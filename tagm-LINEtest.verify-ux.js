// ①③④の修正を、fetch を差し替えて実挙動で検証する
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, 'tagm-LINEtest.html');
const html = fs.readFileSync(SRC, 'utf8');
const tagsJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'tags_sticker_latest.json'), 'utf8'));
const POOL = [];
(function walk(v) { Array.isArray(v) ? v.forEach(walk) : (v && typeof v === 'object') ? Object.values(v).forEach(walk) : (typeof v === 'string' && POOL.push(v)); })(tagsJson.categories);

let fails = 0;
const check = (n, c, x) => { c ? console.log('  PASS  ' + n) : (fails++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : ''))); };

// 起動時のタグJSON取得は素通しし、generateContent だけを counter/handler に回す
function aiOnly(handler, counter) {
  return async (url, opt) => {
    if (typeof url === 'string' && url.indexOf('generativelanguage') !== -1) {
      counter.n++;
      return handler(counter.n, url, opt);
    }
    return Promise.reject(new Error('offline'));
  };
}

function boot(fetchImpl) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/t.html', pretendToBeVisual: true,
    beforeParse(w) { w.fetch = fetchImpl; w.indexedDB = undefined; w.alert = m => { w.__lastAlert = m; }; }
  });
  return dom.window;
}

function ready(w) {
  return new Promise(res => w.addEventListener('load', () => setTimeout(() => {
    // jsdom は <dialog> を実装していないので、open/showModal/close を最小限で補う
    w.document.querySelectorAll('dialog').forEach(d => {
      let isOpen = false;
      Object.defineProperty(d, 'open', { get: () => isOpen, set: v => { isOpen = !!v; }, configurable: true });
      d.showModal = function () { isOpen = true; };
      d.close = function () { isOpen = false; };
    });
    res(w);
  }, 250)));
}

// --- 共通のお膳立て: 画像2枚ぶんのダミーをIDBの代わりに流し込む ---
function stub(w, calls) {
  w.eval('aiGetTagPool = function(){ return ' + JSON.stringify(POOL) + '; }');
  w.eval('aiLoadApiKey = async function(){ return "DUMMY"; }');
  w.eval('idbGetAll = async function(){ return { "s:1": {}, "s:2": {}, "s:3": {}, "s:4": {}, "s:5": {},' +
         ' "s:6": {}, "s:7": {}, "s:8": {}, "s:9": {}, "s:10": {} }; }');
  w.eval('aiPrepareImagePart = async function(){ return { mimeType: "image/png", data: "AA" }; }');
  w.eval('render = function(){};');
}

const okBody = keys => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(
    Object.fromEntries(keys.map(k => [k, POOL.slice(0, 18)])) ) }] } }]
});

(async () => {
  console.log('\n=== 1. 定数（枚数選択の廃止） ===');
  {
    const w = await ready(boot(() => Promise.reject(new Error('offline'))));
    const ev = c => w.eval(c);
    check('AI_CHUNK_SIZE = 40（無料枠向け）', ev('AI_CHUNK_SIZE') === 40, 'got ' + ev('AI_CHUNK_SIZE'));
    check('チャンク間の待機 3000ms', ev('AI_CHUNK_INTERVAL_MS') === 3000);
    check('リトライ待ちが3段階', ev('AI_RETRY_WAITS_MS.length') === 3, JSON.stringify(ev('AI_RETRY_WAITS_MS')));
    check('入力欄がDOMから消えている', w.document.getElementById('ai-tag-chunk-size') === null);
    check('モーダル自体は生きている', !!w.document.getElementById('ai-tagging-modal'));
    w.close();
  }

  console.log('\n=== 2. 429で段階的に待ってから諦める ===');
  {
    const ctr = { n: 0 };
    const w = await ready(boot(aiOnly(async () =>
      ({ status: 429, json: async () => ({ error: { message: 'Too many requests, slow down', details: [] } }) }), ctr)));
    stub(w);
    // setTimeout を乗っ取って「何ms待とうとしたか」を記録し、実際には待たない
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ __waits.push(ms); return __realST(f,0);} return __realST(f,ms); }; __waits = [];');
    const res = await w.eval('aiRunTagging({ normKeys:["1","2"], chunkSize:8, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:n=>n, onProgress:()=>{} })');
    const recorded = w.eval('__waits');
    check('AI呼び出しは3回（初回+リトライ予算2）', ctr.n === 3, 'got ' + ctr.n);
    check('待ち時間が 8s→20s と伸びる',
      JSON.stringify(recorded.slice(0, 2)) === JSON.stringify([8000, 20000]), JSON.stringify(recorded));
    check('失敗理由が返る', !!(res.errors && res.errors.length), JSON.stringify(res.errors));
    check('理由に429の説明が入る', /429/.test(res.errors[0]), res.errors[0]);
    check('理由にサーバの原文が入る', /slow down/.test(res.errors[0]), res.errors[0]);
    w.close();
  }

  console.log('\n=== 3. サーバがretryDelayを指定したらそれに従う ===');
  {
    const ctr = { n: 0 };
    const w = await ready(boot(aiOnly(async (n) => {
      if (n === 1) return { status: 429, json: async () => ({ error: { message: 'rate', details: [{ retryDelay: '27s' }] } }) };
      return { status: 200, json: async () => okBody(['1', '2']) };
    }, ctr)));
    stub(w);
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ __waits.push(ms); return __realST(f,0);} return __realST(f,ms); }; __waits = [];');
    const res = await w.eval('aiRunTagging({ normKeys:["1","2"], chunkSize:8, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:n=>n, onProgress:()=>{} })');
    check('27s指定 → 28000ms 待つ（既定の8000より優先）', w.eval('__waits')[0] === 28000, JSON.stringify(w.eval('__waits')));
    check('リトライ後は成功する', res.successCount === 2, JSON.stringify(res));
    w.close();
  }

  console.log('\n=== 4. チャンク間に待機が入る ===');
  {
    const ctr = { n: 0 };
    const w = await ready(boot(aiOnly(async () =>
      ({ status: 200, json: async () => okBody(['1','2','3','4','5','6','7','8','9','10']) }), ctr)));
    stub(w);
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ __waits.push(ms); return __realST(f,0);} return __realST(f,ms); }; __waits = [];');
    await w.eval('aiRunTagging({ normKeys:["1","2","3","4","5","6","7","8","9","10"], chunkSize:8, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:n=>n, onProgress:()=>{} })');
    check('10枚/8枚区切り → 2リクエスト', ctr.n === 2, 'got ' + ctr.n);
    check('チャンク間に3000ms待機が1回', w.eval('__waits').filter(m => m === 3000).length === 1, JSON.stringify(w.eval('__waits')));
    w.close();
  }

  console.log('\n=== 5. 完了時のモーダル挙動 ===');
  {
    const w = await ready(boot(aiOnly(async () => ({ status: 200, json: async () => okBody(['1','2']) }), { n: 0 })));
    stub(w);
    w.eval('aiBuildStickerIndex = function(){ return { "1": {writeKey:"1", hasImage:true, existingTags:[]}, "2": {writeKey:"2", hasImage:true, existingTags:[]} }; }');
    w.document.getElementById('ai-tagging-modal').showModal();
    w.eval('document.getElementById("ai-tag-mode-all").checked = true;');
    await w.eval('aiHandleStartTagging()');
    check('成功直後はまだ開いている（結果を一瞬見せる）', w.document.getElementById('ai-tagging-modal').open);
    await new Promise(r => setTimeout(r, 1500));
    check('1.2秒後に自動で閉じる', !w.document.getElementById('ai-tagging-modal').open);
    w.close();
  }

  console.log('\n=== 6. 失敗時は閉じずに理由を出す ===');
  {
    const w = await ready(boot(aiOnly(async () => ({ status: 429, json: async () => ({ error: { message: 'Quota exceeded for quota metric', details: [] } }) }), { n: 0 })));
    stub(w);
    w.eval('aiBuildStickerIndex = function(){ return { "1": {writeKey:"1", hasImage:true, existingTags:[]}, "2": {writeKey:"2", hasImage:true, existingTags:[]} }; }');
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ return __realST(f,0);} return __realST(f,ms); };');
    w.document.getElementById('ai-tagging-modal').showModal();
    w.eval('document.getElementById("ai-tag-mode-all").checked = true;');
    await w.eval('aiHandleStartTagging()');
    await new Promise(r => setTimeout(r, 1500));
    check('失敗時はモーダルが開いたまま', w.document.getElementById('ai-tagging-modal').open);
    const txt = w.document.getElementById('ai-tag-result').textContent;
    check('画面に「失敗した理由」が出る', /失敗した理由/.test(txt), txt.slice(0, 200));
    check('サーバの原文も画面に出る', /Quota exceeded/.test(txt), txt.slice(0, 200));
    // ブラウザは #fdf1e7 を rgb(253, 241, 231) に正規化するので両方許容する
    const bg = w.document.getElementById('ai-tag-result').style.background;
    check('結果欄が警告色になる', /fdf1e7|253,\s*241,\s*231/.test(bg), bg);
    w.close();
  }

  console.log('=== 7. 穴埋めモード（不足分だけ補う） ===');
  {
    const w = await ready(boot(aiOnly(async () => ({ status: 200, json: async () => okBody(['1','2']) }), { n: 0 })));
    stub(w);
    w.eval('aiBuildStickerIndex = function(){ return {'
      + ' "1": {writeKey:"1", hasImage:true, existingTags:["大丈夫","連絡","OK"]},'
      + ' "2": {writeKey:"2", hasImage:true, existingTags:new Array(9).fill(0).map(function(_,i){return "t"+i;})} }; }');
    w.document.getElementById('ai-tagging-modal').showModal();
    w.eval('document.getElementById("ai-tag-mode-fill").checked = true;');
    let threw = null;
    try { await w.eval('aiHandleStartTagging()'); } catch (e) { threw = e.message; }
    check('穴埋め実行で例外が出ない', !threw, threw);
    check('errors is not defined のアラートが出ない',
      !(w.__lastAlert && /errors is not defined/.test(w.__lastAlert)), w.__lastAlert);
    check('アラート自体が出ない', !w.__lastAlert, w.__lastAlert);
    w.close();
  }

  console.log('=== 8. 穴埋めモードでも失敗理由が出る ===');
  {
    const w = await ready(boot(aiOnly(async () => ({ status: 429, json: async () => ({ error: { message: 'Quota exceeded (fill)', details: [] } }) }), { n: 0 })));
    stub(w);
    w.eval('aiBuildStickerIndex = function(){ return { "1": {writeKey:"1", hasImage:true, existingTags:["大丈夫"]} }; }');
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ return __realST(f,0);} return __realST(f,ms); };');
    w.document.getElementById('ai-tagging-modal').showModal();
    w.eval('document.getElementById("ai-tag-mode-fill").checked = true;');
    let threw = null;
    try { await w.eval('aiHandleStartTagging()'); } catch (e) { threw = e.message; }
    check('穴埋めの失敗でも例外が出ない', !threw, threw);
    const txt = w.document.getElementById('ai-tag-result').textContent;
    check('穴埋めでも失敗理由が画面に出る', /失敗した理由/.test(txt), txt.slice(0,160));
    check('穴埋めでもサーバ原文が出る', /Quota exceeded/.test(txt), txt.slice(0,160));
    w.close();
  }

  console.log('=== 9. 503（モデル混雑）でも待って再試行する ===');
  {
    const ctr = { n: 0 };
    const w = await ready(boot(aiOnly(async (n) => {
      if (n <= 2) return { status: 503, json: async () => ({ error: { message: 'This model is currently experiencing high demand.' } }) };
      return { status: 200, json: async () => okBody(['1','2']) };
    }, ctr)));
    stub(w);
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ __waits.push(ms); return __realST(f,0);} return __realST(f,ms); }; __waits = [];');
    const res = await w.eval('aiRunTagging({ normKeys:["1","2"], chunkSize:8, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:function(n){return n;}, onProgress:function(){} })');
    check('503を2回受けても3回目で成功する', res.successCount === 2, JSON.stringify(res.errors || res));
    check('503でも 8s→20s と待つ', JSON.stringify(w.eval('__waits').slice(0,2)) === JSON.stringify([8000,20000]), JSON.stringify(w.eval('__waits')));
    w.close();
  }

  console.log('=== 10. 503が続いたら理由を混雑として説明する ===');
  {
    const ctr = { n: 0 };
    const w = await ready(boot(aiOnly(async () => ({ status: 503, json: async () => ({ error: { message: 'This model is currently experiencing high demand.' } }) }), ctr)));
    stub(w);
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ return __realST(f,0);} return __realST(f,ms); };');
    const res = await w.eval('aiRunTagging({ normKeys:["1"], chunkSize:8, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:function(n){return n;}, onProgress:function(){} })');
    check('503は3回試す（初回+リトライ予算2）', ctr.n === 3, 'got ' + ctr.n);
    check('説明が「混雑」になる（429と誤解させない）', res.errors[0].indexOf('混雑しています(HTTP 503)') !== -1, res.errors[0]);
    check('429の文言は出ない', res.errors[0].indexOf('リクエスト制限(429)') === -1, res.errors[0]);
    check('サーバの原文も残る', /high demand/.test(res.errors[0]), res.errors[0]);
    w.close();
  }

  console.log('=== 11. 無料枠向けの既定値 ===');
  {
    const w = await ready(boot(aiOnly(async () => ({ status: 200, json: async () => okBody(['1']) }), { n: 0 })));
    check('チャンクは40', w.eval('AI_CHUNK_SIZE') === 40, 'got ' + w.eval('AI_CHUNK_SIZE'));
    check('思考予算は0', w.eval('AI_THINKING_BUDGET') === 0, 'got ' + w.eval('AI_THINKING_BUDGET'));
    check('リトライ予算は2', w.eval('AI_RETRY_BUDGET') === 2, 'got ' + w.eval('AI_RETRY_BUDGET'));
    w.close();
  }

  console.log('=== 12. 40枚以下は必ず1リクエスト ===');
  {
    for (const total of [8, 16, 24, 40]) {
      const ctr = { n: 0 };
      const keys = Array.from({length: total}, (_, i) => String(i+1));
      const w = await ready(boot(aiOnly(async () => ({ status: 200, json: async () => okBody(keys) }), ctr)));
      stub(w);
      await w.eval("__X__".replace('__X__','')||'0');
      await w.eval('aiRunTagging({ normKeys:' + JSON.stringify(keys) + ', chunkSize:AI_CHUNK_SIZE, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:function(n){return n;}, onProgress:function(){} })');
      check(total + '枚 → 1リクエスト', ctr.n === 1, 'got ' + ctr.n);
      w.close();
    }
  }

  console.log('=== 13. リトライ予算は実行全体で共有される ===');
  {
    const ctr = { n: 0 };
    const keys = Array.from({length: 80}, (_, i) => String(i+1));
    const w = await ready(boot(aiOnly(async () => ({ status: 503, json: async () => ({ error: { message: 'high demand' } }) }), ctr)));
    stub(w);
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ return __realST(f,0);} return __realST(f,ms); };');
    await w.eval('aiRunTagging({ normKeys:' + JSON.stringify(keys) + ', chunkSize:AI_CHUNK_SIZE, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:function(n){return n;}, onProgress:function(){} })');
    check('80枚(2チャンク)全滅でも 4リクエストまで', ctr.n <= 4, 'got ' + ctr.n + '（予算2 + 初回2）');
    w.close();
  }

  console.log('=== 14. 無料枠切れなら即中断して待ち時間を伝える ===');
  {
    const ctr = { n: 0 };
    const keys = Array.from({length: 80}, (_, i) => String(i+1));
    const w = await ready(boot(aiOnly(async () => ({ status: 429, json: async () => ({ error: {
      message: 'You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20',
      details: [{ retryDelay: '55s' }] } }) }), ctr)));
    stub(w);
    w.eval('__realST = setTimeout; setTimeout = function(f, ms){ if(ms>=1000){ return __realST(f,0);} return __realST(f,ms); };');
    const res = await w.eval('aiRunTagging({ normKeys:' + JSON.stringify(keys) + ', chunkSize:AI_CHUNK_SIZE, perStickerCount:9, allowAutosuggest:false, mustTags:[], writeKeyOf:function(n){return n;}, onProgress:function(){} })');
    check('枠切れなら1リクエストで止める', ctr.n === 1, 'got ' + ctr.n);
    check('2つ目のチャンクを叩きに行かない', ctr.n < 2, 'got ' + ctr.n);
    check('全80枚が未処理として報告される', res.failedNorms.length === 80, 'got ' + res.failedNorms.length);
    check('待つべき秒数が案内される', res.errors[0].indexOf('56秒') !== -1 || /約d+秒待って/.test(res.errors[0]), res.errors[0]);
    check('無料枠だと明記される', res.errors[0].indexOf('無料枠の上限') !== -1, res.errors[0]);
    check('枠切れでもサーバ原文が残る', res.errors[0].indexOf('free_tier_requests') !== -1, res.errors[0]);
    w.close();
  }

  console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILED'));
  process.exit(fails === 0 ? 0 : 1);
})();

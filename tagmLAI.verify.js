// tagmLAI.html を jsdom で読み込み、AIおすすめタグ帯の挙動を検証する
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const FILE = path.join(__dirname, 'tagmLAI.html');
const html = fs.readFileSync(FILE, 'utf8');

let fails = 0;
function check(name, cond, extra) {
  if (cond) { console.log('  PASS  ' + name); }
  else { fails++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/tagm-test.html',
  pretendToBeVisual: true,
  beforeParse(w) {
    w.fetch = () => Promise.reject(new Error('offline'));
    w.indexedDB = undefined;
    w.crypto = w.crypto || {};
  }
});
const w = dom.window;
const ev = (code) => w.eval(code);

w.addEventListener('load', () => setTimeout(run, 300));

function run() {
  console.log('\n=== 1. 定数・ヘルパー ===');
  check('AI_CANDIDATE_MAX === 18', ev('AI_CANDIDATE_MAX') === 18, 'got ' + ev('AI_CANDIDATE_MAX'));
  check('aiGetCandidateCount(9) === 18', w.aiGetCandidateCount(9) === 18, 'got ' + w.aiGetCandidateCount(9));
  check('aiGetCandidateCount(5) === 10', w.aiGetCandidateCount(5) === 10, 'got ' + w.aiGetCandidateCount(5));
  check('aiGetCandidateCount(12) === 18 (上限クランプ)', w.aiGetCandidateCount(12) === 18, 'got ' + w.aiGetCandidateCount(12));

  console.log('\n=== 2. jsAttr エスケープ ===');
  check("jsAttr(\"it's\") が ' をJSエスケープ", w.jsAttr("it's") === "it\\'s", JSON.stringify(w.jsAttr("it's")));
  check('jsAttr("a&b") が & を実体参照化', w.jsAttr('a&b') === 'a&amp;b', JSON.stringify(w.jsAttr('a&b')));
  check('jsAttr(\'a"b\') が " を &quot; に（&amp;quot; にならない）', w.jsAttr('a"b') === 'a&quot;b', JSON.stringify(w.jsAttr('a"b')));
  check('jsAttr("え？") は素通し', w.jsAttr('え？') === 'え？', JSON.stringify(w.jsAttr('え？')));

  console.log('\n=== 3. プロンプト本文 ===');
  const p = w.aiBuildTaggingInstruction(9, [], false);
  check('18個を要求している', /18個/.test(p));
  check('先頭9個が採用されると明記', /先頭9個/.test(p));
  check('「相手が打つ言葉」枠がある', p.includes('相手が打つ言葉'));
  check('略語展開の指示がある', p.includes('いてら') && p.includes('はらへ'));
  check('季節タグ禁止がある', p.includes('年末年始') && p.includes('禁止'));
  check('動物タグは1個までの制限がある', /動物・キャラクター種別/.test(p));
  check('表情の誤読への注意がある', p.includes('口を大きく開けた笑顔'));
  check('旧「言い換えからタグを作らない」が消えている', !p.includes('言い換え・翻訳からタグを作らない'), '旧文言が残存');
  check('言い換えが明示的に許可されている', p.includes('言い換え・略語の展開・意訳の結果として選んでよい'));
  check('旧9観点の羅列が消えている', !p.includes('デザイン上の特徴'));
  const pMust = w.aiBuildTaggingInstruction(9, ['やよい'], false);
  check('mustTags が指示文に入る', pMust.includes('やよい'));

  console.log('\n=== 4. おすすめ帯のレンダリング ===');
  ev(`state.tags = { '01': ['大丈夫','連絡'], '02': [] };
      state.userMustTags = ['やよい'];
      state.suggestions = { '1': ['大丈夫','連絡','問題ない','OK','やよい',"アポ'ストロフィ"], '2': [] };
      displayMode = 'full';
      renderStickers();`);
  const list = w.document.getElementById('stickers-list');
  const rows = list.querySelectorAll('.sticker-row');
  check('スタンプ行が2行出ている', rows.length === 2, 'got ' + rows.length);

  const strip = rows[0].querySelector('.suggest-strip');
  check('01行におすすめ帯がある', !!strip);
  const chips = strip ? Array.from(strip.querySelectorAll('.suggest-chip')).map(b => b.textContent.trim()) : [];
  check('採用済みタグ(大丈夫/連絡)が候補から除外されている',
    !chips.includes('大丈夫') && !chips.includes('連絡'), 'chips=' + JSON.stringify(chips));
  check('必須タグ(やよい)が候補から除外されている', !chips.includes('やよい'), 'chips=' + JSON.stringify(chips));
  check('未採用の候補が残っている', chips.includes('問題ない') && chips.includes('OK'), 'chips=' + JSON.stringify(chips));
  check('候補ゼロの行には帯が出ない', !rows[1].querySelector('.suggest-strip'));

  console.log('\n=== 5. DOM構造の健全性 ===');
  // renderStickers の innerHTML が壊れていれば .tag-input が行内に見つからない
  check('01行にタグ入力欄が残っている', !!rows[0].querySelector('.tag-input'));
  check('01行のタグチップが2個', rows[0].querySelectorAll('.tag-chip:not(.must)').length === 2,
    'got ' + rows[0].querySelectorAll('.tag-chip:not(.must)').length);
  check('おすすめ帯がタグチップ列の外（兄弟）にある',
    strip && strip.parentElement === rows[0].querySelector('.tag-chip').parentElement.parentElement,
    'strip.parent=' + (strip && strip.parentElement.className));

  console.log('\n=== 6. クリックで採用される ===');
  const before = ev("JSON.stringify(state.tags['01'])");
  const target = Array.from(strip.querySelectorAll('.suggest-chip')).find(b => b.textContent.trim() === '問題ない');
  target.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('state.tags に追加された', ev("state.tags['01'].includes('問題ない')"),
    'before=' + before + ' after=' + ev("JSON.stringify(state.tags['01'])"));
  const strip2 = w.document.querySelectorAll('.sticker-row')[0].querySelector('.suggest-strip');
  const chips2 = Array.from(strip2.querySelectorAll('.suggest-chip')).map(b => b.textContent.trim());
  check('再描画後、採用済みになった候補が帯から消える', !chips2.includes('問題ない'), 'chips=' + JSON.stringify(chips2));

  console.log('\n=== 7. アポストロフィを含むタグでも壊れない ===');
  const apo = Array.from(strip2.querySelectorAll('.suggest-chip')).find(b => b.textContent.trim() === "アポ'ストロフィ");
  check('アポストロフィ入りチップが描画されている', !!apo);
  if (apo) {
    apo.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('クリックで正しい文字列が追加される', ev(`state.tags['01'].includes("アポ'ストロフィ")`),
      ev("JSON.stringify(state.tags['01'])"));
  }

  console.log('\n=== 8. JSONエクスポートに suggestions が混ざらない ===');
  const json = ev('buildOrderedJsonString(state)');
  check('エクスポートJSONに suggestions が無い', !json.includes('suggestions'), json.slice(0, 200));
  check('エクスポートJSONに候補タグ「OK」が混入していない',
    !JSON.parse(json).tags['01'].includes('OK'), json.slice(0, 300));
  check('エクスポートJSONは正しくパースできる', (() => { try { JSON.parse(json); return true; } catch (e) { return false; } })());

  console.log('\n=== 9. resetAll 後に state が壊れない ===');
  w.confirm = () => true;
  w.indexedDB = undefined;
  Promise.resolve(w.resetAll()).catch(() => {}).then(() => {
    check('resetAll 後 aiRejectedTags が定義済み', ev("!!state.aiRejectedTags && typeof state.aiRejectedTags === 'object'"));
    check('resetAll 後 suggestions が定義済み', ev("!!state.suggestions && typeof state.suggestions === 'object'"));
    let threw = false;
    try { ev("state.tags['01'] = ['x']; removeTag('01', 0);"); } catch (e) { threw = true; }
    check('resetAll 直後の removeTag が例外を出さない', !threw);

    console.log('\n' + (fails === 0 ? 'ALL PASS' : fails + ' FAILED'));
    process.exit(fails === 0 ? 0 : 1);
  });
}

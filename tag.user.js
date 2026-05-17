// ==UserScript==
// @name         タグ付けさん for LINE Creator Market
// @namespace    https://github.com/yayoi333/linewl
// @version      1.0
// @description  LINE Creator Marketのタグ付け申請画面でタグJSONを自動入力。緑のボタンをタップして実行。
// @author       yayoi
// @match        https://creator.line.me/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'lcmTagJson';
  const PREFIX      = 'LINE_CM_TAG_JSON:';
  const STOP_ID     = 'lcm-tag-stop';
  const BOX_ID      = 'lcm-tag-box';
  const BTN_ID      = 'lcm-tag-btn';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const trim  = s  => String(s || '').replace(/\s+/g, ' ').trim();
  const toNum = s  => {
    const m = String(s || '')
      .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 65248))
      .match(/\d{1,3}/);
    return m ? m[0].padStart(3, '0') : '';
  };

  function parseJson(text) {
    text = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    if (text.startsWith(PREFIX)) text = text.slice(PREFIX.length);
    for (let s = text.indexOf('{'); s >= 0; s = text.indexOf('{', s + 1)) {
      let quote = '', esc = false, depth = 0;
      for (let i = s; i < text.length; i++) {
        const c = text[i];
        if (quote) { esc ? (esc = false) : c === '\\' ? (esc = true) : c === quote && (quote = ''); }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
          try {
            const obj  = JSON.parse(text.slice(s, i + 1));
            const tags = obj?.tags && typeof obj.tags === 'object' ? obj.tags : obj;
            if (tags && typeof tags === 'object' && Object.keys(tags).some(k => toNum(k))) return obj;
          } catch (e) {}
          break;
        }
      }
    }
    throw new Error('タグJSONが見つかりません');
  }

  function buildPairs(parsed) {
    const tags = parsed?.tags && typeof parsed.tags === 'object' ? parsed.tags : parsed;
    return Object.entries(tags)
      .map(([k, v]) => [
        toNum(k),
        Array.isArray(v) ? v.map(String) : String(v).split(/[,\n、]/).map(trim).filter(Boolean)
      ])
      .filter(([k, v]) => k && v.length)
      .sort((a, b) => Number(a[0]) - Number(b[0]));
  }

  function isOnTagPage() {
    return $$('label.cm-product-image-tag').length > 0
      || !!$('.btn-next-image')
      || /タグの編集|おすすめのタグ|タグ設定/.test(document.body?.innerText || '');
  }

  let stopping = false;
  const tagLabel = el => trim(el.textContent).split(/[（(]\d+[）)]/)[0].trim();

  async function waitForTags() {
    for (let i = 0; i < 30; i++) {
      const labels = $$('label.cm-product-image-tag');
      if (labels.length > 20) return labels;
      await sleep(200);
    }
    return $$('label.cm-product-image-tag');
  }

  async function applyOneStickerTags(tags) {
    const labels = await waitForTags();
    if (!labels.length) throw new Error('タグ候補が読み込めません');
    for (const tag of tags) {
      if (stopping) return;
      const label = labels.find(l => tagLabel(l) === tag);
      if (label && !label.classList.contains('cm-product-image-tag-selected')) {
        label.click();
        await sleep(450);
      }
    }
  }

  function currentHash() {
    return toNum(location.hash.replace(/^#\/?/, '') || $('select')?.value || '');
  }

  async function nextImage(prevHash) {
    const isVisible = el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const btn = $('.btn-next-image')
      || $$('button,a').find(el => isVisible(el) && /次|›|＞|→/.test(trim(el.textContent || el.value)));
    if (!btn) return false;
    btn.click();
    for (let i = 0; i < 25; i++) {
      await sleep(200);
      const h = location.hash.replace(/^#\/?/, '');
      if (h && h !== prevHash) return true;
    }
    return false;
  }

  async function openPasteBox(prefill = '') {
    document.getElementById(BOX_ID)?.remove();
    return new Promise(resolve => {
      const box = document.createElement('div');
      box.id = BOX_ID;
      box.style.cssText = [
        'position:fixed', 'z-index:2147483647', 'inset:10px',
        'background:#fff', 'border:1px solid #86efac', 'border-radius:12px',
        'box-shadow:0 12px 32px rgba(0,0,0,.22)', 'padding:14px',
        'font:14px/1.5 system-ui,sans-serif', 'color:#172033',
        'display:flex', 'flex-direction:column', 'gap:10px'
      ].join(';');
      box.innerHTML = `
        <b style="font-size:17px;">📋 タグ付けさん</b>
        <p style="margin:0;font-size:13px;color:#64748b;">タグJSONを貼り付けてください。前後に文章が混ざっていてもOKです。</p>
        <textarea style="flex:1;min-height:120px;box-sizing:border-box;font:13px/1.4 monospace;padding:8px;border:1px solid #a5d6a7;border-radius:8px;resize:vertical;"></textarea>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button data-run   style="flex:2;min-height:60px;font-size:22px;font-weight:700;background:#4caf50;color:#fff;border:none;border-radius:10px;cursor:pointer;">実行</button>
          <button data-clear style="flex:1;min-height:60px;font-size:18px;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:10px;cursor:pointer;">クリア</button>
          <button data-close style="flex:1;min-height:60px;font-size:18px;background:#fff;color:#888;border:1px solid #ddd;border-radius:10px;cursor:pointer;">閉じる</button>
        </div>
      `;
      const ta = $('textarea', box);
      ta.value = prefill;
      $('[data-run]',   box).onclick = () => { box.remove(); resolve(ta.value); };
      $('[data-clear]', box).onclick = () => { ta.value = ''; ta.focus(); };
      $('[data-close]', box).onclick = () => { box.remove(); resolve(''); };
      document.body.appendChild(box);
      ta.focus();
      if (prefill) ta.select();
    });
  }

  function showStopButton() {
    document.getElementById(STOP_ID)?.remove();
    const el = document.createElement('div');
    el.id = STOP_ID;
    el.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'right:12px', 'top:12px',
      'background:#fff', 'border:1px solid #fecaca', 'border-radius:10px',
      'box-shadow:0 8px 24px rgba(0,0,0,.18)', 'padding:10px',
      'font:13px/1.4 system-ui,sans-serif', 'color:#172033'
    ].join(';');
    el.innerHTML = `
      <button type="button" style="min-height:48px;border:1px solid #ef4444;border-radius:8px;background:#ef4444;color:white;font-weight:700;padding:0 18px;font-size:15px;cursor:pointer;">停止</button>
      <div style="margin-top:6px;color:#64748b;">タグ付け中…</div>
    `;
    $('button', el).onclick = () => { stopping = true; $('div', el).textContent = '停止します'; };
    document.body.appendChild(el);
    return el;
  }

  async function run() {
    if (!isOnTagPage()) {
      alert('LINEのタグ付け申請画面で実行してください');
      return;
    }

    let text = '';
    try {
      if (navigator.clipboard?.readText) text = await navigator.clipboard.readText().catch(() => '');
    } catch (e) {}
    if (!text) text = localStorage.getItem(STORAGE_KEY) || '';

    text = await openPasteBox(text);
    if (!text.trim()) return;

    let pairs;
    try {
      pairs = buildPairs(parseJson(text));
      localStorage.setItem(STORAGE_KEY, text);
    } catch (e) {
      alert(e.message || 'JSONの読み込みに失敗しました');
      return;
    }
    if (!pairs.length) { alert('対応表が空です'); return; }

    stopping = false;
    const stopEl = showStopButton();
    try {
      for (let i = 0; i < pairs.length && !stopping; i++) {
        const hash = currentHash();
        await applyOneStickerTags(pairs[i][1]);
        if (!stopping && i < pairs.length - 1) {
          await nextImage(hash);
          await sleep(700);
        }
      }
      stopEl.remove();
      alert(stopping ? 'タグ付けを停止しました' : `タグ付けが完了しました: ${pairs.length}件`);
    } catch (e) {
      stopEl.remove();
      alert(e.message || '実行できませんでした');
    }
  }

  function addTriggerButton() {
    if (document.getElementById(BTN_ID)) return;
    if (!isOnTagPage()) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '🏷 タグ付けさん';
    btn.title = 'タグJSONを貼り付けて自動タグ付けします';
    btn.style.cssText = [
      'position:fixed', 'z-index:2147483646', 'right:12px', 'bottom:24px',
      'background:#4caf50', 'color:#fff', 'border:none', 'border-radius:12px',
      'padding:12px 18px', 'font:700 15px system-ui', 'cursor:pointer',
      'box-shadow:0 4px 14px rgba(0,0,0,.22)', 'letter-spacing:.03em'
    ].join(';');
    btn.onclick = run;
    document.body.appendChild(btn);
  }

  // SPA対応：ページ変化を監視してボタンを再表示
  const observer = new MutationObserver(() => addTriggerButton());
  observer.observe(document.body || document.documentElement, { childList: true, subtree: false });
  setTimeout(addTriggerButton, 1200);
})();

// ==UserScript==
// @name         LINE タグ付けさん
// @namespace    https://yayoi333.github.io/linewl/
// @version      1.0.0
// @description  LINE Creators Marketのタグ付けページにタグ付けさんボタンを表示します。
// @match        https://creator.line.me/*
// @match        https://creator.line.me/*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  const CODE = "(()=>{const t=\"lcmTagJson\",e=\"LINE_CM_TAG_JSON:\",n=\"lcm-tag-stop\",o=\"lcm-tag-box\",r=(t,e=document)=>e.querySelector(t),a=(t,e=document)=>[...e.querySelectorAll(t)],i=t=>new Promise(e=>setTimeout(e,t)),c=t=>String(t||\"\").replace(/\\s+/g,\" \").trim(),s=t=>{const e=(t=>String(t||\"\").replace(/[０-９]/g,t=>String.fromCharCode(t.charCodeAt(0)-65248)))(t).match(/\\d{1,3}/);return e?e[0].padStart(3,\"0\"):\"\"};function l(t){const n=function(t){t=String(t||\"\").replace(/^```(?:json)?/i,\"\").replace(/```$/i,\"\").trim(),t.startsWith(e)&&(t=t.slice(17));for(let e=t.indexOf(\"{\");e>=0;e=t.indexOf(\"{\",e+1)){let n=\"\",o=!1,r=0;for(let a=e;a<t.length;a++){const i=t[a];if(n)o?o=!1:\"\\\\\"===i?o=!0:i===n&&(n=\"\");else if('\"'===i||\"'\"===i)n=i;else if(\"{\"===i)r++;else if(\"}\"===i&&0===--r){const n=t.slice(e,a+1);try{const t=JSON.parse(n),e=t&&t.tags&&\"object\"==typeof t.tags?t.tags:t;if(e&&\"object\"==typeof e&&Object.keys(e).some(t=>s(t)))return t}catch(t){}break}}}throw Error(\"タグJSONが見つかりません\")}(t),o=n&&n.tags&&\"object\"==typeof n.tags?n.tags:n;return Object.entries(o).map(([t,e])=>[s(t),Array.isArray(e)?e.map(String):String(e).split(/[,\\n、]/).map(c).filter(Boolean)]).filter(([t,e])=>t&&e.length).sort((t,e)=>Number(t[0])-Number(e[0]))}async function d(){let e=\"\";if(navigator.clipboard?.readText)try{e=await navigator.clipboard.readText()}catch(t){}if(e||(e=localStorage.getItem(t)||\"\"),e=await function(t=\"\"){return document.getElementById(o)?.remove(),new Promise(e=>{const n=document.createElement(\"div\");n.id=o,n.style.cssText=\"position:fixed;z-index:2147483647;inset:10px;background:#fff;border:1px solid #86efac;border-radius:10px;box-shadow:0 12px 30px #0004;padding:12px;font:14px/1.5 system-ui,sans-serif;color:#172033\",n.innerHTML='<b>タグJSONを貼り付け</b><p style=\"margin:6px 0;color:#64748b\">前後に文章が混ざっていてもOKです。必要なJSON部分だけ読み込みます。</p><textarea style=\"width:100%;height:52%;box-sizing:border-box;font:13px/1.45 monospace\"></textarea><p><button data-run type=\"button\" style=\"min-height:76px;font-size:24px;padding:0 32px;border-radius:10px\">実行</button> <button data-clear type=\"button\" style=\"min-height:76px;font-size:24px;padding:0 32px;border-radius:10px\">クリア</button> <button data-close type=\"button\">閉じる</button></p>';const a=r(\"textarea\",n);a.value=t,r(\"[data-run]\",n).onclick=()=>{const t=a.value;n.remove(),e(t)},r(\"[data-clear]\",n).onclick=()=>{a.value=\"\",a.focus()},r(\"[data-close]\",n).onclick=()=>{n.remove(),e(\"\")},document.body.appendChild(n),a.focus(),a.select()})}(e),!e)throw Error(\"タグJSONが空です\");return localStorage.setItem(t,e),l(e)}let p=!1;const u=t=>c(t.textContent).split(/[（(]\\d+[）)]/)[0].trim();async function g(t){const e=await async function(){for(let t=0;t<30;t++){const t=a(\"label.cm-product-image-tag\");if(t.length>20)return t;await i(200)}return a(\"label.cm-product-image-tag\")}();if(!e.length)throw Error(\"タグ候補が読み込めません\");for(const n of t){if(p)return;const t=e.find(t=>u(t)===n);t&&!t.classList.contains(\"cm-product-image-tag-selected\")&&(t.click(),await i(450))}}async function f(t){const e=r(\".btn-next-image\")||a(\"button,a\").find(t=>(t=>{if(!(t instanceof HTMLElement))return!1;const e=getComputedStyle(t),n=t.getBoundingClientRect();return\"none\"!==e.display&&\"hidden\"!==e.visibility&&n.width>0&&n.height>0})(t)&&/次|›|＞|→/.test(c(t.textContent||t.value)));if(!e)return!1;e.click();for(let e=0;e<25;e++){await i(200);const e=location.hash.replace(/^#\\/?/,\"\");if(e&&e!==t)return!0}return!0}const m=()=>s(location.hash.replace(/^#\\/?/,\"\")||r(\"select\")?.value||\"\");(async()=>{try{if(!(a(\"label.cm-product-image-tag\").length||r(\".btn-next-image\")||/タグの編集|おすすめのタグ|タグ設定/.test(document.body?.innerText||\"\")))return void alert(\"LINEのタグ付け画面で実行してください\");const t=await d();if(!t.length)throw Error(\"対応表が空です\");p=!1;const e=function(){document.getElementById(n)?.remove();const t=document.createElement(\"div\");return t.id=n,t.style.cssText=\"position:fixed;z-index:2147483647;right:12px;top:12px;background:#fff;border:1px solid #fecaca;border-radius:8px;box-shadow:0 8px 24px #0003;padding:10px;font:13px/1.4 system-ui,sans-serif;color:#172033\",t.innerHTML='<button type=\"button\" style=\"min-height:38px;border:1px solid #ef4444;border-radius:8px;background:#ef4444;color:white;font-weight:700;padding:0 16px\">停止</button><div style=\"margin-top:6px;color:#64748b\">タグ付け中</div>',r(\"button\",t).onclick=()=>{p=!0,r(\"div\",t).textContent=\"停止します\"},document.body.appendChild(t),t}();for(let e=0;e<t.length&&!p;e++){const n=m();await g(t[e][1]),!p&&e<t.length-1&&await f(n),await i(700)}e.remove(),alert(p?\"タグ付けを停止しました\":\"タグ付けが完了しました: \"+t.length+\"件\")}catch(t){document.getElementById(n)?.remove(),alert(t.message||\"実行できませんでした\")}})()})();";
  const ID = "lcm-vm-tag-button";
  const isTagPage = () => {
    const text = document.body?.innerText || "";
    return document.querySelector("label.cm-product-image-tag") || document.querySelector(".btn-next-image") || /タグの編集|おすすめのタグ|タグ設定/.test(text);
  };
  const run = () => {
    try {
      Function(CODE)();
    } catch (error) {
      alert(error.message || "タグ付けさんを実行できませんでした");
    }
  };
  const show = () => {
    if (!isTagPage() || document.getElementById(ID)) return;
    const button = document.createElement("button");
    button.id = ID;
    button.type = "button";
    button.textContent = "タグ付けさん";
    button.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;min-height:52px;padding:0 18px;border:0;border-radius:10px;background:#059669;color:white;font:700 16px system-ui,sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.24)";
    button.addEventListener("click", run);
    document.body.appendChild(button);
  };
  show();
  setInterval(show, 1200);
})();
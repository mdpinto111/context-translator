// Floating icon + translation popup (Shadow DOM to isolate from page CSS).
(() => {
  if (window.__ctxTranslateLoaded) return;
  window.__ctxTranslateLoaded = true;

  const settings = { sentences: 2, showIcon: true, targetLang: "fr" };
  const LANGS = [["fr","Français"],["en","English"],["es","Español"],["de","Deutsch"],["it","Italiano"],["pt","Português"],
    ["nl","Nederlands"],["he","עברית"],["ar","العربية"],["ru","Русский"],["uk","Українська"],["pl","Polski"],["tr","Türkçe"],
    ["zh","中文"],["ja","日本語"],["ko","한국어"]];
  const refresh = () =>
    chrome.runtime.sendMessage({ type: "get-settings" })
      .then((r) => { if (r && r.ok) Object.assign(settings, r); })
      .catch(() => {});
  refresh();
  chrome.storage.onChanged.addListener(refresh);

  const host = document.createElement("ctx-translate-root");
  host.style.cssText = "all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .icon { position: absolute; width: 28px; height: 28px; border-radius: 50%; border: none; cursor: pointer;
      background: #4f46e5; color: #fff; font-size: 14px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,.25);
      display: none; align-items: center; justify-content: center; padding: 0; }
    .icon:hover { background: #4338ca; }
    .pop { position: absolute; width: 360px; max-width: calc(100vw - 16px); display: none; padding: 12px 14px;
      background: #fff; color: #1f2937; border: 1px solid #e5e7eb; border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
      font-size: 14px; line-height: 1.45; text-align: start; }
    .head { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6b7280; margin-bottom: 6px; gap: 8px; }
    .head select { font-size: 12px; border: 1px solid #d1d5db; border-radius: 5px; background: transparent; color: inherit; padding: 1px 2px; cursor: pointer; }
    .head .left { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .head .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .head button { border: none; background: none; cursor: pointer; color: #6b7280; font-size: 16px; padding: 0 2px; }
    .tr { font-size: 15px; font-weight: 500; white-space: pre-wrap; overflow-wrap: anywhere; }
    .note { margin-top: 8px; padding: 6px 8px; background: #eef2ff; border-radius: 6px; font-size: 12.5px; color: #3730a3; }
    .alts { margin-top: 8px; font-size: 12.5px; color: #4b5563; }
    .alts span { display: inline-block; margin: 2px 4px 0 0; padding: 1px 7px; border: 1px solid #e5e7eb; border-radius: 10px; }
    .err { color: #b91c1c; }
    .err a { color: #4f46e5; cursor: pointer; text-decoration: underline; }
    .actions { margin-top: 10px; display: flex; gap: 8px; }
    .actions button { font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid #d1d5db; background: #f9fafb; cursor: pointer; color: #1f2937; }
    .spin { width: 16px; height: 16px; border: 2px solid #c7d2fe; border-top-color: #4f46e5; border-radius: 50%;
      animation: s .7s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px; }
    @keyframes s { to { transform: rotate(360deg); } }
    @media (prefers-color-scheme: dark) {
      .pop { background: #1f2937; color: #f3f4f6; border-color: #374151; }
      .note { background: #312e81; color: #e0e7ff; }
      .alts { color: #d1d5db; } .alts span { border-color: #4b5563; }
      .actions button { background: #374151; color: #f3f4f6; border-color: #4b5563; }
      .head select { border-color: #4b5563; } .head option { background: #1f2937; }
      .err { color: #fca5a5; }
    }
  </style>
  <button class="icon" title="Translate with context">文</button>
  <div class="pop" role="dialog">
    <div class="head"><span class="left"><span class="meta"></span><select class="lang" title="Target language"></select></span><button class="close" title="Close">×</button></div>
    <div class="body"></div>
  </div>`;

  const icon = shadow.querySelector(".icon");
  const pop = shadow.querySelector(".pop");
  const meta = shadow.querySelector(".meta");
  const body = shadow.querySelector(".body");
  const langSel = shadow.querySelector(".lang");
  for (const [c, n] of LANGS) langSel.add(new Option(n, c));
  langSel.addEventListener("change", () => {
    settings.targetLang = langSel.value;
    chrome.storage.local.set({ targetLang: langSel.value }).catch(() => {});
    if (lastCtx && lastRect) run(lastCtx, lastRect, true);
  });
  let lastCtx = null, lastRect = null, reqId = 0;

  const mount = () => { if (!host.isConnected) (document.body || document.documentElement).appendChild(host); };
  const hideIcon = () => { icon.style.display = "none"; };
  const hidePop = () => { pop.style.display = "none"; reqId++; };

  function selectionRect() {
    const a = document.activeElement;
    if (a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT")) return a.getBoundingClientRect();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rects = range.getClientRects();
    return rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
  }

  function place(el, rect, w, h) {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const left = Math.min(Math.max(8, rect.right - w / 2), vw - w - 8);
    let top = rect.bottom + 6;
    if (top + h > vh && rect.top - h - 6 > 0) top = rect.top - h - 6;
    el.style.left = `${left + window.scrollX}px`;
    el.style.top = `${top + window.scrollY}px`;
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  async function run(ctx, rect, explicitLang = false) {
    mount(); hideIcon();
    lastCtx = ctx; lastRect = rect;
    const id = ++reqId;
    langSel.value = settings.targetLang;
    meta.textContent = "Translating…";
    body.innerHTML = `<span class="spin"></span>Analyzing context…`;
    pop.style.display = "block";
    place(pop, rect, pop.offsetWidth, pop.offsetHeight);
    let r;
    try {
      r = await Promise.race([
        chrome.runtime.sendMessage({ type: "translate", ctx, targetLang: explicitLang ? settings.targetLang : undefined }),
        new Promise((res) => setTimeout(() => res({ ok: false, error: "No response from the extension after 100 s." }), 100000)),
      ]);
    } catch (e) { r = { ok: false, error: "The extension was reloaded: please refresh the page." }; }
    if (id !== reqId) return; // popup closed or a newer request started meanwhile
    if (!r || !r.ok) {
      meta.textContent = "Error";
      body.innerHTML = r && r.error === "NO_KEY"
        ? `<div class="err">No API key configured for this provider. <a class="opt">Open options</a></div>`
        : `<div class="err">${esc((r && r.error) || "Unknown error")}</div>`;
      const a = body.querySelector(".opt");
      if (a) a.onclick = () => chrome.runtime.sendMessage({ type: "open-options" });
      return;
    }
    const t = r.result;
    langSel.value = t.targetLang;
    meta.textContent = `${t.sourceLang ? t.sourceLang.toUpperCase() : "?"} →`;
    meta.title = langSel.title = `Model: ${t.model}`;
    body.innerHTML = `<div class="tr">${esc(t.translation)}</div>`
      + (t.note ? `<div class="note">${esc(t.note)}</div>` : "")
      + (t.alternatives.length ? `<div class="alts">Alternatives: ${t.alternatives.map((a) => `<span>${esc(a)}</span>`).join("")}</div>` : "")
      + `<div class="actions"><button class="copy">Copy</button></div>`;
    body.querySelector(".copy").onclick = (e) => {
      navigator.clipboard.writeText(t.translation).then(() => { e.target.textContent = "Copied ✓"; });
    };
    place(pop, rect, pop.offsetWidth, pop.offsetHeight);
  }

  function translateCurrent() {
    const ctx = CtxTranslate.getSelectionContext({ sentences: settings.sentences });
    const rect = selectionRect();
    if (ctx && rect) run(ctx, rect);
  }

  icon.addEventListener("mousedown", (e) => e.preventDefault()); // keep the selection
  icon.addEventListener("click", (e) => { e.stopPropagation(); if (lastCtx && lastRect) run(lastCtx, lastRect); });
  shadow.querySelector(".close").addEventListener("click", hidePop);

  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return;
    setTimeout(() => {
      if (!settings.showIcon) return;
      const ctx = CtxTranslate.getSelectionContext({ sentences: settings.sentences });
      const rect = ctx && selectionRect();
      if (!ctx || !rect || ctx.selection.length > 5000) { hideIcon(); return; }
      lastCtx = ctx; lastRect = rect;
      mount();
      icon.style.display = "flex";
      place(icon, { right: rect.right + 14, bottom: rect.bottom - 2, top: rect.top }, 28, 28);
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (e.composedPath().includes(host)) return;
    hideIcon(); hidePop();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideIcon(); hidePop(); } });

  chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "translate-selection") translateCurrent(); });
})();

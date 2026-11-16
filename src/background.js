// Service worker (Chrome) / page d'arrière-plan (Firefox).
if (typeof CtxPrompt === "undefined" && typeof importScripts === "function") importScripts("prompt.js", "providers.js");

const DEFAULTS = {
  provider: "anthropic",
  providers: {}, // { [id]: { apiKey, model, baseUrl } }
  targetLang: (chrome.i18n.getUILanguage() || "fr").split("-")[0],
  sentences: 2,
  showIcon: true,
};

const cache = new Map();
const CACHE_MAX = 200;

async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

function activeConfig(s) {
  const def = CtxProviders.PROVIDERS[s.provider];
  const c = s.providers[s.provider] || {};
  return { provider: s.provider, apiKey: c.apiKey || "", model: c.model || def.defaultModel, baseUrl: c.baseUrl || def.defaultBaseUrl };
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "ctx-translate", title: "Traduire « %s » avec le contexte", contexts: ["selection", "editable"] });
  });
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "ctx-translate" || !tab) return;
  chrome.tabs.sendMessage(tab.id, { type: "translate-selection" }, { frameId: info.frameId ?? 0 }).catch(() => {});
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function saveModel(s, model) {
  const providers = { ...s.providers, [s.provider]: { ...(s.providers[s.provider] || {}), model } };
  await chrome.storage.local.set({ providers });
}

async function translate(ctx, overrideLang) {
  const s = await getSettings();
  const cfg = activeConfig(s);
  if (CtxProviders.PROVIDERS[cfg.provider].needsKey && !cfg.apiKey) throw new Error("NO_KEY");
  const target = overrideLang || s.targetLang;
  const key = JSON.stringify([ctx.selection, ctx.context, target, cfg.provider, cfg.model]);
  if (cache.has(key)) return cache.get(key);
  const { text, model } = await CtxProviders.completeWithFallback(cfg, CtxPrompt.SYSTEM_PROMPT, CtxPrompt.buildUserMessage(ctx, target));
  if (model !== cfg.model) await saveModel(s, model); // le modèle configuré n'existait plus
  const result = { ...CtxPrompt.parseResponse(text), targetLang: target, model };
  cache.set(key, result);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const reply = (p) => { p.then((r) => sendResponse({ ok: true, ...r })).catch((e) => sendResponse({ ok: false, error: e.message })); return true; };
  if (msg.type === "translate") return reply(translate(msg.ctx, msg.targetLang).then((result) => ({ result })));
  if (msg.type === "get-settings") return reply(getSettings().then((s) => ({ targetLang: s.targetLang, sentences: s.sentences, showIcon: s.showIcon })));
  if (msg.type === "test-provider") return reply(CtxProviders.completeWithFallback(msg.cfg, "Reply with the single word OK.", "ping"));
  if (msg.type === "open-options") chrome.runtime.openOptionsPage();
});

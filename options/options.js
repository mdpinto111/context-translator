const { PROVIDERS } = CtxProviders;
const $ = (id) => document.getElementById(id);

const LANGS = [
  ["fr", "Français"], ["en", "English"], ["es", "Español"], ["de", "Deutsch"], ["it", "Italiano"],
  ["pt", "Português"], ["nl", "Nederlands"], ["he", "עברית"], ["ar", "العربية"], ["ru", "Русский"],
  ["uk", "Українська"], ["pl", "Polski"], ["tr", "Türkçe"], ["zh", "中文"], ["ja", "日本語"], ["ko", "한국어"],
];

const HINTS = {
  anthropic: { key: "Create a key at console.anthropic.com.", url: "" },
  openai: { key: "Create a key at platform.openai.com.", url: "" },
  gemini: {
    key: "Free, no credit card required.",
    keyLink: "https://aistudio.google.com/app/apikey",
    model: "The list of available models loads automatically once you enter the key. \"flash\" models are fast and included in the free tier.",
    url: "",
  },
  ollama: {
    key: "",
    model: "Name of an installed model (ollama pull llama3.1). List them with: ollama list.",
    url: "If Ollama rejects the request (403), start it with OLLAMA_ORIGINS=\"chrome-extension://*,moz-extension://*\".",
  },
  custom: {
    key: "Optional (OpenRouter, Mistral, Groq… require one; LM Studio does not).",
    model: "Exact model identifier on the server.",
    url: "Must end with /v1, e.g. https://openrouter.ai/api/v1 or http://localhost:1234/v1.",
  },
};

let state = { provider: "anthropic", providers: {}, targetLang: "fr", secondaryLang: "fr", sentences: 2, showIcon: true };

function fillSelects() {
  for (const [id, p] of Object.entries(PROVIDERS)) $("provider").add(new Option(p.label, id));
  for (const [code, name] of LANGS) { $("targetLang").add(new Option(name, code)); $("secondaryLang").add(new Option(name, code)); }
}

function readProviderFields() {
  state.providers[state.provider] = {
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim(),
    baseUrl: $("baseUrl").value.trim(),
  };
}

function showProvider(id) {
  const p = PROVIDERS[id];
  const c = state.providers[id] || {};
  const h = HINTS[id] || {};
  $("keyBlock").style.display = id === "ollama" ? "none" : "";
  $("apiKey").value = c.apiKey || "";
  $("keyHint").textContent = (h.key ? h.key + " " : "") + "Stored locally, sent only to the selected provider. ";
  if (h.keyLink) {
    const a = document.createElement("a");
    a.href = h.keyLink; a.target = "_blank"; a.rel = "noopener";
    a.textContent = "Get a key →";
    $("keyHint").appendChild(a);
  }
  $("model").value = c.model || p.defaultModel;
  $("modelList").innerHTML = p.models.map((m) => `<option value="${m}">`).join("");
  $("modelHint").textContent = h.model || "Pick from the list or type another model ID.";
  $("baseUrl").value = c.baseUrl || p.defaultBaseUrl;
  $("urlHint").textContent = h.url || "Keep the default unless you use a proxy.";
  $("testStatus").textContent = "";
  if (id === "gemini" && c.apiKey) loadGeminiModels();
}

async function loadGeminiModels() {
  const key = $("apiKey").value.trim();
  if (state.provider !== "gemini" || !key) return;
  try {
    const models = await CtxProviders.listGeminiModels({ apiKey: key, baseUrl: $("baseUrl").value.trim() });
    if (state.provider !== "gemini" || !models.length) return;
    $("modelList").innerHTML = models.map((m) => `<option value="${m}">`).join("");
    if (!models.includes($("model").value.trim())) $("model").value = models.find((m) => /flash/.test(m)) || models[0];
    $("modelHint").textContent = `${models.length} models available with this key. Clear the field to see the list.`;
  } catch (e) {
    $("modelHint").textContent = e.message;
  }
}

let keyTimer;
$("apiKey").addEventListener("input", () => { clearTimeout(keyTimer); keyTimer = setTimeout(loadGeminiModels, 600); });

function currentCfg() {
  readProviderFields();
  return { provider: state.provider, ...state.providers[state.provider] };
}

// Requests access to a host not already covered by host_permissions (must run during a click).
async function ensureHostPermission(baseUrl) {
  let origin;
  try { origin = new URL(baseUrl).origin + "/*"; } catch (_) { throw new Error("Invalid API URL."); }
  if (await chrome.permissions.contains({ origins: [origin] })) return;
  if (!(await chrome.permissions.request({ origins: [origin] }))) throw new Error(`Permission denied for ${origin}`);
}

function setStatus(el, text, ok) { el.textContent = text; el.className = "status " + (ok ? "ok" : "err"); }

async function load() {
  const s = await chrome.storage.local.get(Object.keys(state));
  state = { ...state, targetLang: (chrome.i18n.getUILanguage() || "fr").split("-")[0], ...s };
  $("provider").value = state.provider;
  $("targetLang").value = state.targetLang;
  $("secondaryLang").value = state.secondaryLang;
  $("sentences").value = state.sentences;
  $("showIcon").checked = state.showIcon;
  showProvider(state.provider);
}

$("provider").addEventListener("change", (e) => {
  readProviderFields();
  state.provider = e.target.value;
  showProvider(state.provider);
});

$("test").addEventListener("click", async () => {
  const st = $("testStatus");
  const cfg = currentCfg();
  setStatus(st, "Testing…", true);
  try {
    await ensureHostPermission(cfg.baseUrl || PROVIDERS[cfg.provider].defaultBaseUrl);
    const r = await Promise.race([
      chrome.runtime.sendMessage({ type: "test-provider", cfg }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(
        "No response from the background script. Open chrome://extensions → the extension's \"service worker\" link and check the console.")), 100000)),
    ]);
    if (!r) throw new Error("The background script did not respond (reload the extension).");
    if (r.ok) {
      const changed = r.persist && r.model !== cfg.model;
      if (changed) $("model").value = r.model;
      setStatus(st, changed ? `Connection OK ✓ (model replaced by ${r.model}, remember to save)` : "Connection OK ✓", true);
    }
    else setStatus(st, r.error, false);
  } catch (e) { setStatus(st, e.message, false); }
});

$("save").addEventListener("click", async () => {
  const st = $("saveStatus");
  const cfg = currentCfg();
  try {
    await ensureHostPermission(cfg.baseUrl || PROVIDERS[cfg.provider].defaultBaseUrl);
    await chrome.storage.local.set({
      provider: state.provider,
      providers: state.providers,
      targetLang: $("targetLang").value,
      secondaryLang: $("secondaryLang").value,
      sentences: Math.max(0, Math.min(10, parseInt($("sentences").value, 10) || 0)),
      showIcon: $("showIcon").checked,
    });
    setStatus(st, "Saved ✓", true);
    setTimeout(() => { st.textContent = ""; }, 2000);
  } catch (e) { setStatus(st, e.message, false); }
});

fillSelects();
load();

const { PROVIDERS } = CtxProviders;
const $ = (id) => document.getElementById(id);

const LANGS = [
  ["fr", "Français"], ["en", "English"], ["es", "Español"], ["de", "Deutsch"], ["it", "Italiano"],
  ["pt", "Português"], ["nl", "Nederlands"], ["he", "עברית"], ["ar", "العربية"], ["ru", "Русский"],
  ["uk", "Українська"], ["pl", "Polski"], ["tr", "Türkçe"], ["zh", "中文"], ["ja", "日本語"], ["ko", "한국어"],
];

const HINTS = {
  anthropic: { key: "Créez une clé sur console.anthropic.com.", url: "" },
  openai: { key: "Créez une clé sur platform.openai.com.", url: "" },
  gemini: { key: "Créez une clé gratuite sur aistudio.google.com.", url: "" },
  ollama: {
    key: "",
    model: "Nom d'un modèle installé (ollama pull llama3.1). Liste : ollama list.",
    url: "Si Ollama refuse la requête (403), lancez-le avec OLLAMA_ORIGINS=\"chrome-extension://*,moz-extension://*\".",
  },
  custom: {
    key: "Facultative (OpenRouter, Mistral, Groq… en exigent une ; LM Studio non).",
    model: "Identifiant exact du modèle côté serveur.",
    url: "Doit se terminer par /v1, ex. https://openrouter.ai/api/v1 ou http://localhost:1234/v1.",
  },
};

let state = { provider: "anthropic", providers: {}, targetLang: "fr", sentences: 2, showIcon: true };

function fillSelects() {
  for (const [id, p] of Object.entries(PROVIDERS)) $("provider").add(new Option(p.label, id));
  for (const [code, name] of LANGS) $("targetLang").add(new Option(name, code));
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
  $("keyHint").textContent = (h.key ? h.key + " " : "") + "Stockée localement, envoyée uniquement au fournisseur choisi.";
  $("model").value = c.model || p.defaultModel;
  $("modelList").innerHTML = p.models.map((m) => `<option value="${m}">`).join("");
  $("modelHint").textContent = h.model || "Choisissez dans la liste ou saisissez un autre identifiant.";
  $("baseUrl").value = c.baseUrl || p.defaultBaseUrl;
  $("urlHint").textContent = h.url || "Laissez la valeur par défaut sauf si vous passez par un proxy.";
  $("testStatus").textContent = "";
}

function currentCfg() {
  readProviderFields();
  return { provider: state.provider, ...state.providers[state.provider] };
}

// Demande l'accès à un hôte qui n'est pas déjà couvert par host_permissions (doit être appelé lors d'un clic).
async function ensureHostPermission(baseUrl) {
  let origin;
  try { origin = new URL(baseUrl).origin + "/*"; } catch (_) { throw new Error("URL de l'API invalide."); }
  if (await chrome.permissions.contains({ origins: [origin] })) return;
  if (!(await chrome.permissions.request({ origins: [origin] }))) throw new Error(`Permission refusée pour ${origin}`);
}

function setStatus(el, text, ok) { el.textContent = text; el.className = "status " + (ok ? "ok" : "err"); }

async function load() {
  const s = await chrome.storage.local.get(Object.keys(state));
  state = { ...state, targetLang: (chrome.i18n.getUILanguage() || "fr").split("-")[0], ...s };
  $("provider").value = state.provider;
  $("targetLang").value = state.targetLang;
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
  setStatus(st, "Test en cours…", true);
  try {
    await ensureHostPermission(cfg.baseUrl || PROVIDERS[cfg.provider].defaultBaseUrl);
    const r = await chrome.runtime.sendMessage({ type: "test-provider", cfg });
    if (r.ok) setStatus(st, "Connexion réussie ✓", true);
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
      sentences: Math.max(0, Math.min(10, parseInt($("sentences").value, 10) || 0)),
      showIcon: $("showIcon").checked,
    });
    setStatus(st, "Enregistré ✓", true);
    setTimeout(() => { st.textContent = ""; }, 2000);
  } catch (e) { setStatus(st, e.message, false); }
});

fillSelects();
load();

// Adaptateurs pour les différents fournisseurs de LLM.
(function (root) {
  const PROVIDERS = {
    anthropic: {
      label: "Claude (Anthropic)",
      needsKey: true,
      defaultModel: "claude-haiku-5-5",
      models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
      defaultBaseUrl: "https://api.anthropic.com",
    },
    openai: {
      label: "ChatGPT (OpenAI)",
      needsKey: true,
      defaultModel: "gpt-4o-mini",
      models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
      defaultBaseUrl: "https://api.openai.com/v1",
    },
    gemini: {
      label: "Gemini (Google)",
      needsKey: true,
      defaultModel: "gemini-flash-lite-latest",
      models: ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-pro-latest"],
      defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    },
    ollama: {
      label: "Ollama (local)",
      needsKey: false,
      defaultModel: "llama3.1",
      models: [],
      defaultBaseUrl: "http://localhost:11434",
    },
    custom: {
      label: "Compatible OpenAI (LM Studio, OpenRouter, Mistral, Groq…)",
      needsKey: false,
      defaultModel: "",
      models: [],
      defaultBaseUrl: "http://localhost:1234/v1",
    },
  };

  const ERRORS = {
    401: "Clé API invalide. Vérifiez-la dans les options.",
    403: "Accès refusé (clé, droits, ou origine CORS refusée par le serveur local).",
    404: "Modèle ou URL introuvable. Vérifiez les options.",
    429: "Limite de requêtes atteinte, réessayez dans un instant.",
    500: "Erreur interne du service, réessayez dans un instant.",
    503: "Le modèle est surchargé en ce moment, réessayez dans un instant.",
    529: "Le service est surchargé, réessayez dans un instant.",
  };

  const TIMEOUT_MS = 45000;
  const GEMINI_TIMEOUT_MS = 20000; // au-delà, on essaie un autre modèle

  async function fetchWithTimeout(url, init = {}, timeoutMs = TIMEOUT_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      const host = new URL(url).host;
      if (e.name === "AbortError") {
        const err = new Error(`Pas de réponse de ${host} après ${timeoutMs / 1000} s.`);
        err.status = 408; // traité comme une erreur passagère
        throw err;
      }
      throw new Error(`Impossible de joindre ${host} (réseau, serveur arrêté ou permission manquante).`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function post(url, headers, body, timeoutMs) {
    const res = await fetchWithTimeout(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, timeoutMs);
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.error?.message || j.error || ""; } catch (_) {}
      const badKey = res.status === 400 && /api key/i.test(String(detail));
      const err = new Error(badKey ? `${ERRORS[401]} (${detail})` : ERRORS[res.status] || `Erreur API (${res.status}) ${detail}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /** Réglage de réflexion le plus bas accepté selon la génération du modèle. */
  function geminiThinking(model) {
    if (/gemini-2.5/.test(model)) return /pro/.test(model) ? { thinkingBudget: 128 } : { thinkingBudget: 0 };
    if (/gemini-(1|2.0)/.test(model)) return null;
    return { thinkingLevel: "low" }; // Gemini 3+ et alias -latest
  }

  const trim = (u) => (u || "").replace(/\/+$/, "");

  /** cfg = { provider, apiKey, model, baseUrl } */
  async function complete(cfg, system, user) {
    const p = PROVIDERS[cfg.provider];
    if (!p) throw new Error("Fournisseur inconnu.");
    const base = trim(cfg.baseUrl || p.defaultBaseUrl);
    const model = cfg.model || p.defaultModel;
    if (!model) throw new Error("Aucun modèle configuré.");

    switch (cfg.provider) {
      case "anthropic": {
        const d = await post(`${base}/v1/messages`, {
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        }, { model, max_tokens: 1024, system, messages: [{ role: "user", content: user }] });
        return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      }
      case "gemini": {
        const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
        const headers = { "x-goog-api-key": cfg.apiKey };
        const body = (thinkingConfig) => ({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json", ...(thinkingConfig ? { thinkingConfig } : {}) },
        });
        let d;
        try {
          // Réflexion minimale : inutile pour traduire et très lente
          d = await post(url, headers, body(geminiThinking(model)), GEMINI_TIMEOUT_MS);
        } catch (e) {
          if (e.status !== 400 || /api key/i.test(e.message)) throw e;
          d = await post(url, headers, body(null), GEMINI_TIMEOUT_MS); // modèle qui refuse ce réglage
        }
        return (d.candidates?.[0]?.content?.parts || []).filter((x) => !x.thought).map((x) => x.text || "").join("");
      }
      case "ollama": {
        const d = await post(`${base}/api/chat`, {}, {
          model, stream: false, format: "json", options: { temperature: 0.2 },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        });
        return d.message?.content || "";
      }
      case "openai":
      case "custom": {
        const headers = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {};
        const d = await post(`${base}/chat/completions`, headers, {
          model, temperature: 0.2,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        });
        return d.choices?.[0]?.message?.content || "";
      }
    }
  }

  /** Liste les modèles Gemini utilisables pour generateContent avec la clé fournie. */
  async function listGeminiModels(cfg) {
    const base = trim(cfg.baseUrl || PROVIDERS.gemini.defaultBaseUrl);
    const res = await fetchWithTimeout(`${base}/models?pageSize=1000`, { headers: { "x-goog-api-key": cfg.apiKey } });
    if (!res.ok) throw new Error(res.status === 400 || res.status === 403 ? "Clé API Gemini invalide." : `Erreur API (${res.status})`);
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/.test(m.name) && !/embedding|image|tts|audio|live/.test(m.name))
      .map((m) => m.name.replace(/^models\//, ""))
      .sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || b.localeCompare(a));
  }

  /** Classe les modèles Gemini du plus adapté au moins adapté pour la traduction rapide. */
  function rankGeminiModels(models) {
    const score = (m) => {
      const unstable = /preview|exp|thinking/.test(m) ? 10 : 0;
      if (/nano|gemma/.test(m)) return 50 + unstable;
      if (/flash-lite|lite/.test(m)) return 0 + unstable; // le plus rapide, suffisant pour traduire
      if (/flash/.test(m)) return 1 + unstable;
      if (/pro/.test(m)) return 3 + unstable;
      return 5 + unstable;
    };
    return [...models].sort((a, b) => score(a) - score(b) || b.localeCompare(a));
  }

  function pickGeminiModel(models) { return rankGeminiModels(models)[0]; }

  // Erreurs passagères : surcharge, erreur serveur, quota par modèle
  const TRANSIENT = new Set([408, 429, 500, 502, 503, 504, 529]);
  // Modèles récemment surchargés ou trop lents : évités pendant 5 min
  const cooldown = new Map();
  const COOLDOWN_MS = 5 * 60 * 1000;
  const isCooling = (m) => (cooldown.get(m) || 0) > Date.now();
  const markBusy = (m) => cooldown.set(m, Date.now() + COOLDOWN_MS);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Comme complete(), avec reprise sur erreur :
   * - erreur passagère (503 surcharge…) : nouvel essai après une courte pause ;
   * - Gemini : si le modèle est introuvable (404) ou reste indisponible, essaie
   *   d'autres modèles disponibles pour la clé.
   * Renvoie { text, model, persist } ; persist = le modèle configuré n'existe plus.
   */
  async function completeWithFallback(cfg, system, user) {
    const model = cfg.model || PROVIDERS[cfg.provider].defaultModel;
    let lastErr;
    if (cfg.provider === "gemini" && isCooling(model)) {
      lastErr = Object.assign(new Error("Modèle surchargé récemment."), { status: 503 });
    } else for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { text: await complete({ ...cfg, model }, system, user), model, persist: false };
      } catch (e) {
        lastErr = e;
        if (!TRANSIENT.has(e.status) || e.status === 408 || attempt === 1) break;
        await sleep(1500);
      }
    }
    if (cfg.provider !== "gemini" || !(lastErr.status === 404 || TRANSIENT.has(lastErr.status))) throw lastErr;
    if (TRANSIENT.has(lastErr.status)) markBusy(model);

    const candidates = rankGeminiModels(await listGeminiModels(cfg)).filter((m) => m !== model && !isCooling(m)).slice(0, 3);
    for (const next of candidates) {
      try {
        return { text: await complete({ ...cfg, model: next }, system, user), model: next, persist: lastErr.status === 404 };
      } catch (e) {
        if (!(e.status === 404 || TRANSIENT.has(e.status))) throw e;
        if (TRANSIENT.has(e.status)) markBusy(next);
      }
    }
    if (lastErr.status === 404) throw new Error(`Modèle « ${model} » introuvable et aucun autre modèle Gemini n'a répondu.`);
    throw new Error("Tous les modèles Gemini sont surchargés en ce moment. Réessayez dans quelques instants.");
  }

  const api = { PROVIDERS, complete, completeWithFallback, listGeminiModels, pickGeminiModel, rankGeminiModels };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CtxProviders = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

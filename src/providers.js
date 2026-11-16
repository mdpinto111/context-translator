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
      defaultModel: "gemini-flash-latest",
      models: ["gemini-flash-latest", "gemini-pro-latest"],
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
    529: "Le service est surchargé, réessayez dans un instant.",
  };

  async function post(url, headers, body) {
    let res;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    } catch (e) {
      throw new Error(`Impossible de joindre ${new URL(url).host} (serveur arrêté ou permission manquante).`);
    }
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.error?.message || j.error || ""; } catch (_) {}
      const err = new Error(ERRORS[res.status] || `Erreur API (${res.status}) ${detail}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
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
        const d = await post(`${base}/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": cfg.apiKey }, {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        });
        return (d.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("");
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
    let res;
    try { res = await fetch(`${base}/models?pageSize=1000`, { headers: { "x-goog-api-key": cfg.apiKey } }); }
    catch (_) { throw new Error("Impossible de joindre l'API Gemini."); }
    if (!res.ok) throw new Error(res.status === 400 || res.status === 403 ? "Clé API Gemini invalide." : `Erreur API (${res.status})`);
    const data = await res.json();
    return (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/.test(m.name) && !/embedding|image|tts|audio|live/.test(m.name))
      .map((m) => m.name.replace(/^models\//, ""))
      .sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || b.localeCompare(a));
  }

  /** Choisit le meilleur modèle Gemini disponible (flash stable de préférence). */
  function pickGeminiModel(models) {
    const stable = models.filter((m) => !/preview|exp|thinking|lite|nano/.test(m));
    return stable.find((m) => /flash/.test(m)) || models.find((m) => /flash/.test(m)) || stable[0] || models[0];
  }

  /**
   * Comme complete(), mais pour Gemini : si le modèle est introuvable (404),
   * récupère la liste des modèles disponibles et réessaie avec le plus adapté.
   * Renvoie { text, model }.
   */
  async function completeWithFallback(cfg, system, user) {
    const model = cfg.model || PROVIDERS[cfg.provider].defaultModel;
    try {
      return { text: await complete({ ...cfg, model }, system, user), model };
    } catch (e) {
      if (cfg.provider !== "gemini" || e.status !== 404) throw e;
      const models = await listGeminiModels(cfg);
      const next = pickGeminiModel(models);
      if (!next || next === model) throw new Error(`Modèle « ${model} » introuvable et aucun autre modèle Gemini disponible.`);
      return { text: await complete({ ...cfg, model: next }, system, user), model: next };
    }
  }

  const api = { PROVIDERS, complete, completeWithFallback, listGeminiModels, pickGeminiModel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CtxProviders = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

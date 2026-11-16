// Prompt building and model response parsing.
(function (root) {
  const LANG_NAMES = {
    fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese",
    nl: "Dutch", ru: "Russian", ar: "Arabic", he: "Hebrew", zh: "Chinese", ja: "Japanese", ko: "Korean",
    pl: "Polish", tr: "Turkish", uk: "Ukrainian",
  };

  function langName(code) {
    const c = (code || "").toLowerCase().split(/[-_]/)[0];
    return LANG_NAMES[c] || code;
  }

  const SYSTEM_PROMPT = `You are an expert translator. You receive a passage extracted from a web page, in which the user selected a portion marked with <selection>…</selection>.
Translate ONLY the selected portion into the target language.
Use the surrounding context, the page title and the section heading to resolve ambiguities: word sense (homonyms, polysemy), pronoun references, grammatical gender and number, register, idioms, domain-specific terminology.
If the selection is a single word or short phrase, give the translation that fits this specific context, not the most common dictionary sense.
Keep the translation natural and faithful; do not translate the context.
Reply with ONLY a JSON object, no markdown fences:
{"translation": string, "sourceLang": ISO 639-1 code of the selection, "alternatives": [up to 3 other plausible translations, may be empty], "note": short explanation written in the target language of how context changed the translation, or "" if nothing notable}`;

  function buildUserMessage(ctx, targetLang) {
    const parts = [`Target language: ${langName(targetLang)} (${targetLang})`];
    if (ctx.pageTitle) parts.push(`Page title: ${ctx.pageTitle}`);
    if (ctx.heading) parts.push(`Section heading: ${ctx.heading}`);
    if (ctx.pageLang) parts.push(`Declared page language: ${ctx.pageLang}`);
    parts.push(`<context>\n${ctx.context}\n</context>`);
    parts.push(`Selected text to translate: "${ctx.selection}"`);
    return parts.join("\n");
  }

  function parseResponse(text) {
    const t = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const o = JSON.parse(m[0]);
        if (typeof o.translation === "string") {
          return {
            translation: o.translation,
            sourceLang: o.sourceLang || "",
            alternatives: Array.isArray(o.alternatives) ? o.alternatives.filter((a) => typeof a === "string").slice(0, 3) : [],
            note: typeof o.note === "string" ? o.note : "",
          };
        }
      } catch (_) { /* fall back */ }
    }
    return { translation: t, sourceLang: "", alternatives: [], note: "" };
  }

  const api = { SYSTEM_PROMPT, buildUserMessage, parseResponse, langName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CtxPrompt = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

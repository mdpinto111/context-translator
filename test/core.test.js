const test = require("node:test");
const assert = require("node:assert");
const { buildContextSnippet, splitSentences } = require("../src/context.js");
const { buildUserMessage, parseResponse } = require("../src/prompt.js");

const text = "The river was calm. We sat on the bank and watched the boats. Later it started to rain. We went home.";

test("splitSentences découpe en phrases", () => {
  assert.strictEqual(splitSentences(text, "en").length, 4);
});

test("buildContextSnippet balise la sélection et garde les phrases voisines", () => {
  const s = text.indexOf("bank");
  const out = buildContextSnippet(text, s, s + 4, { sentences: 1, lang: "en" });
  assert.match(out, /on the <selection>bank<\/selection> and/);
  assert.match(out, /^The river was calm\./);
  assert.match(out, /started to rain\.$/);
  assert.doesNotMatch(out, /went home/);
});

test("buildContextSnippet ignore les espaces autour de la sélection", () => {
  const s = text.indexOf("bank");
  const out = buildContextSnippet(text, s - 1, s + 5, { sentences: 0 });
  assert.match(out, /the <selection>bank<\/selection> and/);
});

test("buildContextSnippet respecte la limite de caractères", () => {
  const long = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const s = long.indexOf("number 100");
  const out = buildContextSnippet(long, s, s + 10, { sentences: 50, maxChars: 300 });
  assert.ok(out.length <= 340, `longueur ${out.length}`);
  assert.match(out, /<selection>number 100<\/selection>/);
});

test("buildUserMessage contient contexte et langue cible", () => {
  const msg = buildUserMessage({ selection: "bank", context: "x <selection>bank</selection> y", pageTitle: "Rivers" }, "fr");
  assert.match(msg, /français/);
  assert.match(msg, /Page title: Rivers/);
  assert.match(msg, /<context>/);
});

test("parseResponse lit du JSON, même entouré de ``` ou de texte", () => {
  const r = parseResponse('```json\n{"translation":"rive","sourceLang":"en","alternatives":["berge"],"note":"contexte fluvial"}\n```');
  assert.deepStrictEqual(r, { translation: "rive", sourceLang: "en", alternatives: ["berge"], note: "contexte fluvial" });
  assert.strictEqual(parseResponse('Voici : {"translation":"banque"}').translation, "banque");
});

test("parseResponse se replie sur le texte brut", () => {
  assert.strictEqual(parseResponse("rive").translation, "rive");
});

const providers = require("../src/providers.js");

test("pickGeminiModel préfère un flash stable", () => {
  assert.strictEqual(providers.pickGeminiModel(["gemini-3-pro", "gemini-3-flash-preview", "gemini-3-flash", "gemini-3-flash-lite"]), "gemini-3-flash");
});

test("completeWithFallback bascule sur un modèle disponible en cas de 404", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("/models?")) return { ok: true, json: async () => ({ models: [
      { name: "models/gemini-3-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    ] }) };
    if (url.includes("gemini-old")) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }) };
  };
  const r = await providers.completeWithFallback({ provider: "gemini", apiKey: "k", model: "gemini-old" }, "s", "u");
  assert.deepStrictEqual(r, { text: "OK", model: "gemini-3-flash", persist: true });
  assert.strictEqual(calls.length, 3);
});

test("completeWithFallback : 503 → nouvel essai, puis autre modèle, sans le mémoriser", async () => {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("/models?")) return { ok: true, json: async () => ({ models: [
      { name: "models/gemini-busy", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3-flash-lite", supportedGenerationMethods: ["generateContent"] },
    ] }) };
    if (url.includes("gemini-busy")) return { ok: false, status: 503, json: async () => ({ error: { message: "high demand" } }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }) };
  };
  const r = await providers.completeWithFallback({ provider: "gemini", apiKey: "k", model: "gemini-busy" }, "s", "u");
  assert.deepStrictEqual(r, { text: "OK", model: "gemini-3-flash-lite", persist: false });
  assert.strictEqual(calls.filter((u) => u.includes("gemini-busy:")).length, 2); // 1 essai + 1 reprise
});

test("completeWithFallback ne bascule pas pour une clé invalide", async () => {
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: "API key not valid" } }) });
  await assert.rejects(providers.completeWithFallback({ provider: "gemini", apiKey: "bad", model: "m" }, "s", "u"), /API key not valid/);
});

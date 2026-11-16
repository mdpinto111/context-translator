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

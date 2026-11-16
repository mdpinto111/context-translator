// Extraction du contexte autour d'une sélection.
// Les fonctions "pures" (sur chaînes) sont exportées pour les tests Node.
(function (root) {
  const MAX_CONTEXT = 2000;
  const BLOCK_SELECTOR = "p, li, td, th, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6, article, section, div";

  function splitSentences(text, lang) {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        const seg = new Intl.Segmenter(lang || undefined, { granularity: "sentence" });
        return Array.from(seg.segment(text), (s) => ({ text: s.segment, start: s.index }));
      } catch (_) { /* repli ci-dessous */ }
    }
    const out = [];
    const re = /[^.!?。！？]+[.!?。！？]*\s*/g;
    let m;
    while ((m = re.exec(text))) out.push({ text: m[0], start: m.index });
    return out.length ? out : [{ text, start: 0 }];
  }

  /**
   * À partir du texte d'un bloc et de la position de la sélection dans ce bloc,
   * renvoie un extrait (N phrases avant/après) où la sélection est balisée.
   */
  function buildContextSnippet(blockText, selStart, selEnd, opts = {}) {
    const n = opts.sentences ?? 2;
    const max = opts.maxChars ?? MAX_CONTEXT;
    const sentences = splitSentences(blockText, opts.lang);
    let first = 0, last = sentences.length - 1;
    for (let i = 0; i < sentences.length; i++) {
      const s = sentences[i], e = s.start + s.text.length;
      if (s.start <= selStart && selStart < e) first = i;
      if (s.start < selEnd && selEnd <= e) { last = i; break; }
    }
    let from = Math.max(0, first - n);
    let to = Math.min(sentences.length - 1, last + n);
    const startPos = () => sentences[from].start;
    const endPos = () => sentences[to].start + sentences[to].text.length;
    // Réduction symétrique si trop long
    while (endPos() - startPos() > max && (from < first || to > last)) {
      if (first - from >= to - last && from < first) from++;
      else if (to > last) to--;
      else from++;
    }
    let a = startPos(), b = endPos();
    if (b - a > max) { // la sélection elle-même est énorme
      a = Math.max(0, selStart - max / 4);
      b = Math.min(blockText.length, selEnd + max / 4);
    }
    const before = blockText.slice(a, selStart);
    const sel = blockText.slice(selStart, selEnd);
    const after = blockText.slice(selEnd, b);
    return (before + "<selection>" + sel + "</selection>" + after).replace(/\s+/g, " ").trim();
  }

  // ---- Partie DOM (navigateur uniquement) ----
  function findBlock(node) {
    let el = node.nodeType === 1 ? node : node.parentElement;
    while (el && el !== document.body) {
      if (el.matches(BLOCK_SELECTOR) && el.innerText && el.innerText.trim().length > 20) return el;
      el = el.parentElement;
    }
    return el || document.body;
  }

  function nearestHeading(el) {
    let cur = el;
    while (cur && cur !== document.body) {
      let sib = cur.previousElementSibling;
      while (sib) {
        if (/^H[1-6]$/.test(sib.tagName)) return sib.innerText.trim();
        const h = sib.querySelector && sib.querySelector("h1,h2,h3,h4,h5,h6");
        if (h) return h.innerText.trim();
        sib = sib.previousElementSibling;
      }
      cur = cur.parentElement;
    }
    return "";
  }

  function getSelectionContext(opts = {}) {
    const active = document.activeElement;
    const pageLang = document.documentElement.lang || "";
    const base = { pageTitle: document.title || "", pageLang, heading: "", url: location.hostname };

    // Champs de saisie
    if (active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && /text|search|url|email/.test(active.type)))) {
      const { selectionStart: s, selectionEnd: e, value } = active;
      if (s == null || s === e) return null;
      return { ...base, selection: value.slice(s, e), context: buildContextSnippet(value, s, e, { ...opts, lang: pageLang }) };
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const selection = sel.toString().trim();
    if (!selection) return null;
    const range = sel.getRangeAt(0);
    const block = findBlock(range.commonAncestorContainer);

    // Position de la sélection dans le texte du bloc
    const pre = document.createRange();
    pre.selectNodeContents(block);
    pre.setEnd(range.startContainer, range.startOffset);
    // textContent et Range.toString partagent le même modèle de texte brut
    const fullText = block.textContent;
    const raw = range.toString();
    let start = pre.toString().length;
    let end = start + raw.length;
    if (fullText.slice(start, end) !== raw) {
      const idx = fullText.indexOf(raw);
      if (idx >= 0) { start = idx; end = idx + raw.length; }
    }
    return {
      ...base,
      heading: nearestHeading(block),
      selection,
      context: buildContextSnippet(fullText, start, end, { ...opts, lang: pageLang }),
    };
  }

  const api = { splitSentences, buildContextSnippet, getSelectionContext };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CtxTranslate = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

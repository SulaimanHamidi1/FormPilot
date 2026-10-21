// Text normalisation and cheap fuzzy similarity. Exposes JF.text.
(() => {
  const JF = (globalThis.JF = globalThis.JF || {});
  if (JF.text) return;

  const STOP = new Set('a an the of to in on for and or your you are is do does did be will would please this that with what which our we us as at by from if any have has i my me it its can'.split(' '));

  // "First-Name (required)" -> "first name required"; lowercases, strips accents.
  function normalize(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9+#]+/g, ' ')
      .trim();
  }

  // Attribute text: "firstName_input" -> "firstname input first name input",
  // keeping the unsplit form so "LinkedIn" still reads as "linkedin".
  function normalizeAttr(s) {
    const plain = normalize(s);
    const split = normalize(String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2'));
    return split === plain ? plain : plain + ' ' + split;
  }

  const stem =(w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w);

  function tokens(s, { keepStop = false } = {}) {
    const out = normalize(s).split(' ').filter(Boolean).map(stem);
    return keepStop ? out : out.filter((w) => !STOP.has(w));
  }

  // Dice coefficient over token sets.
  function tokenSim(a, b) {
    const A = new Set(Array.isArray(a) ? a : tokens(a));
    const B = new Set(Array.isArray(b) ? b : tokens(b));
    if (!A.size || !B.size) return 0;
    let n = 0;
    for (const t of A) if (B.has(t)) n++;
    return (2 * n) / (A.size + B.size);
  }

  // Whole-word containment of a normalised phrase in normalised text.
  function containsPhrase(text, phrase) {
    if (!phrase) return false;
    if (text === phrase) return true;
    const i = (' ' + text + ' ').indexOf(' ' + phrase + ' ');
    return i >= 0;
  }

  // Character-bigram Dice similarity for short strings (typos, abbreviations).
  function charSim(a, b) {
    a = normalize(a).replace(/ /g, '');
    b = normalize(b).replace(/ /g, '');
    if (a === b) return a ? 1 : 0;
    if (a.length < 2 || b.length < 2) return 0;
    const grams = new Map();
    for (let i = 0; i < a.length - 1; i++) {
      const g = a.slice(i, i + 2);
      grams.set(g, (grams.get(g) || 0) + 1);
    }
    let n = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const g = b.slice(i, i + 2);
      const c = grams.get(g);
      if (c) { n++; grams.set(g, c - 1); }
    }
    return (2 * n) / (a.length + b.length - 2);
  }

  JF.text = { normalize, normalizeAttr, tokens, tokenSim, containsPhrase, charSim, STOP };
})();

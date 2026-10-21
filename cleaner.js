// cleaner.js — the lookup table of hidden characters and the single-pass scan/clean.
// Shared by app.js (small texts, on the page) and worker.js (large texts, off the main thread).
// Pure functions only: no DOM, no network.

export const CATEGORIES = [
  { id: 'zwsp', label: 'Zero-width spaces', hint: 'Invisible break points (U+200B). Break searches, code and lookups.', group: 'zw' },
  { id: 'zwnj', label: 'Zero-width non-joiners', hint: 'Stop letters joining (U+200C). Real Persian and Indic text needs some.', group: 'zw' },
  { id: 'zwj', label: 'Zero-width joiners', hint: 'Glue characters together (U+200D). Emoji families are built with them.', group: 'zw' },
  { id: 'wj', label: 'Word joiners', hint: 'Invisible no-break glue between words (U+2060).', group: 'zw' },
  { id: 'bom', label: 'Byte order marks', hint: 'U+FEFF, often at the start of files. Breaks CSV headers and scripts.', group: 'zw' },
  { id: 'shy', label: 'Soft hyphens', hint: 'Hidden hyphenation hints inside words (U+00AD). Break exact-phrase search.', group: 'other' },
  { id: 'marks', label: 'Direction marks', hint: 'LRM, RLM and ALM: invisible hints for right-to-left text.', group: 'bidi' },
  { id: 'bidi', label: 'Bidi embeddings and overrides', hint: 'Controls that reorder text on screen (U+202A–202E, U+2066–2069).', group: 'bidi' },
  { id: 'spaces', label: 'Non-standard spaces', hint: 'Non-breaking, thin, hair, en, em, ideographic… Turned into a normal space.', group: 'space' },
  { id: 'vs', label: 'Variation selectors', hint: 'Pick emoji or text style for the previous character (U+FE00–FE0F).', group: 'other' },
  { id: 'tags', label: 'Tag characters', hint: 'Invisible copies of ASCII (U+E0000 block), used to hide prompts.', group: 'other' },
  { id: 'control', label: 'Other control characters', hint: 'Control and invisible format characters. Tabs and newlines are kept.', group: 'other' },
];

const CHARS = new Map(); // code point -> { cp, cat, short, name, replace }
function def(cat, cp, short, name, replace = '') { CHARS.set(cp, { cp, cat, short, name, replace }); }

def('zwsp', 0x200B, 'ZWSP', 'Zero width space');
def('zwsp', 0x180E, 'MVS', 'Mongolian vowel separator');
def('zwnj', 0x200C, 'ZWNJ', 'Zero width non-joiner');
def('zwj', 0x200D, 'ZWJ', 'Zero width joiner');
def('wj', 0x2060, 'WJ', 'Word joiner');
def('bom', 0xFEFF, 'BOM', 'Byte order mark (zero width no-break space)');
def('shy', 0x00AD, 'SHY', 'Soft hyphen');
def('marks', 0x200E, 'LRM', 'Left-to-right mark');
def('marks', 0x200F, 'RLM', 'Right-to-left mark');
def('marks', 0x061C, 'ALM', 'Arabic letter mark');
[[0x202A, 'LRE', 'Left-to-right embedding'], [0x202B, 'RLE', 'Right-to-left embedding'], [0x202C, 'PDF', 'Pop directional formatting'],
  [0x202D, 'LRO', 'Left-to-right override'], [0x202E, 'RLO', 'Right-to-left override'], [0x2066, 'LRI', 'Left-to-right isolate'],
  [0x2067, 'RLI', 'Right-to-left isolate'], [0x2068, 'FSI', 'First strong isolate'], [0x2069, 'PDI', 'Pop directional isolate'],
].forEach(([cp, s, n]) => def('bidi', cp, s, n));
[[0x00A0, 'NBSP', 'No-break space'], [0x1680, 'OSM', 'Ogham space mark'], [0x2000, 'NQSP', 'En quad'], [0x2001, 'MQSP', 'Em quad'],
  [0x2002, 'ENSP', 'En space'], [0x2003, 'EMSP', 'Em space'], [0x2004, '3/MSP', 'Three-per-em space'], [0x2005, '4/MSP', 'Four-per-em space'],
  [0x2006, '6/MSP', 'Six-per-em space'], [0x2007, 'FSP', 'Figure space'], [0x2008, 'PSP', 'Punctuation space'], [0x2009, 'THSP', 'Thin space'],
  [0x200A, 'HSP', 'Hair space'], [0x202F, 'NNBSP', 'Narrow no-break space'], [0x205F, 'MMSP', 'Medium mathematical space'],
  [0x3000, 'IDSP', 'Ideographic space'],
].forEach(([cp, s, n]) => def('spaces', cp, s, n, ' '));
def('spaces', 0x2028, 'LSEP', 'Line separator', '\n');
def('spaces', 0x2029, 'PSEP', 'Paragraph separator', '\n');
for (let i = 0; i < 16; i++) def('vs', 0xFE00 + i, `VS${i + 1}`, `Variation selector ${i + 1}`);
for (let i = 0; i < 240; i++) def('vs', 0xE0100 + i, `VS${i + 17}`, `Variation selector ${i + 17}`);
def('tags', 0xE0001, 'LANG', 'Language tag');
for (let cp = 0xE0020; cp <= 0xE007E; cp++) {
  const ch = String.fromCharCode(cp - 0xE0000);
  def('tags', cp, cp === 0xE0020 ? 'TAG ␠' : `TAG ${ch}`, `Tag ${cp === 0xE0020 ? 'space' : `“${ch}”`}`);
}
def('tags', 0xE007F, 'CANCEL', 'Cancel tag');
const C0 = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
  'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];
C0.forEach((s, cp) => { if (cp !== 0x09 && cp !== 0x0A && cp !== 0x0D) def('control', cp, s, `Control character ${s}`); });
def('control', 0x7F, 'DEL', 'Delete control character');
for (let cp = 0x80; cp <= 0x9F; cp++) def('control', cp, cp === 0x85 ? 'NEL' : 'C1', cp === 0x85 ? 'Next line' : 'C1 control character', cp === 0x85 ? '\n' : '');
[[0x2061, 'FA', 'Function application'], [0x2062, 'IT', 'Invisible times'], [0x2063, 'IS', 'Invisible separator'], [0x2064, 'IP', 'Invisible plus'],
  [0x206A, 'ISS', 'Inhibit symmetric swapping'], [0x206B, 'ASS', 'Activate symmetric swapping'], [0x206C, 'IAFS', 'Inhibit Arabic form shaping'],
  [0x206D, 'AAFS', 'Activate Arabic form shaping'], [0x206E, 'NADS', 'National digit shapes'], [0x206F, 'NODS', 'Nominal digit shapes'],
  [0xFFF9, 'IAA', 'Interlinear annotation anchor'], [0xFFFA, 'IAS', 'Interlinear annotation separator'], [0xFFFB, 'IAT', 'Interlinear annotation terminator'],
  [0x115F, 'HCF', 'Hangul choseong filler'], [0x1160, 'HJF', 'Hangul jungseong filler'], [0x3164, 'HF', 'Hangul filler'], [0xFFA0, 'HWHF', 'Halfwidth Hangul filler'],
  [0x17B4, 'KIVAQ', 'Khmer inherent vowel aq'], [0x17B5, 'KIVAA', 'Khmer inherent vowel aa'],
].forEach(([cp, s, n]) => def('control', cp, s, n));
for (let cp = 0x1D173; cp <= 0x1D17A; cp++) def('control', cp, 'MUS', 'Musical format character');

export function lookup(cp) { return CHARS.get(cp); }

export function hex(cp) { return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`; }

// Safety rule: joiners next to emoji or inside scripts that shape with them, variation selectors after emoji
// (or CJK ideographs), and tag sequences that spell a subdivision flag such as England's.
const EMOJI_NEAR = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\u{FE0F}\u{20E3}]/u;
const JOINING_SCRIPT = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;
const VS_BASE = /[\p{Emoji}\p{Script=Han}]/u;
const RTL_SCRIPT = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u;
const BLACK_FLAG = 0x1F3F4;
const isTag = (cp) => cp >= 0xE0000 && cp <= 0xE007F;

function cpBefore(text, i) {
  if (i <= 0) return -1;
  const lo = text.charCodeAt(i - 1);
  if (lo >= 0xDC00 && lo <= 0xDFFF && i >= 2) {
    const hi = text.charCodeAt(i - 2);
    if (hi >= 0xD800 && hi <= 0xDBFF) return ((hi - 0xD800) << 10) + (lo - 0xDC00) + 0x10000;
  }
  return lo;
}
const test = (re, cp) => cp >= 0 && re.test(String.fromCodePoint(cp));

function isSafe(text, i, len, info, state) {
  if (info.cat === 'zwj' || info.cat === 'zwnj') {
    const prev = cpBefore(text, i);
    const next = i + len < text.length ? text.codePointAt(i + len) : -1;
    return test(EMOJI_NEAR, prev) || test(EMOJI_NEAR, next) || test(JOINING_SCRIPT, prev) || test(JOINING_SCRIPT, next);
  }
  if (info.cat === 'vs') return test(VS_BASE, cpBefore(text, i));
  if (info.cat === 'tags') {
    const prev = cpBefore(text, i);
    if (!isTag(prev)) state.tagBase = prev;
    return state.tagBase === BLACK_FLAG;
  }
  return false;
}

// 'remove' | 'off' (category not selected) | 'safe' (kept by the safety rule). Call in text order with one state object.
export function decide(text, i, len, info, opts, state) {
  if (!opts.remove[info.cat]) return 'off';
  if (opts.safety && isSafe(text, i, len, info, state)) return 'safe';
  return 'remove';
}

export function newState() { return { tagBase: -1 }; }

export function countCodePoints(text) {
  let n = text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xDC00 && d <= 0xDFFF) { n--; i++; }
    }
  }
  return n;
}

// Walks the text once, code point by code point, so surrogate pairs are never split (lone surrogates are left alone).
// onProgress(fraction) is called every `chunk` code units; the worker uses it to drive the progress bar.
export function scanClean(text, opts, onProgress, chunk = 1 << 20) {
  const counts = {};
  for (const c of CATEGORIES) counts[c.id] = { found: 0, removed: 0, kept: 0, safe: 0 };
  const chars = new Map(); // cp -> { cp, short, name, cat, found }
  const state = newState();
  const n = text.length;
  let out = '';
  let run = 0;
  let removed = 0;
  let replaced = 0;
  let nextReport = chunk;
  for (let i = 0; i < n;) {
    const c = text.charCodeAt(i);
    if (c >= 0x20 && c < 0x7F) { i++; continue; }
    let cp = c;
    let len = 1;
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < n) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xDC00 && d <= 0xDFFF) { cp = ((c - 0xD800) << 10) + (d - 0xDC00) + 0x10000; len = 2; }
    }
    const info = CHARS.get(cp);
    if (info) {
      const verdict = decide(text, i, len, info, opts, state);
      const cnt = counts[info.cat];
      cnt.found++;
      let rec = chars.get(cp);
      if (!rec) { rec = { cp, short: info.short, name: info.name, cat: info.cat, found: 0 }; chars.set(cp, rec); }
      rec.found++;
      if (verdict === 'remove') {
        cnt.removed++;
        if (info.replace) replaced++; else removed++;
        out += text.slice(run, i) + info.replace;
        run = i + len;
      } else if (verdict === 'safe') { cnt.safe++; } else { cnt.kept++; }
    }
    i += len;
    if (onProgress && i >= nextReport) { onProgress(i / n); nextReport += chunk; }
  }
  out += text.slice(run);

  const extras = { eol: 0, trimmed: 0, collapsed: 0 };
  if (opts.eol) out = out.replace(/\r\n?/g, () => { extras.eol++; return '\n'; });
  if (opts.trim) out = out.replace(/[ \t]+(?=\r?\n|\r|$)/g, () => { extras.trimmed++; return ''; });
  if (opts.collapse) out = out.replace(/([^ \t\r\n]) {2,}/g, (_, ch) => { extras.collapsed++; return `${ch} `; });

  let found = 0;
  for (const c of CATEGORIES) found += counts[c.id].found;
  return {
    output: out,
    counts,
    chars: [...chars.values()].sort((a, b) => b.found - a.found || a.cp - b.cp),
    found,
    removed,
    replaced,
    extras,
    before: countCodePoints(text),
    after: countCodePoints(out),
    rtl: RTL_SCRIPT.test(text),
  };
}

// Splits the first `limit` code units of text into plain runs and hidden-character entries for the reveal view.
export function revealSegments(text, opts, limit) {
  const segs = [];
  const state = newState();
  const n = Math.min(text.length, limit);
  let run = 0;
  for (let i = 0; i < n;) {
    const c = text.charCodeAt(i);
    if (c >= 0x20 && c < 0x7F) { i++; continue; }
    let cp = c;
    let len = 1;
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xDC00 && d <= 0xDFFF) { cp = ((c - 0xD800) << 10) + (d - 0xDC00) + 0x10000; len = 2; }
    }
    const info = CHARS.get(cp);
    if (info) {
      if (run < i) segs.push(text.slice(run, i));
      segs.push({ info, verdict: decide(text, i, len, info, opts, state) });
      run = i + len;
    }
    i += len;
  }
  const end = Math.min(text.length, Math.max(n, run));
  if (run < end) segs.push(text.slice(run, end));
  return segs;
}

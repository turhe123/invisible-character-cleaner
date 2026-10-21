// app.js — Invisible Character Cleaner UI. Everything runs on this device; nothing is stored or sent.
import { toast, downloadBlob, formatBytes, wireDropzone } from './site.js';
import { CATEGORIES, scanClean, revealSegments, hex } from './cleaner.js';

// Fictional sample (same text as tests/fixtures/bakery-notes.txt, written by tests/make-fixtures.js).
const SAMPLE_TEXT = '\uFEFFQuarterly Notes for Maple Street Bakery\n\n'
  + 'Prepared by Juniper Vale\u200F for the morning team.\n\n'
  + 'Best sellers this quarter:\n'
  + '- Crois\u200Bsant, butter and almond: up 12%\n'
  + '- Sour\u200Bdo\u200Bugh loaf: steady\n'
  + '- Café crème brûlée tart: new this season\n\n'
  + 'Flour order: 25\u00A0kg of stone-ground wheat every Friday, plus 4\u00A0kg of rye.\n'
  + 'The extra\u00ADordinarily popular seeded rye returns in spring.\n\n'
  + 'Thanks from the whole family \u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} at the counter!\n';

const MAX_FILE = 20 * 1024 * 1024;
const WORKER_MIN = 1_500_000; // code units; above this, cleaning runs in worker.js
const REVEAL_LIMIT = 300_000; // characters shown as chips in the reveal view
const TEXT_EXT = new Set(['txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'ndjson', 'log', 'srt', 'vtt', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'xml', 'html', 'htm', 'svg', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h',
  'cc', 'cpp', 'hpp', 'cs', 'php', 'pl', 'lua', 'r', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'tex', 'rst', 'adoc', 'gitignore', 'dockerfile', 'makefile']);
const GROUP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.group]));
const nf = new Intl.NumberFormat('en');

const $ = (id) => document.getElementById(id);
const input = $('input');
const output = $('output');
const revealToggle = $('reveal');
const revealView = $('reveal-view');
const statusLine = $('status');
const emptyState = $('empty-state');
const results = $('results');
const progress = $('progress');
const btnClean = $('clean');
const btnCopy = $('copy');
const btnDownload = $('download');
const btnClear = $('clear');
const catList = $('categories');

// source: the exact loaded text (a textarea turns \r\n into \n), used until the user edits the box.
const state = { fileName: null, source: null, result: null, errors: [], runId: 0, worker: null };
const getText = () => (state.source ?? input.value);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// ---------- Category checklist ----------
for (const c of CATEGORIES) {
  const li = el('li', 'icc-cat is-zero');
  li.dataset.cat = c.id;
  const label = el('label', 'icc-cat__label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = `cat-${c.id}`;
  box.dataset.cat = c.id;
  box.checked = true;
  box.setAttribute('aria-describedby', `hint-${c.id}`);
  const count = el('span', 'icc-cat__count', '0');
  count.dataset.count = c.id;
  label.append(box, el('span', 'icc-cat__name', c.label), count);
  const hint = el('p', 'icc-cat__hint', c.hint);
  hint.id = `hint-${c.id}`;
  li.append(label, hint);
  catList.append(li);
}

function getOpts() {
  const remove = {};
  catList.querySelectorAll('input[data-cat]').forEach((b) => { remove[b.dataset.cat] = b.checked; });
  return { remove, safety: $('opt-safety').checked, trim: $('opt-trim').checked, collapse: $('opt-collapse').checked, eol: $('opt-eol').checked };
}

// ---------- Running the cleaner ----------
function run({ announce = false } = {}) {
  const text = getText();
  const id = ++state.runId;
  output.dataset.state = 'pending';
  emptyState.hidden = text.length > 0;
  if (!text) {
    stopWorker();
    state.result = null;
    output.value = '';
    output.dataset.state = 'done';
    render();
    return Promise.resolve(null);
  }
  const opts = getOpts();
  if (text.length < WORKER_MIN) {
    stopWorker();
    finish(id, scanClean(text, opts), announce);
    return Promise.resolve(state.result);
  }
  return runInWorker(id, text, opts, announce);
}

function stopWorker() {
  if (state.worker) { state.worker.terminate(); state.worker = null; }
  progress.hidden = true;
}

function setProgress(value) {
  progress.hidden = false;
  const pct = Math.min(99, Math.floor(value * 100)); // never claim 100% until the result is in
  progress.firstElementChild.style.width = `${pct}%`;
  progress.setAttribute('aria-valuenow', String(pct));
  statusLine.textContent = `Cleaning a large text… ${pct}%`;
}

function runInWorker(id, text, opts, announce) {
  stopWorker();
  setProgress(0);
  btnCopy.disabled = true;
  btnDownload.disabled = true;
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      finish(id, scanClean(text, opts), announce); // very old browsers: clean on the page instead
      resolve(state.result);
      return;
    }
    state.worker = worker;
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') setProgress(msg.value);
      else if (msg.type === 'done') { stopWorker(); finish(id, msg.result, announce); resolve(state.result); }
      else if (msg.type === 'error') { stopWorker(); state.errors = [`Cleaning failed: ${msg.message}`]; render(); resolve(null); }
    };
    worker.onerror = () => {
      stopWorker();
      finish(id, scanClean(text, opts), announce);
      resolve(state.result);
    };
    worker.postMessage({ id, text, opts });
  });
}

function finish(id, result, announce) {
  if (id !== state.runId) return;
  state.result = result;
  output.value = result.output;
  output.dataset.state = 'done';
  render();
  if (announce) {
    results.querySelector('.result, .alert')?.scrollIntoView({ block: 'nearest' });
    const changed = result.removed + result.replaced + result.extras.eol + result.extras.trimmed + result.extras.collapsed;
    toast(result.found === 0 && changed === 0 ? 'Already clean: no hidden characters found' : `Cleaned: ${nf.format(result.removed)} removed, ${nf.format(result.replaced)} replaced`);
  }
}

// ---------- Rendering ----------
function plural(n, one, many = `${one}s`) { return `${nf.format(n)} ${n === 1 ? one : many}`; }

function render() {
  const r = state.result;
  results.replaceChildren();
  for (const msg of state.errors) results.append(el('div', 'alert alert--error', msg));

  for (const c of CATEGORIES) {
    const cnt = r ? r.counts[c.id] : null;
    const li = catList.querySelector(`[data-cat="${c.id}"]`);
    const found = cnt ? cnt.found : 0;
    li.classList.toggle('is-zero', found === 0);
    const badge = li.querySelector('.icc-cat__count');
    badge.textContent = nf.format(found);
    badge.title = cnt && cnt.safe ? `${cnt.safe} kept by the safety rule` : '';
  }

  const name = outputName();
  btnDownload.textContent = `Download ${name}`;
  btnDownload.disabled = !r;
  btnCopy.disabled = !r;

  if (!r) {
    statusLine.textContent = 'Paste text, drop a file or load the sample to start.';
    renderReveal();
    return;
  }

  const changes = [];
  if (r.removed) changes.push(`${nf.format(r.removed)} removed`);
  if (r.replaced) changes.push(`${nf.format(r.replaced)} replaced with a space or newline`);
  statusLine.textContent = `Before: ${plural(r.before, 'character')} · After: ${plural(r.after, 'character')}${changes.length ? ` · ${changes.join(', ')}` : ''}`;

  if (r.found === 0) {
    results.append(el('div', 'alert alert--ok', 'No hidden characters found. Your text is already clean.'));
  } else {
    const card = el('div', 'result icc-report');
    const meta = el('div', 'result__meta');
    const kinds = r.chars.length;
    meta.append(el('div', 'result__name', `Found ${plural(r.found, 'hidden character')} of ${plural(kinds, 'kind')}`));
    const safe = CATEGORIES.reduce((n, c) => n + r.counts[c.id].safe, 0);
    const off = CATEGORIES.reduce((n, c) => n + r.counts[c.id].kept, 0);
    const info = [];
    info.push(`${nf.format(r.removed + r.replaced)} cleaned`);
    if (safe) info.push(`${nf.format(safe)} kept by the safety rule (emoji, joined scripts)`);
    if (off) info.push(`${nf.format(off)} kept because their category is off`);
    meta.append(el('div', 'result__info', info.join(' · ')));
    const list = el('ul', 'icc-found');
    list.setAttribute('aria-label', 'Hidden characters by type');
    for (const ch of r.chars) {
      const item = el('li', `ich ich--${GROUP[ch.cat]}`);
      item.title = ch.name;
      item.append(el('b', null, ch.short), el('small', null, hex(ch.cp)), el('span', 'ich__n', `×${nf.format(ch.found)}`));
      list.append(item);
    }
    card.append(meta, list);
    results.append(card);
    const dirFound = r.counts.marks.removed + r.counts.bidi.removed;
    if (r.rtl && dirFound) {
      results.append(el('div', 'alert alert--warn', 'This text contains right-to-left script. Removing direction marks may change the display order of mixed text; untick “Direction marks” and “Bidi embeddings” to keep them.'));
    }
  }
  const x = r.extras;
  const extras = [];
  if (x.eol) extras.push(`${plural(x.eol, 'line ending')} normalised`);
  if (x.trimmed) extras.push(`trailing spaces trimmed on ${plural(x.trimmed, 'line')}`);
  if (x.collapsed) extras.push(`${plural(x.collapsed, 'run')} of spaces collapsed`);
  if (extras.length) results.append(el('p', 'icc-extras', `Extras: ${extras.join(', ')}.`));
  renderReveal();
}

function renderReveal() {
  const on = revealToggle.checked;
  input.hidden = on;
  revealView.hidden = !on;
  if (!on) { revealView.replaceChildren(); return; }
  const text = getText();
  const frag = document.createDocumentFragment();
  if (!text) {
    frag.append(el('span', 'icc-reveal__empty', 'Nothing to reveal yet. Turn Reveal off to paste text.'));
  } else {
    for (const seg of revealSegments(text, getOpts(), REVEAL_LIMIT)) {
      if (typeof seg === 'string') { frag.append(seg); continue; }
      const { info, verdict } = seg;
      const chip = el('span', `ich ich--${GROUP[info.cat]}${verdict === 'remove' ? '' : ' is-kept'}`);
      const fate = verdict === 'remove' ? (info.replace ? 'replaced' : 'removed') : verdict === 'safe' ? 'kept by the safety rule' : 'kept (category off)';
      chip.title = `${info.name}, ${hex(info.cp)}: ${fate}`;
      chip.append(el('b', null, info.short), el('small', null, hex(info.cp)));
      frag.append(chip);
      if (info.replace === '\n') frag.append('\n');
    }
    if (text.length > REVEAL_LIMIT) {
      frag.append(el('span', 'icc-reveal__more', `Showing the first ${nf.format(REVEAL_LIMIT)} characters. The counts and the cleaned result cover the whole text.`));
    }
  }
  revealView.replaceChildren(frag);
}

function outputName() {
  if (!state.fileName) return 'cleaned.txt';
  const m = state.fileName.match(/^(.*?)(\.[^.]+)?$/);
  return `${m[1] || 'text'}-cleaned${m[2] || '.txt'}`;
}

// ---------- Actions ----------
async function copyResult() {
  const text = state.result ? state.result.output : '';
  if (!text) { toast('Nothing to copy yet'); return; }
  try {
    await navigator.clipboard.writeText(text);
    toast('Cleaned text copied');
  } catch {
    // Safari without clipboard permission: select the result and use the legacy copy command.
    output.focus();
    output.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    toast(ok ? 'Cleaned text copied' : 'Press Ctrl+C (or Cmd+C) to copy the selected result');
  }
}

function downloadResult() {
  if (!state.result) return;
  const name = outputName();
  downloadBlob(new Blob([state.result.output], { type: 'text/plain;charset=utf-8' }), name);
  toast(`Saved ${name} (${formatBytes(new Blob([state.result.output]).size)})`);
}

function setText(text, fileName) {
  state.errors = [];
  state.fileName = fileName;
  state.source = text;
  input.value = text;
  return run({ announce: true });
}

async function readTextFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF)) {
    throw new Error(`${file.name} is saved as UTF-16, not UTF-8. Re-save it as UTF-8 and try again.`);
  }
  try {
    // ignoreBOM keeps a leading byte order mark in the text so it can be reported and removed.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`${file.name} is not valid UTF-8 text. Re-save it as UTF-8 (most editors offer this under “Save as”) and try again.`);
  }
}

function isTextFile(file) {
  const name = file.name.toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : name;
  if (TEXT_EXT.has(ext)) return true;
  return /^text\//.test(file.type) || /json|xml|javascript/.test(file.type);
}

async function handleFiles(files) {
  const errors = [];
  const ok = [];
  for (const f of files) {
    if (!isTextFile(f)) errors.push(`${f.name} is not a text file. Drop a .txt, .md, .csv, .json or code file.`);
    else if (f.size > MAX_FILE) errors.push(`${f.name} is ${formatBytes(f.size)}; the limit is ${formatBytes(MAX_FILE)}.`);
    else ok.push(f);
  }
  if (ok.length > 1) errors.push(`Only one file is cleaned at a time, so ${ok[0].name} was loaded and ${plural(ok.length - 1, 'other file')} skipped.`);
  if (ok.length) {
    try {
      const text = await readTextFile(ok[0]);
      if (revealToggle.checked && text.length > REVEAL_LIMIT) revealToggle.checked = false;
      await setText(text, ok[0].name);
      toast(`${ok[0].name} loaded (${formatBytes(ok[0].size)}), nothing was uploaded`);
    } catch (err) {
      errors.push(err.message);
    }
  }
  state.errors = errors;
  render();
  if (errors.length) results.firstElementChild?.scrollIntoView({ block: 'nearest' });
}

// ---------- Wiring ----------
let typingTimer = 0;
// Read from the input event (not only paste): mobile Safari paste events can carry trimmed text.
input.addEventListener('input', () => {
  state.errors = [];
  state.source = null;
  output.dataset.state = 'pending';
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => run(), input.value.length > 200_000 ? 300 : 40);
});
input.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
input.addEventListener('drop', (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) { e.preventDefault(); handleFiles(files); }
});
$('options').addEventListener('change', () => run());
revealToggle.addEventListener('change', () => {
  renderReveal();
  (revealToggle.checked ? revealView : input).scrollTop = 0;
});
btnClean.addEventListener('click', () => {
  if (!getText()) { toast('Paste some text first, or load the sample'); input.focus(); return; }
  run({ announce: true });
});
btnCopy.addEventListener('click', copyResult);
btnDownload.addEventListener('click', downloadResult);
btnClear.addEventListener('click', () => {
  state.fileName = null;
  state.source = null;
  state.errors = [];
  input.value = '';
  revealToggle.checked = false;
  run();
  input.focus();
});
$('load-sample').addEventListener('click', () => setText(SAMPLE_TEXT, null));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); copyResult(); }
});
wireDropzone($('dropzone'), $('file-input'), handleFiles);

run();

// Called by the factory's screenshot script: loads the fictional bakery note and shows the reveal view with a result.
window.__demo = async () => {
  const res = await fetch('./tests/fixtures/bakery-notes.txt');
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer());
  revealToggle.checked = true;
  await setText(text, 'bakery-notes.txt');
};

export { handleFiles, SAMPLE_TEXT };

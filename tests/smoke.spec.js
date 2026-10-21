// smoke.spec.js — Invisible Character Cleaner: the acceptance checks from SPEC.md on fictional fixtures.
// Fixtures are written by tests/make-fixtures.js (bakery-notes.txt, latin1-notes.txt).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const fixture = (name) => path.join(__dirname, 'fixtures', name);
const SAMPLE = fs.readFileSync(fixture('bakery-notes.txt'), 'utf8'); // starts with a BOM
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}';
const count = (page, cat) => page.locator(`[data-count="${cat}"]`);

async function paste(page, text) {
  await page.locator('#input').fill(text);
  await expect(page.locator('#output')).toHaveAttribute('data-state', 'done');
}

test.describe('Invisible Character Cleaner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
  });

  test('fixture starts with a BOM and matches the built-in sample', async ({ page }) => {
    expect(SAMPLE.charCodeAt(0)).toBe(0xFEFF);
    await page.click('#load-sample');
    await expect(page.locator('#output')).toHaveAttribute('data-state', 'done');
    expect(await page.locator('#input').inputValue()).toBe(SAMPLE);
  });

  test('pasting the sample shows a count per character type greater than zero', async ({ page }) => {
    await paste(page, SAMPLE);
    await expect(count(page, 'zwsp')).toHaveText('3');
    await expect(count(page, 'bom')).toHaveText('1');
    await expect(count(page, 'spaces')).toHaveText('2');
    await expect(count(page, 'shy')).toHaveText('1');
    await expect(count(page, 'marks')).toHaveText('1');
    await expect(count(page, 'zwj')).toHaveText('3');
    await expect(count(page, 'bidi')).toHaveText('0');
    const report = page.locator('#results .icc-report');
    await expect(report).toContainText('Found 11 hidden characters');
    for (const label of ['ZWSP', 'NBSP', 'BOM', 'SHY', 'RLM']) await expect(report.locator('.ich', { hasText: label })).toHaveCount(1);
    await expect(page.locator('#status')).toContainText('Before: 414 characters');
  });

  test('Clean removes zero-width characters but keeps emoji and accented letters', async ({ page }) => {
    await paste(page, SAMPLE);
    await page.click('#clean');
    await expect(page.locator('.toast')).toContainText('Cleaned');
    const out = await page.locator('#output').inputValue();
    expect(out).not.toMatch(/[\u200B\uFEFF\u00AD\u200E\u200F\u00A0\u2060]/);
    expect(out).toContain('Croissant');
    expect(out).toContain('Sourdough');
    expect(out).toContain('25 kg');
    expect(out).toContain('extraordinarily');
    expect(out).toContain('Café crème brûlée');
    expect(out).toContain(FAMILY);
    // The only joiners left are the three inside the family emoji.
    expect(out.split('\u200D').length - 1).toBe(3);
    expect(out.replace(FAMILY, '')).not.toContain('\u200D');
    await expect(page.locator('#status')).toContainText('After: 408 characters');
  });

  test('turning the safety rule off removes emoji joiners too', async ({ page }) => {
    await paste(page, SAMPLE);
    await page.uncheck('#opt-safety');
    await expect.poll(async () => (await page.locator('#output').inputValue()).includes('\u200D')).toBe(false);
  });

  test('reveal view shows hidden characters as labelled chips', async ({ page }) => {
    await paste(page, SAMPLE);
    await page.check('#reveal');
    const view = page.locator('#reveal-view');
    await expect(view).toBeVisible();
    await expect(page.locator('#input')).toBeHidden();
    await expect(view.locator('.ich', { hasText: 'ZWSP' })).toHaveCount(3);
    await expect(view.locator('.ich', { hasText: 'NBSP' })).toHaveCount(2);
    await expect(view.locator('.ich', { hasText: 'BOM' })).toHaveCount(1);
    await expect(view.locator('.ich', { hasText: 'ZWSP' }).first()).toContainText('U+200B');
    await expect(view.locator('.ich', { hasText: 'NBSP' }).first()).toContainText('U+00A0');
    // Emoji joiners are shown as kept (dashed) chips.
    await expect(view.locator('.ich.is-kept', { hasText: 'ZWJ' })).toHaveCount(3);
    await expect(view).toContainText('Crois');
    await page.uncheck('#reveal');
    await expect(page.locator('#input')).toBeVisible();
  });

  test('reveal view never interprets text as HTML', async ({ page }) => {
    await paste(page, '<img src=x onerror="window.__pwned=1">\u200B<b>bold</b>');
    await page.check('#reveal');
    await expect(page.locator('#reveal-view img')).toHaveCount(0);
    await expect(page.locator('#reveal-view')).toContainText('<b>bold</b>');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });

  test('toggling off non-breaking spaces leaves them in the output', async ({ page }) => {
    await paste(page, SAMPLE);
    expect(await page.locator('#output').inputValue()).not.toContain('\u00A0');
    await page.uncheck('#cat-spaces');
    await expect.poll(async () => (await page.locator('#output').inputValue()).split('\u00A0').length - 1).toBe(2);
    const out = await page.locator('#output').inputValue();
    expect(out).toContain('25\u00A0kg');
    expect(out).not.toContain('\u200B');
    await expect(page.locator('#results')).toContainText('2 kept because their category is off');
  });

  test('cleaned text can be copied (button and Ctrl+Enter) and downloaded as a txt file', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await paste(page, SAMPLE);
    const expected = await page.locator('#output').inputValue();

    await page.click('#copy');
    await expect(page.locator('.toast')).toContainText('copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);

    await page.evaluate(() => navigator.clipboard.writeText('placeholder'));
    await page.locator('#input').focus();
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);

    await expect(page.locator('#download')).toHaveText('Download cleaned.txt');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    expect(download.suggestedFilename()).toBe('cleaned.txt');
    const bytes = fs.readFileSync(await download.path());
    expect(bytes.length).toBe(Buffer.byteLength(expected, 'utf8'));
    const text = bytes.toString('utf8');
    expect(text).toBe(expected);
    expect(text).not.toMatch(/[\u200B\uFEFF\u00A0]/);
    expect(text).toContain(FAMILY);
  });

  test('a dropped file is cleaned and downloads as name-cleaned.txt', async ({ page }) => {
    await page.setInputFiles('#file-input', fixture('bakery-notes.txt'));
    await expect(count(page, 'bom')).toHaveText('1');
    await expect(page.locator('#download')).toHaveText('Download bakery-notes-cleaned.txt');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    expect(download.suggestedFilename()).toBe('bakery-notes-cleaned.txt');
    const text = fs.readFileSync(await download.path(), 'utf8');
    expect(text.startsWith('Quarterly Notes')).toBe(true);
  });

  test('wrong file types are rejected, also when mixed with a valid file', async ({ page }) => {
    await page.setInputFiles('#file-input', [fixture('sample.png'), fixture('bakery-notes.txt')]);
    await expect(page.locator('#results .alert--error')).toContainText('sample.png is not a text file');
    await expect(count(page, 'zwsp')).toHaveText('3');
  });

  test('a file that is not valid UTF-8 shows a clear error', async ({ page }) => {
    await page.setInputFiles('#file-input', fixture('latin1-notes.txt'));
    await expect(page.locator('#results .alert--error')).toContainText('not valid UTF-8');
  });

  test('clean text says it is already clean; tabs, newlines and astral characters survive', async ({ page }) => {
    await page.setInputFiles('#file-input', fixture('sample.txt'));
    await expect(page.locator('#results .alert--ok')).toContainText('already clean');
    const tricky = 'a\tb\nc\n\u{1D11E} \uD800 lone \u{1F600}';
    await paste(page, tricky);
    await expect(page.locator('#results .alert--ok')).toContainText('already clean');
    // Compare inside the page: a lone surrogate would be replaced by U+FFFD on its way to Node.
    expect(await page.evaluate(() => document.getElementById('output').value === document.getElementById('input').value)).toBe(true);
    expect(await page.locator('#output').inputValue()).toContain('a\tb\nc\n\u{1D11E}');
  });

  test('right-to-left text with direction marks gets a warning', async ({ page }) => {
    await paste(page, 'Menu مخبز\u200F 12');
    await expect(page.locator('#results .alert--warn')).toContainText('right-to-left');
  });

  test('extras are off by default and work when switched on', async ({ page }) => {
    // A file keeps its CRLF line endings (a textarea alone would turn them into LF).
    const crlf = 'one  two   \r\nthree\u2003 four\r\n';
    await page.setInputFiles('#file-input', { name: 'crlf-notes.txt', mimeType: 'text/plain', buffer: Buffer.from(crlf, 'utf8') });
    await expect(count(page, 'spaces')).toHaveText('1');
    const save = async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
      return fs.readFileSync(await download.path(), 'utf8');
    };
    expect(await save()).toBe('one  two   \r\nthree  four\r\n');
    await page.check('#opt-trim');
    await page.check('#opt-collapse');
    await page.check('#opt-eol');
    await expect(page.locator('#results')).toContainText('2 line endings normalised');
    expect(await save()).toBe('one two\nthree four\n');
  });

  test('large texts are cleaned in a worker with progress', async ({ page }) => {
    const big = await page.evaluate(() => {
      const line = 'Sour\u200Bdough\u00A0kg \u{1F468}\u200D\u{1F469} café\n';
      return line.repeat(Math.ceil(2_000_000 / line.length));
    });
    const workerLoaded = page.waitForRequest(/worker\.js$/);
    await page.evaluate((t) => {
      const el = document.getElementById('input');
      el.value = t;
      el.dispatchEvent(new Event('input'));
    }, big);
    await workerLoaded;
    await expect(page.locator('#status')).toContainText('After:', { timeout: 30_000 });
    await expect(page.locator('#progress')).toBeHidden();
    const lines = big.split('\n').length - 1;
    await expect(count(page, 'zwsp')).toHaveText(new Intl.NumberFormat('en').format(lines));
    const out = await page.locator('#output').inputValue();
    expect(out).not.toContain('\u200B');
    expect(out).toContain('\u{1F468}\u200D\u{1F469}');
  });

  test('Clear empties everything and shows the sample button', async ({ page }) => {
    await paste(page, SAMPLE);
    await page.click('#clear');
    await expect(page.locator('#input')).toHaveValue('');
    await expect(page.locator('#output')).toHaveValue('');
    await expect(page.locator('#load-sample')).toBeVisible();
    await expect(page.locator('#copy')).toBeDisabled();
  });

  test('__demo shows a finished result', async ({ page }) => {
    await page.evaluate(() => window.__demo());
    await expect(page.locator('#reveal-view .ich').first()).toBeVisible();
    await expect(page.locator('#results .icc-report')).toBeVisible();
  });

  test('layout works at 390px wide', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./');
    await page.click('#load-sample');
    await page.check('#reveal');
    await expect(page.locator('#reveal-view .ich').first()).toBeVisible();
    const widths = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    expect(widths.doc).toBeLessThanOrEqual(widths.win + 1);
    for (const sel of ['#input', '#clean', '#copy', '#download', '#clear', '#categories', '#output', '#reveal-view']) {
      const box = await page.locator(sel).boundingBox();
      if (!box) continue;
      expect(box.x, `${sel} starts inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${sel} fits the viewport`).toBeLessThanOrEqual(391);
    }
    const editor = await page.locator('#reveal-view').boundingBox();
    expect(editor.y).toBeLessThan(844);
  });
});

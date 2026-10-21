// make-fixtures.js — writes the small, fictional text fixtures used by smoke.spec.js and window.__demo.
// Run with: node tests/make-fixtures.js
// The sample text must stay identical to SAMPLE_TEXT in app.js (a smoke test checks this).
const fs = require('fs');
const path = require('path');

const SAMPLE_TEXT = '\uFEFFQuarterly Notes for Maple Street Bakery\n\n'
  + 'Prepared by Juniper Vale\u200F for the morning team.\n\n'
  + 'Best sellers this quarter:\n'
  + '- Crois\u200Bsant, butter and almond: up 12%\n'
  + '- Sour\u200Bdo\u200Bugh loaf: steady\n'
  + '- Café crème brûlée tart: new this season\n\n'
  + 'Flour order: 25\u00A0kg of stone-ground wheat every Friday, plus 4\u00A0kg of rye.\n'
  + 'The extra\u00ADordinarily popular seeded rye returns in spring.\n\n'
  + 'Thanks from the whole family \u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} at the counter!\n';

const dir = path.join(__dirname, 'fixtures');
fs.writeFileSync(path.join(dir, 'bakery-notes.txt'), SAMPLE_TEXT, 'utf8');
// Same kind of note saved in Latin-1: "Café" becomes the single byte 0xE9, which is not valid UTF-8.
fs.writeFileSync(path.join(dir, 'latin1-notes.txt'), Buffer.from('Caf\xe9 menu for Maple Street Bakery\n', 'latin1'));
console.log('fixtures written to', dir);

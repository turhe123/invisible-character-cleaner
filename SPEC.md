# Invisible Character Cleaner — specification

**Tagline:** Find and remove zero-width spaces and hidden Unicode characters from pasted text in your browser, nothing uploaded.

**Category:** Text & Writing

**Free alternative to:** Originality.ai Invisible Text Detector and DevToolLab Invisible Character Remover (ad-supported pages, text pasted into sites with unclear processing, most tools strip everything blindly and break emoji and accents)

**Search phrases:** remove zero width space, invisible character remover, remove hidden characters from text, non breaking space remover, remove chatgpt hidden characters, unicode cleaner online, detect invisible characters

**Allowed libraries:** none (browser APIs only)

**Published at:** https://turhe123.github.io/invisible-character-cleaner/

## Acceptance checks (each must have a test)

- pasting the bundled sample text that contains zero-width spaces, a byte order mark and non-breaking spaces shows a count per character type greater than zero
- clicking Clean produces output with no zero-width characters while emoji and accented letters in the sample remain intact
- the reveal view shows hidden characters as visible labelled chips such as ZWSP and NBSP
- toggling off a category such as non-breaking spaces leaves those characters in the output
- the cleaned text can be copied and downloaded as a txt file
- layout works at 390px wide

## Spec

Incumbent and demand. People paste text from AI chatbots, PDFs, web pages and Word documents and then find that code will not compile, a search for an exact phrase fails, a spreadsheet lookup does not match, or a plagiarism or style tool behaves oddly. The cause is invisible Unicode such as zero-width space, zero-width joiner, word joiner, byte order mark, soft hyphen, left-to-right and right-to-left marks, bidirectional overrides and non-breaking or exotic spaces. Search results for invisible character remover and remove zero width space are full of small ad-supported pages from vendors such as DevToolLab, Originality.ai and OpenReplay. Many strip everything in one click, which damages emoji sequences and scripts that legitimately need joiners, and several do not say clearly where the text is processed. Our version is a focused, private cleaner with a visible report and per-category control.

Feature set. One job: detect, show and remove invisible or look-alike whitespace characters from text. The tool lists every category found with a count and lets the user choose what to remove or normalise. Categories: zero-width space, zero-width non-joiner, zero-width joiner, word joiner, byte order mark, soft hyphen, left-to-right and right-to-left marks, bidirectional embedding and override controls, other control characters except tab and newline, and non-standard spaces such as non-breaking, thin, hair, en, em, ideographic and narrow no-break spaces. Spaces are converted to a normal space instead of deleted so words stay separated. A safety option, on by default, keeps zero-width joiners that sit inside emoji sequences and between letters of scripts that need them, such as Indic and Arabic text, and keeps variation selectors after emoji. Optional extras off by default: trim trailing spaces on each line, collapse repeated spaces, and normalise line endings.

UI. Above the fold is a large text area labelled Paste your text, with a status line showing characters before and after. Beside or under it is a checklist of categories, each with its count and a one-line explanation, defaulted to on except the joiner safety rule which is on and the extras which are off. A Reveal toggle swaps the editor for a read-only view where each hidden character is shown as a small coloured chip with its short name and code point such as U+200B, so users can see exactly what was there. Buttons: Clean, Copy result, Download as cleaned.txt, Clear. A file drop target accepts txt, md, csv, json and code files up to about 20 MB. Empty state shows a button that loads the fictional sample. If nothing hidden is found a clear message says the text is already clean. Cleaning runs live as options change. Keyboard use: Ctrl or Cmd plus Enter copies the result, and all controls are reachable by Tab with visible focus.

Technical approach. Pure JavaScript with no libraries. Scan the string by code point using a lookup table that maps code points and ranges to category, name and action. Build the report with a single pass and a counts map. For the joiner safety rule, check neighbouring code points: keep a joiner when the previous or next code point is in an emoji range or when the surrounding characters belong to scripts that require it, tested with Unicode property escapes in regular expressions. Reveal mode builds DOM nodes with textContent, never innerHTML, to avoid injection. For files above a few megabytes process in chunks inside a Web Worker so the page stays responsive, taking care that surrogate pairs are not split across chunks. Download uses a Blob and an object URL with the name original-name plus -cleaned. Clipboard writing uses the async clipboard API with a textarea selection fallback for Safari.

Edge cases. Preserve tabs and newlines. Handle astral characters and lone surrogates without crashing. Right-to-left text that legitimately uses direction marks gets a warning that removing marks may change display order. Mobile Safari paste events can trim text, so also read from the input event. Very long single lines render slowly in the chip view, so cap the reveal view at a few hundred thousand characters and say so. Files that are not valid UTF-8 show a clear error. Nothing is stored or sent, and the page works offline.

Demo data. A short fictional note titled Quarterly Notes for Maple Street Bakery that contains a leading byte order mark, several zero-width spaces inside the words Croissant and Sourdough, a non-breaking space between a number and the unit kg, a soft hyphen inside a long word, a right-to-left mark after a name, and a family emoji built with zero-width joiners to prove emoji are kept.

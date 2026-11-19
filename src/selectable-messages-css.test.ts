// 2026-11-03-1160-copy (driver, walk of 1155-9 step 4: "Ctrl C works. Please remove the copy button.") - what stays of 1155-9 after the Copy button goes: EVERY message the plugin draws is selectable TEXT (Obsidian's leaf chrome is
// `user-select: none`, so the messages opt in in styles.css), a triple-click selects the sentence and Cmd+C copies it; buttons, chips and the engraving stay unselectable. This pins the PROPERTY in the stylesheet (the real-Chrome measure,
// scripts/dev/measure-selectable-messages.ts, pins it in a browser). The surfaces that set message text are pinned in logged-notice-core.test.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const CSS = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(',').map((x) => x.trim()).filter(Boolean), body: m[2] }));
const selectable = new Set(rules.filter((r) => /(?<![-\w])user-select:\s*text/.test(r.body)).flatMap((r) => r.selectors));

/** The classes of the surfaces that draw a message: the bar's sentence, the three strips' status, the Score's status and message line, the notebook's message, the arrangement and composition sentences. */
const MESSAGES = ['.forge-description-message', '.forge-phrase-status', '.forge-rhythm-edit-score-status', '.forge-rhythm-score-message', '.forge-notebook-message', '.forge-arrangement-pin', '.forge-arrangement-header', '.forge-composition-header', '.forge-player-message'];

test('every message the plugin draws is opted in to selection (a triple-click selects the sentence, Cmd+C copies it)', () => {
  assert.ok(selectable.size >= 35, `non-vacuity: ${selectable.size} selectors opt in`);
  for (const c of MESSAGES) assert.ok(selectable.has(c), `${c} is selectable`);
});

test('CONTROL: a class that is not a message is not in the list, so the check can fail; buttons, chips, the engraving and the drag surface are never made selectable', () => {
  assert.equal(selectable.has('.forge-not-a-message'), false);
  // 2026-11-19-0992a (deliberate): ONE exception, moved on purpose: the name of a note inside a dialog line ("Created bar_010, a copy of bar_007.") is a button that is also a WORD OF THE SENTENCE: Obsidian's `button { user-select: none }` made a selection copy of
  // the line skip the names ("Created , a copy of ."), so `button.forge-chat-link` (and its :not(.clickable-icon) twin, there to out-rank Obsidian's button rules) opts in. Every other button, chip and the engraving stay unselectable.
  const NOTICE_LINK = /^button\.forge-chat-link(:not\(\.clickable-icon\))?$/;
  assert.equal([...selectable].filter((s) => NOTICE_LINK.test(s)).length, 2, 'the exception is exactly the dialog link and its twin');
  for (const s of selectable) if (!NOTICE_LINK.test(s)) assert.doesNotMatch(s, /button|chip|svg|forge-structure|forge-rhythm-score-host(?!\b-)|forge-arr-mute|forge-arr-solo|forge-description-button/, `${s} is a control or the engraving`);
});

test('there is no Copy button: no rule styles one and no element in the message rules is a button', () => {
  assert.doesNotMatch(CSS, /forge-copy-button|copy-message/);
});

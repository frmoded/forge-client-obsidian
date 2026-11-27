// 2026-11-23-1022: ONE pair of words. The facets of a music list note are called Description and Recipe everywhere the driver reads: the strip, the dialog and the console lines of the same family say `the Description` and `the Recipe`, never `the list` or `your script`.
// What this scan covers (2026-11-26-1047 (deliberate): the stale strip's words are gone): (1) the values the strip is made from (the one line of a hand-edited generated facet, the Detach confirm, the custom banner, the bar's labels); (2) every string literal in the files that write them (description-apply.ts, script-edit-core.ts, description-bar-dom.ts,
// duplicate-sentence-core.ts: comments removed). It does NOT cover bars' own words (a bar's `lines:` is a list, not a Description: bar-list-controller.ts, bar-list-note-core.ts), the phrase-core validators or comments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { DETACH_CONFIRM } from './description-apply-core.ts';
import { CUSTOM_BANNER, GENERATED_EDITED } from './phrase-notes-core.ts';
import { BAR_LABELS } from './description-bar-dom.ts';

const FORBIDDEN = /\b(?:the list|your list|my list|this list|the script|your script|my script|this script)\b/i;
const SRC = path.resolve(import.meta.dirname);
const literals = (file: string): string[] => {
  const code = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
};

test('the values of the strip say Description and Recipe (the words of the driver\'s rename), never the list or the script', () => {          // 2026-11-26-1047 (deliberate)
  const values = [GENERATED_EDITED, DETACH_CONFIRM, CUSTOM_BANNER, ...Object.values(BAR_LABELS)];
  for (const v of values) assert.doesNotMatch(v, FORBIDDEN, v);
  assert.equal(GENERATED_EDITED, 'This Recipe/Python is generated. Edit the Description, or Detach.');
});

test('no string literal of the files that write the strip and the dialog says the list or your script (comments are not strings)', () => {
  const bad: string[] = [];
  for (const f of ['description-apply.ts', 'script-edit-core.ts', 'description-bar-dom.ts', 'duplicate-sentence-core.ts']) for (const s of literals(f)) if (FORBIDDEN.test(s)) bad.push(`${f}: ${s.slice(0, 100)}`);
  assert.deepEqual(bad, [], 'a visible string still says the list or the script');
});

test('the scan is not vacuous: it finds the old words in the old strings', () => {
  for (const old of ['The list no longer matches the script', 'Your script has edits', 'Replace them with the list', 'Discard my script edits', 'before the script change', 'the list of sentences']) assert.match(old, FORBIDDEN === undefined ? /x/ : /list|script/i);
  for (const old of ['the list no longer matches', 'your script is kept', 'my script edits', 'the script change']) assert.match(old, FORBIDDEN);
});

// 2026-11-03-1160 (d) - a CUSTOM note's `links:` property follows the notes its Python calls. Before, only the strip's chips did: the property kept what the grammar last wrote, so Obsidian's backlinks and graph named bars the Python no longer
// reads (and missed the ones it calls). The links are rewritten in the ONE write that applies the custom takeover (`applyPythonText`, the `vault.process` of the description controller), from the same scan the chips use (`customCallNotes`).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyPythonText, descriptionState } from './description-apply-core.ts';
import { customCallNotes } from './custom-note-core.ts';
import { customChips } from './structure-strip-core.ts';
import { isCustomNote, pythonTextOf, withDerivedFront, withLinks } from './phrase-notes-core.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newArrangementNote } from './arrangement-core.ts';
import { parseFrontmatter } from './rhythm-edit-core.ts';

const VAULT = { bars: ['bar_001', 'bar_002', 'bar_005', 'bar_007'], phrases: ['phrase_001', 'phrase_003'], arrangements: ['arr_001'], compositions: [], kits: ['rock', 'latin'] };
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 8, order: 'musical', seed: 0 };
const withPython = (text: string, edit: (py: string) => string): string => { const py = pythonTextOf(text) as string; return text.replace(py, edit(py)); };
/** The links of a note as its frontmatter lists them. */
const linksOf = (text: string): string[] => [...(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '').matchAll(/^links:\s*\r?\n((?:\s+-.*\r?\n?)*)/gm)].flatMap((m) => [...m[1].matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => x[1]));
/** A custom Python of the person's own: `calls` are the notes it calls, in order. */
const own = (...calls: string[]): string => `def compute(context):\n${calls.map((c, i) => `  v${i} = ${c}()`).join('\n')}\n  return []`;
const takeover = (text: string, name = 'phrase_003', family: 'phrase' | 'arrangement' = 'phrase'): string => {
  const st = descriptionState(text, family, VAULT);
  assert.equal(st.kind, 'python-custom', JSON.stringify(st));
  const w = applyPythonText(text, name, family, VAULT, (st as { python: string }).python);
  assert.ok(w.ok, JSON.stringify(w));
  return (w as { text: string }).text;
};

test('the generated morph links bar_001 and bar_002; a custom Python that calls bar_005() and phrase_001() makes the links exactly those two, in the order of the calls (the grammar\'s are gone)', () => {
  const n = noteContentFor('phrase_003', MORPH);
  assert.deepEqual(linksOf(n), ['bar_001', 'bar_002'], 'the premise: a generated morph links its two bars');
  const custom = takeover(withPython(n, () => own('bar_005', 'phrase_001')));
  assert.equal(isCustomNote(custom), true);
  assert.deepEqual(linksOf(custom), ['bar_005', 'phrase_001']);
  assert.equal(parseFrontmatter(custom)?.fields.description, parseFrontmatter(n)?.fields.description, 'the description property stays as it was');
});

test('both directions: a call added gives a link, the call removed drops it again (the note is already custom the second time), and a comment-only edit keeps the links', () => {
  const n = noteContentFor('phrase_003', MORPH);
  const one = takeover(withPython(n, () => own('bar_005')));
  assert.deepEqual(linksOf(one), ['bar_005']);
  const two = takeover(withPython(one, () => own('bar_005', 'phrase_001')));
  assert.deepEqual(linksOf(two), ['bar_005', 'phrase_001'], 'added');
  const back = takeover(withPython(two, () => own('phrase_001')));
  assert.deepEqual(linksOf(back), ['phrase_001'], 'removed: bar_005 is no longer called, so no longer linked');
  assert.deepEqual(linksOf(takeover(withPython(back, (py) => `${py}\n  # a comment changes the Python`))), ['phrase_001'], 'a comment-only edit keeps the links');
});

test('a note with no calls gets NO links block, exactly as a generated note that reads nothing does (withDerivedFront with an empty list)', () => {
  const n = noteContentFor('phrase_003', MORPH);
  const custom = takeover(withPython(n, () => own()));
  assert.deepEqual(linksOf(custom), []);
  assert.doesNotMatch(/^---\r?\n([\s\S]*?)\r?\n---/.exec(custom)![1], /^links:/m);
  assert.deepEqual(withDerivedFront(['description: "x"', 'links:', '  - "[[a]]"'], 'x', []), ['description: "x"'], 'the generated note\'s own writer drops the block for an empty list: the same');
  assert.deepEqual(withLinks('---\ndescription: "x"\nlinks:\n  - "[[a]]"\n---\nbody\n', []), '---\ndescription: "x"\n---\nbody\n');
});

test('only the notes the chips name are linked: a bar, a phrase, an arrangement; not a kit, an engine chip, a composition, a name the note could not be, or the note itself; once each', () => {
  assert.deepEqual(customCallNotes('phrase_003', "phrase_003()\nrock()\nthin_out_bars()\ncomp_001()\nbar_005()\nbar_005()\narr_001()\nglobals()['phrase_001']()\nnot_a_note()"), ['bar_005', 'arr_001', 'phrase_001']);
  // the same calls make the chips (the chips add the Recipe's own links besides)
  const py = "bar_005()\nphrase_001()\nrock()";
  assert.deepEqual(customChips('phrase_003', py, '').slice(1).map((c) => c.text), customCallNotes('phrase_003', py));
});

test('an ARRANGEMENT takes over the same way: its links follow the Python (the phrases it plays, and a bar it now calls)', () => {
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_003' }] });
  const custom = takeover(withPython(arr, (py) => py.replace('  return bars', "  bars = [b for b in bars]\n  extra = bar_005()\n  return bars")), 'arr_001', 'arrangement');
  assert.equal(isCustomNote(custom), true);
  const calls = customCallNotes('arr_001', pythonTextOf(custom) as string);
  assert.deepEqual(linksOf(custom), calls);
  assert.ok(calls.includes('bar_005') && calls.includes('phrase_001') && calls.includes('phrase_003'), calls.join(','));
});

test('withLinks keeps every other frontmatter line and everything from the closing fence on, byte for byte (CRLF too)', () => {
  const t = '---\r\ntype: data\r\ndescription: "d"\r\nlinks:\r\n  - "[[old]]"\r\ncontent_type: json\r\n---\r\n\r\n# Description\r\n\r\nbody\r\n';
  assert.equal(withLinks(t, ['bar_005']), '---\r\ntype: data\r\ndescription: "d"\r\nlinks:\r\n  - "[[bar_005]]"\r\ncontent_type: json\r\n---\r\n\r\n# Description\r\n\r\nbody\r\n');
  assert.equal(withLinks('no frontmatter', ['x']), 'no frontmatter');
});

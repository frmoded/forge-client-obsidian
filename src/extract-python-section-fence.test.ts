// 2026-11-03-1159 (bug found in 1155): `extractPythonSection` ended the `# Python` section at ANY column-0 `# ...` line, even INSIDE the ```python fence, so a Python comment that starts a line cut the code short for the plugin's hashes
// and facet states. The census (read-only, ~/.forge-mem-evidence/1159/census.json: 256 fenced notes in the 12 committed repos, 1092 notes with a `# Python` in the working trees and installed vaults) found NOT ONE note with such a line,
// so the extractor is made fence-aware and nothing else moves. This file pins: the new reading (comment, string literal, `py` and bare fences, CRLF, unclosed fence, the H1 AFTER the fence still ends the section), and P3: for every
// committed note of the plugin's bundled vaults and test fixtures the new text equals the frozen legacy text (so no stored hash, facet state or engine fixture can move), with a CONTROL on which the two differ.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { extractPythonSection } from './v2-note-core.ts';
import { pythonTextOf } from './phrase-notes-core.ts';
import { noteContentFor } from './phrase-core.ts';

/** The reading as it was before 1159, frozen (a pinned "before", never the moving tree): the section ends at the next column-0 H1, then the fence is unwrapped. */
function legacy(body: string): string | null {
  const m = /^# Python\s*$/m.exec(body);
  if (!m) return null;
  const tail = body.slice(m.index + m[0].length);
  const nextH1 = /^# [^#\n]/m.exec(tail);
  const raw = (nextH1 ? tail.slice(0, nextH1.index) : tail).replace(/^\s*\n/, '').replace(/\s+$/, '');
  const fenced = /^```(?:python|py)?\s*\n([\s\S]*?)\n```\s*$/.exec(raw.trim());
  return fenced ? fenced[1] : raw;
}
const note = (py: string, fence = 'python', after = '', eol = '\n'): string => ['# Description', '', 'x', '', '# Python', '', '```' + fence, ...py.split('\n'), '```', ...(after ? ['', after] : []), ''].join(eol);

test('a column-0 comment INSIDE the fence is part of the Python (it used to cut the code short)', () => {
  const py = 'def compute(context):\n# a comment that starts the line\n  return 1';
  assert.equal(extractPythonSection(note(py)), py);
  assert.notEqual(legacy(note(py)), py, 'CONTROL: the legacy reading cut it');
  assert.equal(legacy(note(py)), '```python\ndef compute(context):', 'where it cut (and the fence stayed open in what it returned)');
});

test('a heading-like line inside a triple-quoted string is part of the Python', () => {
  const py = 'def compute(context):\n  text = """\n# Not a heading\n## Nor this\n"""\n  return text';
  assert.equal(extractPythonSection(note(py)), py);
});

test('the section still ends at the next H1 AFTER the closing fence, and the text after the fence is what it always was', () => {
  const py = 'def compute(context):\n  return 1';
  const withNext = note(py) + '\n# Notes\n\nafter\n';
  assert.equal(extractPythonSection(withNext), py);
  assert.equal(extractPythonSection(withNext), legacy(withNext));
  const prose = note(py, 'python', 'some prose after the fence');
  assert.equal(extractPythonSection(prose), legacy(prose), 'prose after the fence: unchanged (it is not the fence\'s business)');
});

test('`py` and bare fences, and a CRLF note, give the same text as `python`', () => {
  const py = 'def compute(context):\n# keep\n  return 1';
  for (const fence of ['python', 'py', '']) assert.equal(extractPythonSection(note(py, fence)), py, `fence "${fence}"`);
  assert.equal(extractPythonSection(note(py, 'python', '', '\r\n')), py.split('\n').join('\r\n') + '\r', 'CRLF: the lines keep their own ends, and the last line its \\r, exactly as before (the legacy reading of a note without such a line gives the same)');
  assert.equal(extractPythonSection(note('def compute(context):\n  return 1', 'python', '', '\r\n')), legacy(note('def compute(context):\n  return 1', 'python', '', '\r\n')));
});

test('an unclosed fence is read as it always was (to the next H1): there is no closing fence to be aware of', () => {
  const t = '# Description\n\nx\n\n# Python\n\n```python\ndef compute(context):\n# a comment\n  return 1\n';
  assert.equal(extractPythonSection(t), legacy(t));
  assert.equal(extractPythonSection('# Python\n\nplain text, no fence\n'), 'plain text, no fence');
  assert.equal(extractPythonSection('# Description\n\nx\n'), null, 'no `# Python`: null, as before');
});

// ---- P3: every committed note of the bundled vaults and the test fixtures reads the same as before ----------------------------------------------------------------------------------------------------------------------
const ROOT = path.resolve(import.meta.dirname, '..');
const mdFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' ? [] : mdFiles(path.join(dir, e.name))) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : []));

test('P3: for every note of assets/vaults and test/fixtures with a `# Python`, the new text equals the legacy text (no stored hash, facet state or fixture can move); the census found none with a column-0 line in the fence', () => {
  const files = [...mdFiles(path.join(ROOT, 'assets/vaults')), ...mdFiles(path.join(ROOT, 'test/fixtures'))];
  let withPython = 0; const moved: string[] = [];
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    if (!/^# Python\s*$/m.test(t)) continue;
    withPython++;
    if (extractPythonSection(t) !== legacy(t)) moved.push(path.relative(ROOT, f));
  }
  assert.ok(withPython >= 90, `non-vacuity: ${withPython} notes with a Python section were compared`);
  assert.deepEqual(moved, [], 'no shipped or fixture note reads differently');
});

test('the score-first `pythonTextOf` (1155) gives the same text as `extractPythonSection` for every shipped and fixture note and every note the plugin generates; it stays, because it also reads a fence with prose after it and an indented one (said in the FEEDBACK)', () => {
  const files = [...mdFiles(path.join(ROOT, 'assets/vaults')), ...mdFiles(path.join(ROOT, 'test/fixtures'))];
  const differing: string[] = []; let compared = 0;
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    if (!/^# Python\s*$/m.test(t)) continue;
    compared++;
    if (pythonTextOf(t) !== extractPythonSection(t)) differing.push(path.relative(ROOT, f));
  }
  assert.ok(compared >= 90, 'non-vacuity');
  // a generated phrase note (what the plugin writes): same text
  const gen = noteContentFor('phrase_003', { kind: 'extend', source: 'bar_007', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as any);
  assert.equal(pythonTextOf(gen), extractPythonSection(gen));
  // the divergence cases, stated: prose after the fence (pythonTextOf reads the fence, extractPythonSection the section as it always did)
  const prose = note('def compute(context):\n  return 1', 'python', 'prose after the fence');
  assert.notEqual(pythonTextOf(prose), extractPythonSection(prose), 'the two are NOT interchangeable for a note with prose after the fence: pythonTextOf stays');
  assert.deepEqual(differing, [], 'for every shipped and fixture note they agree');
});

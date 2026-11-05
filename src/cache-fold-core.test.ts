// 2026-11-05-1177 - the decisions of "open the `# Cache` section folded": which notes, which lines, one chance per leaf and note. Pure: no Obsidian.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cacheFoldInfo, cacheFoldKind, cacheSection, shouldFoldCache } from './cache-fold-core.ts';

const NOTE = ['---', 'type: data', '---', '', '# Description', '', 'Extend bar_006.', '', '# Cache', '', '<!-- derived from the Description above; edit the Description, not this -->', '', '```json', '{ "kind": "extend" }', '```', ''].join('\n');

test('shouldFoldCache: only a score-first vault, a note of one of the five kinds, and a leaf that has not had its chance at this note', () => {
  for (const kind of ['phrase', 'bar', 'kit', 'arrangement', 'composition'] as const) assert.equal(shouldFoldCache(true, kind, false), true, kind);
  assert.equal(shouldFoldCache(false, 'phrase', false), false, 'a vault that is not score-first');
  assert.equal(shouldFoldCache(true, null, false), false, 'a note of any other kind');
  assert.equal(shouldFoldCache(true, 'phrase', true), false, 'already handled in this leaf: never folded again');
  assert.equal(shouldFoldCache(false, null, true), false);
});

test('cacheFoldKind names the five kinds by path and nothing else (READMEs and plain notes are not ours)', () => {
  assert.equal(cacheFoldKind('phrases/phrase_001.md'), 'phrase');
  assert.equal(cacheFoldKind('bars/bar_006.md'), 'bar');
  assert.equal(cacheFoldKind('kits/rock.md'), 'kit');
  assert.equal(cacheFoldKind('arrangements/arr_001.md'), 'arrangement');
  assert.equal(cacheFoldKind('compositions/comp_001.md'), 'composition');
  for (const p of ['notes/plain.md', 'phrases/README.md', 'kits/README.md', 'phrase_001.md', 'phrases/sub/phrase_001.md', '', null, undefined]) assert.equal(cacheFoldKind(p as string), null, String(p));
});

test('cacheSection: the heading line and the last line of its section; a fence never makes a heading; only level 1 named exactly Cache', () => {
  assert.deepEqual(cacheSection(NOTE), { from: 8, to: 15 }, 'to the last line (the text ends with a newline: an empty last line)');
  assert.deepEqual(cacheSection('# Cache\n\nx\n\n# Next\n\ny'), { from: 0, to: 3 }, 'ends before the next level-1 heading');
  assert.deepEqual(cacheSection('# Cache\n\n## Sub\n\nz'), { from: 0, to: 4 }, 'a deeper heading stays inside the section');
  assert.equal(cacheSection('# Description\n\n```\n# Cache\n```\n'), null, 'inside a code fence it is text');
  assert.equal(cacheSection('# Description\n\n~~~md\n# Cache\n~~~\n'), null, 'also a tilde fence');
  assert.equal(cacheSection('## Cache\n'), null);
  assert.equal(cacheSection('# Caches\n'), null);
  assert.equal(cacheSection('#Cache\n'), null);
  assert.deepEqual(cacheSection('# Cache\r\n\r\nx\r\n'), { from: 0, to: 3 }, 'CRLF');
  assert.deepEqual(cacheSection('# Cache #\n'), { from: 0, to: 1 }, 'a closed ATX heading');
  assert.equal(cacheSection(''), null);
  assert.equal(cacheSection('# Description\n\nno cache here\n'), null);
});

test('cacheFoldInfo: the Cache fold added to what the view has; null when there is nothing to do', () => {
  assert.deepEqual(cacheFoldInfo(NOTE, null), { folds: [{ from: 8, to: 15 }], lines: 16 });
  assert.deepEqual(cacheFoldInfo(NOTE, { folds: [], lines: 16 }), { folds: [{ from: 8, to: 15 }], lines: 16 });
  assert.deepEqual(cacheFoldInfo(NOTE, { folds: [{ from: 4, to: 6 }], lines: 16 }), { folds: [{ from: 4, to: 6 }, { from: 8, to: 15 }], lines: 16 }, "the person's other folds stay");
  assert.equal(cacheFoldInfo(NOTE, { folds: [{ from: 8, to: 15 }], lines: 16 }), null, 'already folded: no no-op write to the view');
  assert.deepEqual(cacheFoldInfo(NOTE, { folds: [{ from: 4, to: 6 }], lines: 99 }), { folds: [{ from: 8, to: 15 }], lines: 16 }, 'a state taken at another line count is not trusted');
  assert.equal(cacheFoldInfo('# Description\n\nx\n', null), null, 'no Cache heading');
  assert.equal(cacheFoldInfo('', null), null);
});

test('the lines count is the editor\'s: split on newline, so a text ending with a newline has the empty last line (Obsidian counts it)', () => {
  assert.equal(cacheFoldInfo('# Cache\n', null)?.lines, 2);
  assert.equal(cacheFoldInfo('# Cache', null)?.lines, 1);
});

// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS) - DUPLICATE (0992) copies a bar's `lines:` too, BYTE FOR BYTE (11d / the prompt): the copy's front matter is fresh (that is how 0992 made it), so the list is carried across by extending
// the copy, not by keeping the old front matter. A bar with no list gets none (P3); `lines: []` stays an empty list. Written RED first: against HEAD the copy dropped the list.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { copyBarNote, duplicateNote, type DuplicatePorts } from './duplicate-note-core.ts';
import { resolveDuplicateTarget, type ResolvedDuplicate } from './duplicate-sentence-core.ts';
import { barLinesBlock, readBarLines, withBarLines, writeBarNote } from './bar-list-note-core.ts';
import { headSentence } from './bar-grammar-core.ts';
import { barOriginOf } from './bar-provenance-core.ts';
import { extractJsonBlock, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';

const BAR_001 = PLAYGROUND_BARS['bar_001'];
const dataOf = (t: string): RhythmData => (readRhythmNote(t) as { value: { data: RhythmData } }).value.data;
const HEAD = headSentence(dataOf(BAR_001))!;
const LISTED = (writeBarNote(BAR_001, [HEAD, 'Hit kick on step 3.', 'Set the tempo to 120.', 'Hit "x" a: b']) as { text: string }).text;
const fenceTail = (t: string): string => t.slice((extractJsonBlock(t) as { fenceStart: number }).fenceStart);

test('copyBarNote carries the `lines:` block byte for byte; the json from the fence on is the source\'s; the copy is its own bar (fresh front matter, copied_from, origin copy)', () => {
  const r = copyBarNote(LISTED, 'bar_010', 'bar_001');
  assert.equal(r.ok, true, JSON.stringify(r));
  const text = (r as { text: string }).text;
  assert.equal(barLinesBlock(text), barLinesBlock(LISTED), 'the same bytes, line by line');
  assert.deepEqual(readBarLines(text), readBarLines(LISTED));
  assert.equal(fenceTail(text), fenceTail(LISTED));
  assert.deepEqual(barOriginOf(text), { kind: 'copy', of: 'bar_001' });
  assert.match(text, /^---\ntype: data\ncontent_type: json\ndescription: "bar_010 — a copy of \[\[bar_001\]\]/);
  assert.equal((text.match(/^lines:/gm) ?? []).length, 1);
  assert.ok(text.includes('copied_from: "[[bar_001]]"'));
});

test('an empty list stays an empty list in the copy; a bar with NO list gets none (nothing is invented for it)', () => {
  const empty = withBarLines(BAR_001, []);
  assert.equal(barLinesBlock((copyBarNote(empty, 'bar_010', 'bar_001') as { text: string }).text), 'lines: []');
  const plain = (copyBarNote(BAR_001, 'bar_010', 'bar_001') as { text: string }).text;
  assert.equal(readBarLines(plain)?.hasLines, false);
  assert.ok(!plain.includes('lines:'));
});

test('duplicateNote of a listed bar: one create, the copy carries the list; the source is untouched', async () => {
  const store = new Map<string, string>([['bars/bar_001.md', LISTED]]); const creates: string[] = [];
  const ports: DuplicatePorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    listBasenames: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
    exists: (p) => store.has(p),
    create: async (p, c) => { if (store.has(p)) throw new Error('File already exists.'); store.set(p, c); creates.push(p); },
    isAlreadyExists: (e) => /already exists/i.test((e as Error)?.message ?? ''),
  };
  const vault = { bars: ['bar_001'], phrases: [], arrangements: [], compositions: [], kits: [] };
  const of = resolveDuplicateTarget('bar_001', vault) as ResolvedDuplicate;
  const r = await duplicateNote(ports, of, vault);
  assert.equal(r.ok, true);
  assert.deepEqual(creates, ['bars/bar_002.md']);
  assert.equal(store.get('bars/bar_001.md'), LISTED, 'the source is byte for byte what it was');
  assert.equal(barLinesBlock(store.get('bars/bar_002.md')!), barLinesBlock(LISTED));
});

// 2026-11-19-0997: the LIST MODEL's edition seam (src/list-model-selected.ts, the `ListModel` interface in src/music-edition.ts, list-model.full.ts, list-model.lean.ts).
//
// MECHANISM PIN. Most of this file reads source text and the build's redirect on purpose: the property it guards ("no module the lean entry reaches imports a list-model core by value, except through the selector")
// is a property of the import graph, not of any behaviour a unit test could reach. The BUNDLE side of the same property (lean main.js has none of the cores, music main.js has all of them) is
// scripts/build-main.test.mjs; this file is what keeps that test from going red for a reason it cannot name, and what keeps the stubs honest (same shape as the real model, answering what lean answered before).
//
// It does NOT need a mutation run: the seam is wiring. The behaviour of the cores is pinned by their own tests (bar-list-*, duplicate-*), which run unchanged through the full model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { listModel as selected } from './list-model-selected.ts';
import { listModel as full } from './list-model.full.ts';
import { listModel as lean } from './list-model.lean.ts';
import { editionPlugin } from '../scripts/build-main.mjs';

const SRC = path.join(process.cwd(), 'src');
/** The cores behind the seam. A new core of the list model goes here AND gets its sentinel (see the cores' own line). */
const CORES = ['bar-list-controller', 'bar-list-core', 'bar-grammar-core', 'bar-box-host-core', 'bar-list-note-core', 'duplicate-sentence-core', 'duplicate-note-core', 'duplicate-undo-core', 'phrase-steps-lineage-core'];          // 2026-11-20-1000 (deliberate): + phrase-steps-lineage-core (the Inspector through the step lines: a Score-only core, behind the seam so lean does not carry it)
const read = (f: string): string => fs.readFileSync(path.join(SRC, f), 'utf8');

test('mechanism: the committed selector is the FULL list model (tests and tsc see the real cores); only the lean BUILD is redirected', () => {
  assert.equal(selected, full);
  assert.equal(selected.present, true);
  assert.match(read('list-model-selected.ts'), /export \{ listModel \} from '\.\/list-model\.full\.ts';/);
});

test('mechanism: editionPlugin redirects list-model-selected to the stubs for lean and to the real model for music (and does nothing for other files)', () => {
  const resolvers: Array<{ filter: RegExp; fn: () => { path: string } }> = [];
  const probe = (edition: 'lean' | 'music'): string | null => {
    resolvers.length = 0;
    editionPlugin(edition).setup({ onResolve: (o: { filter: RegExp }, fn: () => { path: string }) => { resolvers.push({ filter: o.filter, fn }); } });
    const hit = resolvers.filter((r) => r.filter.test('./list-model-selected.ts'));
    assert.equal(hit.length, 1, 'exactly one resolver answers ./list-model-selected.ts');
    assert.equal(resolvers.some((r) => r.filter.test('./list-model.full.ts') || r.filter.test('./list-model.lean.ts')), false, 'the implementations themselves are not redirected');
    return path.basename(hit[0].fn().path);
  };
  assert.equal(probe('lean'), 'list-model.lean.ts');
  assert.equal(probe('music'), 'list-model.full.ts');
});

test('every core carries its sentinel, and the full model lists exactly those (the build test greps lean for them and music must have them)', () => {
  assert.deepEqual([...full.cores].sort(), CORES.map((c) => `forge-list-model-core:${c}`).sort());
  for (const c of CORES) assert.ok(read(`${c}.ts`).includes(`'forge-list-model-core:${c}'`), `${c}.ts has lost its sentinel`);
  assert.deepEqual(lean.cores, []);
  assert.equal(lean.present, false);
});

test('the lean stubs have the shape of the real model (a member the interface gains cannot be forgotten in either)', () => {
  const shape = (o: unknown): unknown => (o !== null && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape((o as Record<string, unknown>)[k])])) : typeof o);
  assert.deepEqual(shape(lean), shape(full));
});

test('the lean stubs answer what lean answered before the list model: no action sentence, no bar word, no Beat Box host, a bar with no list, a bar list that writes nothing', async () => {
  const d = lean.duplicate;
  for (const sentence of ['Duplicate [[bar_007]].', 'Copy bar 3.', 'Hit kick on steps 1, 5 and 9.', '']) assert.deepEqual(d.readActionText(sentence), { kind: 'none' }, sentence);
  assert.equal(d.barWordVerb('Duplicate bar 3'), null);
  assert.equal(d.barNumberOf({ bar: 2 }, false), null);
  assert.equal(d.idParts('bars/bar_007'), null);
  assert.equal(lean.createBarBoxHost({} as never, {} as never), null);
  assert.equal(lean.withBarLines('---\ntype: data\n---\nbody', []), '---\ntype: data\n---\nbody');
  let writes = 0;
  const bar = lean.createBarList({ proc: async () => { writes++; }, say() {}, pb() {}, pbWarn() {}, trace() {}, setBoxNote() {}, endSuggestion() {}, basename: (p: string) => p });
  assert.equal((await bar.applyBar('bars/bar_001.md', 'Hit kick on step 1.')).ok, false);
  assert.equal((await bar.appendBar('bars/bar_001.md', 'Hit kick on step 1.')).ok, false);
  assert.equal(bar.canStepBar('bars/bar_001.md', 'undo', 'x'), false);
  await bar.evaluateBar('bars/bar_001.md', 'x', true);
  assert.equal(writes, 0, 'the lean stub never asks the controller to write a note');
  assert.equal((await d.duplicateNote({} as never, {} as never, {} as never)).ok, false);
});

test('the FULL model is the real thing (the stubs above would pass if both sides were stubs): the same questions get the real answers', () => {
  const d = full.duplicate;
  assert.equal(d.readActionText('Duplicate [[bar_007]].').kind, 'duplicate');
  assert.equal(d.barWordVerb('Duplicate bar 3'), 'duplicate');
  assert.notEqual(full.createBarBoxHost, lean.createBarBoxHost);
  assert.match(full.withBarLines('---\ntype: data\n---\nbody', []), /lines: \[\]/);
});

test('no module outside the seam imports a list-model core by value: lean reaches them only through list-model-selected (type-only imports are erased and allowed)', () => {
  const offenders: string[] = [];
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'list-model.full.ts');
  const importRe = /^\s*(import|export)\s+(type\s+)?([^;]*?)\s*from\s*['"]\.\/([\w-]+)\.ts['"]/gm;
  for (const f of files) {
    if (CORES.includes(f.replace(/\.ts$/, ''))) continue;                       // the cores may use each other (they are all behind the seam together)
    const text = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(importRe)) {
      if (!CORES.includes(m[4])) continue;
      const typeOnly = m[2] !== undefined || /^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(m[3].trim());
      if (!typeOnly) offenders.push(`${f} imports ${m[4]}`);
    }
    if (new RegExp(`import\\(\\s*['"]\\./(${CORES.join('|')})\\.ts['"]\\s*\\)`).test(text.replace(/^.*typeof import.*$/gm, ''))) offenders.push(`${f} dynamically imports a core`);
  }
  assert.deepEqual(offenders, [], `these modules reach a list-model core without the seam:\n${offenders.join('\n')}`);
});

test('the lean stub module imports no core (not even by accident)', () => {
  const text = read('list-model.lean.ts').replace(/\/\/.*$/gm, '');
  assert.deepEqual([...text.matchAll(/from\s*['"]\.\/([\w.-]+)['"]/g)].map((m) => m[1]), ['music-edition.ts']);
});

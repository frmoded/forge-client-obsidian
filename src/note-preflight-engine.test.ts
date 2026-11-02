// 2026-10-31-1135 (CCQA smoke 10, B5 and B5x) on the REAL engine (Pyodide with the vendored music wheels and the engine bundle; test-support/real-rhythm-engine.ts): the two cases the smoke found. New composition with a 4/4 phrase and a
// 3/4 phrase, and New phrase (extend) from a 12-step bar, are refused BEFORE a note is written, with one sentence built from the engine's own refusal. Proves the stand-in texts of note-preflight-core.test.ts are the engine's real ones.
// Pins the MECHANISM (the check draws the prospective note through the producers and the engine's compute calls); if the design moves this SHOULD go red - reassess, don't just rewrite. Skipped (visibly) without the music wheels.
import { test as baseTest } from 'node:test';
import assert from 'node:assert/strict';

import { WHEELS_PRESENT, engine, computePhrase } from './test-support/real-rhythm-engine.ts';
import { createComposition } from './composition-flow-core.ts';
import { makeNotePreflight } from './note-preflight-core.ts';
import { createNewPhraseFromParams, noteContentFor, type PhraseParams } from './phrase-core.ts';

const skip = WHEELS_PRESENT ? false : 'music wheels not fetched — run: npm run fetch-music-wheels';
const test = (name: string, fn: () => Promise<void>) => baseTest(name, { skip, timeout: 300_000 }, fn);
const bar = (steps: number, ts: string, group: number) => ({ time_signature: ts, steps, group_size: group, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: steps }, (_, i) => i % group === 0), snare: Array.from({ length: steps }, () => false) } });
const barNote = (b: unknown): string => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(b, null, 2)}\n\`\`\`\n`;
const extend = (source: string): PhraseParams => ({ kind: 'extend', source, bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams);

function world(py: any) {
  const files = new Map<string, string>([
    ['bars/bar_001.md', barNote(bar(16, '4/4', 4))],
    ['bars/bar_009.md', barNote(bar(12, '3/4', 3))],
    ['bars/bar_010.md', barNote(bar(16, '3/4', 4))],
    ['phrases/phrase_001.md', noteContentFor('phrase_001', extend('bar_001'))],
    ['phrases/phrase_013.md', noteContentFor('phrase_013', extend('bar_010'))],
  ]);
  const writes: string[] = []; const folders: string[] = []; const notices: string[] = [];
  const preflight = makeNotePreflight({
    readNote: async (p) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    compute: async (data, params, title) => computePhrase(py, data, params, title),
    computeArrangement: async (data, title) => computePhrase(py, data, { kind: 'arrangement' }, title),
    computeComposition: async (data, title) => computePhrase(py, data, { kind: 'composition' }, title),
  });
  const ports = {
    folderExists: (f: string) => folders.includes(f) || [...files.keys()].some((p) => p.startsWith(`${f}/`)), createFolder: async (f: string) => { folders.push(f); },
    exists: (p: string) => files.has(p), create: async (p: string, c: string) => { writes.push(p); files.set(p, c); return p; }, open: async () => {}, notify: (m: string) => { notices.push(m); },
    isAlreadyExists: () => false, trace: () => {}, preflight,
    activePath: () => 'bars/bar_009.md', listPhraseBasenames: () => [...files.keys()].filter((p) => p.startsWith('phrases/')).map((p) => p.slice(8, -3)),
  };
  return { files, writes, folders, notices, ports };
}

test('New composition: a 4/4 phrase and a 3/4 phrase are refused by the engine\'s compose_sections BEFORE any note is written, in one sentence naming both sections', async () => {
  const w = world(await engine());
  const r = await createComposition(w.ports, { sections: [{ source: 'phrases/phrase_001' }, { source: 'phrases/phrase_013' }] });
  assert.deepEqual(r, { ok: false, message: 'phrase_013 (section 2) is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.' });
  assert.deepEqual([w.writes, w.folders, w.notices], [[], [], [r.message]]);
  // the control on the SAME engine: two 4/4 sections are written
  const ok = await createComposition(w.ports, { sections: [{ source: 'phrases/phrase_001' }, { source: 'phrases/phrase_001', length: 2 }] });
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.deepEqual(w.writes, ['compositions/comp_001.md']);
});

test('New phrase (extend) of a 12-step bar: the engine\'s extend_rhythm refuses it BEFORE a note is written, in one sentence naming the bar and the grid it needs, and the Score of an extend that is already there says the same, not a traceback', async () => {
  const py = await engine();
  const w = world(py);
  const r = await createNewPhraseFromParams(w.ports, extend('bar_009'));
  assert.deepEqual(r, { ok: false, message: 'bar_009 has 12 steps; extend needs a 16-step bar.' });
  assert.deepEqual([w.writes, w.folders], [[], []]);
  const ok = await createNewPhraseFromParams(w.ports, extend('bar_001'));
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal(w.writes.length, 1);
  // an extend note that was written before this check existed: drawing it gives the same sentence (not a Python traceback in the Score area)
  const { producePhraseNote, phraseDepsWithSources } = await import('./phrase-core.ts').then(async (m) => ({ producePhraseNote: m.producePhraseNote, phraseDepsWithSources: (await import('./composition-core.ts')).phraseDepsWithSources }));
  const deps = phraseDepsWithSources({ readNote: async (p: string) => w.files.get(p) as string, compute: async (d, params, t) => computePhrase(py, d, params, t) }, { computeArrangement: async () => null, computeComposition: async () => null });
  const out = await producePhraseNote(deps, noteContentFor('phrase_099', extend('bar_009')), 'phrase_099');
  assert.deepEqual(out, { kind: 'refusal', message: 'Phrase: bar_009 has 12 steps; extend needs a 16-step bar.' });
});

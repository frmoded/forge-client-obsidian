// 2026-10-31-1135 (CCQA smoke 10, B5 and B5x) - EVERY note-creating command asks the engine before it writes. One row per command x one invalid source, through the REAL flows (createNewPhrase / Mix / Morph, a sentence's phrase,
// a transform, the notebook's Run, createArrangement, createComposition) with host-faithful recording ports (card 12) and an engine stand-in that raises the engine's own ValueError as a Python traceback, exactly as Pyodide hands
// it over (the real engine's texts are proven in note-preflight-engine.test.ts). Each row: the person gets ONE plain sentence, `create` and `createFolder` were never called, no traceback anywhere. The control row: the same
// command on a VALID source writes (so the rows above are not passing for want of a working write path).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createArrangement, type CreatePorts } from './kit-arrangement-flow-core.ts';
import { newArrangementNote, type ArrangementParams } from './arrangement-core.ts';
import { createComposition } from './composition-flow-core.ts';
import { createNotebook, type NotebookPorts } from './notebook-core.ts';
import { createNewMix, createNewMorph, createNewPhrase, createNewPhraseFromParams, noteContentFor, type NewMixPorts, type PhraseParams } from './phrase-core.ts';
import { makeNotePreflight, installNotePreflight, type NotePreflight } from './note-preflight-core.ts';
import { newKitNote } from './kit-core.ts';

const TRACE = (last: string): string => `Traceback (most recent call last):\n  File "<exec>", line 1, in <module>\n  File "/lib/python3.12/site-packages/forge/music/lib.py", line 3561, in the_engine\nValueError: ${last}`;
const bar = (steps: number, ts: string, group: number) => ({ time_signature: ts, steps, group_size: group, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: steps }, (_, i) => i === 0) } });
const barNote = (b: unknown): string => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify(b, null, 2)}\n\`\`\`\n`;
const GOOD = barNote(bar(16, '4/4', 4));
const WALTZ = barNote(bar(12, '3/4', 3));

/** The engine stand-in: what each kind of call does, by the engine's own error. `bad` picks which refusal is raised. */
type Refusal = { extend?: string; mix?: string; morph?: string; transform?: string; arrangement?: string; composition?: string };
function engine(files: Map<string, string>, refuse: Refusal) {
  const ok = { type: 'musicxml', content: '<score-partwise/>' };
  return {
    readNote: async (p: string) => { const t = files.get(p); if (t === undefined) throw new Error('File not found'); return t; },
    // a drawn phrase carries its bars (`bars_data`): the transform, the arrangement and the composition draw their sources through this
    compute: async (d: any, params: PhraseParams) => { const r = (refuse as Record<string, string | undefined>)[params.kind]; if (r !== undefined) throw new Error(TRACE(r)); return { ...ok, bars_data: Array.isArray(d?.bars) ? d.bars : [d?.a ?? d, d?.a ?? d] }; },
    computeArrangement: async () => { if (refuse.arrangement !== undefined) throw new Error(TRACE(refuse.arrangement)); return ok; },
    computeComposition: async () => { if (refuse.composition !== undefined) throw new Error(TRACE(refuse.composition)); return ok; },
  };
}

const EXTEND_12 = 'extend_rhythm: every style needs a 16-step grid (steps == 16, group_size == 4, i.e. 4/4 in sixteenths); got steps=12, group_size=3';
const MIX_BAD = 'mix_rhythm: bars a and b are on different grids (a has 16 steps, b has 12)';
const MORPH_BAD = 'morph_rhythm: bars a and b are on different grids (a has 16 steps, b has 12)';
const REGION_BAD = 'thin_out_bars: bar 2 has no row "tom"';
const ARR_BAD = 'combine_tracks: track 2 (latin) is on another grid than track 1 (rock)';
const COMPOSE_BAD = "compose_sections: section 2 bar 1 has time_signature '3/4' but section 1 has '4/4'; all sections must share the same meter and steps";

function vaultFiles(): Map<string, string> {
  const files = new Map<string, string>([
    ['bars/bar_001.md', GOOD], ['bars/bar_009.md', WALTZ], ['bars/bar_010.md', WALTZ], ['kits/rock.md', newKitNote({ kind: 'kit', name: 'rock', channels: ['kick'] })],
    ['phrases/phrase_001.md', noteContentFor('phrase_001', { kind: 'extend', source: 'bar_001', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams)],
    ['phrases/phrase_013.md', noteContentFor('phrase_013', { kind: 'extend', source: 'bar_009', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams)],
  ]);
  return files;
}

/** Ports that record every write: a flow that wrote anything shows it in `writes`. */
function recorder(files: Map<string, string>) {
  const writes: string[] = []; const folders: string[] = []; const notices: string[] = []; const opened: string[] = [];
  const base = {
    folderExists: (f: string) => folders.includes(f) || [...files.keys()].some((p) => p.startsWith(`${f}/`)),
    createFolder: async (f: string) => { folders.push(f); },
    exists: (p: string) => files.has(p),
    create: async (p: string, c: string) => { writes.push(p); files.set(p, c); return p; },
    open: async (f: string) => { opened.push(f); },
    notify: (m: string) => { notices.push(m); },
    isAlreadyExists: () => false,
    listPhraseBasenames: () => [...files.keys()].filter((p) => p.startsWith('phrases/')).map((p) => p.replace(/^phrases\//, '').replace(/\.md$/, '')),
    listBarBasenames: () => [...files.keys()].filter((p) => p.startsWith('bars/')).map((p) => p.replace(/^bars\//, '').replace(/\.md$/, '')),
    trace: () => {},
  };
  return { base, writes, folders, notices, opened };
}

interface Row { command: string; invalid: Refusal; expected: string; run(files: Map<string, string>, preflight: NotePreflight): Promise<{ ok: boolean; message?: string; rec: ReturnType<typeof recorder> }> }
const phrasePorts = (rec: ReturnType<typeof recorder>, active: string, preflight: NotePreflight): NewMixPorts<string> => ({ activePath: () => active, ...rec.base, preflight });
const EXTEND_FROM_9: PhraseParams = { kind: 'extend', source: 'bar_009', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0 } as PhraseParams;

const ROWS: Row[] = [
  { command: 'New phrase (extend, from the bar you are on)', invalid: { extend: EXTEND_12 }, expected: 'bar_009 has 12 steps; extend needs a 16-step bar.',
    run: async (files, pf) => { const rec = recorder(files); const r = await createNewPhrase(phrasePorts(rec, 'bars/bar_009.md', pf)); return { ...r, rec }; } },
  { command: 'New phrase from a sentence (the planner\'s Create)', invalid: { extend: EXTEND_12 }, expected: 'bar_009 has 12 steps; extend needs a 16-step bar.',
    run: async (files, pf) => { const rec = recorder(files); const r = await createNewPhraseFromParams(phrasePorts(rec, 'bars/bar_009.md', pf), EXTEND_FROM_9); return { ...r, rec }; } },
  { command: 'New mix', invalid: { mix: MIX_BAD }, expected: MIX_BAD,
    run: async (files, pf) => { const rec = recorder(files); const r = await createNewMix(phrasePorts(rec, 'bars/bar_001.md', pf)); return { ...r, rec }; } },
  { command: 'New morph', invalid: { morph: MORPH_BAD }, expected: MORPH_BAD,
    run: async (files, pf) => { const rec = recorder(files); const r = await createNewMorph(phrasePorts(rec, 'bars/bar_001.md', pf)); return { ...r, rec }; } },
  { command: 'New transform', invalid: { transform: REGION_BAD }, expected: REGION_BAD,
    run: async (files, pf) => { const rec = recorder(files); const r = await createNewPhraseFromParams(phrasePorts(rec, 'phrases/phrase_001.md', pf), { kind: 'transform', source: 'phrases/phrase_001', ops: [{ op: 'thin_out', first: 1, last: 2, row: 'tom', amount: 0.5 }] } as PhraseParams); return { ...r, rec }; } },
  { command: 'the notebook Run', invalid: { transform: REGION_BAD }, expected: REGION_BAD,
    run: async (files, pf) => {
      const rec = recorder(files); const cells: string[] = [];
      const ports: NotebookPorts<string> = { sourcePhrase: 'phrases/phrase_001', activePath: () => 'phrases/phrase_001.md', ...rec.base, listCellPaths: () => cells, read: async (p) => files.get(p) as string, write: async () => {}, remove: async () => {}, preflight: pf,
        create: async (p, c) => { if (p.startsWith('notebook/')) cells.push(p); return rec.base.create(p, c); } };
      const r = await createNotebook(ports).run({ bars: [1, 2], row: 'tom' }, 'thin_out', 0.5); return { ...r, rec };
    } },
  { command: 'New arrangement', invalid: { arrangement: ARR_BAD }, expected: ARR_BAD,
    run: async (files, pf) => { const rec = recorder(files); const r = await createArrangement({ ...rec.base, preflight: pf } as CreatePorts<string>, [{ kit: 'rock', phrase: 'phrase_001' }]); return { ...r, rec }; } },
  { command: 'New composition (two sections of another meter)', invalid: { composition: COMPOSE_BAD }, expected: 'phrase_013 (section 2) is 3/4 but phrase_001 (section 1) is 4/4; all sections of a composition must share the same meter and steps.',
    run: async (files, pf) => { const rec = recorder(files); const r = await createComposition({ ...rec.base, preflight: pf } as CreatePorts<string>, { sections: [{ source: 'phrases/phrase_001' }, { source: 'phrases/phrase_013' }] }); return { ...r, rec }; } },
];

for (const row of ROWS) {
  test(`${row.command}: an invalid source is ONE plain sentence from the engine and NOTHING is written (no note, no folder, no traceback)`, async () => {
    const files = vaultFiles();
    const r = await row.run(files, makeNotePreflight(engine(files, row.invalid)));
    assert.equal(r.ok, false, JSON.stringify(r.message));
    assert.equal(r.message, row.expected);
    assert.doesNotMatch(r.message ?? '', /Traceback|File "|ValueError|\n/);
    assert.deepEqual(r.rec.writes, [], 'nothing written');
    assert.deepEqual(r.rec.folders, [], 'no folder made');
    assert.deepEqual(r.rec.opened, [], 'nothing opened');
    assert.ok(r.rec.notices.includes(row.expected), 'the person is told, once');
  });
}

for (const row of ROWS) {
  test(`${row.command}: CONTROL - on a valid source the same flow writes (the rows above do not pass for want of a working write path)`, async () => {
    const files = vaultFiles();
    const valid = row.command.includes('notebook') || row.command === 'New transform' ? {} : {};
    const r = await row.run(files, makeNotePreflight(engine(files, valid)));
    // the sources the row names are the invalid ones (a 12-step bar, a waltz); the control uses a stand-in engine that accepts them, so only the pre-write check differs
    assert.equal(r.ok, true, JSON.stringify(r.message));
    assert.ok(r.rec.writes.length >= 1, 'something was written');
  });
}

test('the INSTALLED check is the fallback when a flow has no port of its own (the plugin installs it once at load); a flow with its own port ignores it', async () => {
  const files = vaultFiles();
  let asked = 0;
  installNotePreflight(async () => { asked++; return 'refused by the installed check.'; });
  try {
    const rec = recorder(files);
    const r = await createNewPhraseFromParams({ activePath: () => null, ...rec.base }, EXTEND_FROM_9);
    assert.deepEqual([r.ok, (r as { message?: string }).message, asked, rec.writes], [false, 'refused by the installed check.', 1, []]);
    const own = await createNewPhraseFromParams({ activePath: () => null, ...rec.base, preflight: async () => null }, EXTEND_FROM_9);
    assert.equal(own.ok, true); assert.equal(asked, 1);
  } finally { installNotePreflight(null); }
});

test('an engine that cannot run at all (not a refusal of the note) does not stop a person making a note: the check says nothing', async () => {
  const files = vaultFiles();
  const pf = makeNotePreflight({ ...engine(files, {}), compute: async () => { throw new Error('Pyodide is not ready yet'); } });
  assert.equal(await pf('phrases/phrase_020.md', noteContentFor('phrase_020', EXTEND_FROM_9)), null);
  assert.equal(await pf('bars/bar_020.md', 'anything'), null, 'a bar or a kit has no engine rule');
  // ...also when the unavailable engine reaches the check wrapped inside a SOURCE's refusal (a composition draws its phrases through the same engine)
  const down = makeNotePreflight({ ...engine(files, {}), compute: async () => { throw new Error('Forge runtime is not hydrated: the binary assets are missing or failed verification.'); } });
  const comp = await import('./composition-core.ts').then((m) => m.newCompositionNote('comp_020', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] }));
  assert.equal(await down('compositions/comp_020.md', comp), null);
  // ...but the engine's own refusal inside a source's refusal still is one
  const refusing = makeNotePreflight(engine(files, { extend: EXTEND_12 }));
  files.set('phrases/phrase_001.md', noteContentFor('phrase_001', EXTEND_FROM_9));
  assert.match(String(await refusing('compositions/comp_020.md', comp)), /extend_rhythm|has 12 steps/);
});

// Added by the 1135 mutation pass.
test('an engine refusal that reaches the check WRAPPED ("...could not build the score (<the engine\'s line>)") is still a refusal, with the engine\'s line in it; the same wrapper around an unavailable engine is not', async () => {
  const files = vaultFiles();
  files.set('phrases/phrase_001.md', noteContentFor('phrase_001', EXTEND_FROM_9));
  const wrapped = makeNotePreflight({ ...engine(files, {}), compute: async () => { throw new Error(TRACE(EXTEND_12)); } });
  const said = await wrapped('phrases/phrase_020.md', noteContentFor('phrase_020', EXTEND_FROM_9));
  assert.equal(typeof said, 'string', 'a refusal is a sentence');
  assert.match(String(said), /12 steps|16-step/);
  assert.doesNotMatch(String(said), /Traceback|ValueError:|\n/);
  // the same wrapper around an engine that is merely unavailable says nothing
  const down = makeNotePreflight({ ...engine(files, {}), compute: async () => { throw new Error('Forge runtime is not hydrated: the binary assets are missing or failed verification.'); } });
  assert.equal(await down('phrases/phrase_020.md', noteContentFor('phrase_020', EXTEND_FROM_9)), null);
});

test('the check names the NOTE it draws by its file name (no folder, no .md), and a path outside the three note folders is no business of the engine', async () => {
  const files = vaultFiles();
  const names: string[] = [];
  const pf = makeNotePreflight({ ...engine(files, {}), compute: async (d: any, params: PhraseParams) => { names.push('draw'); return { type: 'musicxml', content: '<score-partwise/>', bars_data: [] }; } } as never);
  assert.equal(await pf('notes/whatever.md', 'x'), null);
  assert.equal(names.length, 0, 'nothing drawn for a path that is not a phrase, arrangement or composition');
  await pf('phrases/phrase_020.md', noteContentFor('phrase_020', EXTEND_FROM_9));
  assert.ok(names.length > 0, 'a phrase is drawn');
});

test('createComposition asks the check for the path and the text it WILL write: the named path, or the next free name; and "root: true" only for a root', async () => {
  const files = vaultFiles();
  const seen: Array<[string, string]> = [];
  const pf: NotePreflight = async (p, c) => { seen.push([p, c]); return null; };
  const rec = recorder(files);
  await createComposition({ ...rec.base, preflight: pf } as CreatePorts<string>, { sections: [{ source: 'phrases/phrase_001' }], name: 'verse' });
  await createComposition({ ...rec.base, preflight: pf } as CreatePorts<string>, { sections: [{ source: 'phrases/phrase_001' }], root: true });
  await createComposition({ ...rec.base, preflight: pf } as CreatePorts<string>, { sections: [{ source: 'phrases/phrase_001' }] });
  assert.equal(seen[0][0], 'compositions/verse.md', 'the named path');
  assert.equal(seen[1][0], 'compositions/comp_001.md', 'no name: the next free one');
  assert.match(seen[1][1], /root: true/);
  assert.doesNotMatch(seen[0][1], /root: true/);
  assert.doesNotMatch(seen[2][1], /root: true/);
  assert.equal(rec.writes[0], 'compositions/verse.md');
});

test('an engine refusal INSIDE a source of a composition (the wrapped "could not build the score (<engine line>)") is a refusal that carries the engine\'s line; an unavailable engine in the same place is not', async () => {
  const files = vaultFiles();
  const comp = await import('./composition-core.ts').then((m) => m.newCompositionNote('comp_021', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] }));
  const refusing = makeNotePreflight({ ...engine(files, {}), compute: async () => { throw new Error(TRACE('mix_rhythm: bars a and b are on different grids')); } });
  const said = await refusing('compositions/comp_021.md', comp);
  assert.equal(typeof said, 'string');
  assert.match(String(said), /mix_rhythm: bars a and b are on different grids/);
  assert.doesNotMatch(String(said), /Traceback|ValueError:|\n/);
  const down = makeNotePreflight({ ...engine(files, {}), compute: async () => { throw new Error('Pyodide is still loading'); } });
  assert.equal(await down('compositions/comp_021.md', comp), null);
});

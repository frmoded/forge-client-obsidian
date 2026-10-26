// score_first (drain 2026-10-25-1000) — "Turn this mix into a morph": the pure decisions and the whole create-and-open action with the vault, the engine and the UI injected. Nothing here knows about Obsidian.
// The mix note is only READ (its `a` and `b`); the new note is a `kind: "morph"` with the mix's two bars, `order: "musical"`, `seed: 0` and `bars = d + 1` (capped at 64; d = 0 gives 5), `d` being the ENGINE's
// answer (`morph_rhythm_info`), never a copy of its rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  morphBarsFor, planMorphFromMix, readPhraseNote, turnMixIntoMorph, turnMixIntoMorphAvailable, type MixPhrase, type MorphPhrase, type TurnMixPorts,
} from './phrase-core.ts';
import type { RhythmData } from './rhythm-edit-core.ts';

const note = (json: string, extra = '') => `---\ntype: data\ncontent_type: json\n${extra}---\n\n\`\`\`json\n${json}\n\`\`\`\n`;
const MIX: MixPhrase = { kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 0, threshold: 0.65, ghost: true };
const MIX_TEXT = note(JSON.stringify(MIX, null, 2), 'description: "phrase_002 — a mix of bar_005 and bar_001."\n');
const bar = (hits: number[]): RhythmData => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array.from({ length: 16 }, (_, i) => hits.includes(i)) } } as RhythmData);
const barNote = (d: RhythmData) => note(JSON.stringify(d));

interface Rig { ports: TurnMixPorts<{ path: string }>; created: Array<{ path: string; content: string }>; opened: string[]; notices: string[]; lines: string[]; asked: Array<{ a: RhythmData; b: RhythmData; order: string; seed: number }>; reads: string[]; vault: Map<string, string> }
function rig(opts: { active?: string | null; phrases?: string[]; d?: number | Error; mixText?: string | Error; bars?: Record<string, string>; existing?: string[]; createFails?: Array<unknown> } = {}): Rig {
  const vault = new Map<string, string>();
  const active = opts.active === undefined ? 'phrases/phrase_002.md' : opts.active;
  if (active !== null && opts.mixText !== undefined && !(opts.mixText instanceof Error)) vault.set(active, opts.mixText);
  else if (active !== null && opts.mixText === undefined) vault.set(active, MIX_TEXT);
  const bars = opts.bars ?? { 'bars/bar_005.md': barNote(bar([0, 4, 8, 12])), 'bars/bar_001.md': barNote(bar([0, 2, 4, 6])) };
  const created: Array<{ path: string; content: string }> = []; const opened: string[] = []; const notices: string[] = []; const lines: string[] = []; const reads: string[] = [];
  const asked: Rig['asked'] = [];
  const phrases = new Set(opts.phrases ?? ['phrase_001', 'phrase_002']);
  const fails = [...(opts.createFails ?? [])];
  const ports: TurnMixPorts<{ path: string }> = {
    activePath: () => active,
    folderExists: () => true,
    createFolder: async () => {},
    listPhraseBasenames: () => [...phrases],
    exists: (p) => created.some((c) => c.path === p) || phrases.has(p.replace(/^phrases\//, '').replace(/\.md$/, '')),
    create: async (p, content) => { if (fails.length) throw fails.shift(); created.push({ path: p, content }); return { path: p }; },
    open: async (f) => { opened.push(f.path); },
    notify: (m) => { notices.push(m); },
    isAlreadyExists: (e) => (e as Error)?.message === 'File already exists.',
    readNote: async (p) => {
      reads.push(p);
      if (opts.mixText instanceof Error && p === active) throw opts.mixText;
      const t = p === active ? vault.get(p) : bars[p];
      if (t === undefined) throw new Error('File not found');
      return t;
    },
    changes: async (a, b, order, seed) => {
      asked.push({ a, b, order, seed });
      if (opts.d instanceof Error) throw opts.d;
      return opts.d ?? 4;
    },
    trace: (l) => { lines.push(l); },
  };
  return { ports, created, opened, notices, lines, asked, reads, vault };
}
const parseCreated = (c: { content: string }): MorphPhrase => { const r = readPhraseNote(c.content); if (r.ok === false) throw new Error(r.message); return r.value as MorphPhrase; };

test('availability: only in a score-first vault, and only on a mix (a mix tab or a mix text tab); never on a bar, an extend, a morph, nothing, or in another vault', () => {
  assert.equal(turnMixIntoMorphAvailable({ scoreFirst: true, kind: 'mix' }), true);
  for (const kind of ['extend', 'morph', null, undefined] as const) assert.equal(turnMixIntoMorphAvailable({ scoreFirst: true, kind }), false, String(kind));
  assert.equal(turnMixIntoMorphAvailable({ scoreFirst: false, kind: 'mix' }), false, 'not a score-first vault');
});

test('bars = d + 1, capped at 64, and 5 when there is nothing to morph (d = 0)', () => {
  assert.equal(morphBarsFor(4), 5);
  assert.equal(morphBarsFor(1), 2);
  assert.equal(morphBarsFor(0), 5);
  assert.equal(morphBarsFor(63), 64);
  assert.equal(morphBarsFor(64), 64);
  assert.equal(morphBarsFor(500), 64);
});

test('the plan: a morph note with the mix\'s a and b, musical order, seed 0 and bars d + 1; the next free number; the description says where it came from', () => {
  const plan = planMorphFromMix({ mixName: 'phrase_002', mix: MIX, d: 4, existingBasenames: ['phrase_001', 'phrase_002'], exists: () => false });
  assert.equal(plan.ok, true);
  if (plan.ok === false) return;
  assert.equal(plan.path, 'phrases/phrase_003.md');
  const r = readPhraseNote(plan.content);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value, { kind: 'morph', a: 'bar_005', b: 'bar_001', bars: 5, order: 'musical', seed: 0 });
  assert.match(plan.content, /phrase_003 — a morph from \[\[bar_005\]\] to \[\[bar_001\]\]/);
  assert.match(plan.content, /^made_from: "\[\[phrase_002\]\]"$/m, 'the mix it was made from is a wikilink property');
  assert.doesNotMatch(plan.content, /weight|threshold|ghost/, 'the mix\'s vote settings are not carried');
});

test('numbering skips existing notes: a gap is not reused out of order, the first free number after the highest is not assumed (the listing and the existence check decide)', () => {
  const plan = planMorphFromMix({ mixName: 'phrase_002', mix: MIX, d: 4, existingBasenames: ['phrase_001', 'phrase_002', 'phrase_003', 'phrase_004'], exists: () => false });
  assert.equal(plan.ok && plan.path, 'phrases/phrase_005.md');
  const stale = planMorphFromMix({ mixName: 'phrase_002', mix: MIX, d: 4, existingBasenames: ['phrase_001', 'phrase_002'], exists: (p) => p === 'phrases/phrase_003.md' });
  assert.equal(stale.ok && stale.path, 'phrases/phrase_004.md', 'a name taken since the listing was made is skipped');
});

test('the whole action: reads the mix FRESH, asks the engine for d on the two bars (musical, seed 0), creates ONE new morph, opens it, says so on the evidence line; the mix is never written', async () => {
  const r = rig();
  const out = await turnMixIntoMorph(r.ports);
  assert.deepEqual(out, { ok: true, path: 'phrases/phrase_003.md' });
  assert.equal(r.created.length, 1);
  assert.deepEqual(parseCreated(r.created[0]), { kind: 'morph', a: 'bar_005', b: 'bar_001', bars: 5, order: 'musical', seed: 0 });
  assert.deepEqual(r.opened, ['phrases/phrase_003.md']);
  assert.deepEqual(r.asked.map((x) => [x.order, x.seed, x.a.channels.kick.filter(Boolean).length, x.b.channels.kick.filter(Boolean).length]), [['musical', 0, 4, 4]]);
  assert.deepEqual(r.lines, ['[forge-morph] turned phrase_002 (mix) into phrase_003 (morph, bars 5, d 4)']);
  assert.deepEqual(r.notices, []);
  assert.equal(r.vault.get('phrases/phrase_002.md'), MIX_TEXT, 'the original mix is byte-unchanged');
  assert.ok(r.reads.includes('phrases/phrase_002.md') && r.reads.includes('bars/bar_005.md') && r.reads.includes('bars/bar_001.md'));
});

test('bars follow the engine\'s d: 9 changes give 10 bars; 0 changes give 5; 80 changes give 64', async () => {
  for (const [d, bars] of [[9, 10], [0, 5], [80, 64]] as const) {
    const r = rig({ d });
    const out = await turnMixIntoMorph(r.ports);
    assert.equal(out.ok, true, String(d));
    assert.equal(parseCreated(r.created[0]).bars, bars, `d ${d}`);
    assert.deepEqual(r.lines, [`[forge-morph] turned phrase_002 (mix) into phrase_003 (morph, bars ${bars}, d ${d})`]);
  }
});

test('running it twice makes two different morph notes (the second sees the first)', async () => {
  const r = rig();
  const one = await turnMixIntoMorph(r.ports);
  const two = await turnMixIntoMorph(r.ports);
  assert.deepEqual([one, two].map((x) => x.ok && x.path), ['phrases/phrase_003.md', 'phrases/phrase_004.md']);
  assert.equal(r.created.length, 2);
});

test('a name that is taken between the listing and the create is retried with the next one (the vault refuses a file that exists)', async () => {
  const r = rig({ createFails: [new Error('File already exists.')] });
  const out = await turnMixIntoMorph(r.ports);
  assert.equal(out.ok, true);
  assert.equal(r.created.length, 1);
});

test('refusals are Notices that name why, nothing is created or opened, and a caught error is a console.error', async () => {
  const quiet = console.error; const errors: unknown[][] = [];
  console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const cases: Array<[string, Rig, RegExp]> = [
      ['not on a phrase', rig({ active: 'bars/bar_005.md' }), /open a mix phrase first/i],
      ['no active note', rig({ active: null }), /open a mix phrase first/i],
      ['a morph', rig({ mixText: note(JSON.stringify({ kind: 'morph', a: 'bar_005', b: 'bar_001', bars: 5, order: 'musical', seed: 0 })) }), /morph phrase, not a mix/],
      ['an extend', rig({ mixText: note(JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 })) }), /extend phrase, not a mix/],
      ['a mix that is wrong', rig({ mixText: note(JSON.stringify({ kind: 'mix', a: 'bar_005', b: 'bar_001', weight: 3, threshold: 0.5, ghost: false })) }), /not usable.*weight/i],
      ['a mix that cannot be read', rig({ mixText: new Error('disk gone') }), /could not be read.*disk gone/],
      ['bar a missing', rig({ bars: { 'bars/bar_001.md': barNote(bar([0])) } }), /bar_005.*not found/],
      ['bar b not rhythm data', rig({ bars: { 'bars/bar_005.md': barNote(bar([0])), 'bars/bar_001.md': note('{"x": 1}') } }), /bar_001.*not (usable|rhythm)/i],
      ['the engine is not ready', rig({ d: new Error('the engine is not available') }), /engine.*not available/],
      ['the engine refuses the pair', rig({ d: new Error('Traceback ...\nValueError: morph_rhythm_info: the bars differ in steps (16 vs 12).') }), /morph_rhythm_info: the bars differ in steps/],
    ];
    for (const [name, r, re] of cases) {
      const out = await turnMixIntoMorph(r.ports);
      assert.equal(out.ok, false, name);
      assert.equal(r.created.length, 0, `${name}: nothing created`);
      assert.deepEqual(r.opened, [], `${name}: nothing opened`);
      assert.deepEqual(r.lines, [], `${name}: no evidence line for a turn that did not happen`);
      assert.equal(r.notices.length, 1, `${name}: exactly one Notice, got ${JSON.stringify(r.notices)}`);
      assert.match(r.notices[0], re, name);
      assert.equal(out.ok === false && out.message, r.notices[0], `${name}: the result carries the same message`);
    }
    assert.ok(errors.length >= 3, 'the caught errors (unreadable mix, engine) were console.error\'d');
    assert.ok(errors.every((e) => String(e[0]).includes('turnMixIntoMorph')), 'each names the originating method');
  } finally { console.error = quiet; }
});

test('an engine answer that is not a count of changes (NaN, negative, not a number) is a refusal naming the bars, never a morph of NaN bars', async () => {
  for (const d of [Number.NaN, -1, Number.POSITIVE_INFINITY, 'four' as unknown as number]) {
    const r = rig({ d });
    const out = await turnMixIntoMorph(r.ports);
    assert.equal(out.ok, false, String(d));
    assert.equal(r.created.length, 0);
    assert.match(r.notices[0], /did not say how many changes lie between bar_005 and bar_001/);
  }
});

test('a create that fails for another reason is a Notice, not a thrown error and not silence', async () => {
  const quiet = console.error; console.error = () => {};
  try {
    const r = rig({ createFails: [new Error('disk full')] });
    const out = await turnMixIntoMorph(r.ports);
    assert.equal(out.ok, false);
    assert.match(r.notices.join(' | '), /disk full/);
    assert.deepEqual(r.lines, []);
  } finally { console.error = quiet; }
});

// score_first M7 Phase A (drain 2026-10-22-2330) — the mix phrase core: a phrase of `kind: "mix"` holds two bar names and three numbers, never bars. Parse, validate, refuse naming the field, the
// clamps the sliders write, the plain-words sentence, the note's text, "New mix from this bar", and the Score of a mix (both bars read fresh, engine injected). Pure: no Obsidian, no engine.
// The extend phrase is pinned byte-for-byte here too: M7 widened the union, and none of M5/M6's output may move.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MIX_DEFAULTS, MIX_KEYS, PHRASE_KEYS, applyPhraseWrite, clampMixUnit, createNewMix, formatPhraseJson, mixNoteContent, mixSentence, newMixAvailable, newPhraseAvailable, phraseNoteContent,
  planNewMix, producePhrase, producePhraseNote, readPhraseNote, validatePhrase, type MixPhrase,
} from './phrase-core.ts';

const note = (json: string, fm = 'type: data\ncontent_type: json') => `---\n${fm}\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`;
const MIX: MixPhrase = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false };
const barNote = (tempo: number) => `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels: { kick: Array(16).fill(false) },
})}\n\`\`\`\n`;
const computeOk = async () => ({ type: 'musicxml', content: '<score-partwise/>' });

// ---- validation -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a full mix validates and comes back as is; only kind, a and b are required (weight 0.5, threshold 0.5, ghost false fill in)', () => {
  assert.deepEqual(validatePhrase(MIX), { ok: true, value: MIX });
  assert.deepEqual(validatePhrase({ kind: 'mix', a: 'bar_001', b: 'bar_002' }), { ok: true, value: { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false } });
  assert.deepEqual(MIX_DEFAULTS, { weight: 0.5, threshold: 0.5, ghost: false });
  assert.deepEqual([...MIX_KEYS], ['kind', 'a', 'b', 'weight', 'threshold', 'ghost']);
});

test('the same bar twice is a valid mix (the command falls back to it when there is only one bar)', () => {
  assert.equal(validatePhrase({ kind: 'mix', a: 'bar_005', b: 'bar_005' }).ok, true);
});

test('refused, each naming the field: a and b (missing, odd, a path), weight, threshold, ghost, an unknown field, an unknown kind', () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ kind: 'mix', b: 'bar_006' }, /\ba\b.*bar/],
    [{ kind: 'mix', a: 'bar_005' }, /\bb\b.*bar/],
    [{ kind: 'mix', a: '', b: 'bar_006' }, /\ba\b/],
    [{ kind: 'mix', a: 'bars/bar_005', b: 'bar_006' }, /\ba\b/],
    [{ kind: 'mix', a: 'bar_005', b: '../bar_006' }, /\bb\b/],
    [{ kind: 'mix', a: 'bar_005', b: 'bar_006.md' }, /\bb\b/],
    [{ kind: 'mix', a: 7, b: 'bar_006' }, /\ba\b/],
    [{ kind: 'mix', a: 'bar_005', b: null }, /\bb\b/],
    [{ ...MIX, weight: 3 }, /weight/],
    [{ ...MIX, weight: -0.01 }, /weight/],
    [{ ...MIX, weight: 1.01 }, /weight/],
    [{ ...MIX, weight: '0.5' }, /weight/],
    [{ ...MIX, weight: true }, /weight/],
    [{ ...MIX, weight: NaN }, /weight/],
    [{ ...MIX, weight: null }, /weight/],
    [{ ...MIX, threshold: 2 }, /threshold/],
    [{ ...MIX, threshold: -1 }, /threshold/],
    [{ ...MIX, threshold: '0.5' }, /threshold/],
    [{ ...MIX, ghost: 1 }, /ghost/],
    [{ ...MIX, ghost: 'yes' }, /ghost/],
    [{ ...MIX, ghost: null }, /ghost/],
    [{ ...MIX, source: 'bar_005' }, /source/],
    [{ ...MIX, bars: 4 }, /bars/],
    [{ kind: 'loop', a: 'bar_005', b: 'bar_006' }, /kind.*"extend".*"mix"/],
  ];
  for (const [raw, re] of cases) {
    const v = validatePhrase(raw);
    assert.equal(v.ok, false, JSON.stringify(raw));
    if (v.ok === false) assert.match(v.message, re, JSON.stringify(raw));
  }
});

test('the range edges are accepted: weight and threshold 0 and 1, and a value between', () => {
  for (const x of [0, 1, 0.05, 0.95, 0.3]) {
    assert.equal(validatePhrase({ ...MIX, weight: x }).ok, true, `weight ${x}`);
    assert.equal(validatePhrase({ ...MIX, threshold: x }).ok, true, `threshold ${x}`);
  }
  assert.equal(validatePhrase({ ...MIX, ghost: true }).ok, true);
});

test('the extend phrase is untouched: the same value back, the same refusal text for an unknown field, and an extend phrase that names a mix field is refused', () => {
  const FULL = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
  assert.deepEqual(validatePhrase(FULL), { ok: true, value: FULL });
  assert.deepEqual(validatePhrase({ kind: 'extend', source: 'bar_001' }), { ok: true, value: { kind: 'extend', source: 'bar_001', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } });
  // M9 (drain 2026-10-23-0330), deliberate: `overrides` is a field of an extend now, so the refusal text lists it and PHRASE_KEYS has it
  assert.deepEqual(validatePhrase({ ...FULL, swing: 3 }), { ok: false, message: 'Unexpected field "swing" (a phrase holds only kind, source, bars, style, tempo_change_pct, overrides).' });
  assert.deepEqual([...PHRASE_KEYS], ['kind', 'source', 'bars', 'style', 'tempo_change_pct', 'overrides']);
  const mixedUp = validatePhrase({ ...FULL, weight: 0.5 });
  assert.equal(mixedUp.ok, false);
  if (mixedUp.ok === false) assert.match(mixedUp.message, /weight/);
  assert.deepEqual(validatePhrase({ ...MIX, swing: 3 }), { ok: false, message: 'Unexpected field "swing" (a mix holds only kind, a, b, weight, threshold, ghost).' });
});

// ---- the note -------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('formatPhraseJson of a mix is the shape the prompt gives, in that field order, and round-trips through validate', () => {
  assert.equal(formatPhraseJson(MIX), '{\n  "kind": "mix",\n  "a": "bar_005",\n  "b": "bar_006",\n  "weight": 0.5,\n  "threshold": 0.5,\n  "ghost": false\n}');
  const odd: MixPhrase = { ...MIX, weight: 0.35, threshold: 0, ghost: true };
  assert.deepEqual(validatePhrase(JSON.parse(formatPhraseJson(odd))), { ok: true, value: odd });
  // extend: exactly the M5 text
  assert.equal(
    formatPhraseJson({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 }),
    '{\n  "kind": "extend",\n  "source": "bar_005",\n  "bars": 8,\n  "style": "repeat_with_fills",\n  "tempo_change_pct": -20\n}',
  );
});

test('readPhraseNote reads a mix note; a wrong weight in a hand-edited note is refused naming weight', () => {
  assert.deepEqual(readPhraseNote(note(JSON.stringify(MIX))), { ok: true, value: MIX });
  const bad = readPhraseNote(note(JSON.stringify({ ...MIX, weight: 3 })));
  assert.equal(bad.ok, false);
  if (bad.ok === false) assert.match(bad.message, /weight/);
});

test('applyPhraseWrite rewrites only the json block of a mix note: frontmatter and line endings are kept; read_only is honoured', () => {
  const text = note(JSON.stringify({ ...MIX, weight: 1 }), 'type: data\ncontent_type: json\ndescription: "mine"');
  const w = applyPhraseWrite(text, MIX);
  assert.equal(w.ok, true);
  if (w.ok) {
    assert.ok(w.text.startsWith('---\ntype: data\ncontent_type: json\ndescription: "mine"\n---\n\n```json\n'));
    assert.deepEqual(readPhraseNote(w.text), { ok: true, value: MIX });
  }
  const crlf = applyPhraseWrite(text.replace(/\n/g, '\r\n'), MIX);
  assert.equal(crlf.ok, true);
  if (crlf.ok) assert.equal(/[^\r]\n/.test(crlf.text), false);
  const ro = applyPhraseWrite(note(JSON.stringify(MIX), 'type: data\ncontent_type: json\nread_only: true'), MIX);
  assert.equal(ro.ok, false);
});

test('the extend note\'s starter text is byte-for-byte what M5 wrote', () => {
  assert.equal(
    phraseNoteContent('phrase_001', 'bar_005'),
    '---\ntype: data\ncontent_type: json\ndescription: "phrase_001 — bar_005 stretched into a longer phrase. Parameters only; the Score is derived from the bar."\n---\n\n```json\n'
      + '{\n  "kind": "extend",\n  "source": "bar_005",\n  "bars": 4,\n  "style": "repeat_with_fills",\n  "tempo_change_pct": 0\n}\n```\n',
  );
});

test('mixNoteContent: a data/json note whose block is the defaults + the two bars, valid to read back', () => {
  const text = mixNoteContent('phrase_002', 'bar_005', 'bar_006');
  assert.deepEqual(readPhraseNote(text), { ok: true, value: MIX });
  assert.match(text, /^---\ntype: data\ncontent_type: json\ndescription: ".*bar_005.*bar_006.*"\n---\n\n```json\n/);
  assert.ok(text.endsWith('```\n'));
});

// ---- what the sliders write, and the sentence ------------------------------------------------------------------------------------------------------------------------------------------

test('clampMixUnit (the sliders): into 0..1, to two decimals (no 0.30000000000000004 in the note), junk is the default', () => {
  assert.equal(clampMixUnit(-1), 0);
  assert.equal(clampMixUnit(2), 1);
  assert.equal(clampMixUnit(0.35), 0.35);
  assert.equal(clampMixUnit(0.1 + 0.2), 0.3);
  assert.equal(clampMixUnit(0.123456), 0.12);
  assert.equal(clampMixUnit(Number.NaN), 0.5);
  assert.equal(clampMixUnit(Infinity), 1);
  assert.equal(clampMixUnit('0.2' as unknown as number), 0.5);
});

test('mixSentence: says in plain words what the settings do, with the numbers on screen', () => {
  assert.equal(mixSentence(MIX), 'Mix of bar_005 and bar_006: 50 % bar_005; a hit appears where the weights say it should (threshold 0.50).');
  assert.equal(mixSentence({ ...MIX, weight: 1 }), 'Mix of bar_005 and bar_006: 100 % bar_005; a hit appears where the weights say it should (threshold 0.50).');
  assert.equal(mixSentence({ ...MIX, weight: 0.35, threshold: 0.7 }), 'Mix of bar_005 and bar_006: 35 % bar_005; a hit appears where the weights say it should (threshold 0.70).');
  assert.match(mixSentence({ ...MIX, ghost: true }), /Ghost notes: .*quiet/);
  assert.doesNotMatch(mixSentence(MIX), /[Gg]host/);
  assert.match(mixSentence({ ...MIX, b: 'bar_005' }), /bar_005 and itself|the same bar/);
});

// ---- New mix from this bar ------------------------------------------------------------------------------------------------------------------------------------------------------------

test('"New mix from this bar" is offered under exactly the conditions of "New phrase from this bar": a score-first vault, the active file is a bar', () => {
  for (const scoreFirst of [true, false]) {
    for (const activePath of ['bars/bar_005.md', 'phrases/phrase_001.md', null, 'x.md', undefined]) {
      assert.equal(newMixAvailable({ scoreFirst, activePath }), newPhraseAvailable({ scoreFirst, activePath }), `${scoreFirst} ${activePath}`);
    }
  }
  assert.equal(newMixAvailable({ scoreFirst: true, activePath: 'bars/bar_005.md' }), true);
  assert.equal(newMixAvailable({ scoreFirst: false, activePath: 'bars/bar_005.md' }), false, 'P3');
});

test('planNewMix: a is the bar you are on, b the first OTHER bar by number; the name is the next free phrase_NNN; no notice when there is another bar', () => {
  const ok = planNewMix({ activePath: 'bars/bar_005.md', existingBasenames: ['phrase_001'], exists: () => false, barBasenames: ['bar_010', 'bar_002', 'bar_005', 'bar_006', 'README'] });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.path, 'phrases/phrase_002.md');
    assert.deepEqual(readPhraseNote(ok.content), { ok: true, value: { ...MIX, a: 'bar_005', b: 'bar_002' } });
    assert.equal(ok.notice, undefined);
  }
  const after = planNewMix({ activePath: 'bars/bar_001.md', existingBasenames: [], exists: () => false, barBasenames: ['bar_001', 'bar_005', 'bar_006'] });
  assert.equal(after.ok && readPhraseNote(after.content).ok && (readPhraseNote(after.content) as { value: MixPhrase }).value.b, 'bar_005');
});

test('planNewMix with only one bar: b is the same bar and there is a notice saying so', () => {
  const one = planNewMix({ activePath: 'bars/bar_005.md', existingBasenames: [], exists: () => false, barBasenames: ['bar_005'] });
  assert.equal(one.ok, true);
  if (one.ok) {
    assert.deepEqual(readPhraseNote(one.content), { ok: true, value: { ...MIX, a: 'bar_005', b: 'bar_005' } });
    assert.match(one.notice ?? '', /only one bar/i);
    assert.match(one.notice ?? '', /bar_005/);
  }
});

test('planNewMix: not on a bar is refused saying so; a name taken in the same instant moves on; no free name is refused', () => {
  const notBar = planNewMix({ activePath: 'x.md', existingBasenames: [], exists: () => false, barBasenames: ['bar_005'] });
  assert.equal(notBar.ok, false);
  if (notBar.ok === false) assert.match(notBar.message, /New mix: open a bar/);
  const taken = new Set(['phrases/phrase_001.md']);
  const raced = planNewMix({ activePath: 'bars/bar_005.md', existingBasenames: [], exists: (p) => taken.has(p), barBasenames: ['bar_005', 'bar_006'] });
  assert.equal(raced.ok && raced.path, 'phrases/phrase_002.md');
  assert.equal(planNewMix({ activePath: 'bars/bar_005.md', existingBasenames: [], exists: () => true, barBasenames: ['bar_005'] }).ok, false);
});

function mixPorts(over: Record<string, unknown> = {}) {
  const log: string[] = [];
  const p = {
    activePath: () => 'bars/bar_005.md',
    folderExists: () => false,
    createFolder: async () => { log.push('createFolder'); },
    listPhraseBasenames: () => [] as string[],
    listBarBasenames: () => ['bar_005', 'bar_006'],
    exists: () => false,
    create: async (path: string, content: string) => { log.push(`create ${path}`); return { path, content }; },
    open: async (f: { path: string }) => { log.push(`open ${f.path}`); },
    notify: (m: string) => { log.push(`notify ${m}`); },
    isAlreadyExists: (e: unknown) => /already exists/i.test(String((e as Error)?.message ?? e)),
    ...over,
  };
  return { p, log };
}

test('createNewMix: makes phrases/ when missing, creates the next phrase as a mix of this bar and the next, opens it', async () => {
  const { p, log } = mixPorts();
  const r = await createNewMix(p);
  assert.deepEqual(r, { ok: true, path: 'phrases/phrase_001.md' });
  assert.deepEqual(log, ['createFolder', 'create phrases/phrase_001.md', 'open phrases/phrase_001.md']);
});

test('createNewMix with a single bar: creates the mix of the bar with itself, opens it, and says so in a notice', async () => {
  const { p, log } = mixPorts({ listBarBasenames: () => ['bar_005'] });
  const r = await createNewMix(p);
  assert.equal(r.ok, true);
  assert.equal(log.filter((l) => l.startsWith('create ')).length, 1);
  assert.match(log.join('\n'), /notify .*only one bar/i);
  assert.ok(log.findIndex((l) => l.startsWith('open ')) >= 0);
});

test('createNewMix: not on a bar says so and touches nothing; a name taken in the same instant tries the next; every failure is a notice', async () => {
  const a = mixPorts({ activePath: () => 'x.md' });
  const ra = await createNewMix(a.p);
  assert.equal(ra.ok, false);
  assert.equal(a.log.filter((l) => l.startsWith('create ')).length, 0);
  assert.equal(a.log.includes('createFolder'), false);
  assert.match(a.log.join('\n'), /notify New mix: open a bar/);

  let n = 0;
  const b = mixPorts({ folderExists: () => true, create: async (path: string) => { if (n++ === 0) throw new Error('File already exists.'); b.log.push(`create ${path}`); return { path }; } });
  assert.equal((await createNewMix(b.p)).ok, true);

  const c = mixPorts({ folderExists: () => true, create: async () => { throw new Error('disk full'); } });
  const origErr = console.error; console.error = () => {};
  try {
    const rc = await createNewMix(c.p);
    assert.equal(rc.ok, false);
    assert.match(c.log.join('\n'), /notify Could not make a new mix: disk full/);
  } finally { console.error = origErr; }
});

// ---- the Score of a mix ------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('producePhrase of a mix: reads BOTH bars fresh, hands {a, b} and the parameters to the engine, returns its payload', async () => {
  const reads: string[] = [];
  const seen: unknown[] = [];
  const out = await producePhrase({
    readNote: async (p) => { reads.push(p); return barNote(p.includes('005') ? 100 : 120); },
    compute: async (d, p, t) => { seen.push(d, p, t); return computeOk(); },
  }, MIX, 'phrase_002');
  assert.equal(out.kind, 'score');
  assert.deepEqual(reads, ['bars/bar_005.md', 'bars/bar_006.md']);
  const data = seen[0] as { a: { tempo_bpm: number }; b: { tempo_bpm: number } };
  assert.equal(data.a.tempo_bpm, 100);
  assert.equal(data.b.tempo_bpm, 120);
  assert.deepEqual(seen[1], MIX);
  assert.equal(seen[2], 'phrase_002');
});

test('producePhrase of a mix: a missing or unusable bar is a refusal naming WHICH one (a or b) and the bar, and the engine is never reached', async () => {
  let calls = 0;
  const compute = async () => { calls++; return computeOk(); };
  const noB = await producePhrase({ readNote: async (p) => { if (p.includes('006')) throw new Error('File not found'); return barNote(100); }, compute }, MIX, 'p');
  assert.equal(noB.kind, 'refusal');
  if (noB.kind === 'refusal') { assert.match(noB.message, /^Phrase: /); assert.match(noB.message, /\bb\b.*bar_006/); assert.match(noB.message, /not found|could not be read/); }
  const noA = await producePhrase({ readNote: async (p) => { if (p.includes('005')) throw new Error('File not found'); return barNote(100); }, compute }, MIX, 'p');
  assert.equal(noA.kind, 'refusal');
  if (noA.kind === 'refusal') assert.match(noA.message, /\ba\b.*bar_005/);
  const junkB = await producePhrase({ readNote: async (p) => (p.includes('006') ? note('{"x":1}') : barNote(100)), compute }, MIX, 'p');
  assert.equal(junkB.kind, 'refusal');
  if (junkB.kind === 'refusal') assert.match(junkB.message, /^Phrase: .*\bb\b.*bar_006.*not usable/);
  const junkA = await producePhrase({ readNote: async (p) => (p.includes('005') ? note('{"x":1}') : barNote(100)), compute }, MIX, 'p');
  assert.equal(junkA.kind, 'refusal');
  if (junkA.kind === 'refusal') assert.match(junkA.message, /\ba\b.*bar_005.*not usable/);
  assert.equal(calls, 0);
});

test('producePhrase of a mix: an invalid mix (weight 3) is a refusal naming weight and no bar is read', async () => {
  let reads = 0;
  const out = await producePhrase({ readNote: async () => { reads++; return barNote(100); }, compute: computeOk }, { ...MIX, weight: 3 }, 'p');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.match(out.message, /^Phrase: .*weight/);
  assert.equal(reads, 0);
});

test('producePhrase of a mix: the engine\'s mix_rhythm ValueError (two bars on different grids) is a REFUSAL line, not an error and not a console.error; any other engine failure stays an error', async () => {
  const origErr = console.error; const errors: unknown[] = []; console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const mismatch = await producePhrase({
      readNote: async () => barNote(100),
      compute: async () => { throw new Error('mix_rhythm: a and b must agree on steps, but a has 16 and b has 12'); },
    }, MIX, 'p');
    assert.equal(mismatch.kind, 'refusal');
    if (mismatch.kind === 'refusal') assert.match(mismatch.message, /^Phrase: mix_rhythm: a and b must agree on steps/);
    const other = await producePhrase({ readNote: async () => barNote(100), compute: async () => { throw new Error('the engine fell over'); } }, MIX, 'p');
    assert.equal(other.kind, 'error');
    assert.equal(errors.length, 0, 'nothing went to console.error');
  } finally { console.error = origErr; }
});

test('producePhrase of a mix with the same bar twice reads it for both sides and passes the same data twice', async () => {
  const seen: unknown[] = [];
  const out = await producePhrase({ readNote: async () => barNote(100), compute: async (d) => { seen.push(d); return computeOk(); } }, { ...MIX, b: 'bar_005' }, 'p');
  assert.equal(out.kind, 'score');
  const d = seen[0] as { a: unknown; b: unknown };
  assert.deepEqual(d.a, d.b);
});

test('producePhraseNote of a mix note: the note\'s TEXT in -> the same outcomes; extend notes still read one bar', async () => {
  const reads: string[] = [];
  const deps = { readNote: async (p: string) => { reads.push(p); return barNote(100); }, compute: computeOk };
  const mix = await producePhraseNote(deps, note(JSON.stringify(MIX)), 'phrase_002');
  assert.equal(mix.kind, 'score');
  assert.deepEqual(reads, ['bars/bar_005.md', 'bars/bar_006.md']);
  reads.length = 0;
  const ext = await producePhraseNote(deps, note(JSON.stringify({ kind: 'extend', source: 'bar_005', bars: 2, style: 'building', tempo_change_pct: 0 })), 'phrase_001');
  assert.equal(ext.kind, 'score');
  assert.deepEqual(reads, ['bars/bar_005.md']);
  const bad = await producePhraseNote(deps, note(JSON.stringify({ ...MIX, weight: 3 })), 'phrase_002');
  assert.equal(bad.kind, 'refusal');
  if (bad.kind === 'refusal') assert.match(bad.message, /weight/);
});

test('mixRhythmRefusal finds the engine\'s own line in a plain message and in the whole Python traceback Pyodide throws; anything else is not a refusal', async () => {
  const { mixRhythmRefusal } = await import('./phrase-core.ts');
  assert.equal(mixRhythmRefusal('mix_rhythm: a and b must agree on steps, but a has 16 and b has 12'), 'mix_rhythm: a and b must agree on steps, but a has 16 and b has 12');
  const trace = 'Traceback (most recent call last):\n  File "/lib/python313.zip/_pyodide/_base.py", line 523, in eval_code\n  File "<exec>", line 899, in _forge_rhythm_phrase_payload\n  File "/bundle/engine/forge/music/lib.py", line 3800, in mix_rhythm\nValueError: mix_rhythm: a and b must agree on time_signature, but a has \'4/4\' and b has \'3/4\'\n';
  assert.equal(mixRhythmRefusal(trace), "mix_rhythm: a and b must agree on time_signature, but a has '4/4' and b has '3/4'");
  assert.equal(mixRhythmRefusal('Traceback (most recent call last):\nKeyError: \'bars\'\n'), null);
  assert.equal(mixRhythmRefusal('the engine fell over'), null);
  assert.equal(mixRhythmRefusal('extend_rhythm: steps must be 16'), null);
});

test('producePhrase of a mix: the traceback form of the engine\'s mix_rhythm ValueError is a refusal too', async () => {
  const trace = 'Traceback (most recent call last):\n  File "<exec>", line 1, in <module>\nValueError: mix_rhythm: a and b must agree on steps, but a has 16 and b has 12\n';
  const out = await producePhrase({ readNote: async () => barNote(100), compute: async () => { throw new Error(trace); } }, MIX, 'p');
  assert.equal(out.kind, 'refusal');
  if (out.kind === 'refusal') assert.equal(out.message, 'Phrase: mix_rhythm: a and b must agree on steps, but a has 16 and b has 12');
});

test('planNewMix picks the first other bar by NUMBER, not as text (bar_9 comes before bar_10), and never the bar you are on', () => {
  const plan = planNewMix({ activePath: 'bars/bar_5.md', existingBasenames: [], exists: () => false, barBasenames: ['bar_10', 'bar_9', 'bar_5', 'bar_100'] });
  assert.equal(plan.ok && (readPhraseNote(plan.content) as { value: MixPhrase }).value.b, 'bar_9');
  const self = planNewMix({ activePath: 'bars/bar_2.md', existingBasenames: [], exists: () => false, barBasenames: ['bar_2', 'bar_10'] });
  assert.equal(self.ok && (readPhraseNote(self.content) as { value: MixPhrase }).value.b, 'bar_10', 'bar_2 is the bar you are on, so b is the other one');
});

// ---- gaps found by the mutants (client pass) ----------------------------------------------------------------------------------------------------------------------------------------

test('mixSentence rounds the percentage, it does not cut it off: 0.29 is 29 %, not 28 % (0.29 * 100 is 28.999999999999996 in floats)', () => {
  assert.match(mixSentence({ ...MIX, weight: 0.29 }), /: 29 % bar_005;/);
  assert.match(mixSentence({ ...MIX, weight: 0.57 }), /: 57 % bar_005;/);
});

test('producePhrase of a mix with the same bar twice reads that note ONCE', async () => {
  const reads: string[] = [];
  const out = await producePhrase({ readNote: async (p) => { reads.push(p); return barNote(100); }, compute: computeOk }, { ...MIX, b: 'bar_005' }, 'p');
  assert.equal(out.kind, 'score');
  assert.deepEqual(reads, ['bars/bar_005.md']);
});

test('mixRhythmRefusal only takes a line that STARTS with mix_rhythm: (or ValueError: mix_rhythm:); the name in the middle of some other message is not a refusal', async () => {
  const { mixRhythmRefusal } = await import('./phrase-core.ts');
  assert.equal(mixRhythmRefusal('RuntimeError: while calling mix_rhythm: boom'), null);
  assert.equal(mixRhythmRefusal('the engine said mix_rhythm: oops'), null);
  assert.equal(mixRhythmRefusal('Traceback...\nValueError: mix_rhythm: weight must be a number'), 'mix_rhythm: weight must be a number');
});

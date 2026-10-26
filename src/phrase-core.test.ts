// score_first M5 (drain 2026-10-22-1850) — the phrase core: a phrase is a data note holding only parameters (never bars). Parse, validate, defaults, refuse, clamp, the next free name, the
// "New phrase from this bar" decision and the Score of a phrase (source bar read, engine injected). Pure: no Obsidian, no engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PHRASE_DEFAULTS, PHRASE_FOLDER, PHRASE_STYLES, applyPhraseWrite, clampPhraseBars, clampPhrasePct, createNewPhrase, formatPhraseJson, isPhrasePath, newPhraseAvailable,
  nextPhraseName, phraseNoteContent, phrasePath, phraseSourcePath, planNewPhrase, producePhrase, producePhraseNote, readPhraseNote, sourceBarName, validatePhrase,
} from './phrase-core.ts';

const note = (json: string, fm = 'type: data\ncontent_type: json') => `---\n${fm}\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`;
const FULL = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
const BAR_NOTE = `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${JSON.stringify({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: Array(16).fill(false) },
})}\n\`\`\`\n`;

test('a full phrase validates and comes back as is', () => {
  const v = validatePhrase(FULL);
  assert.deepEqual(v, { ok: true, value: FULL });
});

test('defaults: only kind and source are required; bars 4, style repeat_with_fills, tempo_change_pct 0 fill in', () => {
  const v = validatePhrase({ kind: 'extend', source: 'bar_001' });
  assert.deepEqual(v, { ok: true, value: { kind: 'extend', source: 'bar_001', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } });
  assert.deepEqual(PHRASE_DEFAULTS, { bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
});

test('refused, each naming the field: not an object, wrong kind, missing/odd source, bad bars, bad style, bad percentage, unknown field', () => {
  const cases: Array<[unknown, RegExp]> = [
    [null, /must be an object/],
    [[], /must be an object/],
    [{ source: 'bar_001' }, /kind/],
    [{ kind: 'loop', source: 'bar_001' }, /kind.*"extend"/],   // M7: 'mix' is a kind now (phrase-mix-core.test.ts); any other is still refused
    [{ kind: 'extend' }, /source/],
    [{ kind: 'extend', source: '' }, /source/],
    [{ kind: 'extend', source: 'bars/bar_001' }, /source/],
    [{ kind: 'extend', source: '../bar_001' }, /source/],
    [{ kind: 'extend', source: 'bar_001.md' }, /source/],
    [{ kind: 'extend', source: 7 }, /source/],
    [{ kind: 'extend', source: 'bar_001', bars: 0 }, /bars/],
    [{ kind: 'extend', source: 'bar_001', bars: 65 }, /bars/],
    [{ kind: 'extend', source: 'bar_001', bars: 2.5 }, /bars/],
    [{ kind: 'extend', source: 'bar_001', bars: '8' }, /bars/],
    [{ kind: 'extend', source: 'bar_001', style: 'stretch' }, /style/],
    [{ kind: 'extend', source: 'bar_001', tempo_change_pct: -91 }, /tempo_change_pct/],
    [{ kind: 'extend', source: 'bar_001', tempo_change_pct: 101 }, /tempo_change_pct/],
    [{ kind: 'extend', source: 'bar_001', tempo_change_pct: NaN }, /tempo_change_pct/],
    [{ kind: 'extend', source: 'bar_001', tempo_change_pct: '5' }, /tempo_change_pct/],
    [{ kind: 'extend', source: 'bar_001', tempo_change_pct: true }, /tempo_change_pct/],
    [{ kind: 'extend', source: 'bar_001', swing: 3 }, /swing/],
  ];
  for (const [raw, re] of cases) {
    const v = validatePhrase(raw);
    assert.equal(v.ok, false, JSON.stringify(raw));
    if (v.ok === false) assert.match(v.message, re, JSON.stringify(raw));
  }
});

test('the range edges are accepted: bars 1 and 64, -90 and +100', () => {
  for (const bars of [1, 64]) assert.equal(validatePhrase({ ...FULL, bars }).ok, true, `bars ${bars}`);
  for (const pct of [-90, 100, 0, 12.5]) assert.equal(validatePhrase({ ...FULL, tempo_change_pct: pct }).ok, true, `pct ${pct}`);
  assert.deepEqual([...PHRASE_STYLES], ['repeat_with_fills', 'building', 'ghost_notes']);
  for (const style of PHRASE_STYLES) assert.equal(validatePhrase({ ...FULL, style }).ok, true, style);
});

test('clamps (the control strip): bars to a whole number in 1..64, the percentage to -90..100; junk falls back to the default', () => {
  assert.equal(clampPhraseBars(0), 1);
  assert.equal(clampPhraseBars(-3), 1);
  assert.equal(clampPhraseBars(65), 64);
  assert.equal(clampPhraseBars(8.6), 9);
  assert.equal(clampPhraseBars(Number.NaN), PHRASE_DEFAULTS.bars);
  assert.equal(clampPhraseBars(Infinity), 64);
  assert.equal(clampPhrasePct(-500), -90);
  assert.equal(clampPhrasePct(500), 100);
  assert.equal(clampPhrasePct(-20), -20);
  assert.equal(clampPhrasePct(Number.NaN), 0);
});

test('readPhraseNote: a data/json note with one json block; refuses anything else with the reason', () => {
  assert.deepEqual(readPhraseNote(note(JSON.stringify(FULL))), { ok: true, value: FULL });
  const bad = (text: string, re: RegExp) => { const v = readPhraseNote(text); assert.equal(v.ok, false); if (v.ok === false) assert.match(v.message, re); };
  bad('no frontmatter', /frontmatter/);
  bad(note(JSON.stringify(FULL), 'type: action'), /not a data note/);
  bad(note(JSON.stringify(FULL), 'type: data\ncontent_type: yaml'), /content_type/);
  bad(note('{ not json'), /not valid JSON/);
  bad(note(JSON.stringify({ ...FULL, bars: 99 })), /bars/);
  bad(note(JSON.stringify(FULL)) + 'trailing prose\n', /after the json block/);
});

test('formatPhraseJson is the order and shape the prompt gives, and round-trips through validate', () => {
  assert.equal(formatPhraseJson(FULL), '{\n  "kind": "extend",\n  "source": "bar_005",\n  "bars": 8,\n  "style": "repeat_with_fills",\n  "tempo_change_pct": -20\n}');
  assert.deepEqual(validatePhrase(JSON.parse(formatPhraseJson(FULL))), { ok: true, value: FULL });
});

test('applyPhraseWrite changes only the json block: frontmatter, prose-free body and line endings are kept', () => {
  const text = note(JSON.stringify({ ...FULL, bars: 4 }), 'type: data\ncontent_type: json\ndescription: "mine"');
  const w = applyPhraseWrite(text, FULL);
  assert.equal(w.ok, true);
  if (w.ok) {
    assert.ok(w.text.startsWith('---\ntype: data\ncontent_type: json\ndescription: "mine"\n---\n\n```json\n'));
    assert.deepEqual(readPhraseNote(w.text), { ok: true, value: FULL });
    assert.equal(w.text.endsWith('\n```\n'), true);
  }
  const crlf = applyPhraseWrite(text.replace(/\n/g, '\r\n'), FULL);
  assert.equal(crlf.ok, true);
  if (crlf.ok) assert.equal(/[^\r]\n/.test(crlf.text), false, 'every line ending stayed CRLF');
  const notData = applyPhraseWrite('plain note', FULL);
  assert.equal(notData.ok, false);
  const readOnly = applyPhraseWrite(note(JSON.stringify(FULL), 'type: data\ncontent_type: json\nread_only: true'), FULL);
  assert.equal(readOnly.ok, false, 'read_only is honoured (constitution D7)');
  if (readOnly.ok === false) assert.match(readOnly.message, /read_only/);
});

test('paths and names: phrases/phrase_NNN.md, the next free one is past the highest, junk names are ignored', () => {
  assert.equal(PHRASE_FOLDER, 'phrases');
  assert.equal(phrasePath('phrase_001'), 'phrases/phrase_001.md');
  assert.equal(nextPhraseName([]), 'phrase_001');
  assert.equal(nextPhraseName(['phrase_001', 'phrase_002']), 'phrase_003');
  assert.equal(nextPhraseName(['phrase_001', 'phrase_004', 'notes', 'phrase_x', 'bar_009']), 'phrase_005', 'one past the highest, not the first gap');
  assert.equal(nextPhraseName(['phrase_004', 'phrase_001', 'phrase_002']), 'phrase_005', 'the order of the listing does not matter');
  assert.equal(nextPhraseName(['phrase_999']), 'phrase_1000');
  assert.equal(phraseSourcePath('bar_005'), 'bars/bar_005.md');
  assert.equal(isPhrasePath('phrases/phrase_001.md'), true);
  assert.equal(isPhrasePath('phrases/README.md'), false, 'the folder README is not a phrase');
  assert.equal(isPhrasePath('phrases/deep/phrase_001.md'), false);
  assert.equal(isPhrasePath('bars/bar_001.md'), false);
  assert.equal(isPhrasePath(null), false);
});

test('sourceBarName: a bar is a note directly in bars/ named bar_NNN; nothing else is', () => {
  assert.equal(sourceBarName('bars/bar_005.md'), 'bar_005');
  assert.equal(sourceBarName('bars/bar_1000.md'), 'bar_1000');
  for (const p of ['bars/other.md', 'old/bars/bar_005.md', 'bars/sub/bar_005.md', 'phrases/bar_005.md', 'bar_005.md', 'bars/bar_005.txt', '', null, undefined]) assert.equal(sourceBarName(p as string | null | undefined), null, String(p));
});

test('"New phrase from this bar" is offered only in a score-first vault, and only when the active file is a bar', () => {
  assert.equal(newPhraseAvailable({ scoreFirst: true, activePath: 'bars/bar_005.md' }), true);
  assert.equal(newPhraseAvailable({ scoreFirst: false, activePath: 'bars/bar_005.md' }), false, 'P3: every other vault');
  assert.equal(newPhraseAvailable({ scoreFirst: true, activePath: 'phrases/phrase_001.md' }), false);
  assert.equal(newPhraseAvailable({ scoreFirst: true, activePath: null }), false);
  assert.equal(newPhraseAvailable({ scoreFirst: true, activePath: 'percussion_lab/peak.md' }), false);
});

test('phraseNoteContent: a data/json note whose block is the defaults + the source, valid to read back; the description is a safe YAML scalar', () => {
  const text = phraseNoteContent('phrase_001', 'bar_005');
  assert.deepEqual(readPhraseNote(text), { ok: true, value: { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } });
  assert.match(text, /^---\ntype: data\ncontent_type: json\ndescription: ".*"\nlinks:\n  - "\[\[bar_005\]\]"\n---\n\n<!-- derived from the json below[^\n]*-->\n\n## Description\n[\s\S]*\n## Recipe\n[\s\S]*\n```json\n/);   // 2026-10-26-1260: derived sections above the fence
  assert.ok(text.endsWith('```\n'));
});

test('planNewPhrase: next free path + content naming the source; refuses when the active file is not a bar; retries past a name taken in the same instant', () => {
  const ok = planNewPhrase({ activePath: 'bars/bar_005.md', existingBasenames: ['phrase_001'], exists: () => false });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.path, 'phrases/phrase_002.md');
    assert.deepEqual(readPhraseNote(ok.content), { ok: true, value: { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 } });
  }
  const notBar = planNewPhrase({ activePath: 'x.md', existingBasenames: [], exists: () => false });
  assert.equal(notBar.ok, false);
  const taken = new Set(['phrases/phrase_001.md']);
  const raced = planNewPhrase({ activePath: 'bars/bar_005.md', existingBasenames: [], exists: (p) => taken.has(p) });
  assert.equal(raced.ok && raced.path, 'phrases/phrase_002.md', 'a taken name moves to the next number');
  const exhausted = planNewPhrase({ activePath: 'bars/bar_005.md', existingBasenames: [], exists: () => true });
  assert.equal(exhausted.ok, false);
});

function ports(over: Record<string, unknown> = {}) {
  const log: string[] = [];
  const p = {
    activePath: () => 'bars/bar_005.md',
    folderExists: () => false,
    createFolder: async () => { log.push('createFolder'); },
    listPhraseBasenames: () => [] as string[],
    exists: () => false,
    create: async (path: string, content: string) => { log.push(`create ${path}`); return { path, content }; },
    open: async (f: { path: string }) => { log.push(`open ${f.path}`); },
    notify: (m: string) => { log.push(`notify ${m}`); },
    isAlreadyExists: (e: unknown) => /already exists/i.test(String((e as Error)?.message ?? e)),
    ...over,
  };
  return { p, log };
}

test('createNewPhrase: makes phrases/ when missing, creates the next phrase, opens it', async () => {
  const { p, log } = ports();
  const r = await createNewPhrase(p);
  assert.deepEqual(r, { ok: true, path: 'phrases/phrase_001.md' });
  assert.deepEqual(log, ['createFolder', 'create phrases/phrase_001.md', 'open phrases/phrase_001.md']);
});

test('createNewPhrase: an active file that is not a bar says so (a notice, nothing created); a name taken in the same instant tries the next; every failure is a notice', async () => {
  const a = ports({ activePath: () => 'x.md' });
  const ra = await createNewPhrase(a.p);
  assert.equal(ra.ok, false);
  assert.equal(a.log.filter((l) => l.startsWith('create ')).length, 0);
  assert.equal(a.log.includes('createFolder'), false, 'the vault is not touched when the active note is not a bar');
  assert.match(a.log.join('\n'), /notify .*bar/i);

  let n = 0;
  const b = ports({ folderExists: () => true, create: async (path: string) => { if (n++ === 0) throw new Error('File already exists.'); b.log.push(`create ${path}`); return { path }; } });
  const rb = await createNewPhrase(b.p);
  assert.equal(rb.ok, true);

  const c = ports({ folderExists: () => true, create: async () => { throw new Error('disk full'); } });
  const origErr = console.error; console.error = () => {};
  try {
    const rc = await createNewPhrase(c.p);
    assert.equal(rc.ok, false);
    assert.match(c.log.join('\n'), /notify Could not make a new phrase: disk full/);
  } finally { console.error = origErr; }
});

const computeOk = async (_d: unknown, _p: unknown, _t: string) => ({ type: 'musicxml', content: '<score-partwise/>' });

test('producePhrase: reads the source bar, hands the bar data + the phrase parameters to the engine, returns its payload', async () => {
  const seen: unknown[] = [];
  const out = await producePhrase({
    readNote: async (p) => { seen.push(p); return BAR_NOTE; },
    compute: async (d, p, t) => { seen.push(d, p, t); return computeOk(d, p, t); },
  }, FULL, 'phrase_001');
  assert.equal(out.kind, 'score');
  assert.equal(seen[0], 'bars/bar_005.md', 'the source is read from bars/<source>.md');
  assert.equal((seen[1] as { tempo_bpm: number }).tempo_bpm, 100);
  assert.deepEqual(seen[2], FULL);
  assert.equal(seen[3], 'phrase_001');
});

test('producePhrase refusals say what is wrong and never reach the engine: invalid phrase, missing source, source that is not rhythm data', async () => {
  let calls = 0;
  const compute = async () => { calls++; return computeOk(0, 0, ''); };
  const invalid = await producePhrase({ readNote: async () => BAR_NOTE, compute }, { ...FULL, bars: 99 }, 'p');
  assert.equal(invalid.kind, 'refusal');
  if (invalid.kind === 'refusal') assert.match(invalid.message, /^Phrase: .*bars/);
  const missing = await producePhrase({ readNote: async () => { throw new Error('File not found'); }, compute }, FULL, 'p');
  assert.equal(missing.kind, 'refusal');
  if (missing.kind === 'refusal') assert.match(missing.message, /bar_005.*(not found|could not be read)/);
  const junk = await producePhrase({ readNote: async () => note('{"a":1}'), compute }, FULL, 'p');
  assert.equal(junk.kind, 'refusal');
  if (junk.kind === 'refusal') assert.match(junk.message, /^Phrase: the source bar_005/);
  assert.equal(calls, 0);
});

test('producePhrase: an engine error and an empty payload are errors (a line, not a thrown exception)', async () => {
  const thrown = await producePhrase({ readNote: async () => BAR_NOTE, compute: async () => { throw new Error('extend_rhythm: steps must be 16'); } }, FULL, 'p');
  assert.equal(thrown.kind, 'error');
  if (thrown.kind === 'error') assert.match(thrown.message, /steps must be 16/);
  const empty = await producePhrase({ readNote: async () => BAR_NOTE, compute: async () => ({}) }, FULL, 'p');
  assert.equal(empty.kind, 'error');
});

test('producePhraseNote: the phrase note\'s TEXT in (what the view hands the live Score) -> the same outcomes; an unreadable or invalid phrase is a refusal line, and the source is not read', async () => {
  let reads = 0;
  const deps = { readNote: async () => { reads++; return BAR_NOTE; }, compute: computeOk };
  const ok = await producePhraseNote(deps, note(JSON.stringify(FULL)), 'phrase_001');
  assert.equal(ok.kind, 'score');
  assert.equal(reads, 1);
  const invalid = await producePhraseNote(deps, note(JSON.stringify({ ...FULL, bars: 0 })), 'phrase_001');
  assert.equal(invalid.kind, 'refusal');
  if (invalid.kind === 'refusal') assert.match(invalid.message, /^Phrase: .*bars/);
  const notJson = await producePhraseNote(deps, note('{ nope'), 'phrase_001');
  assert.equal(notJson.kind, 'refusal');
  if (notJson.kind === 'refusal') assert.match(notJson.message, /^Phrase: .*not valid JSON/);
  const unreadable = await producePhraseNote(deps, { unreadable: 'File not found' }, 'phrase_001');
  assert.equal(unreadable.kind, 'refusal');
  if (unreadable.kind === 'refusal') assert.match(unreadable.message, /^Phrase: the phrase note could not be read \(File not found\)/);
  assert.equal(reads, 1, 'no source read for a phrase that is not valid');
});

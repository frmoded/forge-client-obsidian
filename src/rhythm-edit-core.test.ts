// Beat-as-data Phase 5 (drain 2026-10-05-2100): edit a rhythm data note through the Rhythm Box widget.
// Pure-core tests: the widget<->plugin message protocol, validation (mirrors the engine's rhythm_data_to_stream schema),
// the pretty-printer (reproduces the existing notes' json blocks byte for byte), and the write path that replaces ONLY the
// json block of the note.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  RHYTHM_CHANNELS,
  applySave,
  buildLoadMessage,
  buildSaveResultMessage,
  contentFingerprint,
  extractJsonBlock,
  formatRhythmJson,
  isRhythmEditCandidate,
  parseWidgetMessage,
  readRhythmNote,
  validateRhythmData,
  type RhythmData,
} from './rhythm-edit-core.ts';

const ROOT = process.cwd();

/** A rhythm-data note from the music-theory vault: the SOURCE checkout if present, else the bundled copy. */
function vaultNote(name: string): string {
  for (const base of ['../music-theory/rhythm_data', 'assets/vaults/music-theory/rhythm_data']) {
    const file = path.resolve(ROOT, base, `${name}.md`);
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8');
  }
  throw new Error(`rhythm_data/${name}.md not found in the source vault or the bundled copy`);
}

const rock = (): RhythmData => ({
  time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100,
  channels: {
    kick: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false],
    snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
    hihat: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  },
});

const noteText = (json: string, fm = 'type: data\ncontent_type: json\ndescription: "A beat"') =>
  `---\n${fm}\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`;

// ---- protocol -----------------------------------------------------------------------------------------------

test('protocol: the widget\'s ready and save messages are recognised, extra fields are ignored', () => {
  assert.deepEqual(parseWidgetMessage({ type: 'forge-rhythm-ready' }), { kind: 'ready' });
  assert.deepEqual(parseWidgetMessage({ type: 'forge-rhythm-ready', extra: 1 }), { kind: 'ready' });
  const m = parseWidgetMessage({ type: 'forge-rhythm-save', data: rock(), junk: 'x' });
  assert.equal(m.kind, 'save');
  if (m.kind === 'save') assert.deepEqual(m.data, rock());
});

test('protocol: unknown types and non-objects are ignored; a save with no usable data is malformed (never written)', () => {
  for (const raw of [null, undefined, 'forge-rhythm-save', 42, [], { type: 'something-else' }, { type: 5 }, {}]) {
    assert.equal(parseWidgetMessage(raw).kind, 'ignored', JSON.stringify(raw));
  }
  for (const raw of [{ type: 'forge-rhythm-save' }, { type: 'forge-rhythm-save', data: null }, { type: 'forge-rhythm-save', data: 'x' }, { type: 'forge-rhythm-save', data: [1] }]) {
    assert.equal(parseWidgetMessage(raw).kind, 'malformed', JSON.stringify(raw));
  }
});

test('protocol: the plugin-side messages carry exactly the documented shape', () => {
  assert.deepEqual(buildLoadMessage(rock(), 'straight rock'), { type: 'forge-rhythm-load', data: rock(), noteName: 'straight rock' });
  assert.deepEqual(buildSaveResultMessage(true, 'ok'), { type: 'forge-rhythm-save-result', ok: true, message: 'ok' });
  assert.deepEqual(buildSaveResultMessage(false, 'stale'), { type: 'forge-rhythm-save-result', ok: false, message: 'stale' });
});

// ---- validation (mirrors forge/music/lib.py rhythm_data_to_stream) ----------------------------------------------

test('validate: a well-formed pattern passes, including int velocities and 0 as a rest', () => {
  const d = rock();
  d.channels.hihat[0] = 112;
  d.channels.snare[1] = 0;
  const r = validateRhythmData(d);
  assert.equal(r.ok, true);
});

for (const [label, mutate, why] of [
  ['missing channels', (d: any) => { delete d.channels; }, /channels/],
  ['missing time_signature', (d: any) => { delete d.time_signature; }, /time_signature/],
  ['missing tempo_bpm', (d: any) => { delete d.tempo_bpm; }, /tempo_bpm/],
  ['steps zero', (d: any) => { d.steps = 0; }, /steps/],
  ['steps a bool', (d: any) => { d.steps = true; }, /steps/],
  ['steps a float', (d: any) => { d.steps = 16.5; }, /steps/],
  ['more than 64 steps', (d: any) => { d.steps = 65; d.group_size = 5; for (const c of Object.keys(d.channels)) d.channels[c] = new Array(65).fill(false); }, /64/],
  ['group_size not dividing steps', (d: any) => { d.group_size = 5; }, /group_size/],
  ['swing out of range', (d: any) => { d.swing_pct = 101; }, /swing_pct/],
  ['unknown channel', (d: any) => { d.channels.cowbell = new Array(16).fill(false); }, /cowbell/],
  ['empty channels', (d: any) => { d.channels = {}; }, /channels/],
  ['channel too short', (d: any) => { d.channels.kick = d.channels.kick.slice(0, 15); }, /kick.*16/],
  ['step is a string', (d: any) => { d.channels.snare[3] = 'x'; }, /snare.*step 3/],
  ['step is a float', (d: any) => { d.channels.snare[3] = 90.5; }, /snare.*step 3/],
  ['step is negative', (d: any) => { d.channels.snare[3] = -1; }, /snare.*step 3/],
  ['step above 127', (d: any) => { d.channels.snare[3] = 128; }, /snare.*step 3/],
  ['step is null', (d: any) => { d.channels.snare[3] = null; }, /snare.*step 3/],
  ['an extra top-level field (the save would drop it)', (d: any) => { d.description = 'hi'; }, /description/],
] as Array<[string, (d: any) => void, RegExp]>) {
  test(`validate: rejects ${label}`, () => {
    const d: any = rock();
    mutate(d);
    const r = validateRhythmData(d);
    assert.equal(r.ok, false);
    if (r.ok === false) assert.match(r.message, why);
  });
}

test('validate: non-objects are rejected', () => {
  for (const raw of [null, 'x', 5, [], undefined]) assert.equal(validateRhythmData(raw).ok, false);
});

test('validate: velocity bounds 1 and 127 are accepted, swing_pct may be omitted (the engine defaults it to 0)', () => {
  const d: any = rock();
  d.channels.kick[1] = 1; d.channels.kick[2] = 127; delete d.swing_pct;
  assert.equal(validateRhythmData(d).ok, true);
});

// ---- the pretty-printer ------------------------------------------------------------------------------------

test('format: shape is 2-space indent, fixed key order, each channel array on ONE line', () => {
  assert.equal(
    formatRhythmJson({ time_signature: '3/4', steps: 12, group_size: 4, swing_pct: 25, tempo_bpm: 90,
      channels: { kick: [true, 112, ...new Array(10).fill(false)] } }),
    '{\n  "time_signature": "3/4",\n  "steps": 12,\n  "group_size": 4,\n  "swing_pct": 25,\n  "tempo_bpm": 90,\n  "channels": {\n'
    + '    "kick": [true, 112, false, false, false, false, false, false, false, false, false, false]\n  }\n}',
  );
});

test('format: key order does not depend on the input object\'s key order', () => {
  const shuffled: any = { channels: rock().channels, tempo_bpm: 100, swing_pct: 0, group_size: 4, steps: 16, time_signature: '4/4' };
  assert.equal(formatRhythmJson(shuffled), formatRhythmJson(rock()));
});

for (const name of ['rhythm_pattern_straight_rock', 'rhythm_pattern_syncopated']) {
  test(`format GOLDEN: re-serialising ${name} reproduces its json block byte for byte`, () => {
    const text = vaultNote(name);
    const block = extractJsonBlock(text);
    assert.equal(block.ok, true);
    if (block.ok === false) return;
    const original = text.slice(block.contentStart, block.contentEnd);
    const parsed = validateRhythmData(JSON.parse(original));
    assert.equal(parsed.ok, true);
    if (parsed.ok === false) return;
    assert.equal(formatRhythmJson(parsed.value), original);
  });
}

// ---- reading a note ----------------------------------------------------------------------------------------

test('read: the two shipped rhythm data notes are readable', () => {
  for (const name of ['rhythm_pattern_straight_rock', 'rhythm_pattern_syncopated']) {
    const r = readRhythmNote(vaultNote(name));
    assert.equal(r.ok, true, name);
  }
});

for (const [label, text, why] of [
  ['an action note', '---\ntype: action\n---\n\n# Recipe\n\nReturn 1.\n', /type|data/],
  ['content_type not json', noteText('{}', 'type: data\ncontent_type: yaml'), /json/],
  ['read_only: true (constitution D7)', noteText(JSON.stringify(rock()), 'type: data\ncontent_type: json\nread_only: true'), /read_only/],
  ['no frontmatter', '```json\n{}\n```\n', /frontmatter/],
  ['json that is not rhythm data', noteText('{"hello": "world"}'), /rhythm|time_signature/],
  ['json that does not parse', noteText('{ not json'), /JSON/],
  ['rhythm data with an extra field the save would drop', noteText(JSON.stringify({ ...rock(), description: 'x' })), /description/],
] as Array<[string, string, RegExp]>) {
  test(`read: refuses ${label}`, () => {
    const r = readRhythmNote(text);
    assert.equal(r.ok, false);
    if (r.ok === false) assert.match(r.message, why);
  });
}

for (const [label, text] of [
  ['two json blocks', `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n{}\n\`\`\`\n\n\`\`\`json\n{}\n\`\`\`\n`],
  ['prose before the block', `---\ntype: data\ncontent_type: json\n---\n\nSome notes.\n\n\`\`\`json\n{}\n\`\`\`\n`],
  ['prose after the block', `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n{}\n\`\`\`\n\nMore notes.\n`],
  ['a different fence language', `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`yaml\na: 1\n\`\`\`\n`],
  ['no block at all', `---\ntype: data\ncontent_type: json\n---\n\n{}\n`],
  ['an unclosed block', `---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n{}\n`],
]) {
  test(`extract: refuses to guess where to write when the body has ${label}`, () => {
    assert.equal(extractJsonBlock(text).ok, false);
  });
}

// ---- the write ---------------------------------------------------------------------------------------------

test('write: replaces ONLY the json block; the frontmatter and every other byte are identical', () => {
  const original = vaultNote('rhythm_pattern_straight_rock');
  const changed = rock();
  changed.channels.kick[4] = true;
  const r = applySave(original, contentFingerprint(original), changed);
  assert.equal(r.ok, true);
  if (r.ok === false) return;
  const a = extractJsonBlock(original);
  const b = extractJsonBlock(r.text);
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) {
    assert.equal(r.text.slice(0, b.contentStart), original.slice(0, a.contentStart), 'everything before the block (frontmatter, fence) is byte-identical');
    assert.equal(r.text.slice(b.contentEnd), original.slice(a.contentEnd), 'everything after the block is byte-identical');
    assert.notEqual(r.text, original);
  }
});

test('write: an unchanged save reproduces the shipped notes byte for byte (no diff at all)', () => {
  for (const name of ['rhythm_pattern_straight_rock', 'rhythm_pattern_syncopated']) {
    const original = vaultNote(name);
    const read = readRhythmNote(original);
    assert.ok(read.ok);
    if (read.ok === false) return;
    const r = applySave(original, contentFingerprint(original), read.value.data);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.text, original, name);
  }
});

test('write: int velocities survive an unchanged save', () => {
  const d = rock();
  d.channels.hihat[0] = 112; d.channels.hihat[2] = 72; d.channels.kick[0] = 100;
  const text = noteText(formatRhythmJson(d));
  const read = readRhythmNote(text);
  assert.ok(read.ok);
  if (read.ok === false) return;
  const r = applySave(text, contentFingerprint(text), read.value.data);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.text, text);
});

test('write: a CRLF note keeps its line endings — only the block changes, and the new block is CRLF too', () => {
  const crlf = noteText(formatRhythmJson(rock())).replace(/\n/g, '\r\n');
  const changed = rock();
  changed.channels.snare[0] = true;
  const r = applySave(crlf, contentFingerprint(crlf), changed);
  assert.ok(r.ok);
  if (r.ok === false) return;
  assert.ok(!/(^|[^\r])\n/.test(r.text), 'no bare LF anywhere in the result');
  const a = extractJsonBlock(crlf), b = extractJsonBlock(r.text);
  assert.ok(a.ok && b.ok);
  if (a.ok && b.ok) assert.equal(r.text.slice(b.contentEnd), crlf.slice(a.contentEnd));
});

test('write: trailing whitespace after the closing fence is preserved', () => {
  const text = noteText(formatRhythmJson(rock())) + '\n\n   \n';
  const changed = rock();
  changed.channels.kick[1] = true;
  const r = applySave(text, contentFingerprint(text), changed);
  assert.ok(r.ok);
  if (r.ok) assert.ok(r.text.endsWith('```\n\n\n   \n'));
});

test('write: refused when the note changed on disk since it was opened (stale), and nothing is produced', () => {
  const original = noteText(formatRhythmJson(rock()));
  const fingerprintAtLoad = contentFingerprint(original);
  const edited = original.replace('"A beat"', '"A beat, edited elsewhere"');
  const r = applySave(edited, fingerprintAtLoad, rock());
  assert.equal(r.ok, false);
  if (r.ok === false) { assert.equal(r.kind, 'stale'); assert.match(r.message, /changed on disk/); }
});

test('write: refused (and the note untouched) when the payload is not valid rhythm data — validation runs BEFORE any write', () => {
  const original = noteText(formatRhythmJson(rock()));
  for (const bad of [{ ...rock(), steps: 15 }, { ...rock(), channels: { cowbell: [] } }, null, 'x', { ...rock(), tempo_bpm: undefined }]) {
    const r = applySave(original, contentFingerprint(original), bad as any);
    assert.equal(r.ok, false);
    if (r.ok === false) assert.equal(r.kind, 'invalid');
  }
});

test('write: refused for a read_only note, a non-rhythm note, and a body that is not exactly one json block', () => {
  const ro = noteText(formatRhythmJson(rock()), 'type: data\ncontent_type: json\nread_only: true');
  assert.equal(applySave(ro, contentFingerprint(ro), rock()).ok, false);
  const action = '---\ntype: action\n---\n\n```json\n{}\n```\n';
  assert.equal(applySave(action, contentFingerprint(action), rock()).ok, false);
  const prose = noteText(formatRhythmJson(rock())) + '\nSome prose.\n';
  const r = applySave(prose, contentFingerprint(prose), rock());
  assert.equal(r.ok, false);
});

test('fingerprint: equal text -> equal, any change -> different', () => {
  assert.equal(contentFingerprint('abc'), contentFingerprint('abc'));
  assert.notEqual(contentFingerprint('abc'), contentFingerprint('abd'));
  assert.notEqual(contentFingerprint('abc'), contentFingerprint('abc '));
  assert.notEqual(contentFingerprint(''), contentFingerprint('\n'));
});

// ---- command availability ----------------------------------------------------------------------------------

test('availability: only a data note whose content_type is json is a candidate', () => {
  assert.equal(isRhythmEditCandidate({ type: 'data', content_type: 'json' }), true);
  assert.equal(isRhythmEditCandidate({ type: 'data', content_type: 'json', description: 'x' }), true);
  for (const fm of [undefined, null, {}, { type: 'action' }, { type: 'data' }, { type: 'data', content_type: 'yaml' },
                    { type: 'data', content_type: 'text' }, { type: 'action', content_type: 'json' }, { content_type: 'json' }]) {
    assert.equal(isRhythmEditCandidate(fm as any), false, JSON.stringify(fm));
  }
});

test('the channel list matches the engine\'s converter channels', () => {
  assert.deepEqual([...RHYTHM_CHANNELS], ['kick', 'snare', 'hihat']);
});

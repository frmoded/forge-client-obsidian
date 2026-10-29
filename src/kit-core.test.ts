// 2026-10-29-0820 (M10 slice 1): a KIT note - Forge shape (Description / Recipe / Python) above one json fence. Pure; no Obsidian. Pins the MECHANISM of the derived text (the goldens) and the PROPERTIES (the json is the only parsed data, refresh is
// idempotent and leaves the fence and the person's own frontmatter alone, presets cannot drift from the engine's channel vocabulary); if the derived text's design moves the goldens SHOULD go red - reassess, don't just rewrite.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { RHYTHM_CHANNELS } from './rhythm-edit-core.ts';
import { DERIVED_NOTE } from './phrase-notes-core.ts';
import { KIT_NAME_RULE, KIT_PRESETS, channelWords, formatKitJson, freeKitName, inEngineOrder, isKitPath, kitCreatedLine, kitDescription, kitFromChoice, kitPath, kitPython, kitRecipeSteps, newKitNote, readKitNote, refreshKitNoteText, validateKit, type KitParams } from './kit-core.ts';

const ROCK: KitParams = { kind: 'kit', name: 'rock', channels: ['kick', 'snare', 'hihat'] };
const LATIN: KitParams = { kind: 'kit', name: 'latin', channels: ['bell', 'claves', 'conga_high', 'conga_low'] };
const parses = (src: string): boolean => spawnSync('python3', ['-I', '-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: src, encoding: 'utf8' }).status === 0;

test('the rock kit, golden: Description, Recipe (one step per channel, no links), Python (returns the kit), then the json fence LAST', () => {
  assert.equal(kitDescription(ROCK), 'A rock kit: kick, snare, hi-hat.');
  assert.deepEqual(kitRecipeSteps(ROCK), ['Add the kick.', 'Add the snare.', 'Add the hi-hat.']);
  assert.equal(kitPython(ROCK), ["def compute(context):", "  return {'name': 'rock', 'channels': ['kick', 'snare', 'hihat']}"].join('\n'));
  assert.equal(newKitNote(ROCK), [
    '---', 'type: data', 'content_type: json', 'description: "A rock kit: kick, snare, hi-hat."', '---', '',
    DERIVED_NOTE, '', '# Description', '', 'A rock kit: kick, snare, hi-hat.', '', '# Recipe', '', 'Add the kick.', 'Add the snare.', 'Add the hi-hat.', '',
    '# Python', '', '```python', 'def compute(context):', "  return {'name': 'rock', 'channels': ['kick', 'snare', 'hihat']}", '```', '',
    '```json', '{', '  "kind": "kit",', '  "name": "rock",', '  "channels": ["kick", "snare", "hihat"]', '}', '```', '',
  ].join('\n'));
});

test('the Recipe links to nothing: a channel is not a note, so no wikilink and no links: property', () => {
  const note = newKitNote(LATIN);
  assert.ok(!note.includes('[['), 'no wikilink anywhere');
  assert.ok(!/^links:/m.test(note));
  assert.deepEqual(kitRecipeSteps(LATIN), ['Add the bell.', 'Add the claves.', 'Add the high conga.', 'Add the low conga.']);
});

test('the presets are derived from the engine\'s vocabulary: every channel is one the engine draws, in the engine\'s order, each once; rock is kick, snare, hi-hat; latin is the percussion channels (the two congas, claves, bell)', () => {
  assert.deepEqual(KIT_PRESETS.map((p) => p.name), ['rock', 'latin']);
  for (const p of KIT_PRESETS) {
    assert.ok(p.channels.length > 0, p.name);
    assert.ok(p.channels.every((c) => (RHYTHM_CHANNELS as readonly string[]).includes(c)), `${p.name}: every channel is in the vocabulary`);
    assert.deepEqual(p.channels, RHYTHM_CHANNELS.filter((c) => p.channels.includes(c)), `${p.name}: engine order`);
    assert.equal(validateKit({ kind: 'kit', name: p.name, channels: p.channels }).ok, true, `${p.name}: a preset is a valid kit`);
  }
  assert.deepEqual(KIT_PRESETS[0].channels, ['kick', 'snare', 'hihat']);
  assert.deepEqual(KIT_PRESETS[1].channels, ['bell', 'claves', 'conga_high', 'conga_low']);
  assert.equal(new Set(KIT_PRESETS.flatMap((p) => p.channels)).size, KIT_PRESETS.flatMap((p) => p.channels).length, 'the two starter kits share no channel, so they can play together');
  assert.deepEqual(inEngineOrder(['conga_low', 'kick', 'zzz', 'kick']), ['kick', 'conga_low'], 'engine order, each once, an unknown name falls away');
});

test('the vocabulary is the ONE definition: a channel the engine gained would appear in a kit\'s words without a table entry', () => {
  assert.equal(channelWords('hihat'), 'hi-hat');
  assert.equal(channelWords('some_new_channel'), 'some new channel');
});

test('validation: a kit is exactly kind, name, channels; the name is a safe file name; channels are known, non-empty, each once; the order is the engine\'s whatever the order given', () => {
  assert.deepEqual(validateKit({ kind: 'kit', name: 'rock', channels: ['hihat', 'kick'] }), { ok: true, value: { kind: 'kit', name: 'rock', channels: ['kick', 'hihat'] } });
  const bad: Array<[unknown, RegExp]> = [
    [null, /object/], [[], /object/], [{ kind: 'phrase', name: 'x', channels: ['kick'] }, /kind must be "kit"/], [{ kind: 'kit', name: 'x', channels: ['kick'], extra: 1 }, /Unexpected field "extra"/],
    [{ kind: 'kit', name: '', channels: ['kick'] }, /not usable/], [{ kind: 'kit', name: 'a/b', channels: ['kick'] }, /not usable/], [{ kind: 'kit', name: '../x', channels: ['kick'] }, /not usable/], [{ kind: 'kit', name: 'x'.repeat(41), channels: ['kick'] }, /not usable/],
    [{ kind: 'kit', name: 'x' }, /at least one channel/], [{ kind: 'kit', name: 'x', channels: [] }, /at least one channel/], [{ kind: 'kit', name: 'x', channels: ['triangle'] }, /Unknown channel "triangle"/],
    [{ kind: 'kit', name: 'x', channels: ['kick', 'kick'] }, /listed twice/], [{ kind: 'kit', name: 'x', channels: [3] }, /Unknown channel 3/],
  ];
  for (const [raw, re] of bad) {
    const r = validateKit(raw);
    assert.equal(r.ok, false, JSON.stringify(raw));
    if (r.ok === false) assert.match(r.message, re, JSON.stringify(raw));
  }
  assert.equal(kitFromChoice('  rock  ', ['kick']).ok, true, 'a name is trimmed');
  assert.equal(kitFromChoice('', ['kick']).ok, false);
});

test('the round trip: kit -> note -> kit, byte for byte in the json; a note whose json is broken, missing or not a kit is refused in a sentence', () => {
  for (const p of [ROCK, LATIN]) {
    const text = newKitNote(p);
    const read = readKitNote(text);
    assert.ok(read.ok);
    if (read.ok) { assert.deepEqual(read.value, p); assert.equal(formatKitJson(read.value), formatKitJson(p)); }
  }
  assert.equal(readKitNote('no frontmatter').ok, false);
  assert.equal(readKitNote('---\ntype: data\n---\n\nno fence\n').ok, false);
  assert.equal(readKitNote('---\ntype: data\ncontent_type: json\n---\n\n```json\n{oops\n```\n').ok, false);
  assert.equal(readKitNote('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "phrase"}\n```\n').ok, false);
});

test('every Python block parses (ast.parse), for both presets and a kit with a name that is not an identifier; and the parse check can fail', () => {
  for (const p of [ROCK, LATIN, { ...ROCK, name: 'my-kit' }, { ...ROCK, name: "o'brien" }]) assert.equal(parses(kitPython(p)), true, p.name);
  assert.equal(parses('def compute(context)\n  return 1'), false, 'non-vacuity');
});

test('"Refresh note links" on a kit: a hand-edited derived text is regenerated, the json fence and the person\'s own frontmatter line survive byte for byte, a second run changes nothing', () => {
  const fresh = newKitNote(ROCK);
  const edited = fresh.replace('A rock kit: kick, snare, hi-hat.\n\n# Recipe', 'Somebody typed here.\n\n# Recipe').replace('type: data', 'type: data\nread_only: false');
  assert.notEqual(edited, fresh);
  const r = refreshKitNoteText(edited);
  assert.ok(r.ok && r.changed);
  if (!r.ok) return;
  assert.ok(!r.text.includes('Somebody typed here.'));
  assert.ok(r.text.includes('read_only: false'), 'the person\'s own line stays');
  assert.equal(r.text.slice(r.text.indexOf('```json')), fresh.slice(fresh.indexOf('```json')), 'the fence and everything after it: byte-identical');
  const again = refreshKitNoteText(r.text);
  assert.ok(again.ok && !again.changed && again.text === r.text);
  assert.equal(refreshKitNoteText(fresh).ok && (refreshKitNoteText(fresh) as { changed: boolean }).changed, false, 'a fresh note is already current: no write');
  assert.equal(refreshKitNoteText('---\ntype: data\ncontent_type: json\n---\n\n```json\n{"kind": "kit"}\n```\n').ok, false, 'an invalid kit is named, not rewritten');
});

test('paths and names: kits/<name>.md, README is not a kit, a taken name gets _2, _3; the evidence line says what was made', () => {
  assert.equal(kitPath('rock'), 'kits/rock.md');
  assert.equal(isKitPath('kits/rock.md'), true);
  assert.equal(isKitPath('kits/README.md'), false);
  assert.equal(isKitPath('kits/deep/rock.md'), false);
  assert.equal(isKitPath('phrases/rock.md'), false);
  assert.equal(freeKitName('rock', () => false), 'rock');
  const taken = new Set(['kits/rock.md', 'kits/rock_2.md']);
  assert.equal(freeKitName('rock', (p) => taken.has(p)), 'rock_3');
  assert.equal(kitCreatedLine(ROCK), '[forge-kit] created kits/rock.md channels=kick,snare,hihat');
});

test('reading a kit note: every way a note can fail to be a kit is one sentence the person can act on, from the reader and from "Refresh note links" alike; the name rule and the channel vocabulary are in the words', () => {
  const head = '---\ntype: data\ncontent_type: json\n---\n\n';
  const NO_JSON = 'The note body must end with one fenced ```json block (no json block found).';
  const cases: Array<[string, string, string | RegExp]> = [
    ['no frontmatter', 'no frontmatter', 'The note has no frontmatter, so it is not a data note.'],
    ['no json block', `${head}prose only\n`, NO_JSON],
    ['unclosed block', `${head}\`\`\`json\n{"kind": "kit",\n`, 'The json block is not closed.'],
    ['text after the block', `${head}\`\`\`json\n{}\n\`\`\`\nmore\n`, 'The note has text after the json block; it must contain exactly one fenced json block, last.'],
    ['not json', `${head}\`\`\`json\n{nope\n\`\`\`\n`, /^The json block is not valid JSON: /],
  ];
  for (const [label, text, want] of cases) {
    for (const r of [readKitNote(text), refreshKitNoteText(text)]) {
      assert.equal(r.ok, false, label);
      if (r.ok === false) typeof want === 'string' ? assert.equal(r.message, want, label) : assert.match(r.message, want, label);
    }
  }
  const noName = validateKit({ kind: 'kit', name: '', channels: ['kick'] });
  assert.ok(noName.ok === false && noName.message === `The kit name "" is not usable. ${KIT_NAME_RULE}`);
  assert.match(KIT_NAME_RULE, /^A kit name is 1 to 40 letters, digits, "_" or "-", starting with a letter or digit\.$/);
  const unknown = validateKit({ kind: 'kit', name: 'x', channels: ['triangle'] });
  assert.ok(unknown.ok === false && unknown.message === `Unknown channel "triangle" (the engine knows: ${RHYTHM_CHANNELS.join(', ')}).`);
  assert.ok(RHYTHM_CHANNELS.length > 1 && unknown.ok === false && unknown.message.includes(', '), 'the vocabulary is listed, comma separated');
});

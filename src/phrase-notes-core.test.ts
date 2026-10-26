// score_first M7b (a) / design 4.12 phase B (drain 2026-10-26-1260, DEMO profile) — phrase and bar notes read as NOTES: a Description with real [[wikilinks]], a Recipe, a `links:` list in the frontmatter that Obsidian indexes (so
// backlinks and the graph work), all derived deterministically from the json (no LLM; the json stays the only parsed data). Golden texts per kind, the round trip (derived parts regenerate, the fence is untouched, byte-identical
// when nothing changed), the control-strip write keeping the links in step, the bars (frontmatter only; the Beat Box save keeps it), the refresh being idempotent.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applyPhraseWrite, formatPhraseJson, mixNoteContent, morphNoteContent, phraseNoteContent, readPhraseKind, readPhraseNote, refreshPhraseNoteText, salvageOverrideRefusal, type PhraseParams } from './phrase-core.ts';
import { DERIVED_NOTE, barDescription, phraseDescription, phraseLinks, phraseRecipe, refreshBarNoteText } from './phrase-notes-core.ts';
import { forkNoteContent } from './phrase-fork-core.ts';
import { applySave, formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 };
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 17, order: 'musical', seed: 0 };
const VOTE: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.6, threshold: 0.65, ghost: true };
const PATH: PhraseParams = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.65, ghost: true, mode: 'path', order: 'musical', seed: 0 };

// ---- the derived parts, per kind (golden) -----------------------------------------------------------------------------------------------------------------------------------------------

test('Description (the sentence with wikilinks) and Recipe (the call with wikilinks), golden, for each kind', () => {
  assert.equal(phraseDescription('phrase_001', EXTEND), 'phrase_001 — [[bar_005]] extended to 8 bars: repeat with fills, slowing 20 %.');
  assert.equal(phraseRecipe(EXTEND), 'extend_rhythm([[bar_005]], bars=8, style="repeat_with_fills", tempo_change_pct=-20)');
  assert.equal(phraseDescription('phrase_004', MORPH), 'phrase_004 — a morph from [[bar_007]] to [[bar_008]] in 17 bars, musical order.');
  assert.equal(phraseRecipe(MORPH), 'morph_rhythm([[bar_007]], [[bar_008]], bars=17, order="musical", seed=0)');
  assert.equal(phraseDescription('phrase_002', VOTE), 'phrase_002 — a mix of [[bar_005]] and [[bar_006]] by vote: 60 % bar_005 / 40 % bar_006, threshold 0.65, ghost notes on.');
  assert.equal(phraseRecipe(VOTE), 'mix_rhythm([[bar_005]], [[bar_006]], weight=0.6, threshold=0.65, ghost=true)');
  assert.equal(phraseDescription('phrase_005', PATH), 'phrase_005 — a mix of [[bar_005]] and [[bar_006]] as a path of single-hit changes: weight 1 is all of bar_005, 0 is all of bar_006, musical order.');
  assert.equal(phraseRecipe(PATH), 'mix_rhythm([[bar_005]], [[bar_006]], weight=1, mode="path", order="musical", seed=0)');
  assert.equal(phraseRecipe({ ...EXTEND, tempo_change_pct: 0, style: 'ghost_notes', bars: 1 }), 'extend_rhythm([[bar_005]], bars=1, style="ghost_notes", tempo_change_pct=0)');
  assert.equal(phraseRecipe({ ...MORPH, bars: 1, position: 3, order: 'seeded', seed: 7 } as PhraseParams), 'morph_rhythm([[bar_007]], [[bar_008]], bars=1, order="seeded", seed=7, position=3)');
});

test('forks: the links list gets the fork notes, the description says which bar is edited by hand, and a "Bars made" section lists them (only when there are overrides)', () => {
  const forked: PhraseParams = { ...MORPH, overrides: { '3': 'bars/bar_009', '10': 'bars/bar_010' } } as PhraseParams;
  assert.deepEqual(phraseLinks(forked), ['bar_007', 'bar_008', 'bar_009', 'bar_010']);
  assert.equal(phraseDescription('phrase_004', forked), 'phrase_004 — a morph from [[bar_007]] to [[bar_008]] in 17 bars, musical order. Edited by hand: bar 3 is [[bar_009]], bar 10 is [[bar_010]].');
  assert.deepEqual(phraseLinks(EXTEND), ['bar_005']);
  assert.deepEqual(phraseLinks({ ...VOTE, b: 'bar_005' }), ['bar_005'], 'a bar named twice is linked once');
  const text = morphNoteContent('phrase_004', 'bar_007', 'bar_008');
  const written = applyPhraseWrite(text, forked, 'phrase_004');
  assert.ok(written.ok && written.text.includes('## Bars made\n\n- bar 3: [[bar_009]]\n- bar 10: [[bar_010]]\n'));
  assert.ok(!morphNoteContent('phrase_004', 'bar_007', 'bar_008').includes('## Bars made'));
});

// ---- the new notes ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('a new phrase / mix / morph note: frontmatter with description and links, the derived sections, then the json fence last; the note still reads back to the same params', () => {
  const morph = morphNoteContent('phrase_004', 'bar_007', 'bar_008', { bars: 17 });
  assert.equal(morph, [
    '---', 'type: data', 'content_type: json',
    'description: "phrase_004 — a morph from [[bar_007]] to [[bar_008]] in 17 bars, musical order."',
    'links:', '  - "[[bar_007]]"', '  - "[[bar_008]]"',
    '---', '',
    DERIVED_NOTE, '',
    '## Description', '', 'phrase_004 — a morph from [[bar_007]] to [[bar_008]] in 17 bars, musical order.', '',
    '## Recipe', '', 'morph_rhythm([[bar_007]], [[bar_008]], bars=17, order="musical", seed=0)', '',
    '```json', formatPhraseJson(MORPH), '```', '',
  ].join('\n'));
  assert.deepEqual((readPhraseNote(morph) as { value: PhraseParams }).value, MORPH);
  const extend = phraseNoteContent('phrase_001', 'bar_005');
  assert.deepEqual((readPhraseNote(extend) as { value: PhraseParams }).value.kind, 'extend');
  assert.match(extend, /^description: "phrase_001 — \[\[bar_005\]\] extended to 4 bars/m);
  assert.match(extend, /\nlinks:\n {2}- "\[\[bar_005\]\]"\n---\n/);
  const mix = mixNoteContent('phrase_002', 'bar_005', 'bar_006');
  assert.equal((readPhraseNote(mix) as { value: PhraseParams }).value.kind, 'mix');
  assert.match(mix, /## Recipe\n\nmix_rhythm\(\[\[bar_005\]\], \[\[bar_006\]\], weight=1, mode="path"/);
  assert.equal(readPhraseKind(mix), 'mix');
});

// ---- the round trip ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const OLD = (json: string, desc = 'phrase_003 — a morph from bar_007 to bar_001, one single-hit change at a time. Parameters only; the Score is derived from the two bars.') =>
  `---\ntype: data\ncontent_type: json\ndescription: ${JSON.stringify(desc)}\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`;
const OLD_MORPH = OLD(formatPhraseJson({ kind: 'morph', a: 'bar_007', b: 'bar_001', bars: 8, order: 'musical', seed: 0 }));

test('refresh upgrades an old note: description, links, derived sections; the json fence is byte-identical; a second refresh changes nothing (idempotent, byte for byte)', () => {
  const r = refreshPhraseNoteText(OLD_MORPH, 'phrase_003');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.changed, true);
  assert.match(r.text, /^description: "phrase_003 — a morph from \[\[bar_007\]\] to \[\[bar_001\]\] in 8 bars, musical order\."$/m);
  assert.match(r.text, /\nlinks:\n {2}- "\[\[bar_007\]\]"\n {2}- "\[\[bar_001\]\]"\n---\n/);
  const fence = OLD_MORPH.slice(OLD_MORPH.indexOf('```json'));
  assert.ok(r.text.endsWith(fence), 'the fence and everything after it are the old bytes');
  const again = refreshPhraseNoteText(r.text, 'phrase_003');
  assert.ok(again.ok && again.changed === false && again.text === r.text);
  assert.deepEqual((readPhraseNote(r.text) as { value: PhraseParams }).value, { kind: 'morph', a: 'bar_007', b: 'bar_001', bars: 8, order: 'musical', seed: 0 });
});

test('refresh keeps every other frontmatter line (read_only, anything a person added) and the line endings of the note; a hand edit of the derived sections is overwritten, the fence is not', () => {
  const crlf = OLD_MORPH.replace(/\n/g, '\r\n').replace('content_type: json', 'content_type: json\r\nread_only: false\r\ntags: [demo]');
  const r = refreshPhraseNoteText(crlf, 'phrase_003');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.ok(r.text.includes('read_only: false\r\ntags: [demo]\r\n'), 'the person\'s own lines stay');
  assert.ok(!/[^\r]\n/.test(r.text), 'CRLF all the way');
  const edited = r.text.replace('musical order.\r\n\r\n## Recipe', 'MY OWN WORDS.\r\n\r\n## Recipe').replace('## Recipe\r\n\r\nmorph_rhythm', '## Recipe\r\n\r\nmy_call');
  const back = refreshPhraseNoteText(edited, 'phrase_003');
  assert.ok(back.ok && back.text === r.text, 'regenerated to what it was');
});

test('refresh refuses what it cannot read (not a phrase, bad json, a read_only note) with the reason, and changes nothing', () => {
  assert.deepEqual(refreshPhraseNoteText('no frontmatter', 'phrase_001'), { ok: false, message: 'The note has no frontmatter, so it is not a data note.' });
  const bad = OLD('{ "kind": "morph", ');
  const r = refreshPhraseNoteText(bad, 'phrase_001');
  assert.equal(r.ok, false);
  const ro = refreshPhraseNoteText(OLD_MORPH.replace('content_type: json', 'content_type: json\nread_only: true'), 'phrase_003');
  assert.equal(ro.ok, false);
});

// ---- the control strip's write keeps the links in step -----------------------------------------------------------------------------------------------------------------------------------

test('a control-strip write rewrites the fence AND the derived parts: changing a morph\'s Bars changes the Description and the Recipe; changing a mix\'s bar changes the links; without a name only the fence changes (as before)', () => {
  const text = morphNoteContent('phrase_004', 'bar_007', 'bar_008');
  const w = applyPhraseWrite(text, { ...MORPH, bars: 5 }, 'phrase_004');
  assert.ok(w.ok);
  if (!w.ok) return;
  assert.match(w.text, /in 5 bars, musical order\./);
  assert.match(w.text, /morph_rhythm\(\[\[bar_007\]\], \[\[bar_008\]\], bars=5,/);
  assert.deepEqual((readPhraseNote(w.text) as { value: PhraseParams }).value, { ...MORPH, bars: 5 });
  const same = applyPhraseWrite(w.text, { ...MORPH, bars: 5 }, 'phrase_004');
  assert.ok(same.ok && same.text === w.text, 'writing what is already there changes no byte');
  const swapped = applyPhraseWrite(mixNoteContent('phrase_002', 'bar_005', 'bar_006'), { ...PATH, b: 'bar_008' }, 'phrase_002');
  assert.ok(swapped.ok && /\n {2}- "\[\[bar_005\]\]"\n {2}- "\[\[bar_008\]\]"\n/.test(swapped.text) && !swapped.text.includes('bar_006'));
  const bare = applyPhraseWrite(OLD_MORPH, { ...MORPH, bars: 5 });
  assert.ok(bare.ok && bare.text.includes('"bars": 5') && bare.text.includes('Parameters only'), 'no name: the old behaviour, only the fence');
});

test('every reader of a phrase note finds the fence behind the derived text (readPhraseKind, readPhraseNote, salvageOverrideRefusal)', () => {
  const forked = { ...MORPH, bars: 5, overrides: { '9': 'bars/bar_010' } } as unknown as PhraseParams;
  const text = applyPhraseWrite(morphNoteContent('phrase_004', 'bar_007', 'bar_008'), forked, 'phrase_004');
  assert.ok(text.ok);
  if (!text.ok) return;
  assert.equal(readPhraseKind(text.text), 'morph');
  assert.equal(readPhraseNote(text.text).ok, false, 'a fork past Bars is refused');
  assert.ok(salvageOverrideRefusal(text.text), 'and the strip stays live for it');
});

test('exactly one json fence, last: derived text before it is fine; text after it, or a second fence, is still refused', () => {
  const ok = morphNoteContent('phrase_004', 'bar_007', 'bar_008');
  assert.equal(readPhraseNote(ok).ok, true);
  assert.equal(readPhraseNote(ok + '\nmore text\n').ok, false);
  assert.equal(readPhraseNote(ok.replace('```json', '```json\n{}\n```\n\n```json')).ok, false);
});

// ---- bars: frontmatter only --------------------------------------------------------------------------------------------------------------------------------------------------------------

const BAR_DATA: RhythmData = { time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: 100, channels: { kick: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false], snare: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false], hihat: Array(16).fill(false) } } as RhythmData;
const STARTER = (name: string, json = formatRhythmJson(BAR_DATA)) => `---\ntype: data\ncontent_type: json\ndescription: "${name} — a one-bar rhythm for the Beat Box: kick on beats 1 and 3, snare on 2 and 4."\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`;

test('barDescription names the bar, its hits per channel and its tempo; a bar that is not the starter any more says so', () => {
  assert.equal(barDescription('bar_005', BAR_DATA), 'bar_005 — a one-bar rhythm for the Beat Box: 6 hits in 16 steps (kick 4, snare 2), tempo 100.');
  assert.equal(barDescription('bar_001', { ...BAR_DATA, channels: { kick: Array(16).fill(false) } } as RhythmData), 'bar_001 — a one-bar rhythm for the Beat Box: no hits in 16 steps, tempo 100.');
});

test('refreshing a bar: a starter description that no longer matches the hits is derived again; a description a person wrote is left alone; a fork\'s forked_from becomes a wikilink; the fence and the rest are byte-identical; idempotent', () => {
  const r = refreshBarNoteText(STARTER('bar_005'), 'bar_005');
  assert.ok(r.ok && r.changed);
  if (!r.ok) return;
  assert.match(r.text, /^description: "bar_005 — a one-bar rhythm for the Beat Box: 6 hits in 16 steps \(kick 4, snare 2\), tempo 100\."$/m);
  assert.equal(r.text.slice(r.text.indexOf('```json')), STARTER('bar_005').slice(STARTER('bar_005').indexOf('```json')));
  const again = refreshBarNoteText(r.text, 'bar_005');
  assert.ok(again.ok && !again.changed && again.text === r.text);
  const mine = STARTER('bar_007').replace(/description: .*/, 'description: "bar_007 — my own words about this groove."');
  const kept = refreshBarNoteText(mine, 'bar_007');
  assert.ok(kept.ok && !kept.changed && kept.text === mine, 'hand-written description: untouched');
  const oldFork = `---\ntype: data\ncontent_type: json\ndescription: "bar_009 — forked from phrases/phrase_001 bar 3 to edit by hand. The phrase shows this bar instead of the generated one."\nforked_from: "phrases/phrase_001 bar 3"\n---\n\n\`\`\`json\n${formatRhythmJson(BAR_DATA)}\n\`\`\`\n`;
  const fork = refreshBarNoteText(oldFork, 'bar_009');
  assert.ok(fork.ok && fork.changed);
  if (!fork.ok) return;
  assert.match(fork.text, /^forked_from: "\[\[phrase_001\]\]"\nforked_bar: 3$/m);
  assert.match(fork.text, /^description: "bar_009 — forked from \[\[phrase_001\]\] bar 3 to edit by hand/m);
  assert.ok(readRhythmNote(fork.text).ok, 'still an editable rhythm data note for the Beat Box');
});

test('a new fork note carries the wikilinks from the start (forked_from and the description)', () => {
  const t = forkNoteContent('bar_009', 'phrases/phrase_001', 3, BAR_DATA);
  assert.match(t, /^forked_from: "\[\[phrase_001\]\]"\nforked_bar: 3$/m, 'the WHOLE value is the link: that is what Obsidian indexes');
  assert.match(t, /^description: "bar_009 — forked from \[\[phrase_001\]\] bar 3 to edit by hand\./m);
  assert.ok(readRhythmNote(t).ok);
});

test('the Beat Box save of a bar with the new frontmatter keeps every byte outside the json fence (applySave)', () => {
  const r = refreshBarNoteText(STARTER('bar_005'), 'bar_005');
  assert.ok(r.ok);
  if (!r.ok) return;
  const parsed = readRhythmNote(r.text);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const moved = { ...parsed.value.data, tempo_bpm: 120 };
  const saved = applySave(r.text, parsed.value.fingerprint, moved);
  assert.ok(saved.ok, JSON.stringify(saved));
  if (!saved.ok) return;
  assert.equal(saved.text.slice(0, saved.text.indexOf('```json')), r.text.slice(0, r.text.indexOf('```json')), 'frontmatter (description) untouched');
  assert.match(saved.text, /"tempo_bpm": 120/);
});

test('a morph made from a mix carries made_from as a whole-value wikilink (indexed by Obsidian: the graph ties the morph to its mix); a later control write keeps it', () => {
  const t = morphNoteContent('phrase_003', 'bar_005', 'bar_001', { from: 'phrase_002', bars: 5 });
  assert.match(t, /\nmade_from: "\[\[phrase_002\]\]"\n/);
  const w = applyPhraseWrite(t, { kind: 'morph', a: 'bar_005', b: 'bar_001', bars: 6, order: 'musical', seed: 0 }, 'phrase_003');
  assert.ok(w.ok && /\nmade_from: "\[\[phrase_002\]\]"\n/.test(w.text) && w.text.includes('in 6 bars'));
});

test('MEASURED in the installed Obsidian 1.12.7 (app.js, dT): a property is a link for backlinks and the graph only when its WHOLE string value is [[x]]; so the links: list and forked_from / made_from are written that way, while the [[wikilinks]] in the prose are indexed from the note BODY', () => {
  for (const item of ['[[bar_005]]']) assert.ok(item.startsWith('[[') && item.endsWith(']]'));
  const t = morphNoteContent('phrase_003', 'bar_005', 'bar_001', { from: 'phrase_002' });
  const front = /^---\n([\s\S]*?)\n---/.exec(t)![1];
  for (const m of front.matchAll(/^\s*(?:-|links:|made_from:|forked_from:)\s*"?(\[\[[^\]]+\]\])"?$/gm)) assert.match(m[0], /"\[\[[^\]]+\]\]"$/, 'every property link is a whole quoted value');
  assert.match(t.slice(t.indexOf('## Description')), /\[\[bar_005\]\]/, 'the body names the bars as real links');
});

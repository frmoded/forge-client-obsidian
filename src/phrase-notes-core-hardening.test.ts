// 2026-10-27-1000 (FULL-profile hardening of what shipped under DEMO): the survivors of the mutation pass over phrase-notes-core.ts, killed with exact-output tests. Every expected text below is what the person reads in a
// phrase or bar note (Description, Recipe, Python, the frontmatter order, the refusals), so a mutant that changes one is a visible regression, not noise.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PhraseParams } from './phrase-core.ts';
import { CACHE_NOTE, DERIVED_NOTE, SOURCE_CHAIN_KEYS, SOURCE_CHAIN_NOTE, barDescription, extractPhraseJsonBlock, newPhraseNote, phraseDescription, phraseLinks, phraseParts, phrasePython, phraseRecipeSteps, refreshBarNoteText, renderPhraseNote, sourceChainSections } from './phrase-notes-core.ts';
import { chainStampLines } from './test-support/source-chain-golden.ts';
import { formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';

const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_005', bars: 8, style: 'building', tempo_change_pct: 0 };
const MORPH: PhraseParams = { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 17, order: 'musical', seed: 0 };

// ---- the sentences ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the comments are exactly these (they tell a person which text is the source and which is not theirs to edit); a kit keeps the derived-note marker, a phrase has the two source-chain ones', () => {
  assert.equal(DERIVED_NOTE, '<!-- derived from the json below; edit the controls, not this text -->');
  assert.equal(SOURCE_CHAIN_NOTE, '<!-- the Description below is the source of this note: the controls write it, and the Recipe, the Python and the json cache are derived from it -->');
  assert.equal(CACHE_NOTE, '<!-- derived from the Description above; edit the Description, not this -->');
  const sections = sourceChainSections(phraseParts('phrase_001', EXTEND));
  assert.equal(sections[0], SOURCE_CHAIN_NOTE);
  assert.equal(sections[sections.length - 1], CACHE_NOTE);
  assert.equal(sections[sections.length - 3], '# Cache', 'the heading ends the Python section, so the Python hash covers the Python only');
});

test('the tempo in the Description: slowing, speeding up, none; one step either side of 0 is already one of the two', () => {
  const d = (pct: number) => phraseDescription('p', { ...EXTEND, tempo_change_pct: pct });
  assert.equal(d(0), 'p — [[bar_005]] extended to 8 bars: building, no tempo change.');
  assert.equal(d(-1), 'p — [[bar_005]] extended to 8 bars: building, slowing 1 %.');
  assert.equal(d(1), 'p — [[bar_005]] extended to 8 bars: building, speeding up 1 %.');
  assert.equal(d(100), 'p — [[bar_005]] extended to 8 bars: building, speeding up 100 %.');
});

test('a seeded morph says its seed in the Description, a musical one does not; the Recipe says position only when there is one', () => {
  assert.equal(phraseDescription('p', { ...MORPH, order: 'seeded', seed: 7 }), 'p — a morph from [[bar_007]] to [[bar_008]] in 17 bars, seeded order (seed 7).');
  assert.equal(phraseDescription('p', { ...MORPH, order: 'by_channel', seed: 7 }), 'p — a morph from [[bar_007]] to [[bar_008]] in 17 bars, by_channel order.');
  assert.equal(phraseDescription('p', MORPH), 'p — a morph from [[bar_007]] to [[bar_008]] in 17 bars, musical order.');
  assert.ok(phrasePython({ ...MORPH, bars: 1, position: 0 }).includes("morph_rhythm(a=a, b=b, bars=1, order='musical', seed=0, position=0)"));
  assert.ok(phrasePython({ ...MORPH, bars: 1, position: 3 }).includes("morph_rhythm(a=a, b=b, bars=1, order='musical', seed=0, position=3)"));
  assert.ok(phrasePython(MORPH).includes("morph_rhythm(a=a, b=b, bars=17, order='musical', seed=0)") && !phrasePython(MORPH).includes('position'));
});

test('a path mix without an order or a seed reads as musical order and seed 0, in the Description and the Recipe; with them it says them', () => {
  const bare = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 1, threshold: 0.5, ghost: false, mode: 'path' } as PhraseParams;
  assert.equal(phraseDescription('p', bare), 'p — a mix of [[bar_005]] and [[bar_006]] as a path of single-hit changes: weight 1 is all of bar_005, 0 is all of bar_006, musical order.');
  assert.ok(phrasePython(bare).includes("morph_rhythm_info(a=a, b=b, order='musical', seed=0)") && phrasePython(bare).includes("order='musical', seed=0, position=stop"));
  assert.equal(phraseRecipeSteps(bare)[1], 'Mix them as a path of single-hit changes from the first to the second, in musical order.');
  const full = { ...bare, order: 'seeded', seed: 9 } as PhraseParams;
  assert.equal(phraseDescription('p', full), 'p — a mix of [[bar_005]] and [[bar_006]] as a path of single-hit changes: weight 1 is all of bar_005, 0 is all of bar_006, seeded order.');
  assert.ok(phrasePython(full).includes("morph_rhythm_info(a=a, b=b, order='seeded', seed=9)") && phrasePython(full).includes("order='seeded', seed=9, position=stop"));
  assert.equal(phraseRecipeSteps(full)[1], 'Mix them as a path of single-hit changes from the first to the second, in seeded order (seed 9).');
});

test('a vote mix: the two percentages are rounded and add up, the threshold has two decimals, ghost notes say off or on', () => {
  const vote = (weight: number, threshold: number, ghost: boolean) => ({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight, threshold, ghost }) as PhraseParams;
  assert.equal(phraseDescription('p', vote(0.25, 0.5, false)), 'p — a mix of [[bar_005]] and [[bar_006]] by vote: 25 % bar_005 / 75 % bar_006, threshold 0.50, ghost notes off.');
  assert.equal(phraseDescription('p', vote(1, 1, true)), 'p — a mix of [[bar_005]] and [[bar_006]] by vote: 100 % bar_005 / 0 % bar_006, threshold 1.00, ghost notes on.');
  assert.equal(phraseDescription('p', vote(0, 0, false)), 'p — a mix of [[bar_005]] and [[bar_006]] by vote: 0 % bar_005 / 100 % bar_006, threshold 0.00, ghost notes off.');
  assert.equal(phraseDescription('p', vote(0.333, 0.5, false)), 'p — a mix of [[bar_005]] and [[bar_006]] by vote: 33 % bar_005 / 67 % bar_006, threshold 0.50, ghost notes off.');
});

test('ONE fork is enough for "Edited by hand", the Recipe step, the Python line and the links; forks come in bar-number order, not text order', () => {
  const one: PhraseParams = { ...EXTEND, overrides: { '3': 'bars/bar_009' } };
  assert.equal(phraseDescription('p', one), 'p — [[bar_005]] extended to 8 bars: building, no tempo change. Edited by hand: bar 3 is [[bar_009]].');
  assert.deepEqual(phraseLinks(one), ['bar_005', 'bar_009']);
  assert.ok(sourceChainSections(phraseParts('p', one)).includes('Bar 3 is replaced by [[bar_009]].') && sourceChainSections(phraseParts('p', one)).includes('  bars[2] = bar_009()'));
  assert.ok(!sourceChainSections(phraseParts('p', EXTEND)).some((l) => /is replaced by|bars\[/.test(l)), 'no forks, no fork lines');
  const many: PhraseParams = { ...EXTEND, overrides: { '10': 'bars/bar_012', '2': 'bars/bar_011', '5': 'bars/bar_011' } };
  assert.equal(phraseDescription('p', many), 'p — [[bar_005]] extended to 8 bars: building, no tempo change. Edited by hand: bar 2 is [[bar_011]], bar 5 is [[bar_011]], bar 10 is [[bar_012]].');
  assert.deepEqual(phraseLinks(many), ['bar_005', 'bar_011', 'bar_012'], 'each note once');
  const forkedMorph: PhraseParams = { ...MORPH, overrides: { '2': 'bars/bar_020' } };
  assert.deepEqual(phraseLinks(forkedMorph), ['bar_007', 'bar_008', 'bar_020']);
  const mix = { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false } as PhraseParams;
  assert.deepEqual(phraseLinks(mix), ['bar_005', 'bar_006'], 'a mix has no forks');
});

// ---- the json fence ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('extractPhraseJsonBlock names what is wrong, in these words, and finds the block with its offsets otherwise', () => {
  const refused = (text: string) => { const r = extractPhraseJsonBlock(text); assert.equal(r.ok, false); return (r as { message: string }).message; };
  assert.equal(refused('no frontmatter\n```json\n{}\n```\n'), 'The note has no frontmatter, so it is not a data note.');
  assert.equal(refused('---\ntype: data\n---\n\njust text\n'), 'The note body must end with one fenced ```json block (no json block found).');
  assert.equal(refused('---\ntype: data\n---\n\n```json\n{}\n'), 'The json block is not closed.');
  assert.equal(refused('---\ntype: data\n---\n\n```json\n{}\n```\n\nafter\n'), 'The note has text after the json block; it must contain exactly one fenced json block, last.');
  const text = '---\ntype: data\n---\n\nabove\n\n```json\n{"a":1}\n```\n';
  const ok = extractPhraseJsonBlock(text);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(text.slice(ok.contentStart, ok.contentEnd), '{"a":1}');
  assert.equal(text.slice(ok.fenceStart), '```json\n{"a":1}\n```\n');
  assert.equal(ok.eol, '\n');
  const crlf = extractPhraseJsonBlock('---\r\ntype: data\r\n---\r\n\r\n```json\r\n{}\r\n```\r\n');
  assert.ok(crlf.ok && crlf.eol === '\r\n');
  assert.ok(extractPhraseJsonBlock('---\ntype: data\n---\n\n```json  \n{}\n```  \n').ok, 'trailing blanks on the fences are fine');
});

// ---- the frontmatter assembly -----------------------------------------------------------------------------------------------------------------------------------------------------

const fenceOf = (text: string) => text.slice(text.indexOf('```json'));
function allFrontOf(text: string): string[] { return text.slice(4, text.indexOf('\n---', 4)).split('\n'); }
/** The frontmatter without the six lines the source chain owns (those are checked where they matter, below). */
function frontOf(text: string): string[] { return allFrontOf(text).filter((l) => !(SOURCE_CHAIN_KEYS as readonly string[]).includes(l.split(':')[0])); }
const render = (front: string, p: PhraseParams = EXTEND) => {
  const text = `---\n${front}\n---\n\n\`\`\`json\n{}\n\`\`\`\n`;
  return renderPhraseNote(text, 'phrase_001', p, text.indexOf('```json'));
};
const DESC = 'description: "phrase_001 — [[bar_005]] extended to 8 bars: building, no tempo change."';

test('the description stays where it was and the links come straight after it; the person\'s other lines keep their order', () => {
  const out = frontOf(render('type: data\ndescription: "old"\ncontent_type: json\nread_only: false'));
  assert.deepEqual(out, ['type: data', DESC, 'links:', '  - "[[bar_005]]"', 'content_type: json', 'read_only: false']);
});

test('no description yet: it is placed straight after content_type, before the lines that follow it', () => {
  const out = frontOf(render('type: data\ncontent_type: json\nread_only: false'));
  assert.deepEqual(out, ['type: data', 'content_type: json', DESC, 'links:', '  - "[[bar_005]]"', 'read_only: false']);
});

test('neither a description nor a content_type line: both go at the end of the frontmatter', () => {
  const out = frontOf(render('type: data\nread_only: false'));
  assert.deepEqual(out, ['type: data', 'read_only: false', DESC, 'links:', '  - "[[bar_005]]"']);
});

test('an old links block is replaced whole, however many items it had, wherever it sat; two description lines leave one', () => {
  const stale = 'type: data\nlinks:\n  - "[[old_1]]"\n  - "[[old_2]]"\n  - "[[old_3]]"\ncontent_type: json\ndescription: "old"\ndescription: "older"\nlinks:\n  - "[[tail]]"';
  const out = frontOf(render(stale));
  assert.deepEqual(out, ['type: data', 'content_type: json', DESC, 'links:', '  - "[[bar_005]]"']);
  const lastBlock = frontOf(render('type: data\ncontent_type: json\ndescription: "old"\nlinks:\n  - "[[a]]"\n  - "[[b]]"'));
  assert.deepEqual(lastBlock, ['type: data', 'content_type: json', DESC, 'links:', '  - "[[bar_005]]"'], 'a links block that ends the frontmatter');
});

test('a text without frontmatter is returned as it is; a new phrase note is frontmatter, derived text, then the fence last', () => {
  const bare = 'just text\n```json\n{}\n```\n';
  assert.equal(renderPhraseNote(bare, 'p', EXTEND, 10), bare);
  const text = newPhraseNote('phrase_001', EXTEND, '{"kind": "extend"}');
  assert.equal(text, [
    '---', 'type: data', 'content_type: json', DESC, 'links:', '  - "[[bar_005]]"', ...chainStampLines('Extend [[bar_005]] to 8 bars, building up.', ['Take [[bar_005]].', 'Build it up over 8 bars.'], phrasePython(EXTEND)), '---', '',
    SOURCE_CHAIN_NOTE, '', '# Description', '', 'Extend [[bar_005]] to 8 bars, building up.', '', '# Recipe', '', 'Take [[bar_005]].', 'Build it up over 8 bars.', '',
    '# Python', '', '```python', phrasePython(EXTEND), '```', '',
    '# Cache', '', CACHE_NOTE, '',
    '```json', '{"kind": "extend"}', '```', '',
  ].join('\n'));
  assert.equal(fenceOf(newPhraseNote('p', EXTEND, '{}', ['made_from: "[[x]]"'])).startsWith('```json'), true);
  assert.ok(newPhraseNote('phrase_001', EXTEND, '{}', ['made_from: "[[x]]"']).includes(`content_type: json\n${DESC}\nlinks:\n  - "[[bar_005]]"\nmade_from: "[[x]]"\nsource_facet: description\n`), 'the derived description sits right after content_type; the extra line follows the links; the six stamps come after the person\'s lines');
});

// ---- bars -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const data = (channels: Record<string, Array<boolean | number | null>>, tempo = 100): RhythmData => ({ time_signature: '4/4', steps: 8, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels } as unknown as RhythmData);

test('barDescription counts hits (true or a velocity, never false, 0 or null), says "hit" for one and "hits" for more, and leaves silent channels out', () => {
  assert.equal(barDescription('b', data({ kick: [true, false, false, false, false, false, false, false] })), 'b — a one-bar rhythm for the Beat Box: 1 hit in 8 steps (kick 1), tempo 100.');
  assert.equal(barDescription('b', data({ kick: [1, 0, 100, null, 0, 0, 0, 0], snare: [false, false, false, false, false, false, false, false], hat: [true, false, false, false, false, false, false, false] }, 90.5)), 'b — a one-bar rhythm for the Beat Box: 3 hits in 8 steps (kick 2, hat 1), tempo 90.5.');
  assert.equal(barDescription('b', data({ kick: [0, 0, 0, 0, 0, 0, 0, 0], snare: [null, null, null, null, null, null, null, null] })), 'b — a one-bar rhythm for the Beat Box: no hits in 8 steps, tempo 100.');
  assert.equal(barDescription('b', data({ kick: [true, true, false, false, false, false, false, false] })), 'b — a one-bar rhythm for the Beat Box: 2 hits in 8 steps (kick 2), tempo 100.');
});

const bar = (front: string, d: RhythmData = data({ kick: [true, false, false, false, false, false, false, false] })) => `---\ntype: data\ncontent_type: json\n${front}---\n\n\`\`\`json\n${formatRhythmJson(d)}\n\`\`\`\n`;

test('refreshing a bar: what cannot be read is refused with the reason and nothing else; a description that is not JSON is left as it is and does not count as hand-written', () => {
  const bad = refreshBarNoteText('no frontmatter', 'bar_001');
  assert.ok(!bad.ok && bad.message === 'The note has no frontmatter, so it is not a data note.');
  const text = bar('description: not json at all\n');
  const r = refreshBarNoteText(text, 'bar_001');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.text, text, 'untouched');
  assert.equal(r.changed, false);
  assert.equal('kept' in r, false, 'a line that is not even JSON is neither derived nor reported as a person\'s words');
});

test('refreshing a bar: a description a person wrote is kept and reported as hand-written; a generated one is derived again; a note with no description is left alone', () => {
  const mine = bar('description: "bar_001 — my words."\n');
  const kept = refreshBarNoteText(mine, 'bar_001');
  assert.ok(kept.ok && kept.kept === 'hand-written' && !kept.changed && kept.text === mine);
  const stale = bar('description: "bar_001 — a one-bar rhythm for the Beat Box: no hits in 8 steps, tempo 100."\n');
  const fresh = refreshBarNoteText(stale, 'bar_001');
  assert.ok(fresh.ok && fresh.changed && !('kept' in fresh));
  if (fresh.ok) assert.ok(fresh.text.includes('description: "bar_001 — a one-bar rhythm for the Beat Box: 1 hit in 8 steps (kick 1), tempo 100."\n'));
  const none = bar('');
  const same = refreshBarNoteText(none, 'bar_001');
  assert.ok(same.ok && !same.changed && !('kept' in same));
  const prefix = bar('descriptionx: "kept"\n');
  const p = refreshBarNoteText(prefix, 'bar_001');
  assert.ok(p.ok && p.text === prefix && !('kept' in p), 'only a line that starts with "description:" is a description');
});

test('refreshing a bar: the old fork description and forked_from become wikilinks, word for word', () => {
  const old = bar('description: "bar_009 — forked from phrases/phrase_001 bar 3 to edit by hand. The phrase shows this bar instead of the generated one."\nforked_from: "phrases/phrase_001 bar 3"\n');
  const r = refreshBarNoteText(old, 'bar_009');
  assert.ok(r.ok && r.changed);
  if (!r.ok) return;
  assert.ok(r.text.includes('description: "bar_009 — forked from [[phrase_001]] bar 3 to edit by hand. The phrase shows this bar instead of the generated one."\nforked_from: "[[phrase_001]]"\nforked_bar: 3\n'), r.text);
  assert.equal('kept' in r, false);
});

test('refreshing a bar that cannot be read as rhythm data is refused with the reader\'s own reason, whatever its frontmatter says', () => {
  const brokenJson = `---\ntype: data\ncontent_type: json\ndescription: "bar_001 — a one-bar rhythm for the Beat Box: no hits in 8 steps, tempo 100."\n---\n\n\`\`\`json\n{ nope\n\`\`\`\n`;
  const r = refreshBarNoteText(brokenJson, 'bar_001');
  assert.ok(!r.ok && /^The json block is not valid JSON: /.test(r.message), 'ok' in r ? JSON.stringify(r) : '');
  const readOnly = bar('read_only: true\n');
  const ro = refreshBarNoteText(readOnly, 'bar_001');
  assert.ok(!ro.ok && /read_only: true/.test(ro.message));
  const notData = refreshBarNoteText(bar('').replace('type: data', 'type: note'), 'bar_001');
  assert.ok(!notData.ok && /^This is not a data note \(type: note\)\.$/.test(notData.message));
});

test('refreshing a bar: only a line that STARTS with "description:" is looked at; a stray line that happens to be JSON is not mistaken for one', () => {
  const stray = bar('"bar_001 — a one-bar rhythm for the Beat Box: no hits in 8 steps, tempo 100."\n0123456789ab"zzz"\n');
  const r = refreshBarNoteText(stray, 'bar_001');
  assert.ok(r.ok && !r.changed && r.text === stray && !('kept' in r), 'neither rewritten nor reported');
});

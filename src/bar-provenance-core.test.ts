// 2026-11-05-1182 (M17a, design 4.14) - a bar note says where it came from: `# Description` (one sentence) and `# Recipe` (the same fact as a step with wikilinks) above the json fence, derived and read-only. The pure half:
// the sentence per origin, reading an origin back from a note, writing the sections (idempotent, every other byte kept), the widened reader (and what it still refuses), the Beat Box save keeping the sections current,
// the writers (New bar, Edit this bar) and the migration ("Refresh note links"). Real notes: the starter, the fork writer, bars as the playground vault has them (a copy at the pinned commit).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BAR_PROVENANCE_NOTE, barHits, barLinks, barOriginOf, barProvenanceSections, barRecipe, barSentence, hasBarProvenance, keepBarProvenance, withBarProvenance, type BarOrigin,
} from './bar-provenance-core.ts';
import { applySave, contentFingerprint, extractJsonBlock, formatRhythmJson, readRhythmNote, type RhythmData } from './rhythm-edit-core.ts';
import { refreshBarNoteText } from './phrase-notes-core.ts';
import { forkNoteContent } from './phrase-fork-core.ts';
import { planNewBar } from './score-first-core.ts';
import { RHYTHM_STARTER, rhythmNoteTemplate } from './new-note-core.ts';

const row = (...on: number[]) => Array.from({ length: 16 }, (_, i) => on.includes(i));
const data = (channels: Record<string, boolean[]>, tempo = 100): RhythmData => ({ time_signature: '4/4', steps: 16, group_size: 4, swing_pct: 0, tempo_bpm: tempo, channels } as unknown as RhythmData);
const KICK_SNARE = data({ kick: row(0, 8), snare: row(4, 12) });
const bar = (front: string, d: RhythmData = KICK_SNARE) => `---\ntype: data\ncontent_type: json\n${front}---\n\n\`\`\`json\n${formatRhythmJson(d)}\n\`\`\`\n`;
const FORK: BarOrigin = { kind: 'fork', phrase: 'phrase_006', bar: 9 };

// ---- the sentence builder (pure), per origin -------------------------------------------------------------------------------------------------------------------

test('barHits: hits (true or a velocity), "hit" for one and "hits" for more, none, the steps and the tempo', () => {
  assert.equal(barHits(KICK_SNARE), '4 hits in 16 steps, tempo 100');
  assert.equal(barHits(data({ kick: row(0) })), '1 hit in 16 steps, tempo 100');
  assert.equal(barHits(data({ kick: row() , snare: row() })), 'no hits in 16 steps, tempo 100');
  assert.equal(barHits(data({ kick: [1, 0, 100, null, ...Array(12).fill(false)] as never }, 90.5)), '2 hits in 16 steps, tempo 90.5');
});

test('barSentence: made in the Beat Box says what is in it; made by hand and a fork say where they came from', () => {
  assert.equal(barSentence({ kind: 'beatbox' }, KICK_SNARE), 'Bar made in the Beat Box; 4 hits in 16 steps, tempo 100.');
  assert.equal(barSentence({ kind: 'hand' }, KICK_SNARE), 'Bar made by hand.');
  assert.equal(barSentence(FORK, KICK_SNARE), 'Bar 9 of [[phrase_006]], forked to edit by hand.');
  assert.equal(barSentence({ kind: 'fork', phrase: 'phrase_006', bar: null }, KICK_SNARE), 'A fork of a bar of [[phrase_006]], to edit by hand.');
  assert.equal(barSentence({ kind: 'hand' }, data({ kick: row() })), 'Bar made by hand.', 'a bar made by hand does not change with its hits');
});

test('barRecipe: the same fact as steps, a wikilink only where the bar knows its origin; links: carries that phrase and nothing else', () => {
  assert.deepEqual(barRecipe({ kind: 'beatbox' }), ['Draw the bar in the Beat Box.']);
  assert.deepEqual(barRecipe({ kind: 'hand' }), ['Write the bar by hand.']);
  assert.deepEqual(barRecipe(FORK), ['Take bar 9 of [[phrase_006]].', 'Change it in the Beat Box.']);
  assert.deepEqual(barRecipe({ kind: 'fork', phrase: 'phrase_006', bar: null }), ['Take a bar of [[phrase_006]].', 'Change it in the Beat Box.']);
  for (const o of [{ kind: 'beatbox' }, { kind: 'hand' }] as BarOrigin[]) assert.ok(!barRecipe(o).join('\n').includes('[['), `${o.kind}: no Recipe link`);
  assert.deepEqual([barLinks({ kind: 'beatbox' }), barLinks({ kind: 'hand' }), barLinks(FORK)], [[], [], ['phrase_006']]);
});

test('the sections are the comment, the Description, the Recipe - in that order, one sentence in the Description', () => {
  const s = barProvenanceSections({ kind: 'beatbox' }, KICK_SNARE);
  assert.deepEqual(s, [BAR_PROVENANCE_NOTE, '', '# Description', '', 'Bar made in the Beat Box; 4 hits in 16 steps, tempo 100.', '', '# Recipe', '', 'Draw the bar in the Beat Box.']);
  assert.match(BAR_PROVENANCE_NOTE, /rewrites it|every save/, 'the comment says a write replaces them');
});

// ---- reading an origin back ------------------------------------------------------------------------------------------------------------------------------------

test('barOriginOf: a fork from its frontmatter (the link form and the older string form), made in the Beat Box from its own Description, everything else made by hand', () => {
  assert.deepEqual(barOriginOf(bar('forked_from: "[[phrase_006]]"\nforked_bar: 9\n')), FORK);
  assert.deepEqual(barOriginOf(bar('forked_from: "phrases/phrase_006 bar 9"\n')), FORK);
  assert.deepEqual(barOriginOf(bar('forked_from: "[[phrase_006]]"\n')), { kind: 'fork', phrase: 'phrase_006', bar: null });
  assert.deepEqual(barOriginOf(bar('')), { kind: 'hand' }, 'a bar with no known origin');
  const made = withBarProvenance(bar(''), { kind: 'beatbox' }, KICK_SNARE);
  assert.deepEqual(barOriginOf(made), { kind: 'beatbox' }, 'read back from the Description it opens with');
  assert.deepEqual(barOriginOf(withBarProvenance(bar(''), { kind: 'hand' }, KICK_SNARE)), { kind: 'hand' });
  assert.deepEqual(barOriginOf(withBarProvenance(bar('forked_from: "[[phrase_006]]"\nforked_bar: 9\n'), FORK, KICK_SNARE)), FORK);
  assert.deepEqual(barOriginOf(bar('description: "Bar made in the Beat Box"\n')), { kind: 'hand' }, 'the frontmatter description is not the origin; only the # Description section is');
  const mentions = withBarProvenance(bar(''), { kind: 'beatbox' }, KICK_SNARE).replace('Bar made in the Beat Box;', 'A bar I drew in the Beat Box;');
  assert.deepEqual(barOriginOf(mentions), { kind: 'hand' }, 'a Description that only MENTIONS the Beat Box is not "made in the Beat Box"');
});

// ---- writing the sections --------------------------------------------------------------------------------------------------------------------------------------

test('withBarProvenance: the sections go between the frontmatter and the fence; the frontmatter lines and the fence and everything after it are byte for byte what they were', () => {
  const text = bar('description: "bar_001 — mine."\nsomething_else: 7\n');
  const out = withBarProvenance(text, { kind: 'beatbox' }, KICK_SNARE);
  assert.equal(out.slice(out.indexOf('```json')), text.slice(text.indexOf('```json')), 'the fence and what follows it');
  assert.match(out, /^---\ntype: data\ncontent_type: json\ndescription: "bar_001 — mine\."\nsomething_else: 7\n---\n\n<!-- where this bar came from/);
  assert.match(out, /\n# Description\n\nBar made in the Beat Box; 4 hits in 16 steps, tempo 100\.\n\n# Recipe\n\nDraw the bar in the Beat Box\.\n\n```json\n/);
  assert.ok(!/^links:/m.test(out), 'a bar with no origin to link to gets no links:');
});

test('withBarProvenance is idempotent, and rewrites an earlier version of the sections (a hand edit of them is overwritten)', () => {
  const once = withBarProvenance(bar(''), { kind: 'beatbox' }, KICK_SNARE);
  assert.equal(withBarProvenance(once, { kind: 'beatbox' }, KICK_SNARE), once);
  const handEdited = once.replace('Bar made in the Beat Box; 4 hits', 'My very own words; 4 hits').replace('Draw the bar in the Beat Box.', 'Something else entirely.');
  assert.equal(withBarProvenance(handEdited, { kind: 'beatbox' }, KICK_SNARE), once);
  assert.ok(readRhythmNote(handEdited).ok, 'a hand-edited section is still a readable bar');
});

test('a fork gets links: with the phrase it came from (after the lines the note has), once, whatever links: it had', () => {
  const out = withBarProvenance(bar('description: "d"\nforked_from: "[[phrase_006]]"\nforked_bar: 9\nlinks:\n  - "[[old]]"\n'), FORK, KICK_SNARE);
  assert.match(out, /\ndescription: "d"\nforked_from: "\[\[phrase_006\]\]"\nforked_bar: 9\nlinks:\n  - "\[\[phrase_006\]\]"\n---\n/);
  assert.equal((out.match(/^links:/gm) ?? []).length, 1);
  assert.equal(withBarProvenance(out, FORK, KICK_SNARE), out);
});

test('CRLF notes: the sections use the note\'s own line endings and the result is still one readable bar', () => {
  const crlf = bar('').replace(/\n/g, '\r\n');
  const out = withBarProvenance(crlf, { kind: 'beatbox' }, KICK_SNARE);
  assert.ok(!/[^\r]\n/.test(out), 'every line ends in CRLF');
  assert.ok(readRhythmNote(out).ok);
  assert.equal(withBarProvenance(out, { kind: 'beatbox' }, KICK_SNARE), out);
  assert.deepEqual(barOriginOf(out), { kind: 'beatbox' });
});

test('a text that is not a readable bar comes back unchanged', () => {
  for (const t of ['no frontmatter', bar('read_only: true\n').replace('```json', '```yaml'), '---\ntype: data\n---\n\nprose only\n']) assert.equal(withBarProvenance(t, { kind: 'hand' }, KICK_SNARE), t);
});

// ---- the reader (rhythm-edit-core): widened only for these sections --------------------------------------------------------------------------------------------

test('the reader opens a bar with its sections, finds the same block, and says where the fence starts', () => {
  const plain = bar('');
  const withSections = withBarProvenance(plain, { kind: 'beatbox' }, KICK_SNARE);
  const a = extractJsonBlock(plain), b = extractJsonBlock(withSections);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.equal(withSections.slice(b.contentStart, b.contentEnd), plain.slice(a.contentStart, a.contentEnd), 'the same json');
  assert.equal(withSections.slice(b.fenceStart, b.fenceStart + 7), '```json');
  assert.deepEqual((readRhythmNote(withSections) as { value: { data: RhythmData } }).value.data, (readRhythmNote(plain) as { value: { data: RhythmData } }).value.data);
});

test('the reader still refuses everything else above the block, word for word: other prose, another heading, a code fence, a Description with no Recipe, sections after the block', () => {
  const REFUSAL = 'The note body must be exactly one fenced ```json block (found something else before it, or no json block).';
  const fence = '```json\n{}\n```\n';
  const head = '---\ntype: data\ncontent_type: json\n---\n\n';
  for (const before of ['some prose\n\n', '# Notes\n\nmy notes\n\n', '# Description\n\nonly a description\n\n', '# Recipe\n\nrecipe first\n\n# Description\n\nthen the description\n\n', '# Description\n\nd\n\n# Notes\n\nn\n\n', 'prose\n\n# Recipe\n\nr\n\n', '# Description\n\nd\n\n# Recipe\n\nr\n\n# Python\n\np\n\n', '# Description\n\nd\n\n# Recipe\n\n```python\nx\n```\n\n', '```yaml\na: 1\n```\n\n']) {
    const r = extractJsonBlock(head + before + fence);
    assert.ok(!r.ok && r.message === REFUSAL, JSON.stringify(before));
  }
  const after = extractJsonBlock(`${head}${fence}\n# Description\n\nd\n`);
  assert.ok(!after.ok && /text after the json block/.test(after.message));
  assert.equal(extractJsonBlock(`${head}${fence}`).ok, true, 'and a body that is exactly one block is read as it always was');
  assert.equal(extractJsonBlock(`${head}\n\n${fence}`).ok, true);
});

// ---- the Beat Box save keeps the sections current ---------------------------------------------------------------------------------------------------------------

test('applySave with keepBarProvenance: a bar that carries its sections gets them rewritten for the data just saved, in the same write; the origin stays', () => {
  const made = withBarProvenance(bar(''), { kind: 'beatbox' }, KICK_SNARE);
  const next = data({ kick: row(0), snare: row(4), hihat: row(2, 6) }, 120);
  const r = applySave(made, contentFingerprint(made), next, keepBarProvenance);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.match(r.text, /\nBar made in the Beat Box; 4 hits in 16 steps, tempo 120\.\n/);
  assert.deepEqual((readRhythmNote(r.text) as { value: { data: RhythmData } }).value.data, (readRhythmNote(bar('', next)) as { value: { data: RhythmData } }).value.data, 'the saved data is what the widget sent');
  assert.equal(r.text, withBarProvenance(applySave(made, contentFingerprint(made), next).ok ? (applySave(made, contentFingerprint(made), next) as { text: string }).text : '', { kind: 'beatbox' }, next), 'the same as writing the json, then deriving the sections');
  const fork = withBarProvenance(bar('forked_from: "[[phrase_006]]"\nforked_bar: 9\n'), FORK, KICK_SNARE);
  const f = applySave(fork, contentFingerprint(fork), next, keepBarProvenance);
  assert.ok(f.ok);
  if (f.ok) { assert.match(f.text, /\nBar 9 of \[\[phrase_006\]\], forked to edit by hand\.\n/); assert.deepEqual(barOriginOf(f.text), FORK); }
});

test('P3: a bar that carries NO sections is written by the Beat Box save exactly as before (only the json block changes), with or without the derive hook', () => {
  const plain = bar('description: "bar_001 — x."\n');
  const next = data({ kick: row(1) }, 90);
  const without = applySave(plain, contentFingerprint(plain), next);
  const withHook = applySave(plain, contentFingerprint(plain), next, keepBarProvenance);
  assert.ok(without.ok && withHook.ok);
  if (!without.ok || !withHook.ok) return;
  assert.equal(withHook.text, without.text);
  assert.ok(!hasBarProvenance(withHook.text));
  assert.equal(withHook.text.slice(0, withHook.text.indexOf('```json')), plain.slice(0, plain.indexOf('```json')), 'every byte above the fence');
});

test('keepBarProvenance: sections in, sections rewritten; none in, the text itself', () => {
  const plain = bar('');
  assert.equal(keepBarProvenance(plain, KICK_SNARE), plain);
  const made = withBarProvenance(plain, { kind: 'hand' }, KICK_SNARE);
  assert.equal(keepBarProvenance(made, KICK_SNARE), made);
  assert.equal(hasBarProvenance(made), true);
  assert.equal(hasBarProvenance(plain), false);
});

// ---- the writers -----------------------------------------------------------------------------------------------------------------------------------------------

test('New bar writes the sections in the same write as the json: made in the Beat Box, 4 hits, tempo 100 (the starter), no link', () => {
  const plan = planNewBar({ existingBasenames: [], exists: () => false });
  assert.ok(plan.ok);
  if (!plan.ok) return;
  assert.equal(plan.content, withBarProvenance(rhythmNoteTemplate('bar_001'), { kind: 'beatbox' }, RHYTHM_STARTER));
  assert.ok(readRhythmNote(plan.content).ok, 'it opens in the Beat Box');
  assert.deepEqual(barOriginOf(plan.content), { kind: 'beatbox' });
  assert.ok(!/^links:/m.test(plan.content));
});

test('Edit this bar (the fork) writes the sections in the same write as the json: bar N of the phrase, a Recipe step that links it, links: the phrase', () => {
  const t = forkNoteContent('bar_009', 'phrases/phrase_006', 9, KICK_SNARE);
  assert.match(t, /\nBar 9 of \[\[phrase_006\]\], forked to edit by hand\.\n/);
  assert.match(t, /\nTake bar 9 of \[\[phrase_006\]\]\.\nChange it in the Beat Box\.\n/);
  assert.match(t, /^links:\n  - "\[\[phrase_006\]\]"$/m);
  assert.match(t, /^forked_from: "\[\[phrase_006\]\]"\nforked_bar: 9$/m, 'the lineage fields every reader uses are as they were');
  assert.deepEqual(barOriginOf(t), FORK);
  assert.ok(readRhythmNote(t).ok);
});

// ---- the migration: Refresh note links --------------------------------------------------------------------------------------------------------------------------

test('Refresh note links: a bar with no known origin gets "Bar made by hand." and a Recipe with no link; a fork (old or new form) gets its origin; the json and the frontmatter lines are kept', () => {
  const hand = refreshBarNoteText(bar('description: "bar_001 — my words."\n'), 'bar_001');
  assert.ok(hand.ok && hand.changed);
  if (!hand.ok) return;
  assert.match(hand.text, /\n# Description\n\nBar made by hand\.\n\n# Recipe\n\nWrite the bar by hand\.\n\n```json\n/);
  assert.ok(!/\[\[/.test(hand.text.slice(0, hand.text.indexOf('```json'))), 'no link anywhere in a bar with no origin');
  const old = refreshBarNoteText(bar('description: "bar_009 — forked from phrases/phrase_006 bar 9 to edit by hand. The phrase shows this bar instead of the generated one."\nforked_from: "phrases/phrase_006 bar 9"\n'), 'bar_009');
  assert.ok(old.ok && old.changed);
  if (old.ok) {
    assert.match(old.text, /\nBar 9 of \[\[phrase_006\]\], forked to edit by hand\.\n/);
    assert.match(old.text, /^forked_from: "\[\[phrase_006\]\]"\nforked_bar: 9$/m);
    assert.match(old.text, /^links:\n  - "\[\[phrase_006\]\]"$/m);
  }
});

test('Refresh note links is idempotent: a second run changes nothing, for a bar made by hand, in the Beat Box and a fork', () => {
  for (const text of [bar(''), withBarProvenance(bar(''), { kind: 'beatbox' }, KICK_SNARE), bar('forked_from: "phrases/phrase_006 bar 9"\n')]) {
    const a = refreshBarNoteText(text, 'bar_001');
    assert.ok(a.ok);
    if (!a.ok) return;
    const b = refreshBarNoteText(a.text, 'bar_001');
    assert.ok(b.ok && !b.changed && b.text === a.text);
  }
});

test('Refresh note links keeps the origin of a bar made in the Beat Box and brings its Description up to date with the hits', () => {
  const made = withBarProvenance(bar(''), { kind: 'beatbox' }, KICK_SNARE);
  const edited = made.replace(formatRhythmJson(KICK_SNARE), formatRhythmJson(data({ kick: row(0) })));    // the json changed by hand; the sentence still says 4 hits
  const r = refreshBarNoteText(edited, 'bar_001');
  assert.ok(r.ok && r.changed);
  if (r.ok) { assert.match(r.text, /\nBar made in the Beat Box; 1 hit in 16 steps, tempo 100\.\n/); assert.deepEqual(barOriginOf(r.text), { kind: 'beatbox' }); }
});

test('Refresh note links on a bar that cannot be read says why and changes nothing (the reader\'s own reason, as before)', () => {
  const r = refreshBarNoteText('---\ntype: data\ncontent_type: json\n---\n\n```json\n{ nope\n```\n', 'bar_001');
  assert.ok(!r.ok && /^The json block is not valid JSON: /.test(r.message));
});

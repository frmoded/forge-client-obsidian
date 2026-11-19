// 2026-10-31-1100 (score_first M17b) - the pure cores and plain-DOM pieces around the composition tab, without Obsidian: the root mark (composition-root-core), where the root mark moves (composition-flow-core; what "New composition" does is in new-notes-start-empty.test.ts, 2026-11-19-0960: it makes an EMPTY note), how a bar of the Score is tied to its section and its note (composition-nav-core, on a MusicXML made for the purpose and on the real pin rule), the tree of the strip (composition-strip-core + the DOM a happy-dom test mounts). The connection to the real plugin is proven in compositions-wiring.test.ts, the engine in composition-engine.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { isRootNote, makeRootAvailable, manyRootsMessage, noRootMessage, openPieceAvailable, rootOf, withRoot } from './composition-root-core.ts';
import { moveRoot, newCompositionAvailable, openCompositionAvailable } from './composition-flow-core.ts';
import { FORGE_COMPOSITION_KEY, compositionHeader, expandSections, newCompositionNote, readCompositionNote, type CompositionParams, type CompositionShape } from './composition-core.ts';
import { COMPOSITION_BAR_ROLE, annotateCompositionPayload, barIdsPlayedFrom, barsPlayedFrom, compositionLineageOf, compositionPinnedNote, readCompositionLineage } from './composition-nav-core.ts';
import { treeRows, treeText } from './composition-strip-core.ts';
import { COMPOSITION_INDENT_PX, mountCompositionStrip } from './composition-strip-dom.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';

const P = (...sections: CompositionParams['sections']): CompositionParams => ({ kind: 'composition', sections });
const note = (name: string, p: CompositionParams, root = false): string => newCompositionNote(name, p, root ? ['root: true'] : []);
const win: any = new Window({ url: 'http://localhost/' });

// ---- the root ---------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the ROOT mark: only `root: true` in the frontmatter counts; it is set after content_type, replaced where it stands, removed everywhere else, and a second call changes nothing', () => {
  const plain = note('a', P({ source: 'phrases/phrase_003' }));
  assert.equal(isRootNote(plain), false);
  const on = withRoot(plain, true);
  assert.ok(isRootNote(on));
  assert.match(on, /^---\ntype: data\ncontent_type: json\nroot: true\ndescription: /);
  assert.equal(withRoot(on, true), on, 'idempotent');
  assert.equal(withRoot(on, false), plain, 'off restores the note byte for byte');
  assert.equal(withRoot(plain, false), plain);
  for (const text of ['---\nroot: false\n---\nx', '---\nroot: "no"\n---\nx', 'root: true\nno frontmatter', '---\ntype: data\n---\nroot: true in the body']) assert.equal(isRootNote(text), false, text);
  for (const text of ['---\nroot: true\n---\nx', '---\nroot: "true"\n---\nx', '---\nroot: TRUE\n---\nx']) assert.equal(isRootNote(text), true, text);
  assert.equal(withRoot('---\nroot: true\nroot: true\n---\nbody', true), '---\nroot: true\n---\nbody', 'two marks become one');
  assert.equal(withRoot('no frontmatter here', true), 'no frontmatter here');
  assert.equal(withRoot('---\r\ntype: data\r\n---\r\nbody\r\n', true), '---\r\ntype: data\r\nroot: true\r\n---\r\nbody\r\n', 'line endings kept');
  // a write of the note (the controls) keeps the mark: the one renderer keeps every line it does not own
  const rewritten = note('a', P({ source: 'phrases/phrase_004' }));
  assert.ok(isRootNote(withRoot(rewritten, true)));
});

test('the root of a vault: none, one, or many; the messages say which; the commands are offered in a score-first vault only', () => {
  const text = (root: boolean) => note('x', P({ source: 'phrases/phrase_003' }), root);
  assert.deepEqual(rootOf([]), { kind: 'none' });
  assert.deepEqual(rootOf([{ path: 'compositions/a.md', text: text(false) }]), { kind: 'none' });
  assert.deepEqual(rootOf([{ path: 'compositions/a.md', text: text(false) }, { path: 'compositions/b.md', text: text(true) }]), { kind: 'one', path: 'compositions/b.md' });
  assert.deepEqual(rootOf([{ path: 'compositions/b.md', text: text(true) }, { path: 'compositions/a.md', text: text(true) }]), { kind: 'many', paths: ['compositions/a.md', 'compositions/b.md'] });
  assert.match(noRootMessage, /^Open the piece: no composition is the root of this piece yet\. .*Make this composition the root of the piece/);
  assert.equal(manyRootsMessage(['compositions/a.md', 'compositions/b.md']), 'Open the piece: more than one composition is marked as the root (a, b). Keep it on one: open that composition and run "Make this composition the root of the piece".');
  assert.equal(openPieceAvailable({ scoreFirst: true, compositionCount: 1 }), true);
  assert.equal(openPieceAvailable({ scoreFirst: true, compositionCount: 0 }), false);
  assert.equal(openPieceAvailable({ scoreFirst: false, compositionCount: 3 }), false);
  assert.equal(makeRootAvailable({ scoreFirst: true, activePath: 'compositions/a.md' }), true);
  for (const activePath of ['compositions/README.md', 'compositions/x/y.md', 'phrases/phrase_001.md', null]) assert.equal(makeRootAvailable({ scoreFirst: true, activePath }), false, String(activePath));
  assert.equal(makeRootAvailable({ scoreFirst: false, activePath: 'compositions/a.md' }), false);
  assert.equal(newCompositionAvailable({ scoreFirst: true }), true, '2026-11-19-0960: offered in every music vault, even with nothing to play yet (it makes an empty note)');
  assert.equal(newCompositionAvailable({ scoreFirst: false }), false);
  assert.equal(openCompositionAvailable({ scoreFirst: true, activePath: 'compositions/a.md' }), true);
  assert.equal(openCompositionAvailable({ scoreFirst: true, activePath: 'compositions/README.md' }), false);
});

test('moveRoot: the mark goes to the target and leaves every other note; only notes that change come back', () => {
  const a = note('a', P({ source: 'phrases/phrase_003' }), true), b = note('b', P({ source: 'phrases/phrase_004' })), c = note('c', P({ source: 'phrases/phrase_004' }));
  const moved = moveRoot([{ path: 'compositions/a.md', text: a }, { path: 'compositions/b.md', text: b }, { path: 'compositions/c.md', text: c }], 'compositions/b.md');
  assert.deepEqual(moved.map((n) => n.path), ['compositions/a.md', 'compositions/b.md']);
  assert.ok(!isRootNote(moved[0].text) && isRootNote(moved[1].text));
  assert.deepEqual(moveRoot([{ path: 'compositions/a.md', text: a }, { path: 'compositions/b.md', text: b }], 'compositions/a.md'), [], 'already the root: nothing changes');
});

// ---- tying a bar to its section ---------------------------------------------------------------------------------------------------------------------------------------

const xml = (bars: number): string => `<score-partwise><part-list/><part id="P1">${Array.from({ length: bars }, (_, i) => `<measure number="${i + 1}"><attributes/><sound tempo="${i < 2 ? 100 : 120}"/></measure>`).join('')}</part></score-partwise>`;
const SHAPE: CompositionShape = { sections: [{ index: 0, copy: 0, source: 'phrases/phrase_003', length: 2, bars: 2, first: 1 }, { index: 1, copy: 0, source: 'arrangements/arr_001', bars: 2, first: 3 }, { index: 1, copy: 1, source: 'arrangements/arr_001', bars: 2, first: 5 }] };
const LINEAGE = [
  { section: 1, source: 'phrases/phrase_003', bar: 1, tempo_bpm: 100 }, { section: 1, source: 'phrases/phrase_003', bar: 2, tempo_bpm: 100 },
  { section: 2, source: 'arrangements/arr_001', bar: 1, tempo_bpm: 120 }, { section: 2, source: 'arrangements/arr_001', bar: 2, tempo_bpm: 120 },
  { section: 3, source: 'arrangements/arr_001', bar: 1, tempo_bpm: 120 }, { section: 3, source: 'arrangements/arr_001', bar: 2, tempo_bpm: 120 },
];
const payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ type: 'musicxml', content: xml(6), bars_data: new Array(6).fill({}), composition_lineage: LINEAGE, [FORGE_COMPOSITION_KEY]: SHAPE, ...over });

test('the lineage is read from the engine and checked: exactly one entry per bar, each with a section and a bar; anything else is a sentence, not a crash', () => {
  assert.equal(typeof readCompositionLineage(LINEAGE, 6), 'object');
  assert.deepEqual((readCompositionLineage(LINEAGE, 6) as unknown[]).length, 6);
  assert.equal(readCompositionLineage(undefined, 6), 'the engine did not say which section made each bar');
  assert.equal(readCompositionLineage(LINEAGE, 5), 'the engine gave 6 bar(s) of lineage for 5 bar(s)');
  assert.equal(readCompositionLineage([{ section: 0, bar: 1 }], 1), 'the lineage of bar 1 is not in the shape the plugin reads');
  assert.equal(readCompositionLineage([{ section: 1, bar: 1.5 }], 1), 'the lineage of bar 1 is not in the shape the plugin reads');
  assert.equal(readCompositionLineage([null], 1), 'the lineage of bar 1 is not in the shape the plugin reads');
});

test('annotateCompositionPayload: an id on every measure and, per bar, the section, the note it plays, the bar of that note, the tempo; and every refusal says why instead of tying nothing silently', () => {
  const r = annotateCompositionPayload('compositions/comp_001', payload());
  assert.deepEqual(r.problems, []);
  assert.deepEqual(Object.keys(r.map), ['ph_bar_1', 'ph_bar_2', 'ph_bar_3', 'ph_bar_4', 'ph_bar_5', 'ph_bar_6']);
  assert.match(String(r.payload.content), /<measure number="1" id="ph_bar_1">/);
  const p4 = r.map.ph_bar_4;
  assert.equal(p4.role, COMPOSITION_BAR_ROLE); assert.equal(p4.noteId, 'compositions/comp_001');
  assert.deepEqual(p4.params, { bar: 4, bars: 6, section: 2, sections: 2, pass: 1, passes: 2, source: 'arrangements/arr_001', sourceBar: 2, sourceBars: 2, tempo: 120, tempoBpm: 120 });       // 2026-10-31-1135: section/sections are the lines of the composition, pass/passes the plays of a line
  assert.equal(r.map.ph_bar_5.params.pass, 2);
  assert.equal(r.map.ph_bar_5.params.section, 2, 'a repeat is the same section of the json');
  const none = (over: Record<string, unknown>, problem: RegExp) => { const x = annotateCompositionPayload('compositions/c', payload(over)); assert.deepEqual(x.map, {}); assert.match(x.problems[0], problem); };
  none({ bars_data: [] }, /did not return the bars/); none({ bars_data: undefined }, /did not return the bars/);
  none({ composition_lineage: undefined }, /did not say which section/); none({ composition_lineage: LINEAGE.slice(1) }, /gave 5 bar/);
  none({ [FORGE_COMPOSITION_KEY]: undefined }, /does not say which sections/); none({ [FORGE_COMPOSITION_KEY]: { sections: SHAPE.sections.slice(0, 1) } }, /names section 2, which the Score does not have/);
  none({ content: undefined }, /no MusicXML/); none({ content: xml(5) }, /5 bars but the phrase asks for 6/);
  assert.equal(annotateCompositionPayload('c', payload({ content: undefined, multi_staff_content: xml(6) })).problems.length, 0, 'the multi-staff view decides when there is one');
});

test('the pin rule: a bar of a composition sends the notes pane to the note its SECTION plays (the real pinnedNoteFor), the lineage stack names bar, section, note and composition, and the bars a note plays are found', () => {
  const map = annotateCompositionPayload('compositions/comp_001', payload()).map;
  assert.deepEqual(pinnedNoteFor(map.ph_bar_1), { noteId: 'phrases/phrase_003', reason: 'section 1' });
  assert.deepEqual(pinnedNoteFor(map.ph_bar_6), { noteId: 'arrangements/arr_001', reason: 'section 2' });       // (it was 'section 3': the engine's count, a repeat counted as a section)
  assert.deepEqual(compositionPinnedNote(map.ph_bar_3), { noteId: 'arrangements/arr_001', reason: 'section 2' });
  assert.equal(compositionPinnedNote({ ...map.ph_bar_3, role: 'phrase-bar' }), null);
  assert.equal(compositionPinnedNote({ ...map.ph_bar_3, params: { ...map.ph_bar_3.params, source: '' } }), null);
  const stack = compositionLineageOf(map.ph_bar_5);
  assert.deepEqual(stack.map((e) => e.kind), ['bar', 'note', 'note']);
  assert.equal(stack[0].text, 'bar 5 of 6 · section 2 of 2, pass 2 of 2 · arr_001 bar 1 of 2 · played at 120 bpm');
  assert.deepEqual(stack.slice(1).map((e) => [e.text, (e as { noteId?: string }).noteId]), [['arrangement arr_001', 'arrangements/arr_001'], ['composition comp_001', 'compositions/comp_001']]);
  assert.equal(compositionLineageOf(map.ph_bar_1)[0].text, 'bar 1 of 6 · section 1 of 2 · phrase_003 bar 1 of 2 · played at 100 bpm');
  assert.deepEqual(compositionLineageOf({ noteId: 'x', role: 'other', params: {} })[0], { kind: 'hit', text: 'other' });
  const lineage = readCompositionLineage(LINEAGE, 6) as Exclude<ReturnType<typeof readCompositionLineage>, string>;
  assert.deepEqual(barsPlayedFrom(lineage, 'arrangements/arr_001'), [3, 4, 5, 6]);
  assert.deepEqual(barIdsPlayedFrom(lineage, 'phrases/phrase_003'), ['ph_bar_1', 'ph_bar_2']);
  assert.deepEqual(barsPlayedFrom(lineage, 'compositions/comp_001'), [], 'a note no section plays lights nothing');
});

// ---- the tree -----------------------------------------------------------------------------------------------------------------------------------------------------------------

test('the tree: one row per section of the json with its note, bars and plays; the bars each covers once the Score is drawn; a nested composition shows its sections one level below; a repeat is one row', () => {
  const p = P({ source: 'phrases/phrase_003', length: 2 }, { source: 'arrangements/arr_001', repeat: 1 }, { source: 'compositions/intro' });
  const inner = { 'compositions/intro': P({ source: 'phrases/phrase_004', length: 4 }, { source: 'compositions/deeper' }) };
  const rows = treeRows(p, SHAPE, inner);
  assert.deepEqual(rows.map((r) => [r.depth, r.section, r.label, r.kind]), [[0, 1, 'phrase_003', 'phrase'], [0, 2, 'arr_001', 'arrangement'], [0, 3, 'intro', 'composition'], [1, null, 'phrase_004', 'phrase'], [1, null, 'deeper', 'composition']]);
  assert.deepEqual(rows.map((r) => r.detail), ['2 bars · bars 1-2', 'all its bars · 2 passes · bars 3-6', 'all its bars', '4 bars', 'all its bars']);
  assert.equal(treeText(treeRows(P({ source: 'phrases/phrase_003', length: 1 }), null, {})), '1 phrase_003 (phrase) · 1 bar');
  assert.equal(treeText(rows).split('\n')[3], '  - phrase_004 (phrase) · 4 bars');
  assert.deepEqual(treeRows(P({ source: 'compositions/gone' }), null, { 'compositions/gone': undefined }).map((r) => r.depth), [0], 'a composition that cannot be read has no children');
});

test('the strip DOM: a row per section with its chip, indented one level for a nested one; focusing and clicking a chip tell the owner and the pointer resting tells nobody (2026-11-19-0800); the note a pin came from is emphasised; none hides it', () => {
  const doc = win.document;
  const parent = doc.createElement('div'); doc.body.appendChild(parent);
  const told: string[] = [];
  const strip = mountCompositionStrip(parent, { onHover: (r) => told.push(`hover ${r ? r.noteId : 'none'}`), onClick: (r) => told.push(`click ${r.noteId}`) });
  assert.equal(strip.el.style.display, 'none', 'no rows: hidden');
  strip.show(treeRows(P({ source: 'phrases/phrase_003', length: 2 }, { source: 'compositions/intro' }), SHAPE, { 'compositions/intro': P({ source: 'phrases/phrase_004' }) }));
  assert.equal(strip.el.style.display, '');
  const rows = [...strip.el.querySelectorAll('.forge-composition-row')] as any[];
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.dataset.depth), ['0', '0', '1']);
  assert.equal(rows[2].style.paddingLeft, `${COMPOSITION_INDENT_PX}px`);
  assert.equal(rows[0].style.paddingLeft, '0px');
  assert.deepEqual(rows.map((r) => r.querySelector('.forge-composition-index').textContent), ['1', '2', '↳']);
  assert.deepEqual(rows.map((r) => r.querySelector('.forge-composition-index').style.width), ['20px', '20px', '20px'], 'the same width for every number, so the chips line up (found in real Chrome: the arrow was wider than the 1)');
  const chip = rows[0].querySelector('button');
  assert.equal(visibleText(chip), 'phrase_003'); assert.equal(chip.dataset.note, 'phrases/phrase_003'); assert.equal(accessibleName(chip), 'Open phrase_003'); assert.equal(chip.hasAttribute('aria-label'), false);
  assert.equal(rows[0].querySelector('.forge-composition-detail').textContent, '2 bars · bars 1-2');
  chip.dispatchEvent(new win.Event('mouseenter')); chip.dispatchEvent(new win.Event('mouseover')); chip.dispatchEvent(new win.Event('mouseleave'));
  assert.deepEqual(told, [], '2026-11-19-0800: the pointer resting on a chip (or leaving it) tells the owner nothing');
  chip.dispatchEvent(new win.Event('focus')); chip.dispatchEvent(new win.Event('blur')); chip.dispatchEvent(new win.Event('click', { bubbles: true }));
  assert.deepEqual(told, ['hover phrases/phrase_003', 'hover none', 'click phrases/phrase_003']);
  strip.emphasise(['phrases/phrase_003']);
  assert.equal(chip.style.fontWeight, '700'); assert.ok(chip.classList.contains('forge-structure-chip-on'));
  assert.equal(rows[1].querySelector('button').style.fontWeight, '');
  strip.emphasise(null);
  assert.equal(chip.style.fontWeight, '');
  strip.show([]);
  assert.equal(strip.el.style.display, 'none'); assert.equal(strip.el.querySelectorAll('.forge-composition-row').length, 0, 'no row left'); assert.equal(auditLabels(strip.el).length, 0, 'the strip\'s own hidden name is still there and still points at itself');
  strip.dispose();
  assert.equal(parent.children.length, 0);
});

// ---- the dialog ---------------------------------------------------------------------------------------------------------------------------------------------------------------

function dialog(over: { hasRoot?: boolean; create?: (c: any) => Promise<any> } = {}) {
  const doc = win.document;
  const parent = doc.createElement('div'); doc.body.appendChild(parent);
  const seen: any[] = [];
  let closed = 0;
  const handle = mountCompositionDialog(parent, {
    phrases: ['phrases/phrase_003', 'phrases/phrase_004'], arrangements: ['arrangements/arr_001'], compositions: ['compositions/intro'], hasRoot: over.hasRoot ?? false, nextName: 'comp_001',
    create: over.create ?? (async (c) => { seen.push(c); return { ok: true, path: 'compositions/comp_001.md' }; }), close: () => { closed++; },
  });
  const q = (sel: string) => parent.querySelector(sel) as any;
  const rows = () => [...parent.querySelectorAll('.forge-comp-section')] as any[];
  const click = (e: any) => e.dispatchEvent(new win.Event('click', { bubbles: true }));
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { parent, handle, seen, closed: () => closed, q, rows, click, settle };
}

// ---- 2026-10-31-1100 mutation pass A: the branches the first tests did not pin --------------------------------------------------------------------------------------------

import { NEW_COMPOSITION_COMMAND_ID, NEW_COMPOSITION_COMMAND_NAME, OPEN_COMPOSITION_COMMAND_ID, OPEN_COMPOSITION_COMMAND_NAME } from './composition-flow-core.ts';
import { COMPOSITION_INSPECTOR_HINT } from './composition-nav-core.ts';
import { accessibleName, auditLabels, visibleText } from './test-support/accessible-name.ts';

test('the root mark goes right after content_type even when content_type is the first line', () => {
  assert.equal(withRoot('---\ncontent_type: json\ndescription: x\n---\nbody', true), '---\ncontent_type: json\nroot: true\ndescription: x\n---\nbody');
  assert.equal(withRoot('---\ntype: data\ncontent_type: json\ndescription: x\n---\nbody', true), '---\ntype: data\ncontent_type: json\nroot: true\ndescription: x\n---\nbody');
});

test('the command ids and names are the ones the palette and the tests of the real plugin use', () => {
  assert.deepEqual([NEW_COMPOSITION_COMMAND_ID, NEW_COMPOSITION_COMMAND_NAME, OPEN_COMPOSITION_COMMAND_ID, OPEN_COMPOSITION_COMMAND_NAME], ['new-composition', 'New composition', 'open-composition-as-score', 'Open composition as Score']);
  assert.equal(COMPOSITION_BAR_ROLE, 'composition-bar');
  assert.equal(FORGE_COMPOSITION_KEY, 'forge_composition');
  assert.equal(COMPOSITION_INSPECTOR_HINT, 'Click a bar to see which section and which note it came from. Arrow keys move between bars; Esc lets go.');
});

test('the tree: a one-bar section says "bar N"; only a composition note is opened for children', () => {
  const one: CompositionShape = { sections: [{ index: 0, copy: 0, source: 'phrases/phrase_003', length: 1, bars: 1, first: 3 }] };
  assert.equal(treeRows(P({ source: 'phrases/phrase_003', length: 1 }), one, {})[0].detail, '1 bar · bar 3');
  const rows = treeRows(P({ source: 'phrases/phrase_003' }), null, { 'phrases/phrase_003': P({ source: 'phrases/phrase_004' }) });
  assert.deepEqual(rows.map((r) => r.depth), [0], 'a phrase never shows children, whatever the map holds');
});

test('annotateCompositionPayload: the Kit view is tied when there is one and absent when there is not; a throw inside is one sentence and one console line; a tempo that is not a number is left out', () => {
  const withKit = annotateCompositionPayload('compositions/c', payload({ kit_content: xml(6) }));
  assert.deepEqual(withKit.problems, []);
  assert.match(String(withKit.payload.kit_content), /<measure number="1" id="ph_bar_1">/);
  assert.deepEqual(withKit.kitProblems, []);
  const withoutKit = annotateCompositionPayload('compositions/c', payload());
  assert.equal('kit_content' in withoutKit.payload, false);
  const badKit = annotateCompositionPayload('compositions/c', payload({ kit_content: xml(5) }));
  assert.equal(badKit.problems.length, 0); assert.equal(badKit.kitProblems.length, 1); assert.equal(badKit.payload.kit_content, xml(5), 'a Kit view that cannot be tied is left as it was');
  const nonStringKit = annotateCompositionPayload('compositions/c', payload({ kit_content: 7 }));
  assert.equal(nonStringKit.payload.kit_content, 7);
  assert.deepEqual(nonStringKit.kitProblems, []);
  const logged: unknown[][] = []; const real = console.error; console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const threw = annotateCompositionPayload('compositions/c', payload({ [FORGE_COMPOSITION_KEY]: { sections: [null, null, null] } }));
    assert.deepEqual(threw.map, {});
    assert.match(threw.problems[0], /^the bars could not be tied to the composition \(.+\)$/);
    assert.equal(logged.length, 1); assert.equal(logged[0][0], 'annotateCompositionPayload failed');
  } finally { console.error = real; }
  const weird = LINEAGE.map((l, i) => (i === 0 ? { ...l, tempo_bpm: NaN } : i === 1 ? { ...l, tempo_bpm: Infinity } : i === 2 ? { ...l, tempo_bpm: 'fast' } : l));
  const read = readCompositionLineage(weird, 6) as Exclude<ReturnType<typeof readCompositionLineage>, string>;
  assert.deepEqual(read.slice(0, 3).map((l) => l.tempo_bpm), [null, null, null]);
  assert.equal(read[3].tempo_bpm, 120);
});

test('the lineage stack: the kind of note, its open label, a fractional tempo, a source with a one-character name, and every thing the params may lack', () => {
  const map = annotateCompositionPayload('compositions/comp_001', payload()).map;
  const first = compositionLineageOf(map.ph_bar_1);
  assert.deepEqual(first.slice(1).map((e) => [e.kind, e.text, (e as { openLabel?: string }).openLabel]), [['note', 'phrase phrase_003', 'Open phrase_003'], ['note', 'composition comp_001', 'Open comp_001']]);
  assert.equal(first[0].covers, 'self');
  const inner = { ...map.ph_bar_1, params: { ...map.ph_bar_1.params, source: 'compositions/intro' } };
  assert.equal(compositionLineageOf(inner)[1].text, 'composition intro');
  assert.deepEqual(compositionLineageOf({ noteId: 'x', role: 'other', params: {} }), [{ kind: 'hit', text: 'other' }, { kind: 'note', text: 'x', noteId: 'x' }]);
  const base = map.ph_bar_1.params;
  const with_ = (over: Record<string, unknown>) => compositionLineageOf({ ...map.ph_bar_1, params: { ...base, ...over } });
  assert.match(with_({ tempoBpm: 97.5 })[0].text, / · played at 97\.5 bpm$/);
  assert.match(with_({ tempoBpm: 100 })[0].text, / · played at 100 bpm$/);
  assert.doesNotMatch(with_({ tempoBpm: NaN })[0].text, /played at/);
  assert.doesNotMatch(with_({ tempoBpm: null })[0].text, /played at/);
  const lone = with_({ source: 'x', sourceBar: 1, sourceBars: 4 });
  assert.equal(lone[0].text, 'bar 1 of 6 · section 1 of 2 · x bar 1 of 4 · played at 100 bpm');
  assert.equal(lone.length, 3);
  for (const source of ['', 5, null, undefined]) {
    const out = with_({ source });
    assert.equal(out.length, 2, `source ${String(source)}: only the composition is linked`);
    assert.equal(out[0].text, 'bar 1 of 6 · section 1 of 2 · played at 100 bpm');
    assert.equal(out[1].text, 'composition comp_001');
  }
  assert.equal(with_({ sourceBar: NaN })[0].text, 'bar 1 of 6 · section 1 of 2 · phrase_003 · played at 100 bpm');
  assert.equal(with_({ sourceBars: NaN })[0].text, 'bar 1 of 6 · section 1 of 2 · phrase_003 bar 1 · played at 100 bpm');
  assert.doesNotMatch(with_({ copy: NaN })[0].text, /play \d/);
  assert.doesNotMatch(with_({ copy: 0 })[0].text, /play \d/);
  assert.deepEqual(compositionPinnedNote({ ...map.ph_bar_1, params: { ...base, source: 'x' } }), { noteId: 'x', reason: 'section 1' });
});

// ---- 2026-10-31-1135 (CCQA smoke 10, B3): ONE count of sections ---------------------------------------------------------------------------------------------------------------------
// The header said "2 sections", the tree strip "played 2 times", the Inspector "section 2 of 3" (the repeat counted as a section there). A SECTION is a line of the composition; a repeat of it is a PASS of that section: one function
// (sectionPositionOf, composition-core.ts) feeds the Inspector, and the header and the strip count the same lines. Proven over a SET of compositions (card 20), with a non-vacuity partner.

const bars2 = (n: number): string => `<score-partwise><part-list/><part id="P1">${Array.from({ length: n }, (_, i) => `<measure number="${i + 1}"><attributes/><sound tempo="100"/></measure>`).join('')}</part></score-partwise>`;
/** The payload the producer would give for `p`, every section of 2 bars: the engine's lineage (repeats counted) and the producer's shape. */
function payloadFor(p: CompositionParams): { payload: Record<string, unknown>; shape: CompositionShape } {
  const expanded = expandSections(p);
  const shape: CompositionShape = { sections: expanded.map((e, i) => ({ ...e, bars: 2, first: i * 2 + 1 })) };
  const lineage = expanded.flatMap((e, i) => [1, 2].map((bar) => ({ section: i + 1, source: e.source, bar, tempo_bpm: 100 })));
  const n = expanded.length * 2;
  return { shape, payload: { type: 'musicxml', content: bars2(n), bars_data: new Array(n).fill({}), composition_lineage: lineage, [FORGE_COMPOSITION_KEY]: shape } };
}
const SET: Array<[string, CompositionParams]> = [
  ['one plain section', P({ source: 'phrases/phrase_003' })],
  ['two plain sections', P({ source: 'phrases/phrase_003' }, { source: 'arrangements/arr_001' })],
  ['the smoke-10 piece: a section, then a section played again', P({ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', length: 4, repeat: 1 })],
  ['a repeat on the first section', P({ source: 'phrases/phrase_003', repeat: 2 }, { source: 'arrangements/arr_001' })],
  ['every section repeated, differently', P({ source: 'phrases/phrase_003', repeat: 1 }, { source: 'arrangements/arr_001', repeat: 3 }, { source: 'compositions/intro', repeat: 2 })],
];

test('ONE COUNT over a set of compositions: the header says N sections, the strip has N section rows, and EVERY bar\'s Inspector line says "section k of N" (k, N the lines of the composition) with "pass j of m" only for a repeated section', () => {
  for (const [label, p] of SET) {
    const n = p.sections.length;
    const { payload, shape } = payloadFor(p);
    assert.equal(compositionHeader(p, null), `${n} ${n === 1 ? 'section' : 'sections'}`, label);
    const rows = treeRows(p, shape, {}).filter((r) => r.depth === 0);
    assert.equal(rows.length, n, label);
    const r = annotateCompositionPayload('compositions/comp_001', payload);
    assert.deepEqual(r.problems, [], label);
    let bar = 0;
    expandSections(p).forEach((e) => {
      const passes = (p.sections[e.index].repeat ?? 0) + 1;
      for (let b = 0; b < 2; b++) {
        bar++;
        const text = compositionLineageOf(r.map[`ph_bar_${bar}`])[0].text;
        const expectSection = `section ${e.index + 1} of ${n}`;
        assert.ok(text.includes(` · ${expectSection}${passes > 1 ? `, pass ${e.copy + 1} of ${passes}` : ' ·'}`), `${label}: bar ${bar}: ${text}`);
        assert.doesNotMatch(text, /play \d+ of the section/, 'the old wording is gone');
        assert.equal(compositionPinnedNote(r.map[`ph_bar_${bar}`])?.reason, `section ${e.index + 1}`, `${label}: the notes pane is sent for the SECTION the person counts`);
      }
    });
    // the strip says the same number of passes the Inspector counts
    p.sections.forEach((s, i) => { const detail = rows[i].detail; if (s.repeat !== undefined) assert.match(detail, new RegExp(`${s.repeat + 1} passes`), label); else assert.doesNotMatch(detail, /pass/, label); });
  }
});

test('the smoke-10 piece, word for word: a bar of the second section\'s second pass reads "section 2 of 2, pass 2 of 2" (it read "section 2 of 3")', () => {
  const p = SET[2][1];
  const { payload } = payloadFor(p);
  const map = annotateCompositionPayload('compositions/comp_001', payload).map;
  assert.equal(compositionLineageOf(map.ph_bar_5)[0].text, 'bar 5 of 6 · section 2 of 2, pass 2 of 2 · arr_001 bar 1 of 2 · played at 100 bpm');
  assert.equal(compositionLineageOf(map.ph_bar_1)[0].text, 'bar 1 of 6 · section 1 of 2 · phrase_003 bar 1 of 2 · played at 100 bpm');
});

// Added by the 1135 mutation pass: the position text of a bar's lineage line, with and without the pass numbers the annotator may not have written.
test('compositionLineageOf: a bar without pass numbers reads "section 1 of 2" (a pass of 1 of 1 is not said); a bar with the section but no section COUNT does not invent one', () => {
  const base = { noteId: 'compositions/comp_001', role: COMPOSITION_BAR_ROLE };
  assert.equal(compositionLineageOf({ ...base, params: { bar: 1, bars: 4, section: 1, sections: 2, source: 'phrases/phrase_003' } })[0].text, 'bar 1 of 4 · section 1 of 2 · phrase_003');
  const partial = compositionLineageOf({ ...base, params: { bar: 1, bars: 4, section: 1, source: 'phrases/phrase_003' } })[0].text;
  assert.doesNotMatch(partial, /NaN|null|pass/, partial);
});

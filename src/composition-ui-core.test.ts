// 2026-10-31-1100 (score_first M17b) - the pure cores and plain-DOM pieces around the composition tab, without Obsidian: the root mark (composition-root-core), what "New composition" does with a vault (composition-flow-core, ports stood
// in), how a bar of the Score is tied to its section and its note (composition-nav-core, on a MusicXML made for the purpose and on the real pin rule), the tree of the strip (composition-strip-core + the DOM a happy-dom test mounts) and the
// dialog (composition-dialog-dom). The connection to the real plugin is proven in compositions-wiring.test.ts, the engine in composition-engine.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { isRootNote, makeRootAvailable, manyRootsMessage, noRootMessage, openPieceAvailable, rootOf, withRoot } from './composition-root-core.ts';
import { createComposition, moveRoot, newCompositionAvailable, openCompositionAvailable } from './composition-flow-core.ts';
import { FORGE_COMPOSITION_KEY, newCompositionNote, readCompositionNote, type CompositionParams, type CompositionShape } from './composition-core.ts';
import { COMPOSITION_BAR_ROLE, annotateCompositionPayload, barIdsPlayedFrom, barsPlayedFrom, compositionLineageOf, compositionPinnedNote, readCompositionLineage } from './composition-nav-core.ts';
import { treeRows, treeText } from './composition-strip-core.ts';
import { COMPOSITION_INDENT_PX, mountCompositionStrip } from './composition-strip-dom.ts';
import { mountCompositionDialog } from './composition-dialog-dom.ts';
import { pinnedNoteFor } from './linked-panes-core.ts';
import type { CreatePorts } from './kit-arrangement-flow-core.ts';

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
  assert.equal(newCompositionAvailable({ scoreFirst: true, phraseCount: 0, arrangementCount: 0 }), false);
  assert.equal(newCompositionAvailable({ scoreFirst: true, phraseCount: 0, arrangementCount: 1 }), true);
  assert.equal(newCompositionAvailable({ scoreFirst: false, phraseCount: 5, arrangementCount: 1 }), false);
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

// ---- New composition's flow -------------------------------------------------------------------------------------------------------------------------------------------

function ports(over: Partial<CreatePorts<string>> & { existing?: string[]; failFirst?: string } = {}) {
  const made: Array<[string, string]> = [], folders: string[] = [], notices: string[] = [], traces: string[] = [], opened: string[] = [];
  const existing = new Set(over.existing ?? []);
  let failed = false;
  const p: CreatePorts<string> = {
    folderExists: (f) => existing.has(f), createFolder: async (f) => { folders.push(f); existing.add(f); }, exists: (path) => existing.has(path),
    create: async (path, content) => { if (over.failFirst === path && !failed) { failed = true; existing.add(path); throw new Error('File already exists.'); } if (existing.has(path)) throw new Error('File already exists.'); existing.add(path); made.push([path, content]); return path; },
    open: async (f) => { opened.push(f); }, notify: (m) => { notices.push(m); }, trace: (l) => { traces.push(l); }, isAlreadyExists: (e) => /already exists/.test((e as Error).message), ...over,
  };
  return { p, made, folders, notices, traces, opened };
}

test('createComposition: validates, makes the folder, picks the next free comp_NNN, writes the note through the one writer, prints the evidence line, opens it, says so', async () => {
  const r = ports();
  const out = await createComposition(r.p, { sections: [{ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', repeat: 2 }] });
  assert.deepEqual(out, { ok: true, path: 'compositions/comp_001.md', name: 'comp_001' });
  assert.deepEqual(r.folders, ['compositions']);
  assert.equal(r.made[0][1], newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', repeat: 2 }] }));
  assert.deepEqual(r.traces, ['[forge-composition] created compositions/comp_001.md sections=phrase_003:8,arr_001x3']);
  assert.deepEqual(r.opened, ['compositions/comp_001.md']);
  assert.deepEqual(r.notices, ['Created compositions/comp_001.md.']);
  const second = ports({ existing: ['compositions', 'compositions/comp_001.md'] });
  assert.equal((await createComposition(second.p, { sections: [{ source: 'phrases/phrase_003' }] })).ok && second.made[0][0], 'compositions/comp_002.md');
  assert.deepEqual(second.folders, [], 'the folder was there');
});

test('createComposition: a name the person chose (letters, digits, _ and -), refused when taken or malformed; a name taken between the check and the write is the next number; the root mark and the hook that moves it', async () => {
  const named = ports();
  const out = await createComposition(named.p, { name: ' intro ', sections: [{ source: 'phrases/phrase_003' }] });
  assert.deepEqual(out, { ok: true, path: 'compositions/intro.md', name: 'intro' });
  const taken = ports({ existing: ['compositions', 'compositions/intro.md'] });
  const refused = await createComposition(taken.p, { name: 'intro', sections: [{ source: 'phrases/phrase_003' }] });
  assert.deepEqual(refused, { ok: false, message: 'New composition: a composition called intro already exists (compositions/intro.md). Pick another name.' });
  assert.deepEqual(taken.notices, [refused.ok === false ? refused.message : '']);
  const bad = await createComposition(ports().p, { name: 'a/b', sections: [{ source: 'phrases/phrase_003' }] });
  assert.deepEqual(bad, { ok: false, message: 'New composition: the name "a/b" can only have letters, digits, _ and -.' });
  const race = ports({ existing: ['compositions'], failFirst: 'compositions/comp_001.md' });
  assert.equal((await createComposition(race.p, { sections: [{ source: 'phrases/phrase_003' }] })).ok && race.made[0][0], 'compositions/comp_002.md');
  const racedName = ports({ existing: ['compositions'], failFirst: 'compositions/intro.md' });
  assert.deepEqual(await createComposition(racedName.p, { name: 'intro', sections: [{ source: 'phrases/phrase_003' }] }), { ok: false, message: 'New composition: a composition called intro already exists (compositions/intro.md). Pick another name.' });
  const rooted = ports();
  const hook: string[] = [];
  await createComposition(rooted.p, { sections: [{ source: 'phrases/phrase_003' }], root: true }, async (path) => { hook.push(path); });
  assert.ok(isRootNote(rooted.made[0][1]), 'the note is born marked');
  assert.deepEqual(hook, ['compositions/comp_001.md']);
  const unrooted = ports();
  await createComposition(unrooted.p, { sections: [{ source: 'phrases/phrase_003' }] }, async (path) => { hook.push(path); });
  assert.ok(!isRootNote(unrooted.made[0][1]));
  assert.equal(hook.length, 1, 'the hook is not called without the mark');
  for (const sections of [[], [{ source: 'bars/bar_001' }], [{ source: 'phrases/phrase_003', length: 0 }]]) {
    const r = ports();
    const o = await createComposition(r.p, { sections });
    assert.equal(o.ok, false);
    assert.equal(r.made.length, 0);
    assert.match(r.notices[0], /^New composition: /);
  }
  const boom = await createComposition(ports({ create: async () => { throw new Error('disk full'); } }).p, { sections: [{ source: 'phrases/phrase_003' }] });
  assert.deepEqual(boom, { ok: false, message: 'New composition failed: disk full' });
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
  assert.deepEqual(p4.params, { bar: 4, bars: 6, section: 2, sections: 3, source: 'arrangements/arr_001', sourceBar: 2, sourceBars: 2, copy: 0, jsonSection: 2, tempo: 120, tempoBpm: 120 });
  assert.equal(r.map.ph_bar_5.params.copy, 1);
  assert.equal(r.map.ph_bar_5.params.jsonSection, 2, 'a repeat is the same section of the json');
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
  assert.deepEqual(pinnedNoteFor(map.ph_bar_6), { noteId: 'arrangements/arr_001', reason: 'section 3' });
  assert.deepEqual(compositionPinnedNote(map.ph_bar_3), { noteId: 'arrangements/arr_001', reason: 'section 2' });
  assert.equal(compositionPinnedNote({ ...map.ph_bar_3, role: 'phrase-bar' }), null);
  assert.equal(compositionPinnedNote({ ...map.ph_bar_3, params: { ...map.ph_bar_3.params, source: '' } }), null);
  const stack = compositionLineageOf(map.ph_bar_5);
  assert.deepEqual(stack.map((e) => e.kind), ['bar', 'note', 'note']);
  assert.equal(stack[0].text, 'bar 5 of 6 · section 3 of 3 · arr_001 bar 1 of 2 · play 2 of the section · played at 120 bpm');
  assert.deepEqual(stack.slice(1).map((e) => [e.text, (e as { noteId?: string }).noteId]), [['arrangement arr_001', 'arrangements/arr_001'], ['composition comp_001', 'compositions/comp_001']]);
  assert.equal(compositionLineageOf(map.ph_bar_1)[0].text, 'bar 1 of 6 · section 1 of 3 · phrase_003 bar 1 of 2 · played at 100 bpm');
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
  assert.deepEqual(rows.map((r) => r.detail), ['2 bars · bars 1-2', 'all its bars · played 2 times · bars 3-6', 'all its bars', '4 bars', 'all its bars']);
  assert.equal(treeText(treeRows(P({ source: 'phrases/phrase_003', length: 1 }), null, {})), '1 phrase_003 (phrase) · 1 bar');
  assert.equal(treeText(rows).split('\n')[3], '  - phrase_004 (phrase) · 4 bars');
  assert.deepEqual(treeRows(P({ source: 'compositions/gone' }), null, { 'compositions/gone': undefined }).map((r) => r.depth), [0], 'a composition that cannot be read has no children');
});

test('the strip DOM: a row per section with its chip, indented one level for a nested one; hovering and clicking a chip tell the owner; the note a pin came from is emphasised; none hides it', () => {
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
  assert.equal(chip.textContent, 'phrase_003'); assert.equal(chip.dataset.note, 'phrases/phrase_003'); assert.equal(chip.getAttribute('aria-label'), 'Open phrase_003');
  assert.equal(rows[0].querySelector('.forge-composition-detail').textContent, '2 bars · bars 1-2');
  chip.dispatchEvent(new win.Event('mouseenter')); chip.dispatchEvent(new win.Event('mouseleave')); chip.dispatchEvent(new win.Event('focus')); chip.dispatchEvent(new win.Event('blur')); chip.dispatchEvent(new win.Event('click', { bubbles: true }));
  assert.deepEqual(told, ['hover phrases/phrase_003', 'hover none', 'hover phrases/phrase_003', 'hover none', 'click phrases/phrase_003']);
  strip.emphasise(['phrases/phrase_003']);
  assert.equal(chip.style.fontWeight, '700'); assert.ok(chip.classList.contains('forge-structure-chip-on'));
  assert.equal(rows[1].querySelector('button').style.fontWeight, '');
  strip.emphasise(null);
  assert.equal(chip.style.fontWeight, '');
  strip.show([]);
  assert.equal(strip.el.style.display, 'none'); assert.equal(strip.el.children.length, 0);
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
    phrases: ['phrases/phrase_003', 'phrases/phrase_004'], arrangements: ['arrangements/arr_001'], compositions: ['compositions/intro'], hasRoot: over.hasRoot ?? false,
    create: over.create ?? (async (c) => { seen.push(c); return { ok: true, path: 'compositions/comp_001.md' }; }), close: () => { closed++; },
  });
  const q = (sel: string) => parent.querySelector(sel) as any;
  const rows = () => [...parent.querySelectorAll('.forge-comp-section')] as any[];
  const click = (e: any) => e.dispatchEvent(new win.Event('click', { bubbles: true }));
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  return { parent, handle, seen, closed: () => closed, q, rows, click, settle };
}

test('the dialog: rows for sections (a phrase, an arrangement or a composition of the vault), reorder and remove, the lead words follow the order, empty bars mean all, the root box starts ticked only when there is no root', async () => {
  const d = dialog();
  assert.equal(d.rows().length, 1);
  assert.deepEqual([...d.parent.querySelectorAll('optgroup')].map((g: any) => g.label), ['Phrases', 'Arrangements', 'Compositions']);
  assert.deepEqual([...d.rows()[0].querySelectorAll('option')].map((o: any) => o.value), ['phrases/phrase_003', 'phrases/phrase_004', 'arrangements/arr_001', 'compositions/intro']);
  assert.equal(d.q('.forge-comp-root').checked, true);
  assert.equal(dialog({ hasRoot: true }).q('.forge-comp-root').checked, false);
  assert.equal(d.rows()[0].querySelector('.forge-comp-remove').hidden, true, 'the only section cannot be removed');
  d.click(d.q('.forge-comp-add')); d.click(d.q('.forge-comp-add'));
  const rows = d.rows();
  assert.deepEqual(rows.map((r: any) => r.querySelector('.forge-comp-lead').textContent), ['Play ', 'Then play ', 'Then play ']);
  rows[0].querySelector('.forge-comp-note').value = 'phrases/phrase_004'; rows[1].querySelector('.forge-comp-note').value = 'arrangements/arr_001'; rows[2].querySelector('.forge-comp-note').value = 'compositions/intro';
  rows[1].querySelector('.forge-comp-length').value = '4'; rows[2].querySelector('.forge-comp-repeat').value = '3';
  assert.equal(rows[0].querySelector('.forge-comp-up').disabled, true); assert.equal(rows[2].querySelector('.forge-comp-down').disabled, true);
  d.click(rows[2].querySelector('.forge-comp-up'));                          // intro moves above the arrangement
  assert.deepEqual(d.rows().map((r: any) => r.querySelector('.forge-comp-note').value), ['phrases/phrase_004', 'compositions/intro', 'arrangements/arr_001']);
  d.click(d.rows()[0].querySelector('.forge-comp-down'));
  assert.deepEqual(d.rows().map((r: any) => r.querySelector('.forge-comp-note').value), ['compositions/intro', 'phrases/phrase_004', 'arrangements/arr_001']);
  d.click(d.rows()[1].querySelector('.forge-comp-remove'));
  d.q('.forge-comp-name').value = ' intro_2 ';
  d.click(d.q('.forge-comp-create'));
  await d.settle();
  assert.deepEqual(d.seen, [{ name: 'intro_2', sections: [{ source: 'compositions/intro', repeat: 3 }, { source: 'arrangements/arr_001', length: 4 }], root: true }]);
  assert.equal(d.closed(), 1, 'success closes the dialog');
  d.handle.dispose();
  assert.equal(d.parent.children.length, 0);
});

test('the dialog: a bar count that is not a whole number is said before anything is created; a refusal of the flow is shown and the dialog stays; a throw is shown; Cancel closes; Create cannot be pressed twice', async () => {
  const d = dialog();
  d.rows()[0].querySelector('.forge-comp-length').value = '2.5';
  d.click(d.q('.forge-comp-create'));
  assert.equal(d.q('.forge-comp-message').textContent, 'Section 1: the bars must be a whole number, 1 or more.');
  assert.deepEqual(d.seen, []);
  d.rows()[0].querySelector('.forge-comp-length').value = '';
  d.rows()[0].querySelector('.forge-comp-repeat').value = '0';
  d.click(d.q('.forge-comp-create'));
  assert.equal(d.q('.forge-comp-message').textContent, 'Section 1: the number of more times must be a whole number, 1 or more.');
  const refused = dialog({ create: async () => ({ ok: false, message: 'New composition: a composition called x already exists.' }) });
  refused.click(refused.q('.forge-comp-create')); await refused.settle();
  assert.equal(refused.q('.forge-comp-message').textContent, 'New composition: a composition called x already exists.');
  assert.equal(refused.closed(), 0);
  const threw = dialog({ create: async () => { throw new Error('boom'); } });
  threw.click(threw.q('.forge-comp-create')); await threw.settle();
  assert.equal(threw.q('.forge-comp-message').textContent, 'New composition failed: boom');
  let calls = 0; let release: () => void = () => {};
  const slow = dialog({ create: () => { calls++; return new Promise((resolve) => { release = () => resolve({ ok: true, path: 'x' }); }); } });
  slow.click(slow.q('.forge-comp-create')); slow.click(slow.q('.forge-comp-create'));
  assert.equal(calls, 1); assert.equal(slow.q('.forge-comp-create').disabled, true);
  release(); await slow.settle();
  assert.equal(slow.q('.forge-comp-create').disabled, false);
  const cancelled = dialog(); cancelled.click(cancelled.q('.forge-comp-cancel'));
  assert.equal(cancelled.closed(), 1);
});

test('what the dialog hands over makes the note the writer makes: through createComposition, the sections read back from the note are the rows', async () => {
  const r = ports();
  const d = dialog({ create: (choice) => createComposition(r.p, choice) });
  d.rows()[0].querySelector('.forge-comp-length').value = '8';
  d.click(d.q('.forge-comp-add'));
  d.rows()[1].querySelector('.forge-comp-note').value = 'arrangements/arr_001';
  d.rows()[1].querySelector('.forge-comp-repeat').value = '2';
  d.click(d.q('.forge-comp-create')); await d.settle();
  const read = readCompositionNote(r.made[0][1]);
  assert.ok(read.ok && JSON.stringify(read.value.sections) === JSON.stringify([{ source: 'phrases/phrase_003', length: 8 }, { source: 'arrangements/arr_001', repeat: 2 }]));
  assert.equal(d.closed(), 1);
});

// ---- 2026-10-31-1100 mutation pass A: the branches the first tests did not pin --------------------------------------------------------------------------------------------

import { NEW_COMPOSITION_COMMAND_ID, NEW_COMPOSITION_COMMAND_NAME, OPEN_COMPOSITION_COMMAND_ID, OPEN_COMPOSITION_COMMAND_NAME } from './composition-flow-core.ts';
import { COMPOSITION_INSPECTOR_HINT } from './composition-nav-core.ts';

test('the root mark goes right after content_type even when content_type is the first line', () => {
  assert.equal(withRoot('---\ncontent_type: json\ndescription: x\n---\nbody', true), '---\ncontent_type: json\nroot: true\ndescription: x\n---\nbody');
  assert.equal(withRoot('---\ntype: data\ncontent_type: json\ndescription: x\n---\nbody', true), '---\ntype: data\ncontent_type: json\nroot: true\ndescription: x\n---\nbody');
});

test('createComposition: a chosen name that is taken is refused BEFORE any write; the folder race and a real folder failure are told apart; twenty refused names end in a sentence, each number tried once', async () => {
  const taken = ports({ existing: ['compositions', 'compositions/intro.md'] });
  const attempts: string[] = [];
  const spy = { ...taken.p, create: async (path: string) => { attempts.push(path); return path; } };
  assert.equal((await createComposition(spy, { name: 'intro', sections: [{ source: 'phrases/phrase_003' }] })).ok, false);
  assert.deepEqual(attempts, [], 'nothing was written');
  const skipped = ports({ existing: ['compositions', 'compositions/comp_001.md'] });
  const tried: string[] = [];
  await createComposition({ ...skipped.p, create: async (path: string) => { tried.push(path); return path; } }, { sections: [{ source: 'phrases/phrase_003' }] });
  assert.deepEqual(tried, ['compositions/comp_002.md'], 'a name the vault has is never tried');
  const folderRace = ports({ createFolder: async () => { throw new Error('Folder already exists.'); } });
  assert.equal((await createComposition(folderRace.p, { sections: [{ source: 'phrases/phrase_003' }] })).ok, true, 'someone made the folder first: carry on');
  const folderBroken = ports({ createFolder: async () => { throw new Error('disk full'); } });
  assert.deepEqual(await createComposition(folderBroken.p, { sections: [{ source: 'phrases/phrase_003' }] }), { ok: false, message: 'New composition failed: disk full' });
  assert.equal(folderBroken.made.length, 0);
  const crowded = ports({ existing: ['compositions'] });
  const names: string[] = [];
  const out = await createComposition({ ...crowded.p, create: async (path: string) => { names.push(path); throw new Error('File already exists.'); } }, { sections: [{ source: 'phrases/phrase_003' }] });
  assert.deepEqual(out, { ok: false, message: 'New composition: could not find a free composition name.' });
  assert.deepEqual(names, Array.from({ length: 20 }, (_, i) => `compositions/comp_${String(i + 1).padStart(3, '0')}.md`), 'twenty tries, each a new number');
  assert.deepEqual(crowded.notices, ['New composition: could not find a free composition name.']);
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
  assert.equal(lone[0].text, 'bar 1 of 6 · section 1 of 3 · x bar 1 of 4 · played at 100 bpm');
  assert.equal(lone.length, 3);
  for (const source of ['', 5, null, undefined]) {
    const out = with_({ source });
    assert.equal(out.length, 2, `source ${String(source)}: only the composition is linked`);
    assert.equal(out[0].text, 'bar 1 of 6 · section 1 of 3 · played at 100 bpm');
    assert.equal(out[1].text, 'composition comp_001');
  }
  assert.equal(with_({ sourceBar: NaN })[0].text, 'bar 1 of 6 · section 1 of 3 · phrase_003 · played at 100 bpm');
  assert.equal(with_({ sourceBars: NaN })[0].text, 'bar 1 of 6 · section 1 of 3 · phrase_003 bar 1 · played at 100 bpm');
  assert.doesNotMatch(with_({ copy: NaN })[0].text, /play \d/);
  assert.doesNotMatch(with_({ copy: 0 })[0].text, /play \d/);
  assert.deepEqual(compositionPinnedNote({ ...map.ph_bar_1, params: { ...base, source: 'x' } }), { noteId: 'x', reason: 'section 1' });
});

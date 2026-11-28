// 2026-11-26-1047 (prompt stack, stage 5; checklists: bootstrap projects/prompt-stack-architecture-design.md stage 5, decision 6): the Description (the numbered list) is the ONLY thing a person edits for a score note. The Recipe and the Python are made
// from it and are read only in effect: a hand edit of either is never read back, the next write of the list makes them again, and the plugin never asks which side to keep. Through the REAL controller.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { DESCRIPTION_DEBOUNCE_MS } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { extractDescription, extractRecipeSection } from './v2-note-core.ts';
import { CUSTOM_BANNER, asCustom, handEditRefusalOf, isCustomNote, pythonTextOf, withLinks } from './phrase-notes-core.ts';
import { handEditStatusSettled, isHandEditRefusal } from './hand-edit-refusal-core.ts';
import { refreshPhraseNoteText } from './phrase-core.ts';
import { writePhraseStrip } from './sentence-list-note-core.ts';
import { applySettingsPatches, newArrangementNote, refreshArrangementNoteText } from './arrangement-core.ts';
import { applyCompositionWrite, newCompositionNote, refreshCompositionNoteText } from './composition-core.ts';
import { copyListNote } from './duplicate-note-core.ts';
import { oldRecipeSourced } from './test-support/old-source-notes.ts';
import { repairForOpen } from './note-open-repair-core.ts';
import { asListNote } from './test-support/phrase-list-fixtures.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const VAULT = { bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: [] as string[], compositions: [] as string[], kits: [] as string[] };
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_007', ...PHRASE_DEFAULTS, bars: 8 };
const START = (): string => asListNote(noteContentFor('phrase_001', EXTEND), 'phrase_001');
const listNote = (p: PhraseParams): string => asListNote(noteContentFor('phrase_001', p), 'phrase_001');
const swap = (text: string, section: string, from: string, to: string): string => { assert.ok(section.includes(from), `the section has "${from}"`); return text.replace(section, section.replace(from, to)); };
const editDesc = (text: string, from: string, to: string): string => swap(text, extractDescription(text), from, to);
/** An edit under one heading only (an arrangement's or a composition's Recipe says the very sentences of its Description). */
const under = (heading: string, text: string, from: string, to: string): string => { const at = text.indexOf(`\n# ${heading}\n`); assert.ok(at > 0 && text.slice(at).includes(from), `the ${heading} has "${from}"`); return text.slice(0, at) + text.slice(at).replace(from, to); };
const editRecipe = (text: string, from: string, to: string): string => under('Recipe', text, from, to);
const editPython = (text: string, from: string, to: string): string => under('Python', text, from, to);

function rig(start: string = START(), opts: { confirm?: boolean | ((message: string) => Promise<boolean>) } = {}) {
  const store = new Map<string, string>([[PATH, start]]);
  let now = 0; const timers: Array<{ id: number; at: number; fn: () => void }> = []; let ids = 0;
  const lines: string[] = [], writes: string[] = [], asked: unknown[] = [], confirms: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => VAULT,
    barNames: () => VAULT.bars, phraseNames: () => VAULT.phrases,
    setTimer: (fn, ms) => { const id = ++ids; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    trace: (l) => lines.push(l), panes: () => panes,
    now: () => 1,          // 2026-11-27-1050 (deliberate): a push records its time in `groups:`; two rigs compared byte for byte share one clock
    askPlan: async (payload: unknown) => { asked.push(payload); return { status: 500, json: {} }; }, configured: () => true,
    ...(opts.confirm !== undefined ? { confirm: async (m: string) => { confirms.push(m); return typeof opts.confirm === 'function' ? opts.confirm(m) : opts.confirm as boolean; } } : {}),
  };
  const ctl = createDescriptionController(ports);
  const advance = async (ms: number) => { now += ms; for (;;) { const due = timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers.splice(timers.indexOf(due), 1); due.fn(); } for (let i = 0; i < 60; i++) await Promise.resolve(); };
  const pane = () => { const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: PATH, contentEl: el }); return el as HTMLElement; };
  const touch = async () => { ctl.modified(PATH); await advance(DESCRIPTION_DEBOUNCE_MS); };
  const click = async (el: HTMLElement, action: string) => { const b = el.querySelector(`[data-action="${action}"]`) as HTMLElement | null; assert.ok(b, `the strip has the button ${action}: ${buttons(el).join(', ')}`); b.click(); await advance(1); };
  return { ctl, store, lines, writes, asked, confirms, advance, pane, touch, click };
}
const msg = (el: HTMLElement): string => el.querySelector('.forge-description-message')?.textContent ?? '';
const buttons = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action') ?? '');
const labels = (el: HTMLElement): string[] => [...el.querySelectorAll('.forge-description-button')].map((b) => b.textContent ?? '');
const GONE = ['update-recipe', 'update-python', 'keep-script', 'revert-generated'];

// ---- C1: the Recipe is not read back ------------------------------------------------------------------------------------------------------------------------------------------------

test('1047 C1: a hand edit of a readable Recipe is NOT read back: nothing is written, the list is as it was, there is no stale strip, no "keep or replace" question and no Recipe button', async () => {
  const r = rig(); const a = r.pane();
  const edited = editRecipe(r.store.get(PATH)!, '8 bars', '6 bars');
  r.store.set(PATH, edited); await r.touch();
  await r.ctl.update(PATH); await r.advance(1);
  assert.deepEqual(r.writes, []);
  assert.equal(r.store.get(PATH), edited);
  assert.doesNotMatch(msg(a), /no longer matches|Keep them|Update from Recipe|The Recipe changed/);
  assert.deepEqual(buttons(a).filter((b) => GONE.includes(b)), []);
  assert.deepEqual(r.lines.filter((l) => l.startsWith('[forge-recipe]')), []);
});

test('1047 C1: the next write of the list makes the Recipe again from the Description and the hand edit is gone', async () => {
  const r = rig();
  r.store.set(PATH, editRecipe(r.store.get(PATH)!, '8 bars', '6 bars')); await r.touch();
  const done = await r.ctl.appendLine(PATH, 'Make it 5 bars long.');
  assert.equal(done.ok, true, done.message);
  assert.ok(!extractRecipeSection(r.store.get(PATH)!)!.includes('6 bars'), 'the hand edit is not in the note any more');
  assert.ok(extractRecipeSection(r.store.get(PATH)!)!.includes('5 bars'), 'the Recipe says what the list says');
});

test('1047 C1: a Description edit beside a Recipe edit is applied as it stands (no both-edited choice): the Recipe is made again from the list', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, editDesc(editRecipe(r.store.get(PATH)!, '8 bars', '6 bars'), '8 bars', '5 bars')); await r.touch();
  assert.equal(r.store.get(PATH), listNote({ ...EXTEND, bars: 5 }));
  assert.equal(a.querySelector('.forge-description-bar'), null);
});

test('1047 C1: opening a note that has only a Recipe (no cache, an empty Description) no longer builds it from the Recipe', () => {
  const text = ['---', 'type: data', 'content_type: json', '---', '', '# Description', '', '# Recipe', '', 'Take [[bar_007]].', 'Repeat it for 8 bars with fills.', '', '# Python', ''].join('\n');
  const out = repairForOpen(text, 'phrase_001', 'phrase', VAULT);
  assert.doesNotMatch(out, /source_facet|recipe_hash|python_hash/);
  assert.match(out, /```json\n\{\}\n```/, 'it gets its empty cache only');
  assert.equal(extractRecipeSection(out)!.trim(), 'Take [[bar_007]].\nRepeat it for 8 bars with fills.', 'the Recipe is left as the person typed it');
  assert.equal(extractDescription(out).trim(), '', 'no list was made up');
});

// ---- C2: the Python is not read back ------------------------------------------------------------------------------------------------------------------------------------------------

test('1047 C2: a hand edit of the Python is NOT read back: a shape the old reader knew is not mapped, an unknown shape does not make the note custom; nothing is written', async () => {
  for (const [from, to] of [['bars=8', 'bars=6'], ['  return bars\n', '  extra = 1\n  return bars\n']] as const) {
    const r = rig(); const a = r.pane();
    const edited = editPython(r.store.get(PATH)!, from, to);
    r.store.set(PATH, edited); await r.touch();
    await r.ctl.update(PATH); await r.advance(1);
    assert.deepEqual(r.writes, [], to);
    assert.equal(r.store.get(PATH), edited);
    assert.equal(isCustomNote(r.store.get(PATH)!), false);
    assert.doesNotMatch(msg(a), /The Python changed|becomes a custom note|Update from Python/);
    assert.deepEqual(buttons(a).filter((b) => GONE.includes(b)), []);
    assert.deepEqual(r.lines.filter((l) => l.startsWith('[forge-python]')), []);
  }
});

test('1047 C2: the next write of the list makes the Python again from the Description and the hand edit is gone', async () => {
  const r = rig();
  r.store.set(PATH, editPython(r.store.get(PATH)!, '  return bars\n', '  extra = 1\n  return bars\n')); await r.touch();
  const done = await r.ctl.appendLine(PATH, 'Make it 5 bars long.');
  assert.equal(done.ok, true, done.message);
  const clean = rig(); assert.equal((await clean.ctl.appendLine(PATH, 'Make it 5 bars long.')).ok, true);
  assert.equal(r.store.get(PATH), clean.store.get(PATH), 'byte for byte the note the same push makes when nothing was edited by hand');
});

test('1047 C2: a CUSTOM note stays what it was: its edited Python is kept as typed, `links:` follows its calls, nothing else moves (existing behaviour, not new)', async () => {
  const start = asCustom(START());
  const r = rig(start); const a = r.pane();
  const edited = editPython(start, '  return bars\n', '  extra = bar_008()\n  return bars\n');
  r.store.set(PATH, edited); await r.touch();
  assert.equal(r.store.get(PATH), withLinks(asCustom(edited), ['bar_007', 'bar_008']));
  assert.equal(msg(a), CUSTOM_BANNER);
});

// ---- C3: the rest of the stale machinery is gone; a hand-edited facet is answered by ONE line, never overwritten by a control --------------------------------------------------------

const LINE = 'This Recipe/Python is generated. Edit the Description, or Detach.';
/** The note `music-sandbox/phrases/phrase_001.md` (2026-11-26): the one score note of the six vaults an older build left Recipe-sourced. Its Description has the line that says its music. */
const SANDBOX_PHRASE_001 = (): string => oldRecipeSourced(asListNote(noteContentFor('phrase_001', { ...EXTEND, bars: 14, tempo_change_pct: 12 }), 'phrase_001'));

test('1047 C3: a custom note shows its banner with no button at all (no way back to the generated note)', async () => {
  const r = rig(asCustom(START())); const a = r.pane();
  await r.ctl.inspect(PATH);
  assert.equal(msg(a), CUSTOM_BANNER);
  assert.deepEqual(buttons(a), []);
  assert.equal('revertGenerated' in r.ctl, false);
});

test('1047 C3: a Description edit beside a Python edit is applied as it stands (no both-edited choice)', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, editDesc(editPython(r.store.get(PATH)!, 'bars=8', 'bars=6'), '8 bars', '5 bars')); await r.touch();
  assert.equal(r.store.get(PATH), listNote({ ...EXTEND, bars: 5 }));
  assert.equal(a.querySelector('.forge-description-bar'), null);
});

test('1047: a control never overwrites a hand-edited Recipe or Python: the strip write, the arrangement and composition writes, "Refresh note links" and a copy are all answered with the ONE line, nothing written', () => {
  const phrase = START();
  for (const edited of [editRecipe(phrase, '8 bars', '6 bars'), editPython(phrase, 'bars=8', 'bars=6')]) {
    assert.deepEqual(writePhraseStrip(edited, 'phrase_001', { ...EXTEND, bars: 4 }, VAULT), { ok: false, message: LINE });
    assert.deepEqual(refreshPhraseNoteText(edited, 'phrase_001'), { ok: false, message: LINE });
    assert.deepEqual(copyListNote(edited, 'phrase_009', 'phrase', VAULT, 'phrase_001'), { ok: false, message: '[[phrase_001]] was not copied: this Recipe/Python is generated. Edit the Description, or Detach.' });
    assert.equal(isHandEditRefusal(LINE), true);
    assert.equal(handEditStatusSettled(LINE, edited), false);
    assert.equal(handEditStatusSettled(LINE, phrase), true);
  }
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] });
  assert.deepEqual(applySettingsPatches(editPython(arr, 'def compute', 'def  compute'), 'arr_001', [[0, { mute: true }]]), { ok: false, message: LINE });
  assert.deepEqual(refreshArrangementNoteText(editRecipe(arr, 'Play', 'play'), 'arr_001'), { ok: false, message: LINE });
  const comp = newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] });
  assert.deepEqual(applyCompositionWrite(editRecipe(comp, 'Play', 'play'), 'comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] }), { ok: false, message: LINE });
  assert.deepEqual(refreshCompositionNoteText(editPython(comp, 'def compute', 'def  compute'), 'comp_001'), { ok: false, message: LINE });
  assert.equal(handEditRefusalOf(editDesc(editRecipe(phrase, '8 bars', '6 bars'), '8 bars', '5 bars'), true), 'Not saved: the Description was edited by hand; press Update from Description first or revert it.', 'the Description keeps its own sentence');
});

test('1047: a hand edit of the Recipe or the Python is answered on the strip by ONE line with OK; OK closes it for that text; a further edit, and a refused control, say it again', async () => {
  for (const edit of [(t: string) => editRecipe(t, '8 bars', '6 bars'), (t: string) => editPython(t, 'bars=8', 'bars=6')]) {
    const r = rig(); const a = r.pane();
    const edited = edit(r.store.get(PATH)!); r.store.set(PATH, edited); await r.touch();
    assert.equal(msg(a), LINE);
    assert.equal(buttons(a).includes('ok'), true);
    await r.click(a, 'ok');
    assert.equal(a.querySelector('.forge-description-bar'), null);
    await r.touch(); await r.ctl.inspect(PATH);
    assert.equal(a.querySelector('.forge-description-bar'), null, 'not said again for the same text');
    r.ctl.refused(PATH); await r.advance(1);
    assert.equal(msg(a), LINE, 'a control was refused: said again');
    await r.click(a, 'ok');
    r.store.set(PATH, edited.replace('# Cache', '# Cache\n')); r.store.set(PATH, r.store.get(PATH)!.replace(/6 bars|bars=6/, (m) => m.replace('6', '7'))); await r.touch();
    assert.equal(msg(a), LINE, 'another hand edit: said again');
    assert.deepEqual(r.writes, []);
  }
});

test('1047: after a push of the list the one line is gone (the facets are generated again); Forge makes them again too, and Cmd/Ctrl+Z gives the hand edit back', async () => {
  const r = rig(); const a = r.pane();
  r.store.set(PATH, editPython(r.store.get(PATH)!, 'bars=8', 'bars=6')); await r.touch();
  assert.equal(msg(a), LINE);
  assert.equal((await r.ctl.appendLine(PATH, 'Make it 5 bars long.')).ok, true); await r.advance(1);
  assert.equal(a.querySelector('.forge-description-bar'), null);

  const f = rig(); const b = f.pane();
  const edited = editRecipe(f.store.get(PATH)!, '8 bars', '6 bars'); f.store.set(PATH, edited); await f.touch();
  const forged = await f.ctl.forge(PATH); await f.advance(1);
  assert.deepEqual(forged, { ok: true, message: 'Forged.', wrote: true });
  assert.equal(f.store.get(PATH), START(), 'the list replayed over the hand edit');
  assert.equal(b.querySelector('.forge-description-bar'), null);
  assert.equal((await f.ctl.undoLast(PATH)).ok, true); await f.advance(1);
  assert.equal(f.store.get(PATH), edited, 'one undo gives the hand-edited Recipe back');
  assert.equal(msg(b), LINE);
});

test('1047: a note an older build left Recipe-sourced (music-sandbox phrases/phrase_001) opens quietly and plays from its Description; the next write makes it Description-sourced, the same music', async () => {
  const old = SANDBOX_PHRASE_001();
  assert.match(old, /^source_facet: recipe$/m);
  assert.equal(extractDescription(old).trim(), '1. Extend [[bar_007]] to 14 bars, repeating with fills, 12 percent faster.');
  const r = rig(old); const a = r.pane();
  assert.equal(repairForOpen(old, 'phrase_001', 'phrase', VAULT), old, 'it has its cache: an open writes nothing');
  await r.ctl.inspect(PATH);
  assert.equal(a.querySelector('.forge-description-bar'), null);
  assert.deepEqual(r.writes, []);
  assert.deepEqual(await r.ctl.forge(PATH).then((x) => x.ok), true);
  assert.equal(r.store.get(PATH), listNote({ ...EXTEND, bars: 14, tempo_change_pct: 12 }), 'played from the Description: the note the list makes, Description-sourced');
  const refreshed = refreshPhraseNoteText(old, 'phrase_001');
  assert.ok(refreshed.ok && /^source_facet: description$/m.test(refreshed.text), '"Refresh note links" no longer keeps the Recipe as a source');
  const noCache = old.slice(0, old.indexOf('# Cache'));
  assert.equal(extractDescription(repairForOpen(noCache, 'phrase_001', 'phrase', VAULT)).trim(), '1. Extend [[bar_007]] to 14 bars, repeating with fills, 12 percent faster.', 'without its cache it is built from the Description');
});

// ---- DETACH: one way, to custom Python ----------------------------------------------------------------------------------------------------------------------------------------------

const CONFIRM = 'Detach makes this note custom Python: the Python as it is now becomes the note, and the Score is made by running it. The controls are switched off and the Description and the Recipe are no longer applied. This cannot be undone.';
const linksOf = (text: string): string[] => [...(/^links:\n((?: {2}- .*\n)+)/m.exec(text)?.[1] ?? '').matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);

test('1047 DETACH asks first, in words that say it cannot be undone; Cancel writes nothing; with no way to ask, nothing is done', async () => {
  const no = rig(START(), { confirm: false });
  await no.ctl.detach(PATH); await no.advance(1);
  assert.deepEqual(no.confirms, [CONFIRM]);
  assert.deepEqual(no.writes, []);
  assert.equal(no.ctl.canDetach(PATH), true);
  const mute = rig();
  await mute.ctl.detach(PATH); await mute.advance(1);
  assert.deepEqual(mute.writes, []);
});

test('1047 DETACH of a plain note: ONE write, the custom note (`python_custom: true`, source python, its Python kept, `links:` from the calls, Description, Recipe and json cache untouched); the banner, no button; one trace line', async () => {
  const r = rig(START(), { confirm: true }); const a = r.pane();
  const before = r.store.get(PATH)!;
  await r.ctl.detach(PATH); await r.advance(1);
  const after = r.store.get(PATH)!;
  assert.deepEqual(r.writes, [PATH]);
  assert.equal(after, withLinks(asCustom(before), ['bar_007']));
  assert.match(after, /^python_custom: true$/m); assert.match(after, /^source_facet: python$/m);
  assert.deepEqual(linksOf(after), ['bar_007']);
  assert.equal(pythonTextOf(after), pythonTextOf(before));
  assert.equal(extractDescription(after), extractDescription(before)); assert.equal(extractRecipeSection(after), extractRecipeSection(before));
  assert.equal(after.slice(after.indexOf('# Description')), before.slice(before.indexOf('# Description')), 'only the front matter changed');
  assert.equal(msg(a), CUSTOM_BANNER); assert.deepEqual(buttons(a), []);
  assert.equal(r.ctl.canDetach(PATH), false);
  assert.deepEqual(r.lines, ['[forge-detach] phrase_001 is now custom Python']);
});

test('1047 DETACH from the strip of a hand-edited Python: the two buttons are `Detach` and `OK`; the Python is kept AS TYPED and `links:` follows its calls (not the old ones)', async () => {
  const r = rig(START(), { confirm: true }); const a = r.pane();
  const edited = editPython(r.store.get(PATH)!, '  base = bar_007()\n', "  base = bar_008()  # bar_099() in a comment is not a call\n  extra = globals()['phrase_003']()\n");
  r.store.set(PATH, edited); await r.touch();
  assert.equal(msg(a), LINE);
  assert.deepEqual(buttons(a), ['detach', 'ok']); assert.deepEqual(labels(a), ['Detach', 'OK']);
  await r.click(a, 'detach');
  const after = r.store.get(PATH)!;
  assert.deepEqual(r.confirms, [CONFIRM]);
  assert.equal(isCustomNote(after), true);
  assert.equal(pythonTextOf(after), pythonTextOf(edited));
  assert.deepEqual(linksOf(after), ['bar_008', 'phrase_003']);
  assert.equal(msg(a), CUSTOM_BANNER); assert.deepEqual(buttons(a), []);
});

test('1047 DETACH has NO WAY BACK: no undo, no Forge, no pushed line, no Description edit and no Revert writes over the custom Python', async () => {
  const r = rig(START(), { confirm: true }); const a = r.pane();
  assert.equal((await r.ctl.appendLine(PATH, 'Make it 5 bars long.')).ok, true); await r.advance(1);
  await r.ctl.detach(PATH); await r.advance(1);
  const custom = r.store.get(PATH)!;
  assert.equal(r.ctl.canUndo(PATH), false); assert.equal(r.ctl.canRedo(PATH), false);
  assert.deepEqual(await r.ctl.undoLast(PATH), { ok: false, message: CUSTOM_BANNER });
  assert.deepEqual(await r.ctl.redoLast(PATH), { ok: false, message: CUSTOM_BANNER });
  assert.deepEqual(await r.ctl.forge(PATH), { ok: false, message: CUSTOM_BANNER, wrote: false });
  assert.deepEqual(await r.ctl.appendLine(PATH, 'Make it 3 bars long.'), { ok: false, message: CUSTOM_BANNER });
  await r.ctl.revert(PATH); await r.advance(1);
  assert.equal(r.store.get(PATH), custom, 'nothing wrote over it');
  const typed = editDesc(custom, '8 bars', '2 bars'); r.store.set(PATH, typed); await r.touch();
  assert.equal(r.store.get(PATH), typed, 'its Description is free text now');
  assert.equal(msg(a), CUSTOM_BANNER);
  // a controller that has never looked at the note (a restart) refuses the same way
  const again = rig(custom);
  assert.deepEqual(await again.ctl.forge(PATH), { ok: false, message: CUSTOM_BANNER, wrote: false });
  assert.deepEqual(await again.ctl.undoLast(PATH), { ok: false, message: CUSTOM_BANNER });
  assert.equal(writePhraseStrip(custom, 'phrase_001', { ...EXTEND, bars: 3 }, VAULT).ok, false);
  assert.deepEqual(again.writes, []);
});

test('1047 DETACH refuses in words, without asking: an already custom note, a note with no Python yet, a read_only note', async () => {
  const empty = ['---', 'type: data', 'content_type: json', '---', '', '# Description', '', '# Recipe', '', '# Python', '', '```python', '', '```', '', '# Cache', '', '```json', '{}', '```', ''].join('\n');
  const readOnly = START().replace('content_type: json\n', 'content_type: json\nread_only: true\n');
  for (const [start, said] of [[asCustom(START()), 'Detach: this note is already custom Python.'], [empty, 'Detach: this note has no Python yet. Say a sentence first.'],
    [readOnly, 'Detach: This note is marked read_only: true, so it will not be edited (constitution D7). Remove that line to edit it.']] as const) {
    const r = rig(start, { confirm: true }); const a = r.pane();
    await r.ctl.detach(PATH); await r.advance(1);
    assert.deepEqual(r.confirms, [], said); assert.deepEqual(r.writes, [], said);
    assert.equal(msg(a), said);
  }
});

test('1047 DETACH decides on the text as it is when the person confirms (an edit made while the question was open is what is kept)', async () => {
  let r!: ReturnType<typeof rig>;
  r = rig(START(), { confirm: async () => { r.store.set(PATH, editPython(r.store.get(PATH)!, 'bars=8', 'bars=2')); return true; } });
  await r.ctl.detach(PATH); await r.advance(1);
  assert.match(pythonTextOf(r.store.get(PATH)!)!, /bars=2/); assert.equal(isCustomNote(r.store.get(PATH)!), true);
});

test('1047 DETACH of an arrangement and of a composition writes the custom note with the calls its Python makes', async () => {
  const arr = newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] });
  const comp = newCompositionNote('comp_001', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'arrangements/arr_001' }] });
  for (const [path, start, links] of [['arrangements/arr_001.md', arr, ['phrase_001']], ['compositions/comp_001.md', comp, ['phrase_001', 'arr_001']]] as const) {
    const r = rig(START(), { confirm: true }); r.store.set(path, start);
    await r.ctl.detach(path); await r.advance(1);
    assert.equal(isCustomNote(r.store.get(path)!), true, path);
    assert.deepEqual(linksOf(r.store.get(path)!), links, path);
  }
});

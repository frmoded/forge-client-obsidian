// 2026-11-13-1209 - BUG: in real Obsidian the prompt box says "Asking the sentence service..." and then NOTHING: no preview, no message, no console trace. Cause (read from description-apply.ts, then reproduced here): the box's
// `rejected` sentence is written nowhere (a rejected box sentence writes nothing, 1203 L47 d), it lives ONLY in the controller's `ui` map. While the request is out (1 to 3 s) Obsidian fires other events that re-read the
// note from disk - a vault `modify` (the debounce timer then runs `evaluate`), `inspect` on a file-open or a layout change - and `evaluate` sees an unchanged Description (`synced`) and DELETES the entry; `ask()` then finds
// `!now` at its first guard and returns without a word. The tests drive `ask` with a service stand-in that answers only when the test says so, fire each event in between, and check: the answer is not lost (the preview
// appears, the trace says a request left and what came back), a genuinely changed note or text still drops it - but VISIBLY (a message under the box and in the strip, and a trace line), and `busy` is cleared on every path.
// The CONTROL runs the same scenarios against a copy of the controller with fix (A) or fix (B) removed: they go red.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController as realFactory, type DescriptionController, type DescriptionPorts } from './description-apply.ts';
import { noteContentFor, type PhraseParams } from './phrase-core.ts';
import { newArrangementNote } from './arrangement-core.ts';
import { newCompositionNote } from './composition-core.ts';
import { extractDescription } from './v2-note-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
type Factory = (ports: DescriptionPorts) => DescriptionController;
type Answer = { status: number; json: unknown };
const PATH = 'phrases/phrase_001.md';
const MIX: PhraseParams = { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.5, threshold: 0.5, ghost: false };
const FREE = 'make bar_007 twelve bars long, a bit slower';
const PLAN_EXTEND = { kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 };
const OK = (plan: unknown): Answer => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null } });
const ASKING = /^\[forge-description\] asking the service about phrase_001$/;
const ASKED = /^\[forge-description\] asked the service about phrase_001 -> /;

function rig(factory: Factory, opts: { path?: string; note?: string; plan?: unknown } = {}) {
  const path = opts.path ?? PATH;
  const store = new Map<string, string>([[path, opts.note ?? noteContentFor('phrase_001', MIX)]]);
  const writes: string[] = [], lines: string[] = [], timers: Array<() => void> = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  let release!: (a: Answer) => void; let requests = 0;
  const ports: DescriptionPorts = {
    read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007', 'bar_008'], phrases: ['phrase_001', 'phrase_003'], arrangements: ['arr_001'], compositions: ['song_1'], kits: ['rock'] }),
    barNames: () => ['bar_007', 'bar_008'], phraseNames: () => ['phrase_001', 'phrase_003'],
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {},
    trace: (l) => lines.push(l), panes: () => panes,
    askPlan: () => { requests++; return new Promise<Answer>((res) => { release = res; }); }, configured: () => true,
  };
  const ctl = factory(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
  const fire = async () => { while (timers.length) timers.shift()!(); await flush(); };           // the debounce timers a `modified` left
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const enter = () => { field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); };
  const strip = () => (el.querySelector('.forge-description-message')?.textContent ?? '');
  const boxState = () => (el.querySelector('.forge-prompt-box-state')?.textContent ?? '');
  const buttons = () => [...el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action'));
  const click = async (action: string) => { (el.querySelector(`[data-action="${action}"]`) as HTMLElement).click(); await flush(); };
  const answer = async (a: Answer) => { release(a); await flush(); };
  const start = async (sentence = FREE) => { await ctl.inspect(path); await flush(); type(sentence); enter(); await flush(); };      // the request is OUT, the service has not answered
  return { ctl, store, writes, lines, el, flush, fire, field, type, enter, strip, boxState, buttons, click, answer, start, requests: () => requests, path };
}
type Rig = ReturnType<typeof rig>;

/** What must hold after an event ran while the request was out and the answer then arrived: the preview, the two trace lines, the box and the strip as they were, nothing written, then Apply writes the note. */
async function survives(factory: Factory, event: (r: Rig) => Promise<void>, label: string): Promise<string[]> {
  const bad: string[] = [];
  const ok = (what: string, cond: unknown) => { if (!cond) bad.push(`${label}: ${what}`); };
  const r = rig(factory);
  await r.start();
  ok('one request left', r.requests() === 1);
  ok('the trace says a request was SENT', r.lines.some((l) => ASKING.test(l)));
  ok('the box says it is asking', /Asking the sentence service/.test(r.boxState()));
  await event(r);
  await r.answer(OK(PLAN_EXTEND));
  ok('the PREVIEW appears', JSON.stringify(r.buttons()) === JSON.stringify(['apply-preview', 'cancel-preview']));
  ok('the preview is the plan\'s (12 bars)', /12 bars/.test(r.el.querySelector('.forge-description-preview-description')?.textContent ?? ''));
  ok('the trace says what came back', r.lines.some((l) => ASKED.test(l) && /extend/.test(l)));
  ok('busy is cleared: the box no longer says asking, Apply is not disabled by it', !/Asking/.test(r.boxState()) && !r.el.querySelector('.forge-prompt-box.is-busy'));
  ok('the box keeps the person\'s text', r.field().value === FREE);
  ok('nothing was written', r.writes.length === 0);
  if (r.buttons().includes('apply-preview')) {
    await r.click('apply-preview');
    ok('Apply on the preview writes the note once', r.writes.length === 1 && /12 bars/.test(extractDescription(r.store.get(PATH)!)));
  }
  return bad;
}

const modifyEvent = async (r: Rig) => { r.ctl.modified(r.path); await r.fire(); };                                // (a) a vault `modify` of the note, then the 600 ms debounce
const inspectEvent = async (r: Rig) => { await r.ctl.inspect(r.path); await r.flush(); };                          // (b) `file-open` / a layout change: inspect
const refreshEvent = async (r: Rig) => { r.ctl.modified(r.path); await r.flush(); };                               // (c) the vault `modify` itself: the box refreshes from disk at once (the timer has not fired)
const reactivateEvent = async (r: Rig) => { await r.ctl.inspect(r.path); await r.ctl.inspectOpen(); r.ctl.syncBars(); await r.flush(); };   // (d) the tab is activated again
const cacheWriteEvent = async (r: Rig) => {                                                                        // a write that changes the note's TEXT but not its Description (the json cache, the links)
  r.store.set(r.path, r.store.get(r.path)!.replace('```json', '```json\n'));
  r.ctl.modified(r.path); await r.fire();
};

async function allSurvive(factory: Factory): Promise<string[]> {
  return [
    ...(await survives(factory, async () => {}, 'no event (the baseline)')),
    ...(await survives(factory, modifyEvent, '(a) modify + debounce')),
    ...(await survives(factory, inspectEvent, '(b) inspect')),
    ...(await survives(factory, refreshEvent, '(c) modify, refreshBoxes only')),
    ...(await survives(factory, reactivateEvent, '(d) tab re-activated')),
    ...(await survives(factory, cacheWriteEvent, 'a cache write: the text changes, the Description does not')),
    ...(await survives(factory, async (r) => { await modifyEvent(r); await inspectEvent(r); await reactivateEvent(r); await refreshEvent(r); }, 'all of them, one after another')),
  ];
}

/** A genuinely changed note or text still drops the answer, but never silently. */
async function dropsVisibly(factory: Factory): Promise<string[]> {
  const bad: string[] = [];
  const ok = (what: string, cond: unknown) => { if (!cond) bad.push(what); };
  // the person typed on in the box while the service thought
  const t = rig(factory); await t.start();
  t.type(FREE + ' and louder'); await t.answer(OK(PLAN_EXTEND));
  ok('typed on: no preview', !t.buttons().includes('apply-preview'));
  ok('typed on: the strip says so', t.strip() === 'The Description changed while the service was thinking; its suggestion was dropped.');
  ok('typed on: the BOX says so too', /changed|ask again/i.test(t.boxState()) && !/Asking/.test(t.boxState()));
  ok('typed on: a trace line says it was dropped and why', t.lines.some((l) => ASKED.test(l) && /dropped: /.test(l)));
  ok('typed on: nothing written, the text kept', t.writes.length === 0 && t.field().value === FREE + ' and louder');
  // somebody else changed the Description on disk while the service thought (the sentence was sent over the old one)
  const d = rig(factory); await d.start();
  d.store.set(d.path, noteContentFor('phrase_001', { ...MIX, weight: 0.9 })); d.ctl.modified(d.path); await d.fire();
  await d.answer(OK(PLAN_EXTEND));
  ok('disk changed: no preview', !d.buttons().includes('apply-preview'));
  ok('disk changed: the strip says the answer came back after the text changed', /The answer came back after the text changed; ask again\./.test(d.strip()));
  ok('disk changed: the box says it too', /after the text changed; ask again/.test(d.boxState()) && !/Asking/.test(d.boxState()));
  ok('disk changed: a trace line says dropped and why', d.lines.some((l) => ASKED.test(l) && /dropped: /.test(l)));
  ok('disk changed: nothing was written by the answer', d.writes.length === 0);
  // the service said no: still said, still traced (this path was already visible; it must stay so)
  const n = rig(factory); await n.start();
  await n.answer({ status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'That bar does not exist.' } });
  ok('a refusal: said in the strip and traced, busy cleared', /That bar does not exist/.test(n.strip()) && n.lines.some((l) => ASKED.test(l) && /refused/.test(l)) && !/Asking/.test(n.boxState()));
  return bad;
}

test('REPRODUCTION + FIX: an event that re-reads the note while the request is out (a modify and its debounce, inspect, a refresh, a re-activated tab, a cache write) no longer loses the answer: the preview appears, the trace says a request left and what came back', async () => {
  assert.deepEqual(await allSurvive(realFactory), []);
});

test('a genuinely changed box text or a Description changed by somebody else still drops the answer - VISIBLY: a message in the strip and under the box, a trace line saying why, busy cleared, nothing written', async () => {
  assert.deepEqual(await dropsVisibly(realFactory), []);
});

test('arrangements and compositions are covered the same way: an interleaved modify + inspect does not lose the answer', async () => {
  const PLAN_ARR = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] };
  const PLAN_COMP = { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'phrases/phrase_003', repeat: 1 }] };
  for (const [p, note, plan, sentence, name] of [
    ['arrangements/arr_001.md', newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }] }), PLAN_ARR, 'rock plays phrase three', 'arr_001'],
    ['compositions/song_1.md', newCompositionNote('song_1', { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }] }), PLAN_COMP, 'one then three twice', 'song_1'],
  ] as const) {
    const r = rig(realFactory, { path: p, note });
    await r.start(sentence);
    assert.equal(r.requests(), 1, name);
    r.ctl.modified(p); await r.fire(); await r.ctl.inspect(p); await r.flush();
    await r.answer(OK(plan));
    assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview'], `${name}: the preview appears`);
    assert.ok(r.lines.some((l) => l.includes(`asking the service about ${name}`)) && r.lines.some((l) => l.includes(`asked the service about ${name} -> ${plan.kind}`)), `${name}: both trace lines`);
    await r.click('apply-preview');
    assert.equal(r.writes.length, 1, `${name}: applied once`);
  }
});

test('a box-owned entry is released by the person, not by an event: Cancel, editing the text, and applying the box each end it; a plain Description that is wrong is still evaluated as before (P3)', async () => {
  const r = rig(realFactory); await r.start();
  r.type(FREE + ' x'); await r.answer(OK(PLAN_EXTEND));                           // typed on: dropped visibly, the entry is no longer held
  await r.ctl.inspect(r.path); await r.flush();
  assert.ok(!r.buttons().includes('apply-preview'));
  // Cancel releases a preview: a later inspect then clears the strip as it always did
  const c = rig(realFactory); await c.start(); await c.answer(OK(PLAN_EXTEND));
  await c.click('cancel-preview');
  await c.ctl.inspect(c.path); await c.flush();
  assert.equal(c.buttons().length, 0, 'after Cancel the next inspect finds the note synced and the strip goes');
  // a hand-wrong Description on disk (the strip flow, no box) is evaluated and shown exactly as before
  const bad = noteContentFor('phrase_001', MIX); const w = rig(realFactory, { note: bad.replace(extractDescription(bad), 'Mix the two bars somehow') });
  await w.ctl.inspect(w.path); await w.flush();
  assert.match(w.strip(), /line 1, column \d+/);
  assert.deepEqual(w.buttons(), ['revert', 'ask']);
});

// ---- the CONTROL: the same scenarios against a copy of the controller with a fix removed must go red -------------------------------------------------------------------------------------------

/** A copy of description-apply.ts with `from` replaced by `to`, its relative imports made absolute, loaded as a module of its own (a scratch directory this test creates and removes). */
async function damagedFactory(from: string, to: string): Promise<Factory> {
  const src = path.resolve(import.meta.dirname, 'description-apply.ts');
  let text = fs.readFileSync(src, 'utf8');
  assert.ok(text.includes(from), `the control's premise: description-apply.ts contains ${from.slice(0, 60)}...`);
  text = text.replace(from, to).replace(/from '\.\/([^']+)'/g, (_m, f) => `from '${pathToFileURL(path.resolve(import.meta.dirname, f)).href}'`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-control-1209-'));
  try {
    const file = path.join(dir, 'description-apply-damaged.ts');
    fs.writeFileSync(file, text);
    return (await import(pathToFileURL(file).href)).createDescriptionController as Factory;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('CONTROL: without fix (A) the box-owned entry is deleted again and the events lose the answer; without fix (B) a dropped answer is silent again; the undamaged controller passes both', async () => {
  const guardA = "if (held?.fromBox && (held.busy || held.preview)";                 // fix (A): evaluate leaves a box-owned entry alone
  const noA = await damagedFactory(guardA, 'if (false && held?.fromBox && (held.busy || held.preview)');
  assert.ok((await allSurvive(noA)).length > 0, 'without (A) the interleaved events lose the answer');
  const traceB = "ports.trace(askedServiceLine(basename(path), `dropped: ${why}`));";  // fix (B): every drop is traced and said
  const noB = await damagedFactory(traceB, '/* no trace */');
  assert.ok((await dropsVisibly(noB)).length > 0, 'without (B) a drop leaves no trace');
  const noBox = await damagedFactory('      setBoxNote(path, message);\n', '');                                  // fix (B), the message under the box
  assert.ok((await dropsVisibly(noBox)).length > 0, 'without the line under the box a drop is not said there');
  const noStrip = await damagedFactory("      notices.set(path, { message, text: disk }); syncBars();", '      void disk;');       // fix (B), the message in the strip when the entry is gone
  assert.ok((await dropsVisibly(noStrip)).length > 0, 'without the notice the strip says nothing when the entry is gone');
  const noSent = await damagedFactory('    ports.trace(askingServiceLine(basename(path)));', '');                               // fix (C), the send is traced
  assert.ok((await allSurvive(noSent)).length > 0, 'without (C) nothing says a request left');
  assert.deepEqual(await allSurvive(realFactory), [], 'the undamaged controller passes the survival scenarios');
  assert.deepEqual(await dropsVisibly(realFactory), [], 'and the visible-drop scenarios');
});

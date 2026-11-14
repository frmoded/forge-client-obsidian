// 2026-11-12-1206 - the prompt box and the strip's Ask button now reach the sentence service for an ARRANGEMENT and a COMPOSITION too (forge-transpile 0.2.48), through the SAME controller path as a phrase: the grammar first (free, instant), the
// service only after the grammar said no, only on Apply (or the explicit Ask), ONCE, a PREVIEW first, nothing written until it is applied. The service is a STAND-IN here (never the real one); its answers are the ones forge-transpile 0.2.48
// gives. A service older than 0.2.48 is told apart by the version its answer carries and costs the person one sentence, not a note.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dialogButtons, dialogClick, dialogEntries, dialogLast } from './test-support/dialog-view.ts';
import { Window } from 'happy-dom';

import { createDescriptionController, type DescriptionPorts } from './description-apply.ts';
import { newArrangementNote, readArrangementNote, arrangementRecipeSteps } from './arrangement-core.ts';
import { newCompositionNote, readCompositionNote, type CompositionParams } from './composition-core.ts';
import { describe } from './phrase-describe-core.ts';
import { extractDescription } from './v2-note-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const ARR = 'arrangements/arr_001.md', COMP = 'compositions/song_1.md';
const FREE_ARR = 'rock plays phrase one and latin plays phrase two, latin a bit quieter';
const FREE_COMP = 'first the verse phrase, then the arrangement for four bars, twice';
type Answer = { status: number; json: unknown };
const OK = (plan: unknown, version: string | null = '0.2.48'): Answer => ({ status: 200, json: { ok: true, parsed_ok: true, plan, error: null, ...(version !== null ? { version } : {}) } });
const PLAN_ARR = { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', volume: 60 }] };
const PLAN_COMP = { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }, { source: 'arrangements/arr_001', length: 4, repeat: 1 }] };
const ARR_NOTE = (): string => newArrangementNote('arr_001', { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_003' }] });
const COMP_START: CompositionParams = { kind: 'composition', sections: [{ source: 'phrases/phrase_003' }] };
const COMP_NOTE = (): string => newCompositionNote('song_1', COMP_START);

function rig(opts: { service?: (payload: any) => Promise<Answer>; configured?: boolean; path: string; note: string; extra?: Record<string, string>; version?: () => Promise<string | null>; compositions?: string[] }) {
  const store = new Map<string, string>([[opts.path, opts.note], ...Object.entries(opts.extra ?? {})]);
  const writes: string[] = [], asked: any[] = [], reads: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports: DescriptionPorts = {
    read: async (p) => { reads.push(p); const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) { store.set(p, next); writes.push(p); } },
    vault: () => ({ bars: ['bar_007'], phrases: ['phrase_001', 'phrase_002', 'phrase_003'], arrangements: ['arr_001'], compositions: opts.compositions ?? ['song_1', 'song_2'], kits: ['rock', 'latin'] }),
    barNames: () => ['bar_007'], phraseNames: () => ['phrase_001', 'phrase_002', 'phrase_003'],
    setTimer: () => 0, clearTimer: () => {},
    trace: () => {}, panes: () => panes,
    ...(opts.version !== undefined ? { serviceVersion: opts.version } : {}),
    ...(opts.service !== undefined ? { askPlan: async (payload: any) => { asked.push(payload); return opts.service!(payload); }, configured: () => opts.configured !== false } : {}),
  };
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const score = win.document.createElement('div'); score.className = 'forge-rhythm-edit-score'; el.appendChild(score);
  panes.push({ path: opts.path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const enter = async () => { field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await flush(); };
  const strip = () => dialogLast(el);                // 2026-11-13-1214: a box sentence's outcome is said in the dialog, no longer in the strip
  const buttons = () => dialogButtons(el);
  const click = async (action: string) => { dialogClick(el, action as 'apply-preview' | 'cancel-preview'); await flush(); };
  const ready = async () => { await ctl.inspect(opts.path); await flush(); };
  return { ctl, store, writes, asked, reads, el, flush, field, type, enter, strip, buttons, click, ready, path: opts.path };
}

test('ARRANGEMENT: a free sentence the grammar rejects calls the service ONCE on Apply, with the arrangement request (family, kits, phrases, no bars); the PREVIEW is the description and recipe of the plan; nothing is written', async () => {
  const r = rig({ path: ARR, note: ARR_NOTE(), service: async () => OK(PLAN_ARR) });
  await r.ready();
  r.type(FREE_ARR); await r.enter();
  assert.equal(r.asked.length, 1, 'exactly one request');
  assert.deepEqual(r.asked[0], { sentence: FREE_ARR, bars: [], phrases: ['phrase_001', 'phrase_002', 'phrase_003'], family: 'arrangement', kits: ['latin', 'rock'] });
  assert.deepEqual(r.writes, [], 'a preview writes nothing');
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  const parsed = { kind: 'arrangement' as const, tracks: PLAN_ARR.tracks };
  assert.equal(r.el.querySelector('.forge-chat-suggestion-description')!.textContent, describe(parsed));
  assert.equal(r.el.querySelector('.forge-chat-suggestion-recipe')!.textContent, arrangementRecipeSteps(parsed).join('\n'));
  assert.match(r.el.querySelector('.forge-chat-suggestion-description')!.textContent!, /Play \[\[phrase_001\]\] on the \[\[rock\]\] kit\./);
  assert.equal(r.field().value, FREE_ARR, 'the box keeps the text');
});

test('ARRANGEMENT: applying the preview writes the note once (the arrangement the preview showed) and the box shows the CANONICAL sentence', async () => {
  const r = rig({ path: ARR, note: ARR_NOTE(), service: async () => OK(PLAN_ARR) });
  await r.ready();
  r.type(FREE_ARR); await r.enter(); await r.click('apply-preview');
  assert.deepEqual(r.writes, [ARR]);
  const read = readArrangementNote(r.store.get(ARR)!);
  assert.ok(read.ok); assert.deepEqual(read.value.tracks, PLAN_ARR.tracks);
  assert.equal(r.field().value, extractDescription(r.store.get(ARR)!));
  assert.notEqual(r.field().value, FREE_ARR);
  assert.match(r.strip(), /^Applied \(/, '2026-11-13-1214: the dialog says what was applied, the strip has nothing');
});

test('COMPOSITION: the same path - one request (family, phrases, arrangements, compositions, the note being planned), a preview, one write, the canonical sentence in the box', async () => {
  const r = rig({ path: COMP, note: COMP_NOTE(), service: async () => OK(PLAN_COMP) });
  await r.ready();
  r.type(FREE_COMP); await r.enter();
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.asked[0], { sentence: FREE_COMP, bars: [], phrases: ['phrase_001', 'phrase_002', 'phrase_003'], family: 'composition', arrangements: ['arr_001'], compositions: ['song_1', 'song_2'], note: 'compositions/song_1' });
  assert.deepEqual(r.writes, []);
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
  assert.equal(r.el.querySelector('.forge-chat-suggestion-description')!.textContent, describe(PLAN_COMP as CompositionParams));
  await r.click('apply-preview');
  assert.deepEqual(r.writes, [COMP]);
  const read = readCompositionNote(r.store.get(COMP)!);
  assert.ok(read.ok); assert.deepEqual(read.value.sections, PLAN_COMP.sections);
  assert.equal(r.field().value, extractDescription(r.store.get(COMP)!));
});

test('Cancel writes nothing, the text stays, and no second request was made (arrangement and composition)', async () => {
  for (const [path, note, plan, free] of [[ARR, ARR_NOTE(), PLAN_ARR, FREE_ARR], [COMP, COMP_NOTE(), PLAN_COMP, FREE_COMP]] as const) {
    const r = rig({ path, note, service: async () => OK(plan) });
    await r.ready();
    r.type(free); await r.enter(); await r.click('cancel-preview');
    assert.deepEqual(r.writes, []);
    assert.equal(r.field().value, free);
    assert.deepEqual(r.buttons(), [], '2026-11-13-1214: the dialog\'s suggestion was used (Cancelled); no strip, no explicit Ask for a box sentence');
    assert.equal(r.asked.length, 1);
  }
});

test('grammar-accepted text NEVER calls the service for an arrangement or a composition: it applies as in 1203', async () => {
  const a = rig({ path: ARR, note: ARR_NOTE(), service: async () => OK(PLAN_ARR) });
  await a.ready();
  a.type('Play [[phrase_001]] on the [[rock]] kit. Play [[phrase_002]] on the [[latin]] kit. Together.'); await a.enter();
  assert.deepEqual(a.asked, []); assert.equal(a.writes.length, 1);
  const c = rig({ path: COMP, note: COMP_NOTE(), service: async () => OK(PLAN_COMP) });
  await c.ready();
  c.type('Play [[phrase_001]]. Then play [[phrase_002]].'); await c.enter();
  assert.deepEqual(c.asked, []); assert.equal(c.writes.length, 1);
});

test('TYPING never calls the service for an arrangement or a composition: not on input, not on Shift+Enter; only Apply does', async () => {
  for (const [path, note, free] of [[ARR, ARR_NOTE(), FREE_ARR], [COMP, COMP_NOTE(), FREE_COMP]] as const) {
    const r = rig({ path, note, service: async () => OK(PLAN_ARR) });
    await r.ready();
    for (const t of ['r', 'ro', free.slice(0, 10), free]) { r.type(t); await r.flush(); }
    r.field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })); await r.flush();
    assert.deepEqual(r.asked, []);
  }
});

test('NOT configured, or no service at all: the plain error with line and column, the service never called (arrangement and composition)', async () => {
  for (const [path, note, free] of [[ARR, ARR_NOTE(), FREE_ARR], [COMP, COMP_NOTE(), FREE_COMP]] as const) {
    for (const r of [rig({ path, note, service: async () => OK(PLAN_ARR), configured: false }), rig({ path, note })]) {
      await r.ready();
      r.type(free); await r.enter();
      assert.deepEqual(r.asked, []);
      assert.ok(dialogEntries(r.el).some((e) => e.kind === 'rejected' && /line 1, column \d+/.test(e.text)), 'the dialog says where');
      assert.equal(r.field().value, free);
    }
  }
});

test('THE VERSION GATE (the answer carries it): a 0.2.47 service gets the old-service sentence in the strip - no preview, no write, the text kept - for both kinds, even when it sends a plan', async () => {
  for (const [path, note, plan, free] of [[ARR, ARR_NOTE(), PLAN_ARR, FREE_ARR], [COMP, COMP_NOTE(), PLAN_COMP, FREE_COMP]] as const) {
    const r = rig({ path, note, service: async () => OK(plan, '0.2.47') });
    await r.ready();
    r.type(free); await r.enter();
    assert.equal(r.asked.length, 1);
    assert.match(r.strip(), /does not plan arrangements or compositions yet \(it needs version 0\.2\.48 or newer; this one is 0\.2\.47\)/);
    assert.deepEqual(r.writes, []);
    assert.ok(!r.buttons().includes('apply-preview'));
    assert.equal(r.field().value, free);
  }
});

test('THE VERSION GATE (no version in the answer): a refusal makes the controller ask the service\'s /health version once; an old one gets the old-service sentence, a new one gets the service\'s own words', async () => {
  const refusal: Answer = { status: 200, json: { ok: false, parsed_ok: true, plan: null, error: 'This vault has no bars yet, so there is nothing to build a phrase from. Make a bar in the Beat Box first.' } };
  let asks = 0;
  const old = rig({ path: ARR, note: ARR_NOTE(), service: async () => refusal, version: async () => { asks++; return '0.2.40'; } });
  await old.ready(); old.type(FREE_ARR); await old.enter();
  assert.equal(asks, 1);
  assert.match(old.strip(), /needs version 0\.2\.48 or newer; this one is 0\.2\.40/);
  const fresh = rig({ path: ARR, note: ARR_NOTE(), service: async () => refusal, version: async () => '0.2.50' });
  await fresh.ready(); fresh.type(FREE_ARR); await fresh.enter();
  assert.match(fresh.strip(), /no bars yet/, 'a new service\'s own refusal is shown as it is');
  const unknown = rig({ path: ARR, note: ARR_NOTE(), service: async () => refusal, version: async () => { throw new Error('offline'); } });
  await unknown.ready(); unknown.type(FREE_ARR); await unknown.enter();
  assert.match(unknown.strip(), /no bars yet/, 'a version that cannot be read is not "old"');
  assert.deepEqual(unknown.writes, []);
});

test('SECOND BOUNDARY through the box: a plan naming a kit the vault does not have, and a composition that plays itself, are refused in the dialog - no preview, no write', async () => {
  const kit = rig({ path: ARR, note: ARR_NOTE(), service: async () => OK({ kind: 'arrangement', tracks: [{ kit: 'jazz', phrase: 'phrase_001' }] }) });
  await kit.ready(); kit.type(FREE_ARR); await kit.enter();
  assert.equal(kit.strip(), 'The service refused: "jazz" is not a kit in this vault.');
  assert.deepEqual(kit.writes, []); assert.ok(!kit.buttons().includes('apply-preview'));
  const loop = rig({ path: COMP, note: COMP_NOTE(), service: async () => OK({ kind: 'composition', sections: [{ source: 'compositions/song_1' }] }) });
  await loop.ready(); loop.type(FREE_COMP); await loop.enter();
  assert.equal(loop.strip(), 'The service refused: The composition "song_1" cannot play itself; that would loop.');
  assert.deepEqual(loop.writes, []);
});

test('LOOP THROUGH THE VAULT: song_2 plays song_1, so a plan that makes song_1 play song_2 is refused from song_2\'s own sections (read from the vault), nothing written', async () => {
  const song2 = newCompositionNote('song_2', { kind: 'composition', sections: [{ source: 'compositions/song_1' }] });
  const r = rig({ path: COMP, note: COMP_NOTE(), extra: { 'compositions/song_2.md': song2 }, service: async () => OK({ kind: 'composition', sections: [{ source: 'compositions/song_2' }] }) });
  await r.ready(); r.type(FREE_COMP); await r.enter();
  assert.match(r.strip(), /^The service refused: The composition song_1 loops back to this composition or is nested more than 6 deep\.$/);
  assert.deepEqual(r.writes, []); assert.ok(!r.buttons().includes('apply-preview'));
  assert.ok(r.reads.includes('compositions/song_2.md'), 'the vault was asked');
  // the same plan is fine when song_2 does not loop back
  const ok = rig({ path: COMP, note: COMP_NOTE(), extra: { 'compositions/song_2.md': newCompositionNote('song_2', { kind: 'composition', sections: [{ source: 'phrases/phrase_001' }] }) }, service: async () => OK({ kind: 'composition', sections: [{ source: 'compositions/song_2' }] }) });
  await ok.ready(); ok.type(FREE_COMP); await ok.enter();
  assert.deepEqual(ok.buttons(), ['apply-preview', 'cancel-preview']);
});

test('the strip\'s explicit Ask button is offered for a rejected arrangement and composition Description (not only a phrase), and asks the same way', async () => {
  const r = rig({ path: ARR, note: ARR_NOTE(), service: async () => OK(PLAN_ARR) });
  const pane = r.el;
  r.store.set(ARR, r.store.get(ARR)!.replace(extractDescription(r.store.get(ARR)!), 'Play [[phrase_003]] on the [[rock]] kit'));   // a hand edit the grammar rejects
  await r.ctl.inspect(ARR); r.ctl.syncBars(); await r.flush();
  const stripButtons = (): string[] => [...r.el.querySelectorAll('.forge-description-button')].map((b) => b.getAttribute('data-action') ?? '');     // a HAND edit has no box: its outcome stays in the strip at the top (2026-11-13-1214)
  assert.deepEqual(stripButtons(), ['revert', 'ask']);
  (r.el.querySelector('[data-action="ask"]') as HTMLElement).click(); await r.flush();
  assert.equal(r.asked.length, 1);
  assert.equal(r.asked[0].family, 'arrangement');
  assert.deepEqual(stripButtons(), ['apply-preview', 'cancel-preview']);
  assert.deepEqual(r.writes, []);
  void pane;
});

test('ONE request in flight: a second Apply while the service thinks does nothing (arrangement)', async () => {
  let release!: (a: Answer) => void;
  const r = rig({ path: ARR, note: ARR_NOTE(), service: () => new Promise<Answer>((res) => { release = res; }) });
  await r.ready(); r.type(FREE_ARR);
  r.field().dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await r.flush();
  assert.match(r.el.querySelector('.forge-prompt-box-state')!.textContent!, /Asking the sentence service/);
  await r.enter(); (r.el.querySelector('.forge-prompt-box-apply') as HTMLElement).click(); await r.flush();
  assert.equal(r.asked.length, 1);
  release(OK(PLAN_ARR)); await r.flush();
  assert.equal(r.asked.length, 1);
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview']);
});

test('P3: a PHRASE request is exactly what it was - no family, no kits, no arrangements, no compositions, no note', async () => {
  const { noteContentFor } = await import('./phrase-core.ts');
  const MIX = { kind: 'mix' as const, a: 'bar_007', b: 'bar_007', weight: 0.5, threshold: 0.5, ghost: false };
  const r = rig({ path: 'phrases/phrase_001.md', note: noteContentFor('phrase_001', MIX), service: async () => OK({ kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 }, '0.2.47') });
  await r.ready(); r.type('make bar_007 twelve bars long, a bit slower'); await r.enter();
  assert.equal(r.asked.length, 1);
  assert.deepEqual(Object.keys(r.asked[0]).sort(), ['bars', 'phrases', 'sentence']);
  assert.deepEqual(r.buttons(), ['apply-preview', 'cancel-preview'], 'an OLD service (0.2.47) still plans a phrase: the version gate is for the new kinds only');
});

test('WIRING: the plugin\'s description controller is given the service-version port (description-wiring.ts, called by score-first.ts with the plugin\'s hooks), so a version-less refusal asks /health in the real plugin too', async () => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const { descriptionPortsFor } = await import('./description-wiring.ts');
  const env = { read: async () => '', process: async () => {}, basenamesIn: () => [], panes: () => [], setTimer: () => 0, clearTimer: () => {}, trace: () => {}, warn: () => {} };
  assert.equal(await descriptionPortsFor(env, { serviceVersion: async () => '0.2.41' }).serviceVersion!(), '0.2.41');
  assert.equal(await descriptionPortsFor(env, {}).serviceVersion!(), null, 'no hook: unknown, never old');
  const src = fs.readFileSync(path.resolve(import.meta.dirname, 'score-first.ts'), 'utf8');
  const at = src.indexOf('createDescriptionController(descriptionPortsFor(');
  assert.ok(at > 0, 'score-first.ts builds the controller through descriptionPortsFor');
  assert.match(src.slice(at, at + 3500), /\}, hooks\)\);/, 'and hands it the plugin\'s hooks');
});

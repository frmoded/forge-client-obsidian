// 2026-11-20-1004 (THE FAILED-PROMPT REVIEW QUEUE, phase 1) - on the surface a person uses: the REAL controller, composer and dialog; the queue's port is a recorder. A sentence typed in a composer that ends UNPROCESSED (the grammar cannot read it AND
// the service gives nothing: not offered, not set up, refused, an error, unreachable, a cancelled ask, a cancelled plan) is handed to the port ONCE with the grammar's words and the service result; a sentence that is processed (read, repaired by
// "did you mean", answered by the service and applied, a question asked back) is NEVER recorded. P3: with no port (setting OFF) the dialog is byte for byte what it is. The personal table is offered through "did you mean". Written RED first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { dialogEntries } from './test-support/dialog-view.ts';
import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { emptyArrangementNote, emptyPhraseNote } from './empty-note-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { readBarLines } from './bar-list-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES, asListNote } from './test-support/phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './test-support/bar-list-fixtures.ts';
import type { FailureInput } from './failed-prompt-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PH = 'phrases/phrase_001.md', ARR = 'arrangements/arr_001.md', BAR = 'bars/bar_001.md';
const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
type Svc = (payload: Record<string, unknown>) => Promise<{ status: number; json: unknown }>;

function rig(opts: { path?: string; service?: Svc | 'absent'; configured?: boolean; port?: boolean; known?: Record<string, string[]>; drawn?: number }) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>();
  for (const b of PHRASE_VAULT.bars) store.set(`bars/${b}.md`, PLAYGROUND_BARS[b] ?? PLAYGROUND_BARS['bar_001']);
  for (const [n, t] of Object.entries(PLAYGROUND_PHRASES)) store.set(`phrases/${n}.md`, asListNote(t, n));
  store.set('kits/rock.md', '---\ntype: data\ncontent_type: json\n---\n'); store.set(ARR, emptyArrangementNote('arr_001'));
  store.set(path, path.startsWith('arrangements/') ? emptyArrangementNote('x') : path.startsWith('bars/') ? PLAYGROUND_BARS['bar_001'] : emptyPhraseNote('x'));
  const records: FailureInput[] = []; let requests = 0; const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const hooks: Record<string, unknown> = { composerAutoApply: () => true };
  if (opts.service !== 'absent' && opts.service !== undefined) { hooks.askPlan = async (p: Record<string, unknown>) => { requests++; return (opts.service as Svc)(p); }; hooks.planConfigured = () => opts.configured !== false; }
  if (opts.port !== false) hooks.failedPrompts = { record: (i: FailureInput) => { records.push(JSON.parse(JSON.stringify(i))); }, known: (s: string) => opts.known?.[s.trim().toLowerCase().replace(/[.!?]+$/, '')] ?? null };
  const ports = {
    ...descriptionPortsFor({
      read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
      process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
      basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
      panes: () => panes, setTimer: () => 1, clearTimer: () => {}, trace: () => {}, warn: () => {},
    }, hooks as never),
    drawSeed: () => 7,
  };
  const ctl = createDescriptionController(ports as never);
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  if (opts.drawn !== undefined) { const host = win.document.createElement('div'); host.className = 'forge-rhythm-score-host'; host.innerHTML = `<svg>${'<g class="measure"></g>'.repeat(opts.drawn)}</svg>`; el.appendChild(host); }
  panes.push({ path, contentEl: el, tab: true });
  const flush = async () => { for (let i = 0; i < 400; i++) await Promise.resolve(); };
  const field = () => el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const press = async (init: Record<string, unknown>) => { field().dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })); await flush(); };
  const say = async (s: string) => { type(s); await press({ key: 'Enter' }); };
  const list = () => (path.startsWith('bars/') ? (readBarLines(store.get(path)!)?.lines ?? []).filter((l) => !/^Start with /.test(l)) : extractDescription(store.get(path)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, '')));
  return { ctl, el, records, requests: () => requests, say, press, list, texts: () => dialogEntries(el).map((e) => e.text), kinds: () => dialogEntries(el).map((e) => e.kind), ready: async () => { await ctl.inspect(path); await flush(); }, flush };
}
const none: Svc = async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan: null, error: 'I could not turn that sentence into a phrase.' } });

test('a sentence neither the grammar nor a service can read: ONE record with the typed sentence, the note\'s lines, the grammar\'s words and column, and `none` (no service in this build)', async () => {
  const r = rig({ service: 'absent', drawn: 4 }); await r.ready(); await r.say(EXTEND); r.records.length = 0;
  await r.say('swap the second and third bars');
  assert.equal(r.records.length, 1); const rec = r.records[0];
  assert.equal(rec.kind, 'phrase'); assert.equal(rec.sentence, 'swap the second and third bars'); assert.deepEqual(rec.lines, [EXTEND]); assert.equal(rec.barCount, 4);
  assert.match(rec.grammarError!.message, /Expected/); assert.equal(rec.grammarError!.column, 1); assert.equal(rec.service.result, 'none'); assert.match(rec.service.text ?? '', /not available/);
});

test('a service that is not set up: `not-set-up`', async () => {
  const r = rig({ service: none, configured: false }); await r.ready(); await r.say('swap them please');
  assert.equal(r.requests(), 0); assert.equal(r.records.length, 1); assert.equal(r.records[0].service.result, 'not-set-up'); assert.match(r.records[0].service.text ?? '', /not set up/);
});

test('the service refuses (answers no plan): `refused` with its words; an error status: `error:<code>`; unreachable: `error:unreachable`', async () => {
  const a = rig({ service: none }); await a.ready(); await a.say('swap them please');
  assert.equal(a.records[0].service.result, 'refused'); assert.match(a.records[0].service.text ?? '', /could not turn that sentence/);
  for (const [status, want] of [[401, 'error:401'], [503, 'error:503'], [404, 'error:404']] as const) {
    const r = rig({ service: async () => ({ status, json: { detail: 'x' } }) }); await r.ready(); await r.say('swap them please'); assert.equal(r.records[0].service.result, want, String(status));
  }
  const u = rig({ service: async () => { throw new Error('offline'); } }); await u.ready(); await u.say('swap them please'); assert.equal(u.records[0].service.result, 'error:unreachable'); assert.match(u.records[0].service.text ?? '', /offline/);
});

test('the person cancels: Esc while the service thinks, and Esc on the service\'s plan: `cancelled`', async () => {
  let release!: () => void; const gate = new Promise<void>((res) => { release = res; });
  const slow: Svc = async () => { await gate; return { status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills' }, error: null, version: '0.2.48' } }; };
  const a = rig({ service: slow }); await a.ready();
  a.say('make me eight bars from bar five please'); await a.flush(); await a.press({ key: 'Escape' }); release(); await a.flush();
  assert.equal(a.records.length, 1); assert.equal(a.records[0].service.result, 'cancelled'); assert.equal(a.records[0].sentence, 'make me eight bars from bar five please');
  const plan: Svc = async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills' }, error: null, version: '0.2.48' } });
  const b = rig({ service: plan }); await b.ready(); await b.say('make me eight bars from bar five please'); assert.equal(b.records.length, 0, 'a plan shown is not a failure yet');
  await b.press({ key: 'Escape' }); assert.equal(b.records.length, 1); assert.equal(b.records[0].service.result, 'cancelled'); assert.equal(b.records[0].sentence, 'make me eight bars from bar five please');
});

test('NOT recorded: a sentence the grammar reads; one the 1002 repair offers; a plan the service gave and the person applied; a question the service asked back', async () => {
  const r = rig({ service: none }); await r.ready();
  await r.say(EXTEND); await r.say('Delet bar 2.'); assert.ok(r.kinds().includes('suggestion'));           // a typo: "did you mean"
  assert.equal(r.records.length, 0);
  const plan: Svc = async () => ({ status: 200, json: { ok: true, parsed_ok: true, plan: { kind: 'extend', bar: 'bar_005', bars: 8, style: 'repeat_with_fills' }, error: null, version: '0.2.48' } });
  const b = rig({ service: plan }); await b.ready(); await b.say('make me eight bars from bar five please'); await b.press({ key: 'Enter' }); assert.equal(b.records.length, 0); assert.ok(b.list().length > 0);
  const q = rig({ service: async () => ({ status: 200, json: { ok: true, question: 'Which bars?' } }) }); await q.ready(); await q.say(EXTEND); await q.say('swap them'); assert.equal(q.records.length, 0);
});

test('the same sentence tried again (Enter twice) is ONE record; a different sentence is another; a success in between starts over', async () => {
  const r = rig({ service: none }); await r.ready();
  await r.say('swap them please'); await r.press({ key: 'Enter' }); await r.say('swap them please'); assert.equal(r.records.length, 1);
  await r.say('and now something else entirely'); assert.equal(r.records.length, 2);
});

test('a sentence over 500 characters (the request is not built) and an empty vault of bars end unprocessed too: `none` with the words', async () => {
  const r = rig({ service: none }); await r.ready(); await r.say(`please ${'make it better '.repeat(60)}`);
  assert.equal(r.records.length, 1); assert.equal(r.records[0].service.result, 'none'); assert.match(r.records[0].service.text ?? '', /characters; the limit is 500/); assert.equal(r.requests(), 0);
});

test('an arrangement and a composition record their own kind; a bar records `bar` with the bar\'s own lines and no bar count', async () => {
  const a = rig({ path: ARR, service: none }); await a.ready(); await a.say('put the first phrase on rock please'); assert.equal(a.records[0].kind, 'arrangement');
  const b = rig({ path: BAR, service: 'absent' }); await b.ready(); await b.say('Set the tempo to 96.'); b.records.length = 0; await b.say('make it groovier');
  assert.equal(b.records.length, 1); assert.equal(b.records[0].kind, 'bar'); assert.deepEqual(b.records[0].lines, ['Start with 16 steps in 4/4 at 118 beats per minute: kick on steps 1 and 9, snare on steps 5 and 13.', 'Set the tempo to 96.'], 'the bar\'s own list, head included'); assert.equal(b.records[0].barCount, null); assert.equal(b.records[0].service.result, 'none'); assert.match(b.records[0].grammarError?.message ?? '', /./);
});

test('bars: not set up, refused by an older service (its status), and a cancelled service plan are recorded; a canonical answer applied is not', async () => {
  const ns = rig({ path: BAR, service: none, configured: false }); await ns.ready(); await ns.say('make it groovier'); assert.equal(ns.records[0].service.result, 'not-set-up');
  const old = rig({ path: BAR, service: none }); await old.ready(); await old.say('make it groovier'); assert.equal(old.records[0].service.result, 'refused'); assert.match(old.records[0].service.text ?? '', /does not know bar sentences yet/);
  const e = rig({ path: BAR, service: async () => ({ status: 503, json: { detail: 'busy' } }) }); await e.ready(); await e.say('make it groovier'); assert.equal(e.records[0].service.result, 'error:503');
  const lines: Svc = async () => ({ status: 200, json: { ok: true, lines: ['Hit kick on steps 1, 5 and 9.'] } });
  const c = rig({ path: BAR, service: lines }); await c.ready(); await c.say('four on the floor please'); assert.equal(c.records.length, 0); await c.press({ key: 'Escape' });
  assert.equal(c.records.length, 1); assert.equal(c.records[0].service.result, 'cancelled'); assert.deepEqual(c.list(), []);
  const ok = rig({ path: BAR, service: lines }); await ok.ready(); await ok.say('four on the floor please'); await ok.press({ key: 'Enter' }); assert.equal(ok.records.length, 0); assert.deepEqual(ok.list(), ['Hit kick on steps 1, 5 and 9.']);
});

test('P3: with NO port (the setting is off) the dialog is exactly what it is with a port, nothing is recorded, and the service is asked exactly as often', async () => {
  const withPort = rig({ service: none }); await withPort.ready(); await withPort.say('swap them please');
  const without = rig({ service: none, port: false }); await without.ready(); await without.say('swap them please');
  assert.deepEqual(without.texts(), withPort.texts()); assert.equal(without.requests(), withPort.requests()); assert.equal(without.records.length, 0);
});

test('the PERSONAL TABLE: a sentence resolved before is offered as "Did you mean: <lines>?" (a phrase and a bar), applied only by Enter; it is not a failure so nothing is recorded; an unknown sentence is as before', async () => {
  const r = rig({ service: none, known: { 'swap them please': ['Keep bars 1 to 2.'] } }); await r.ready(); await r.say(EXTEND); r.records.length = 0;
  await r.say('Swap them please.');
  assert.ok(r.texts().some((t) => /Did you mean: Keep bars 1 to 2\? You taught this sentence earlier\./.test(t))); assert.deepEqual(r.list(), [EXTEND], 'never applied silently'); assert.equal(r.records.length, 0); assert.equal(r.requests(), 0);
  await r.press({ key: 'Enter' }); assert.deepEqual(r.list(), [EXTEND, 'Keep bars 1 to 2.']);
  const b = rig({ path: BAR, service: none, known: { 'make it groovier': ['Set the tempo to 100.'] } }); await b.ready(); await b.say('make it groovier');
  assert.ok(b.texts().some((t) => /Did you mean: Set the tempo to 100\?/.test(t))); assert.deepEqual(b.list(), []); await b.press({ key: 'Enter' }); assert.deepEqual(b.list(), ['Set the tempo to 100.']);
});

test('GOLDEN: a table of failing sentences -> recorded or not, and what the record holds (markup stays text; a very long sentence is cut AND said by the store; `Move bar 4 before bar 2.` is REPAIRED, so it is not a failure; `Play [[phrase_001]` has no readable repair, so it is)', async () => {
  const cases: Array<{ path: string; sentence: string; recorded: boolean }> = [
    { path: PH, sentence: 'swap the second and third bars', recorded: true },
    { path: PH, sentence: 'Move bar 4 before bar 2.', recorded: false },
    { path: ARR, sentence: 'Play [[phrase_001]', recorded: true },          // the repair (closing the link) does not make a sentence the arrangement grammar reads (no kit): so it IS a failure
    { path: PH, sentence: '<img src=x onerror=alert(1)> make it better', recorded: true },
    { path: PH, sentence: 'x'.repeat(300), recorded: true },
    { path: PH, sentence: '', recorded: false },
  ];
  const seen: Array<[string, boolean, string | null]> = [];
  for (const c of cases) {
    const r = rig({ path: c.path, service: none }); await r.ready(); if (c.path === PH) await r.say(EXTEND); r.records.length = 0;
    await r.say(c.sentence); seen.push([c.sentence.slice(0, 20), r.records.length === 1, r.records[0]?.sentence.slice(0, 20) ?? null]);
    assert.equal(r.records.length === 1, c.recorded, c.sentence);
  }
  assert.deepEqual(seen.filter((s) => s[1]).map((s) => s[2]), ['swap the second and ', 'Play [[phrase_001]', '<img src=x onerror=a', 'xxxxxxxxxxxxxxxxxxxx']);
});

// 2026-11-13-1211 - the docked prompt box's Apply on a phrase tab, through the SAME ports factory score-first.ts uses (description-wiring.ts), with settings that hold a URL and a token (or hold nothing). A sentence the grammar
// rejects is typed, Apply is pressed with a REAL click, and what must happen is said three ways: the console lines ([forge-promptbox], in order), the one status line under the box, and the request at the transport. The only stub
// is the transport (askPlan's network call). Real driver report (1211): in real Obsidian Apply ended at "edited, not applied" with NOTHING in the console and no visible outcome.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';

import { createDescriptionController } from './description-apply.ts';
import { descriptionPortsFor } from './description-wiring.ts';
import { descriptionState } from './description-apply-core.ts';
import { PHRASE_DEFAULTS, noteContentFor, type PhraseParams } from './phrase-core.ts';
import { extractDescription } from './v2-note-core.ts';
import { replaceDescriptionSection } from './prompt-box-core.ts';

const win: any = new Window({ url: 'http://localhost/' });
const PATH = 'phrases/phrase_001.md';
const SENTENCE = 'make bar_007 twelve bars long, a bit slower';
const EXTEND: PhraseParams = { kind: 'extend', source: 'bar_006', ...PHRASE_DEFAULTS, bars: 6 };
const settle = async (n = 60) => { for (let i = 0; i < n; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < n; i++) await Promise.resolve(); };

function plugin(opts: { url?: string; token?: string; answer?: { status: number; json: unknown }; hold?: Promise<void>; throwIn?: 'basenamesIn' | 'read' } = {}) {
  const store = new Map<string, string>([[PATH, noteContentFor('phrase_001', EXTEND)]]);
  const info: string[] = [], warn: string[] = [], sent: any[] = [];
  const settings = { transpileServiceUrl: opts.url ?? '', transpileServiceToken: opts.token ?? '' };       // what main.ts reads from data.json
  const hooks = {
    askPlan: async (payload: any) => { sent.push(payload); if (opts.hold) await opts.hold; return opts.answer ?? { status: 200, json: { ok: true, version: '0.2.48', plan: { kind: 'extend', bar: 'bar_007', bars: 12, tempo_change_pct: -10 } } }; },
    planConfigured: () => !!settings.transpileServiceUrl?.trim() && !!settings.transpileServiceToken?.trim(),        // main.ts line 786, verbatim
    ownKey: () => undefined, serviceVersion: async () => '0.2.48',
  };
  const ports = descriptionPortsFor({
    read: async (p) => { if (opts.throwIn === 'read' && sent.length === 0 && info.some((l) => l.includes('asking'))) throw new Error('boom'); const t = store.get(p); if (t === undefined) throw new Error('gone'); return t; },
    process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
    basenamesIn: (folder) => { if (opts.throwIn === 'basenamesIn') throw new Error('vault listing failed'); return folder === 'bars' || folder === 'rhythm_bars' ? ['bar_006', 'bar_007', 'README'] : folder === 'phrases' ? ['phrase_001', 'README'] : []; },
    panes: () => panes, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as any),
    trace: (l) => info.push(l), warn: (l) => warn.push(l),
  }, hooks);
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ctl = createDescriptionController(ports);
  const el = win.document.createElement('div'); win.document.body.appendChild(el); panes.push({ path: PATH, contentEl: el, tab: true });
  return { ctl, store, info, warn, sent, el: el as HTMLElement };
}
const boxOf = (el: HTMLElement) => ({ text: el.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement, apply: el.querySelector('.forge-prompt-box-apply') as HTMLButtonElement, state: () => el.querySelector('.forge-prompt-box-state')?.textContent ?? '' });
const type = (b: ReturnType<typeof boxOf>, text: string) => { b.text.value = text; b.text.dispatchEvent(new win.Event('input', { bubbles: true })); };
const promptbox = (lines: string[]) => lines.filter((l) => l.startsWith('[forge-promptbox]') && !l.startsWith('[forge-promptbox] box mounted'));
const mounted = (lines: string[]) => lines.filter((l) => l.startsWith('[forge-promptbox] box mounted'));

async function open(r: ReturnType<typeof plugin>) {
  r.ctl.syncBars(); await settle();
  const b = boxOf(r.el); assert.ok(b.text, 'the box is on the tab'); return b;
}

test('the phrase_001 shape (a derived Recipe and Python cache, the Description edited): the grammar verdict is rejected, not both-edited', () => {
  const note = noteContentFor('phrase_001', EXTEND);
  const edited = replaceDescriptionSection(note, SENTENCE)!;
  assert.notEqual(extractDescription(edited), extractDescription(note));
  const st = descriptionState(edited, 'phrase', { bars: ['bar_006', 'bar_007'], phrases: ['phrase_001'], arrangements: [], compositions: [], kits: [] });
  assert.equal(st.kind, 'rejected');
});

test('URL and token set: Apply logs every decision in order, says "Asking..." under the box, sends ONE request, and ends on the service answered line with a preview', async () => {
  const r = plugin({ url: 'https://example.test', token: 'x'.repeat(10) });
  const b = await open(r);
  type(b, SENTENCE);
  assert.equal(b.state(), 'edited, not applied');
  const pending = (async () => { b.apply.click(); })();
  await Promise.resolve(); await Promise.resolve();
  await pending; await settle();
  assert.equal(r.sent.length, 1, 'ONE request left');
  const lines = promptbox(r.info);
  assert.deepEqual(lines.map((l) => l.replace(/\d+ chars/, 'N chars')), [
    '[forge-promptbox] apply pressed: phrase_001 family=phrase text=N chars',
    '[forge-promptbox] grammar verdict: rejected',
    '[forge-promptbox] service gate: askPlan=present configured=true',
  ]);
  assert.deepEqual(mounted(r.info), ['[forge-promptbox] box mounted: phrase_001 family=phrase askPlan=present configured=true'], 'the first line on opening the tab: this build is live and the gate says what Apply will do');
  assert.ok(r.info.some((l) => l === '[forge-description] asking the service about phrase_001'));
  assert.ok(r.info.some((l) => l.startsWith('[forge-description] asked the service about phrase_001 -> extend')));
  assert.equal(b.state(), 'The service answered: see the preview at the top.');
  assert.ok(r.el.querySelector('.forge-description-preview, [data-action="apply-preview"]'), 'the preview is there');
  for (const l of [...r.info, ...r.warn]) assert.ok(!/x{10}|example\.test/.test(l), 'no token and no URL in any line');
});

test('while the request is out the status line says "Asking the sentence service...", and when it answers, the answer', async () => {
  let release!: () => void; const hold = new Promise<void>((ok) => { release = ok; });
  const r = plugin({ url: 'https://example.test', token: 'tok-tok-tok', hold });
  const b = await open(r);
  type(b, SENTENCE);
  b.apply.click(); await settle(10);
  assert.equal(b.state(), 'Asking the sentence service...');
  assert.equal(r.sent.length, 1);
  release(); await settle();
  assert.equal(b.state(), 'The service answered: see the preview at the top.');
});

test('the service REFUSES: the status line says so, with its message', async () => {
  const r = plugin({ url: 'https://example.test', token: 'tok-tok-tok', answer: { status: 422, json: { detail: 'I cannot plan that sentence.' } } });
  const b = await open(r);
  type(b, SENTENCE); b.apply.click(); await settle();
  assert.match(b.state(), /^The service refused: /);
  assert.ok(promptbox(r.info).length >= 3);
});

test('settings EMPTY: Apply says the service is not set up (under the box) and warns "service gate: ... configured=false"; no request', async () => {
  const r = plugin({});
  const b = await open(r);
  type(b, SENTENCE);
  b.apply.click(); await settle();
  assert.equal(r.sent.length, 0);
  assert.equal(b.state(), 'The sentence service is not set up: add its URL and token in Settings -> Forge.');
  assert.ok(r.warn.includes('[forge-promptbox] service gate: askPlan=present configured=false'), r.warn.join('\n'));
  assert.ok(promptbox(r.info).includes('[forge-promptbox] grammar verdict: rejected'));
});

test('a throw anywhere in Apply is never silent: console.warn names it, the status line says "Apply failed: ..." (the box swallowed it before)', async () => {
  const r = plugin({ url: 'https://example.test', token: 'tok-tok-tok', throwIn: 'basenamesIn' });
  const b = await open(r).catch(() => null);
  const box = b ?? boxOf(r.el);
  if (!box.text) { assert.fail('the box did not mount: the throwing listing broke the tab, which is a finding of its own'); }
  type(box, SENTENCE);
  box.apply.click(); await settle();
  assert.match(box.state(), /^Apply failed: /);
  assert.ok(r.warn.some((l) => l.startsWith('[forge-promptbox] apply failed')), r.warn.join('\n'));
});

test('the empty sentence and an unchanged text do not reach the controller (the box says nothing, Apply is disabled): no lines', async () => {
  const r = plugin({ url: 'https://example.test', token: 'tok-tok-tok' });
  const b = await open(r);
  assert.equal(b.apply.disabled, true);
  b.apply.click(); await settle();
  assert.deepEqual(promptbox(r.info), []);
});

test('editing the box text clears the status line', async () => {
  const r = plugin({});
  const b = await open(r);
  type(b, SENTENCE); b.apply.click(); await settle();
  assert.notEqual(b.state(), 'edited, not applied');
  type(b, SENTENCE + ' x');
  assert.equal(b.state(), 'edited, not applied');
});

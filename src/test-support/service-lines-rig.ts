// 2026-11-21-1015 - the rig of the 1003 wiring tests, shared: the REAL controller (the plugin's own ports mapping, the real composer, dialog and bar list) against a FAKE service (no network). Moved out of service-lines-wiring.test.ts unchanged.
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

import { dialogEntries } from './dialog-view.ts';
import { createDescriptionController } from '../description-apply.ts';
import { descriptionPortsFor } from '../description-wiring.ts';
import { emptyArrangementNote, emptyPhraseNote } from '../empty-note-core.ts';
import { extractDescription } from '../v2-note-core.ts';
import { readBarLines } from '../bar-list-note-core.ts';
import { PHRASE_VAULT, PLAYGROUND_PHRASES, asListNote } from './phrase-list-fixtures.ts';
import { PLAYGROUND_BARS } from './bar-list-fixtures.ts';

export const win: any = new Window({ url: 'http://localhost/' });
export const PH = 'phrases/phrase_001.md', ARR = 'arrangements/arr_001.md', BAR = 'bars/bar_001.md';
export const EXTEND = 'Extend [[bar_005]] to 4 bars, repeating with fills.';
export const SECRET_BODY = 'SECRET-BODY-TEXT-DO-NOT-SEND';
export const OWN_KEY = 'sk-ant-OWNKEY-0123456789abcdef0123456789abcdef';

export type Req = Record<string, unknown>;
export type Svc = (req: Req) => { status: number; json: unknown } | Promise<{ status: number; json: unknown }>;
export function rig(opts: { path?: string; note?: string; service: Svc; drawn?: number; configured?: boolean }) {
  const path = opts.path ?? PH;
  const store = new Map<string, string>();
  for (const b of PHRASE_VAULT.bars) store.set(`bars/${b}.md`, PLAYGROUND_BARS[b] ?? PLAYGROUND_BARS['bar_001']);
  for (const [n, t] of Object.entries(PLAYGROUND_PHRASES)) store.set(`phrases/${n}.md`, asListNote(t, n));
  store.set('arrangements/arr_001.md', emptyArrangementNote('arr_001')); store.set('kits/rock.md', '---\ntype: data\ncontent_type: json\n---\n'); store.set('kits/latin.md', '---\ntype: data\ncontent_type: json\n---\n');
  store.set(path, opts.note ?? (path.startsWith('arrangements/') ? emptyArrangementNote('x') : path.startsWith('bars/') ? PLAYGROUND_BARS['bar_001'] : emptyPhraseNote('x')).replace(/^---\n/, `---\nnotes_to_self: ${SECRET_BODY}\n`));
  const requests: Req[] = []; const traces: string[] = [];
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = [];
  const ports = {
    ...descriptionPortsFor({
      read: async (p) => { const t = store.get(p); if (t === undefined) throw new Error('File not found'); return t; },
      process: async (p, fn) => { await Promise.resolve(); const cur = store.get(p)!; const next = fn(cur); if (next !== cur) store.set(p, next); },
      basenamesIn: (folder) => [...store.keys()].filter((k) => k.startsWith(`${folder}/`)).map((k) => k.slice(folder.length + 1).replace(/\.md$/, '')),
      panes: () => panes, setTimer: () => 1, clearTimer: () => {}, trace: (l: string) => { traces.push(l); }, warn: () => {},
    }, {
      askPlan: async (payload: unknown) => { requests.push(JSON.parse(JSON.stringify(payload))); return opts.service(payload as Req); },
      planConfigured: () => opts.configured !== false,
      composerAutoApply: () => true,
      ownKey: () => OWN_KEY,
    } as never),
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
  const enter = () => press({ key: 'Enter' });
  const list = () => (path.startsWith('bars/') ? (readBarLines(store.get(path)!)?.lines ?? []).filter((l) => !/^Start with /.test(l)) : extractDescription(store.get(path)!).split('\n').filter((l) => l.trim() !== '').map((l) => l.replace(/^\s*\d+[.)]\s+/, '')));
  const texts = () => dialogEntries(el).map((e) => e.text);
  const kinds = () => dialogEntries(el).map((e) => e.kind);
  const suggestion = () => [...el.querySelectorAll('.forge-chat-suggestion-description')].pop()?.textContent ?? '';
  return { ctl, el, store, requests, traces, type, enter, press, list, texts, kinds, suggestion, ready: async () => { await ctl.inspect(path); await flush(); }, writes: () => [...store.entries()].filter(([k]) => k === path).length,
    say: async (s: string) => { type(s); await enter(); } };
}
export type Rig = ReturnType<typeof rig>;
export const lines = (...l: string[]) => async () => ({ status: 200, json: { ok: true, lines: l } });
export const phraseWithHead = async (svc: Svc, drawn = 4): Promise<Rig> => { const r = rig({ service: svc, drawn }); await r.ready(); r.type(EXTEND); await r.enter(); assert.deepEqual(r.list(), [EXTEND]); return r; };


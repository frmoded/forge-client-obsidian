// 2026-11-20-1000 - the REAL phrase tab with the real composer and dialog (happy-dom) for phrases drawn by the stub engine of phrase-steps-rig.ts: shared by the Inspector-through-steps wiring test and the P3 (no step line: byte for byte) test.
import { Window } from 'happy-dom';

import { mountPhrase, type PhraseMountPorts } from '../phrase-dom.ts';
import { registerBarSelectionHost } from '../bar-selection-bus.ts';
import { createDescriptionController } from '../description-apply.ts';
import { descriptionPortsFor } from '../description-wiring.ts';
import { installHostClock } from './host-workspace.ts';
import { noteFor, rigDeps, stubCompute } from './phrase-steps-rig.ts';

const win: any = new Window({ url: 'http://localhost/' });

export async function rig(list: string[]) {
  const clock = installHostClock(win);
  const notePath = 'phrases/phrase_020.md';
  const parent = win.document.createElement('div'); win.document.body.appendChild(parent);
  const text = noteFor(list);
  const base = rigDeps();
  const files = new Map<string, string>([[notePath, text]]);
  const readNote = async (p: string): Promise<string> => { const t = files.get(p); return t !== undefined ? t : base.readNote(p); };
  const panes: Array<{ path: string; contentEl: HTMLElement; tab?: boolean }> = []; const timers: Array<() => void> = []; const pins: unknown[] = [];
  const ctl = createDescriptionController(descriptionPortsFor({
    read: readNote, process: async (p, fn) => { const cur = files.get(p)!; const next = fn(cur); if (next !== cur) files.set(p, next); },
    basenamesIn: (folder) => (folder === 'bars' ? ['bar_005', 'bar_006', 'bar_009'] : folder === 'phrases' ? ['phrase_014'] : []),
    panes: () => panes, setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {}, trace: () => {}, warn: () => {},
    create: async () => {}, exists: () => true, isAlreadyExists: () => false,
  }, {}));
  const off = registerBarSelectionHost({ appendLine: (p, s) => ctl.appendLine(p, s), makePhrase: async () => ({ ok: true as const, path: 'phrases/phrase_099.md' }), duplicateArmed: (p) => ctl.duplicateArmed(p), duplicateClick: (p, id, bar) => ctl.duplicateClick(p, id, bar) });
  const ports: PhraseMountPorts = {
    path: notePath, title: 'phrase_020', plan: 'score', readNote,
    writePhrase: async () => ({ ok: true }),
    compute: stubCompute() as never,
    renderInto: (host, payload) => {
      const first = /<part id="P1">([\s\S]*?)<\/part>/.exec(String(payload.multi_staff_content))![1];
      const ids = [...first.matchAll(/<measure number="\d+" id="([^"]+)"/g)].map((m) => m[1]);
      host.innerHTML = `<svg>${ids.map((id) => `<g class="measure" id="${id}"><g class="note" id="n_${id}"></g></g>`).join('')}</svg>`;
      host.querySelectorAll('g.measure').forEach((g: any, i: number) => { g.getBBox = () => ({ x: 100 * i, y: 0, width: 90, height: 50 }); });
      return true;
    },
    stopPlayers: () => {},
    setTimer: (fn, ms) => (globalThis as any).setTimeout(fn, ms) as number, clearTimer: (h) => (globalThis as any).clearTimeout(h), now: () => 0,
    inspector: { openNote: () => {}, onPin: (p: unknown) => { pins.push(p); } },
  } as never;
  const handle = mountPhrase(parent, ports);
  await handle.load(); await clock.advance(400);
  panes.push({ path: notePath, contentEl: parent, tab: true }); await ctl.inspect(notePath); for (let i = 0; i < 240; i++) await Promise.resolve();
  const bars = () => [...parent.querySelectorAll('g.measure')] as any[];
  const click = (el: any, init: object = {}) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, ...init }));
  const field = () => parent.querySelector('.forge-prompt-box-text') as HTMLTextAreaElement;
  const type = (t: string) => { field().value = t; field().dispatchEvent(new win.Event('input', { bubbles: true })); };
  const flush = async () => { for (let i = 0; i < 240; i++) await Promise.resolve(); await clock.advance(20); };
  /** The Inspector's lines now: each list item's own text (not the "Open note" button's). */
  const lines = (): string[] => [...parent.querySelectorAll('.forge-inspector-body li')].map((li: any) => li.querySelector('span')?.textContent ?? li.textContent ?? '');
  const hint = (): string => (parent.querySelector('.forge-inspector-body') as any)?.textContent ?? '';
  /** The selection menu's count line while the menu is SHOWN (a hidden menu keeps its last words). */
  const count = (): string | undefined => { const menu = parent.querySelector('.forge-bar-selection') as any; return menu && menu.style.display !== 'none' ? (menu.querySelector('.forge-bar-selection-count') as any)?.textContent : undefined; };
  /** The note changes on disk (a step line added): the tab hears the vault's `modify` and draws again. */
  const edit = async (next: string[]): Promise<void> => { files.set(notePath, noteFor(next)); handle.noteModified(notePath); await flush(); await clock.advance(600); await flush(); };
  return { handle, parent, pins, bars, click, field, type, flush, lines, hint, count, edit, done: () => { off(); handle.dispose(); ctl.dispose(); clock.restore(); } };
}


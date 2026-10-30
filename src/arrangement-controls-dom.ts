// score_first M10 slice 2 (drain 2026-10-29-0910) - the row per kit above an arrangement's Score: Mute, Solo and a volume slider (plain DOM, no obsidian import). The person never edits the Recipe text: a change is shown at once, then
// handed to `commit` as ONE batch after a quiet moment (debounced, so a drag of the slider is one write), and the view writes the arrangement note through the same builders New arrangement uses. A redraw from the note never undoes
// a change that has not been written yet; once it has, the rows show what the note says. Every hand-off is one evidence line.
import type { ArrangementParams } from './arrangement-core.ts';

export const ARRANGEMENT_CONTROLS_DELAY_MS = 250;

type Patch = { mute?: boolean; solo?: boolean; volume?: number };
export interface ArrangementControlsPorts {
  /** The changes made since the last quiet moment: [track number, change], in the order they were made. */
  commit(patches: Array<[number, Patch]>): void;
  trace?(line: string): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}
export interface ArrangementControls { show(p: ArrangementParams | null): void; dispose(): void }

export function mountArrangementControls(parent: HTMLElement, ports: ArrangementControlsPorts): ArrangementControls {
  const doc = parent.ownerDocument;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const e = doc.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const root = el('div', 'forge-arr-controls'); root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Kits');
  parent.appendChild(root);

  let kits: string[] = [];
  let pending: Array<[number, Patch]> = [];
  let timer: unknown = null;
  let disposed = false;

  const flush = (): void => {
    timer = null;
    if (disposed || pending.length === 0) return;
    const batch = pending; pending = [];
    ports.commit(batch);
    ports.trace?.(`[forge-arrangement] controls: wrote ${batch.length} change(s)`);
  };
  const queue = (index: number, patch: Patch, said: string): void => {
    const waiting = pending.find(([i]) => i === index);                  // a drag is many `input` events: one kit's changes become ONE change, the last value of each field
    if (waiting) Object.assign(waiting[1], patch); else pending.push([index, { ...patch }]);
    ports.trace?.(`[forge-arrangement] controls: ${kits[index]} ${said}`);
    if (timer !== null) ports.clearTimer(timer);
    timer = ports.setTimer(flush, ARRANGEMENT_CONTROLS_DELAY_MS);
  };

  const build = (p: ArrangementParams): void => {
    root.textContent = '';
    kits = p.tracks.map((t) => t.kit);
    p.tracks.forEach((t, index) => {
      const row = el('div', 'forge-arr-control');
      row.appendChild(el('span', 'forge-arr-control-kit', t.kit));
      const mute = el('button', 'forge-arr-mute', 'Mute'); mute.type = 'button'; mute.setAttribute('aria-label', `Mute ${t.kit}`);
      const solo = el('button', 'forge-arr-solo', 'Solo'); solo.type = 'button'; solo.setAttribute('aria-label', `Solo ${t.kit}`);
      const volume = el('input', 'forge-arr-volume'); volume.type = 'range'; volume.min = '0'; volume.max = '100'; volume.step = '1'; volume.setAttribute('aria-label', `Volume of ${t.kit}`);
      const shown = el('span', 'forge-arr-volume-value');
      mute.addEventListener('click', () => { const on = mute.getAttribute('aria-pressed') !== 'true'; mute.setAttribute('aria-pressed', String(on)); queue(index, { mute: on }, `mute ${on ? 'on' : 'off'}`); });
      solo.addEventListener('click', () => { const on = solo.getAttribute('aria-pressed') !== 'true'; solo.setAttribute('aria-pressed', String(on)); queue(index, { solo: on }, `solo ${on ? 'on' : 'off'}`); });
      volume.addEventListener('input', () => { const v = Math.round(Number(volume.value)); shown.textContent = `${v}%`; queue(index, { volume: v }, `volume ${v}`); });
      row.append(mute, solo, volume, shown);
      root.appendChild(row);
    });
  };
  /** The rows say what the note says (a row with a change still waiting to be written keeps the person's value until it is). */
  const paint = (p: ArrangementParams): void => {
    const rows = Array.from(root.children) as HTMLElement[];
    p.tracks.forEach((t, index) => {
      if (pending.some(([i]) => i === index)) return;
      const row = rows[index];
      (row.querySelector('.forge-arr-mute') as HTMLElement).setAttribute('aria-pressed', String(t.mute === true));
      (row.querySelector('.forge-arr-solo') as HTMLElement).setAttribute('aria-pressed', String(t.solo === true));
      const v = t.volume ?? 100;
      (row.querySelector('.forge-arr-volume') as HTMLInputElement).value = String(v);
      (row.querySelector('.forge-arr-volume-value') as HTMLElement).textContent = `${v}%`;
    });
  };

  return {
    show(p) {
      if (disposed) return;
      if (p === null) { root.textContent = ''; kits = []; return; }
      const same = kits.length === p.tracks.length && kits.every((k, i) => k === p.tracks[i].kit);
      if (!same) { pending = []; if (timer !== null) { ports.clearTimer(timer); timer = null; } build(p); }
      paint(p);
    },
    dispose() {
      disposed = true;
      if (timer !== null) ports.clearTimer(timer);
      timer = null; pending = [];
      root.remove();
    },
  };
}

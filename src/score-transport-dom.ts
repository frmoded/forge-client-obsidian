// 2026-11-17-2000 - the Score's one gentle row: the DOM (design doc checklists/music_tabs_chat_ui_design.md section 4). Plain DOM only (no obsidian import, no createEl): a test builds it in happy-dom and
// real Chrome measures it. Left to right: Play / Pause, Back to the start | Slower, the tempo value (a click opens a field; Enter applies, Esc cancels), Faster | Export (an icon with a menu).
// Small 16 px icons of our own family, no borders, no tooltip of any kind (2026-11-19-0925: the name of each button is a hidden span it points at with aria-labelledby, src/sr-label-core.ts; all the spans live in the row, so the code that replaces a button's children cannot lose them). No progress bar and no time readout: the playhead on the Score is the progress.
import { setSrLabel } from './sr-label-core.ts';
import { parseSvgMarkup } from './svg-markup-core.ts';
import {
  TEMPO_DEFAULT, TEMPO_MAX, TEMPO_MIN, TRANSPORT_ICONS, TRANSPORT_LABELS, clampTempo, formatTempo, parseTempoText, playPauseLabel, stepTempo, type ExportItem,
} from './score-transport-core.ts';

/** What the row needs from a player: the state, three commands, a tempo, and a state-change event (also fired when the score ends by itself). The adapter in music-edition.full.ts wraps html-midi-player's element. */
export interface TransportPlayer {
  readonly playing: boolean;
  start(): void;
  stop(): void;
  reset(): void;
  setTempo(pct: number): void;
  onStateChange(fn: (playing: boolean) => void): () => void;
}
export interface TransportDeps {
  player: TransportPlayer;
  exportItems: ExportItem[];
  runExport(id: ExportItem['id']): void;
  initialTempo?: number;
  /** False when the sound could not start (the player failed to mount): the row then shows only Export, so the downloads are never lost with the sound. Default true. */
  playable?: boolean;
  /** An evidence line (Info level): every hand-off of the row is logged as `[forge-score-row] ...`. */
  log?(line: string): void;
}
export interface MountedTransport { el: HTMLElement; dispose(): void }

const DISPOSERS = new WeakMap<Element, () => void>();
/** A re-render of the Score (the kit toggle) replaces the row: dispose every row under `root` first, so no listener of an old row is left on the document. */
export function disposeScoreTransports(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll('.forge-score-transport'))) { const d = DISPOSERS.get(el); if (d) d(); else el.remove(); }
}

function svgIcon(doc: Document, key: keyof typeof TRANSPORT_ICONS): Node {
  const Parser = (doc.defaultView as unknown as { DOMParser?: typeof DOMParser } | null)?.DOMParser ?? DOMParser;
  const nodes = parseSvgMarkup(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="16" height="16" aria-hidden="true" focusable="false">${TRANSPORT_ICONS[key].svg}</svg>`, new Parser());
  return doc.importNode(nodes[0], true);
}

function button(doc: Document, cls: string, label: string, row: HTMLElement, key: string): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button'; b.className = `forge-tp-btn ${cls}`; setSrLabel(b, label, { host: row, key });
  return b;
}

export function mountScoreTransport(toolbar: HTMLElement, deps: TransportDeps): MountedTransport {
  const doc = toolbar.ownerDocument; const { player } = deps; const log = deps.log ?? ((): void => {});
  const row = doc.createElement('div'); row.className = 'forge-score-transport'; row.setAttribute('role', 'toolbar'); setSrLabel(row, TRANSPORT_LABELS.row);
  let tempo = clampTempo(deps.initialTempo ?? TEMPO_DEFAULT); let menuOpen = false;
  const cleanups: (() => void)[] = [];
  const on = <K extends keyof HTMLElementEventMap>(el: Node, type: K | string, fn: (e: any) => void): void => { el.addEventListener(type, fn); cleanups.push(() => el.removeEventListener(type, fn)); };

  // ---- Play / Pause, Back to the start ------------------------------------------------------------------------------------------------------------------------------------------
  const play = button(doc, 'forge-tp-play', TRANSPORT_LABELS.play, row, 'play'); play.setAttribute('aria-pressed', 'false'); play.appendChild(svgIcon(doc, 'play'));
  const reset = button(doc, 'forge-tp-reset', TRANSPORT_LABELS.reset, row, 'reset'); reset.appendChild(svgIcon(doc, 'reset'));
  const showPlaying = (playing: boolean): void => {
    const label = playPauseLabel(playing); setSrLabel(play, label, { host: row, key: 'play' }); play.setAttribute('aria-pressed', playing ? 'true' : 'false'); play.classList.toggle('is-playing', playing);
    play.replaceChildren(svgIcon(doc, playing ? 'pause' : 'play'));
  };
  on(play, 'click', () => { if (player.playing) { player.stop(); log('[forge-score-row] pause'); } else { player.start(); log('[forge-score-row] play'); } showPlaying(player.playing); });
  on(reset, 'click', () => { player.reset(); showPlaying(false); log('[forge-score-row] back to the start'); });
  cleanups.push(player.onStateChange((p) => showPlaying(p)));

  // ---- tempo -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const group = doc.createElement('div'); group.className = 'forge-tp-tempo-group'; group.setAttribute('role', 'group'); setSrLabel(group, 'Tempo');
  const slower = button(doc, 'forge-tp-slower', TRANSPORT_LABELS.slower, row, 'slower'); slower.appendChild(svgIcon(doc, 'minus'));
  const faster = button(doc, 'forge-tp-faster', TRANSPORT_LABELS.faster, row, 'faster'); faster.appendChild(svgIcon(doc, 'plus'));
  let valueEl: HTMLElement = makeValue();
  function makeValue(): HTMLButtonElement {
    const v = button(doc, 'forge-tp-tempo', TRANSPORT_LABELS.tempo, row, 'tempo'); v.textContent = formatTempo(tempo); on(v, 'click', openField); return v;
  }
  const syncEnds = (): void => { slower.disabled = tempo <= TEMPO_MIN; faster.disabled = tempo >= TEMPO_MAX; };
  const applyTempo = (pct: number): void => { const next = clampTempo(pct); if (next === tempo) { syncEnds(); return; } tempo = next; valueEl.textContent = formatTempo(tempo); syncEnds(); player.setTempo(tempo); log(`[forge-score-row] tempo ${tempo}%`); };
  on(slower, 'click', () => { if (!slower.disabled) applyTempo(stepTempo(tempo, -1)); });
  on(faster, 'click', () => { if (!faster.disabled) applyTempo(stepTempo(tempo, 1)); });
  let closing = false;                                                       // real Chrome fires `blur` while the focused field is being replaced: the inner call must not undo the outer one
  function closeField(input: HTMLInputElement, apply: boolean): void {
    if (closing || !input.isConnected) return;
    closing = true;
    try {
      const parsed = apply ? parseTempoText(input.value) : { ok: false as const };
      const back = makeValue(); valueEl = back; input.replaceWith(back);
      if (apply && parsed.ok) applyTempo(parsed.pct);
      back.textContent = formatTempo(tempo);
      if (apply) back.focus();
    } finally { closing = false; }
  }
  function openField(): void {
    const input = doc.createElement('input'); input.type = 'text'; input.className = 'forge-tp-tempo-input'; input.setAttribute('inputmode', 'numeric'); input.value = String(tempo); input.size = 4;
    valueEl.replaceWith(input); valueEl = input; setSrLabel(input, TRANSPORT_LABELS.tempoField, { host: row, key: 'tempo-field' }); input.focus(); input.select();
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); closeField(input, true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeField(input, false); (valueEl as HTMLElement).focus(); }
    });
    input.addEventListener('blur', () => { closeField(input, false); });                 // leaving the field cancels; only Enter applies
  }
  group.append(slower, valueEl, faster);
  syncEnds();

  // ---- Export -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const exp = doc.createElement('div'); exp.className = 'forge-tp-export';
  const expBtn = button(doc, 'forge-tp-export-btn', TRANSPORT_LABELS.export, row, 'export'); expBtn.setAttribute('aria-haspopup', 'menu'); expBtn.setAttribute('aria-expanded', 'false'); expBtn.appendChild(svgIcon(doc, 'export'));
  const menu = doc.createElement('div'); menu.className = 'forge-tp-menu'; menu.setAttribute('role', 'menu'); setSrLabel(menu, TRANSPORT_LABELS.export, { host: row, key: 'export-menu' }); menu.hidden = true;
  const items: HTMLButtonElement[] = deps.exportItems.map((it) => {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'forge-tp-menuitem'; b.setAttribute('role', 'menuitem'); b.textContent = it.label;
    on(b, 'click', (e: Event) => { e.stopPropagation(); setMenu(false); deps.runExport(it.id); log(`[forge-score-row] export ${it.id}`); expBtn.focus(); });
    on(b, 'keydown', (e: KeyboardEvent) => {
      const i = items.indexOf(b);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMenu(false); expBtn.focus(); }
      else if (e.key === 'Tab') setMenu(false);
    });
    menu.appendChild(b); return b;
  });
  function setMenu(open: boolean): void { menuOpen = open; menu.hidden = !open; expBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  on(expBtn, 'click', (e: Event) => { e.stopPropagation(); setMenu(!menuOpen); if (menuOpen) items[0]?.focus(); });
  on(doc.body, 'click', () => { if (menuOpen) setMenu(false); });
  exp.append(expBtn, menu);

  if (deps.playable === false) { play.hidden = true; reset.hidden = true; group.hidden = true; row.classList.add('is-silent'); }
  row.append(play, reset, group, exp);
  toolbar.insertBefore(row, toolbar.firstChild);
  const dispose = (): void => { for (const c of cleanups.splice(0)) c(); DISPOSERS.delete(row); row.remove(); };
  DISPOSERS.set(row, dispose);
  return { el: row, dispose };
}

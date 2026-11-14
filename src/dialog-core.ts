// 2026-11-13-1214 - the DIALOG above the prompt box: a short, ephemeral-first log of what happened to a note's Description (the person's sentences, the outcomes, the service's suggestions, a control's changes). Pure (no DOM, no
// obsidian): the controller feeds it events, the DOM draws it, the plugin's data.json keeps the last entries per note. The Description on disk stays the single source of truth; the dialog holds NO state that matters.

export const DIALOG_CAP = 50;                         // entries kept per note
export const DIALOG_NOTES_CAP = 40;                   // notes with a kept history in data.json (the least recently used go first)
export const ENTRY_TEXT_MAX = 600;                    // characters per kept text (a long Recipe is cut, with an ellipsis)
export const DIALOG_HEIGHT_DEFAULT = 112;             // px: about four lines of messages
export const DIALOG_HEIGHT_MIN = 48;
export const DIALOG_HEIGHT_MAX = 480;

export type DialogKind = 'you' | 'applied' | 'rejected' | 'asking' | 'suggestion' | 'refused' | 'dropped' | 'control' | 'notice' | 'failed';
export type SuggestionState = 'open' | 'applied' | 'cancelled' | 'expired';
export interface DialogEntry {
  id: number;
  at: number;                                         // ms since the epoch
  kind: DialogKind;
  text: string;
  suggestion?: { description: string; recipe: string; state: SuggestionState };
}
/** What the description controller says happened (one stream feeds the console lines and this dialog). */
export type DialogEvent =
  | { type: 'you'; text: string }
  | { type: 'applied'; change: string; description: string }
  | { type: 'rejected'; line: number; column: number; message: string }
  | { type: 'asking' }
  | { type: 'suggestion'; description: string; recipe: string }
  | { type: 'refused'; message: string }
  | { type: 'dropped'; message: string }
  | { type: 'notice'; message: string }
  | { type: 'failed'; message: string }
  | { type: 'control'; summary: string; description: string };

/** Entries never carry a token or a URL: a link is cut to a word, a long token-looking run is cut, and a text is capped. */
export function redact(text: string): string {
  let t = String(text ?? '');
  t = t.replace(/https?:\/\/\S+/gi, '[link removed]');
  t = t.replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '[removed]');
  return t.length > ENTRY_TEXT_MAX ? `${t.slice(0, ENTRY_TEXT_MAX - 1)}…` : t;
}

const ONE = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The entry (without id and time) an event makes. */
export function fromOutcome(ev: DialogEvent): Omit<DialogEntry, 'id' | 'at'> {
  switch (ev.type) {
    case 'you': return { kind: 'you', text: redact(ev.text) };
    case 'applied': return { kind: 'applied', text: redact(`Applied (${ev.change}): ${ONE(ev.description)}`) };
    case 'rejected': return { kind: 'rejected', text: redact(`The grammar did not accept this sentence (line ${ev.line}, column ${ev.column}: ${ev.message}).`) };
    case 'asking': return { kind: 'asking', text: 'Asking the sentence service...' };
    case 'suggestion': return { kind: 'suggestion', text: 'The service suggests this. Nothing is written until you press Apply.', suggestion: { description: redact(ev.description), recipe: redact(ev.recipe), state: 'open' } };
    case 'refused': return { kind: 'refused', text: redact(`The service refused: ${ev.message}`) };
    case 'dropped': return { kind: 'dropped', text: redact(`Dropped: ${ev.message}`) };
    case 'notice': return { kind: 'notice', text: redact(ev.message) };
    case 'failed': return { kind: 'failed', text: redact(`Apply failed: ${ev.message}`) };
    case 'control': return { kind: 'control', text: redact(`Controls: ${ev.summary}. The Description is now: ${ONE(ev.description)}`) };
  }
}
export const fromControlChange = (summary: string, description: string): Omit<DialogEntry, 'id' | 'at'> => fromOutcome({ type: 'control', summary, description });

/** Append one entry (a fresh id, the time `at`), keeping the newest DIALOG_CAP. Never mutates the list it is given. */
export function append(list: readonly DialogEntry[], entry: Omit<DialogEntry, 'id' | 'at'>, at: number): DialogEntry[] {
  const id = list.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  const next = [...list, { ...entry, id, at }];
  return next.length > DIALOG_CAP ? next.slice(next.length - DIALOG_CAP) : next;
}
/** The suggestion of this entry was used (or went away): its buttons are disabled and the entry says what was chosen. */
export function resolveSuggestion(list: readonly DialogEntry[], id: number, state: Exclude<SuggestionState, 'open'>): DialogEntry[] {
  return list.map((e) => (e.id === id && e.suggestion && e.suggestion.state === 'open' ? { ...e, suggestion: { ...e.suggestion, state } } : e));
}
/** Every suggestion still open is over (a newer one, an edit, a cancel): expired. */
export function expireOpen(list: readonly DialogEntry[]): DialogEntry[] {
  return list.map((e) => (e.suggestion && e.suggestion.state === 'open' ? { ...e, suggestion: { ...e.suggestion, state: 'expired' as const } } : e));
}
export const openSuggestion = (list: readonly DialogEntry[]): DialogEntry | undefined => [...list].reverse().find((e) => e.suggestion?.state === 'open');

/** What the persisted history says, checked: only well-formed entries, capped, with open suggestions expired (a request does not survive a restart). */
export function sanitizeLoaded(raw: unknown): DialogEntry[] {
  if (!Array.isArray(raw)) return [];
  const kinds: DialogKind[] = ['you', 'applied', 'rejected', 'asking', 'suggestion', 'refused', 'dropped', 'control', 'notice', 'failed'];
  const out: DialogEntry[] = [];
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue;
    const r = e as Record<string, unknown>;
    if (typeof r.id !== 'number' || typeof r.at !== 'number' || typeof r.text !== 'string' || !kinds.includes(r.kind as DialogKind)) continue;
    const entry: DialogEntry = { id: r.id, at: r.at, kind: r.kind as DialogKind, text: redact(r.text) };
    const s = r.suggestion as Record<string, unknown> | undefined;
    if (s && typeof s.description === 'string' && typeof s.recipe === 'string') entry.suggestion = { description: redact(s.description), recipe: redact(s.recipe), state: s.state === 'applied' || s.state === 'cancelled' ? s.state : 'expired' };
    out.push(entry);
  }
  return out.slice(-DIALOG_CAP);
}
/** The whole persisted map, checked and capped to the DIALOG_NOTES_CAP most recent notes (by the time of their last entry). */
export function sanitizeStore(raw: unknown): Record<string, DialogEntry[]> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const items = Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, sanitizeLoaded(v)] as const).filter(([, v]) => v.length > 0);
  items.sort((a, b) => (b[1][b[1].length - 1]!.at) - (a[1][a[1].length - 1]!.at));
  return Object.fromEntries(items.slice(0, DIALOG_NOTES_CAP));
}
export const clampHeight = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(DIALOG_HEIGHT_MAX, Math.max(DIALOG_HEIGHT_MIN, Math.round(n))) : DIALOG_HEIGHT_DEFAULT);
export type DialogDock = 'bottom' | 'right';
export const clampDock = (d: unknown): DialogDock => (d === 'right' ? 'right' : 'bottom');

/** The persistence the plugin provides (data.json, keyed by note path: never in the note, never in the vault's files). */
export interface DialogStore {
  entries(path: string): DialogEntry[];
  setEntries(path: string, list: DialogEntry[]): void;
  height(): number;
  setHeight(px: number): void;
  dock(): DialogDock;
  setDock(d: DialogDock): void;
}
/** An in-memory store (the session's own history; tests; the lean fallback). */
export function memoryStore(init: { entries?: Record<string, DialogEntry[]>; height?: number; dock?: DialogDock } = {}): DialogStore {
  const map = new Map<string, DialogEntry[]>(Object.entries(init.entries ?? {}));
  let height = clampHeight(init.height), dock: DialogDock = clampDock(init.dock);
  return { entries: (p) => map.get(p) ?? [], setEntries: (p, l) => { map.set(p, l); }, height: () => height, setHeight: (n) => { height = clampHeight(n); }, dock: () => dock, setDock: (d) => { dock = clampDock(d); } };
}
/** A store over the plugin's settings object (data.json): the same object the plugin saves; `save` is the plugin's own debounced saveSettings. */
export interface DialogSettingsSlice { dialogHistory?: unknown; dialogHeight?: unknown; dialogDock?: unknown }
export function settingsStore(settings: DialogSettingsSlice, save: () => void): DialogStore {
  const store = (): Record<string, DialogEntry[]> => (settings.dialogHistory = typeof settings.dialogHistory === 'object' && settings.dialogHistory !== null ? settings.dialogHistory : {}) as Record<string, DialogEntry[]>;
  return {
    entries: (p) => sanitizeLoaded(store()[p]),
    setEntries(p, list) {
      const s = store(); s[p] = list;
      const keep = sanitizeStore(s); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, keep);        // the least recently used notes go when there are more than DIALOG_NOTES_CAP
      save();
    },
    height: () => clampHeight(settings.dialogHeight),
    setHeight(px) { settings.dialogHeight = clampHeight(px); save(); },
    dock: () => clampDock(settings.dialogDock),
    setDock(d) { settings.dialogDock = clampDock(d); save(); },
  };
}

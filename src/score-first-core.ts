// score_first_experiment M1 (drain 2026-10-21-1100) — the decisions behind "New bar" and "the Score underneath the Beat Box", pure (no obsidian).
//
// Everything that is score-first is gated by ONE question, answered by vault-profile-core.ts#isScoreFirstVault. The functions here take that answer as an input and
// return what to do; for a vault that is NOT score-first each of them returns the "as before" answer (nothing to add), which is what the P3 test pins.

import { RHYTHM_CHOICE, dataNoteContent } from './new-note-core.ts';

export const BAR_FOLDER = 'bars';
const BAR_NAME = /^bar_(\d+)$/;

/** `bar_001`, `bar_002`, … (three digits, then as many as the number needs). */
export function barName(n: number): string {
  return `bar_${String(n).padStart(3, '0')}`;
}

/** The next free bar name given the basenames already in `bars/`: one past the highest `bar_NNN` there (not the first gap — deleting bar_002 and making a bar does not hand
 *  you a name you used to know a different bar by). Names that do not look like `bar_NNN` are ignored. The path is folder-scoped, so the same name elsewhere is no collision. */
export function nextBarName(existingBasenames: Iterable<string>): string {
  let max = 0;
  for (const b of existingBasenames) {
    const m = BAR_NAME.exec(b);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return barName(max + 1);
}

export function barPath(name: string): string {
  return `${BAR_FOLDER}/${name}.md`;
}

export type NewBarPlan = { ok: true; name: string; path: string; content: string } | { ok: false; message: string };

/** A new bar: the next free name, its path, and the SAME starter content "New Forge note -> Rhythm (Beat Box)" writes (one decision function, `dataNoteContent`).
 *  `exists` is the vault lookup. The name is chosen free, so a collision can only be a race (another bar created in the same instant); then the next number is tried, up to
 *  `attempts` times, rather than a dialog asking a person to name a bar. */
export function planNewBar(input: { existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }): NewBarPlan {
  const taken = new Set(input.existingBasenames);
  const attempts = input.attempts ?? 3;
  for (let i = 0; i < attempts; i++) {
    const name = nextBarName(taken);
    const path = barPath(name);
    if (!input.exists(path)) return { ok: true, name, path, content: dataNoteContent(name, RHYTHM_CHOICE) };
    taken.add(name);
  }
  return { ok: false, message: `Could not find a free bar name in ${BAR_FOLDER}/ — try again.` };
}

/** Obsidian's refusal to create a file that is already there ("File already exists."). */
export function isFileExistsError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /already exists/i.test(m);
}

export interface NewBarPorts<F> {
  folderExists(): boolean;
  createFolder(): Promise<void>;
  /** Basenames of the notes in `bars/` right now (fresh on every call: a retry must see the bar that just took the name). */
  listBarBasenames(): string[];
  exists(path: string): boolean;
  create(path: string, content: string): Promise<F>;
  open(file: F): Promise<void>;
  notify(message: string): void;
}

export type NewBarResult = { ok: true; path: string } | { ok: false; message: string };

/** The whole "New bar" action, with the vault and the UI injected: make `bars/` if it is missing, pick the next free name from a FRESH listing, create the note with the starter content,
 *  open it in the Beat Box. A name taken in the same instant ("File already exists.") tries the next number, up to three times. Every failure is a notice naming the reason — never
 *  a dialog, never a silent nothing — and a `console.error` naming this function (caught errors go to console.error). */
export async function createNewBar<F>(ports: NewBarPorts<F>): Promise<NewBarResult> {
  const fail = (message: string): NewBarResult => { ports.notify(message); return { ok: false, message }; };
  try {
    if (!ports.folderExists()) {
      try { await ports.createFolder(); } catch (e) { if (!isFileExistsError(e)) throw e; }     // someone made it in the same instant: fine
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const plan = planNewBar({ existingBasenames: ports.listBarBasenames(), exists: (p) => ports.exists(p) });
      if (plan.ok === false) return fail(plan.message);
      let file: F;
      try {
        file = await ports.create(plan.path, plan.content);
      } catch (e) {
        if (isFileExistsError(e)) continue;               // another bar took the name in the same instant: the next number
        throw e;
      }
      await ports.open(file);
      return { ok: true, path: plan.path };
    }
    return fail('Could not make a new bar: the name kept being taken. Try again.');
  } catch (e) {
    console.error('createNewBar failed', e);
    return fail(`Could not make a new bar: ${(e as Error)?.message ?? e}`);
  }
}

/** Is "New bar" offered? Only in a score-first vault: the command, the ribbon button. Everywhere else it does not exist (not hidden — absent). */
export function newBarAvailable(scoreFirst: boolean): boolean {
  return scoreFirst === true;
}

export type ScorePanelPlan = 'none' | 'score' | 'lean-note';

/** What the Beat Box tab shows under the widget. Not score-first -> 'none' in EVERY edition (the tab is exactly what it was). Score-first -> the live Score in the music
 *  edition, and in the lean edition (no Verovio, no MIDI player) a one-line explanation instead. */
export function scorePanelPlan(input: { scoreFirst: boolean; edition: 'lean' | 'music' }): ScorePanelPlan {
  if (input.scoreFirst !== true) return 'none';
  return input.edition === 'music' ? 'score' : 'lean-note';
}

/** The lean edition's one line. */
export const LEAN_SCORE_NOTE = 'The score under the Beat Box needs the music edition of the plugin.';

/** Wording on the live panel. */
export const SCORE_RENDERING_TEXT = 'Rendering score…';

/** Rebuild-the-tab layout: in a score-first vault the iframe must not be forced to fill the pane (the Score lives under it, so a pane-high widget would push it off screen). */
export function widgetFillsPane(plan: ScorePanelPlan): boolean {
  return plan === 'none';
}

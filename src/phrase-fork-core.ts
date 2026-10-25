// score_first M9 (drain 2026-10-23-0330) — modify ONE bar of an extend phrase: fork on edit (design 4.9). The phrase stays parameters only; `overrides` names the fork notes that stand in for generated bars.
// M7c Phase B (drain 2026-10-24-1230): a morph forks the same way — the same notes, the same `overrides`, the same refusals; only the type widens (an extend or a morph).
//   Edit this bar    writes the bar's computed data as its own rhythm data note (`bars/bar_NNN.md`, next free number), THEN writes the override into the phrase JSON, THEN opens the fork in the Beat Box.
//                    If the second step fails nothing is deleted: the Notice names the leftover note.
//   Revert to generated   removes the override from the phrase JSON; the fork note stays (nothing in this milestone deletes a note).
// Pure: the vault and the UI are injected (same shape as `createNewBar` / `createNewMix`); nothing here knows about Obsidian. Not an asker of the profile: the gate is an input to whoever offers the action.
import { formatRhythmJson, type RhythmData } from './rhythm-edit-core.ts';
import type { ExtendPhrase, MorphPhrase } from './phrase-core.ts';

/** The phrases that can fork a bar: both hold `bars` and `overrides`. */
export type ForkablePhrase = ExtendPhrase | MorphPhrase;

const BAR_NAME = /^bar_(\d+)$/;

/** The bar's name for a fork: one past the highest `bar_NNN` (not the first gap), zero-padded to three like `New bar`. */
function nextBarName(existing: Iterable<string>): string {
  let max = 0;
  for (const b of existing) { const m = BAR_NAME.exec(b); if (m) max = Math.max(max, Number(m[1])); }
  return `bar_${String(max + 1).padStart(3, '0')}`;
}

/** The fork note: an ordinary rhythm data note the Beat Box opens (its body must be exactly one json block, so the lineage line is a FRONTMATTER field — the Beat Box's save rewrites only the json block and keeps
 *  every other byte, so the line survives edits). */
export function forkNoteContent(name: string, phraseNoteId: string, barNumber: number, data: RhythmData): string {
  return [
    '---',
    'type: data',
    'content_type: json',
    `description: ${JSON.stringify(`${name} — forked from ${phraseNoteId} bar ${barNumber} to edit by hand. The phrase shows this bar instead of the generated one.`)}`,
    `forked_from: ${JSON.stringify(`${phraseNoteId} bar ${barNumber}`)}`,
    '---',
    '',
    '```json',
    formatRhythmJson(data),
    '```',
    '',
  ].join('\n');
}

/** Is "Edit this bar" offered for this bar: a bar of the phrase that is not already a fork. */
export function forkable(params: ForkablePhrase, barNumber: number): boolean {
  return Number.isInteger(barNumber) && barNumber >= 1 && barNumber <= params.bars && !(params.overrides && String(barNumber) in params.overrides);
}

const numericKeys = (o: Record<string, string>): Record<string, string> => Object.fromEntries(Object.keys(o).sort((x, y) => Number(x) - Number(y)).map((k) => [k, o[k]]));

export function withOverride<P extends ForkablePhrase>(params: P, barNumber: number, noteId: string): P {
  return { ...params, overrides: numericKeys({ ...(params.overrides ?? {}), [String(barNumber)]: noteId }) };
}

/** The phrase without that bar's override; the last one takes the key away, so the phrase is exactly what it was before the first fork. */
export function withoutOverride<P extends ForkablePhrase>(params: P, barNumber: number): P {
  const { overrides, ...rest } = params;
  const left = Object.fromEntries(Object.entries(overrides ?? {}).filter(([k]) => k !== String(barNumber)));
  return (Object.keys(left).length > 0 ? { ...rest, overrides: numericKeys(left) } : rest) as P;
}

export interface ForkPorts<F> {
  /** Basenames in `bars/` right now (fresh on every call: a retry must see the bar that just took the name). */
  listBarBasenames(): string[];
  exists(path: string): boolean;
  create(path: string, content: string): Promise<F>;
  /** Rewrite the phrase's json block (one atomic read-modify-write on the vault side). */
  writePhrase(params: ForkablePhrase): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Open a note by its lineage id (`bars/bar_007`): the plugin's own opener (a bar opens in the Beat Box). */
  open(noteId: string): void | Promise<void>;
  notify(message: string): void;
  /** Obsidian's refusal to create a file that is already there. */
  isAlreadyExists(e: unknown): boolean;
  /** Permanent evidence lines (`[forge-fork] …`, Info level): optional. */
  trace?(line: string): void;
}

export type ForkResult = { ok: true; path: string; params: ForkablePhrase } | { ok: false; message: string; leftover?: string };

export async function editThisBar<F>(ports: ForkPorts<F>, input: { params: ForkablePhrase; barNumber: number; phraseNoteId: string; barData: RhythmData }): Promise<ForkResult> {
  const fail = (message: string, leftover?: string): ForkResult => { ports.notify(message); return leftover ? { ok: false, message, leftover } : { ok: false, message }; };
  const { params, barNumber, phraseNoteId, barData } = input;
  if (!forkable(params, barNumber)) return fail(`Edit this bar: bar ${barNumber} is ${Number.isInteger(barNumber) && barNumber >= 1 && barNumber <= params.bars ? 'already a fork' : 'not a bar of this phrase'}.`);
  try {
    const taken = new Set(ports.listBarBasenames());
    let path = '';
    let name = '';
    for (let attempt = 0; attempt < 3 && path === ''; attempt++) {
      name = nextBarName(taken);
      const candidate = `bars/${name}.md`;
      if (ports.exists(candidate)) { taken.add(name); continue; }
      try {
        await ports.create(candidate, forkNoteContent(name, phraseNoteId, barNumber, barData));
        path = candidate;
      } catch (e) {
        if (ports.isAlreadyExists(e)) { taken.add(name); continue; }
        throw e;
      }
    }
    if (path === '') return fail('Edit this bar: could not find a free bar name in bars/ — try again.');
    ports.trace?.(`[forge-fork] bar ${barNumber}: created ${path} (forked from ${phraseNoteId} bar ${barNumber})`);
    const next = withOverride(params, barNumber, `bars/${name}`);
    const wrote = await ports.writePhrase(next);
    if (wrote.ok === false) return fail(`Edit this bar: the phrase was not changed, but ${path} was created (use it or delete it): ${wrote.message}`, path);
    ports.trace?.(`[forge-fork] bar ${barNumber}: phrase overrides now ${JSON.stringify(next.overrides)}`);
    await ports.open(`bars/${name}`);
    ports.trace?.(`[forge-fork] bar ${barNumber}: opened bars/${name}`);
    return { ok: true, path, params: next };
  } catch (e) {
    console.error('editThisBar failed', e);
    return fail(`Edit this bar: ${(e as Error)?.message ?? e}`);
  }
}

export async function revertThisBar<F>(ports: ForkPorts<F>, input: { params: ForkablePhrase; barNumber: number }): Promise<{ ok: true; params: ForkablePhrase } | { ok: false; message: string }> {
  const fail = (message: string): { ok: false; message: string } => { ports.notify(message); return { ok: false, message }; };
  const { params, barNumber } = input;
  const fork = params.overrides?.[String(barNumber)];
  if (fork === undefined) return fail(`Revert to generated: bar ${barNumber} is not a fork.`);
  const next = withoutOverride(params, barNumber);
  const wrote = await ports.writePhrase(next);
  if (wrote.ok === false) return fail(`Revert to generated: ${wrote.message}`);
  ports.trace?.(`[forge-fork] bar ${barNumber}: reverted to generated; ${fork} stays in the vault`);
  return { ok: true, params: next };
}

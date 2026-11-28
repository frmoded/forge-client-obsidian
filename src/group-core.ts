// 2026-11-27-1050 (prompt stack stage 2; design: forge-moda-bootstrap projects/prompt-stack-architecture-design.md, decision 6) - the PURE core of the PROMPT STACK. The script stays the flat numbered list; every push is ONE GROUP over it: the
// words, the lines the push wrote and the lines it replaced. No `obsidian`, no DOM, no vault (the note's front matter is group-note-core.ts, the controller's side group-controller.ts).
//
//   pushGroup(groups, before, after, meta)   the stack after a push that made `after` out of `before`
//   reconcile(groups, list)                  the longest bottom part of the stack the list still agrees with: the rest is dropped, never a line
//   popTo(groups, list, keep)                the list as it was after `keep` groups, and the groups that go (null = nothing to pop)
//   translateGroups(...)                     a Waiting line replaced by its translation INSIDE its group
//   describePop(gone, first)                 the prompts that go, in words
//
// WHAT A GROUP PROVES. `h` is the fingerprint of the first `len` lines as the push left them, together with the positions it wrote and the lines it replaced. A group is believed only while those lines are exactly there and the entry itself is as it was
// written; popping it then gives back exactly the list it was pushed on. Lines after `len` that no group describes (typed by hand at the end) are carried along untouched. So a pop can never delete or overwrite a line that a group does not prove.
import { contentFingerprint } from './rhythm-edit-core.ts';
import { saidText } from './sentence-list-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_GROUP_CORE = 'forge-list-model-core:group-core';

export const PROMPT_MAX = 400;
export type Who = 'typed' | 'service' | 'menu';
/** A line the push replaced or took away: `i` its index (0-based) in the list as it was BEFORE the push, `t` its text. */
export interface Old { i: number; t: string }
export interface Group {
  /** The prompt's words. */
  p: string;
  /** How many lines the push wrote, and the number (1-based, as the Description numbers them) of the first one. `w` names every one of them when they are not next to each other. */
  n: number; at: number; w?: number[];
  rep: Old[];
  who: Who;
  /** Filled by a later stage (the service's model and grammar card); kept as they are. */
  model?: string; card?: string;
  ts: number;
  /** The lines of the list right after the push, and the fingerprint of those lines with `w` and `rep`. */
  len: number; h: string;
}
export interface PushMeta { words: string; who: Who; ts: number }

/** The words a group keeps: the SAME sanitiser as `(you said: ...)`, with the stack's own limit. */
export const promptWords = (raw: string): string => saidText(raw, PROMPT_MAX);

const written = (g: Pick<Group, 'n' | 'at' | 'w'>): number[] => g.w ?? Array.from({ length: g.n }, (_, k) => g.at + k);
const stamp = (after: readonly string[], at: readonly number[], rep: readonly Old[]): string => contentFingerprint(JSON.stringify([after, at, rep.map((r) => [r.i, r.t])]));
const whole = (v: unknown, min = 0): boolean => typeof v === 'number' && Number.isInteger(v) && v >= min;

/** Is this a well-formed entry? (Whether it is TRUE of a list is `reconcile`'s question.) */
export function isGroup(v: unknown): v is Group {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return typeof g.p === 'string' && whole(g.n) && whole(g.at, 1) && whole(g.len) && typeof g.h === 'string' && (g.n as number) <= (g.len as number)
    && (g.w === undefined || (Array.isArray(g.w) && g.w.length === g.n && g.w.every((x) => whole(x, 1))))
    && Array.isArray(g.rep) && g.rep.every((r) => typeof r === 'object' && r !== null && whole(r.i) && typeof r.t === 'string' && r.t.trim() !== '' && !/[\r\n]/.test(r.t));
}

/** The lines before the push, from the first `g.len` lines after it: the written ones out, the replaced ones back at their own indexes. Null: the entry does not fit them. */
function unpush<T>(after: readonly T[], g: Group, make: (t: string) => T): T[] | null {
  const at = written(g);
  if (new Set(at).size !== at.length || at.some((x) => x > after.length)) return null;
  const out = after.filter((_, i) => !at.includes(i + 1));
  let last = -1;
  for (const r of g.rep) { if (r.i <= last || r.i > out.length) return null; out.splice(r.i, 0, make(r.t)); last = r.i; }
  return out;
}

/** The list BEFORE each group, walking down from the top; null when any of them does not fit. */
function walk<T>(groups: readonly Group[], list: readonly T[], text: (x: T) => string, make: (t: string) => T): T[][] | null {
  const befores: T[][] = []; let cur: readonly T[] = list;
  for (let j = groups.length - 1; j >= 0; j--) {
    const g = groups[j];
    if (g.len > cur.length) return null;
    const head = cur.slice(0, g.len);
    if (stamp(head.map(text), written(g), g.rep) !== g.h) return null;
    const before = unpush(head, g, make);
    if (before === null) return null;
    befores[j] = [...before, ...cur.slice(g.len)];
    cur = befores[j];
  }
  return befores;
}
/** The longest bottom part of the stack that the list agrees with, and the list before each of its groups. */
function longest<T>(groups: readonly Group[], list: readonly T[], text: (x: T) => string, make: (t: string) => T): { groups: Group[]; befores: T[][] } {
  for (let m = groups.length; m > 0; m--) {
    const some = groups.slice(0, m), befores = walk(some, list, text, make);
    if (befores !== null) return { groups: some, befores };
  }
  return { groups: [], befores: [] };
}
const asText = (x: string): string => x;
const ofStrings = (groups: readonly Group[], list: readonly string[]) => longest<string>(groups, list, asText, asText);

export function reconcile(groups: readonly Group[], list: readonly string[]): Group[] { return ofStrings(groups, list).groups; }

/** The longest common run of both lists, in order: what was added to `b` and what was taken from `a` (indexes). */
function changes<T>(a: readonly T[], b: readonly T[]): { added: number[]; removed: number[] } {
  const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const added: number[] = [], removed: number[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; } else if (i < a.length && (j >= b.length || L[i + 1][j] >= L[i][j + 1])) removed.push(i++); else added.push(j++);
  }
  return { added, removed };
}

/** The entry for the change `before` -> `after` (`text` reads a line): the other fields are `base`'s. */
function entry<T>(base: Pick<Group, 'p' | 'who' | 'ts' | 'model' | 'card'>, before: readonly T[], after: readonly T[], text: (x: T) => string): Group | null {
  const { added, removed } = changes(before, after);
  if (added.length === 0 && removed.length === 0) return null;
  const at = added.map((i) => i + 1), rep = removed.map((i) => ({ i, t: text(before[i]) }));
  const first = at[0] ?? rep[0].i + 1;
  const { p, who, model, card, ts } = base;
  return {
    p, n: at.length, at: first, ...(at.every((x, k) => x === first + k) ? {} : { w: at }), rep, who, ...(model !== undefined ? { model } : {}), ...(card !== undefined ? { card } : {}), ts,
    len: after.length, h: stamp(after.map(text), at, rep),
  };
}

/** The stack after a push: the groups `before` still agrees with, then this one (none when the push changed nothing). */
export function pushGroup(groups: readonly Group[], before: readonly string[], after: readonly string[], meta: PushMeta): Group[] {
  const kept = reconcile(groups, before);
  const g = entry({ p: promptWords(meta.words), who: meta.who, ts: meta.ts }, before, after, asText);
  return g === null ? kept : [...kept, g];
}

/** Keep `keep` groups: the list as it was before the next one, the groups that stay and the ones that go. Null: there is nothing above `keep` that the list agrees with. */
export function popTo(groups: readonly Group[], list: readonly string[], keep: number): { groups: Group[]; list: string[]; gone: Group[] } | null {
  const held = ofStrings(groups, list);
  if (!whole(keep) || keep >= held.groups.length) return null;
  return { groups: held.groups.slice(0, keep), list: [...held.befores[keep]], gone: held.groups.slice(keep) };
}

/**
 * "Translate line N": line `at` (0-based) of `before` became the `count` lines of `after` at the same place. Every group keeps its own lines: wherever the Waiting line stood, in the list as it is and in the lists under the later groups, the translated
 * lines stand now (a line the write only reworded is followed the same way), and each entry is made again from those.
 */
export function translateGroups(groups: readonly Group[], before: readonly string[], after: readonly string[], at: number, count: number): Group[] {
  if (after.length !== before.length - 1 + count) return reconcile(groups, after);
  type Line = { t: string };
  const lines: Line[] = before.map((t) => ({ t }));
  const held = longest<Line>(groups, lines, (x) => x.t, (t) => ({ t }));
  const now = new Map<Line, Line[]>(lines.map((x, i) => {
    if (i === at) return [x, after.slice(at, at + count).map((t) => ({ t }))];
    const t = after[i < at ? i : i + count - 1];
    return [x, t === x.t ? [x] : [{ t }]];
  }));
  const as = (some: readonly Line[]): Line[] => some.flatMap((x) => now.get(x) ?? [x]);
  const out: Group[] = [];
  for (let j = 0; j < held.groups.length; j++) {
    const g = held.groups[j], full = j === held.groups.length - 1 ? lines : held.befores[j + 1];
    const g2 = entry(g, as(held.befores[j].slice(0, g.len - g.n + g.rep.length)), as(full.slice(0, g.len)), (x) => x.t);
    if (g2 === null) break;
    out.push(g2);
  }
  return reconcile(out, after);
}

const SHOWN = 8, WORDS = 40;
/** `2: "make it slower" (1 line). 3: ...`: the prompts that go, by their numbers (`first` = the number of the first one). A long run names the first few and says how far it goes: the dialog cuts nothing. */
export function describePop(gone: readonly Group[], first: number): string {
  const one = (g: Group, k: number): string => {
    const p = g.p === '' ? '(no words)' : g.p.length > WORDS ? `${g.p.slice(0, WORDS).trimEnd()}…` : g.p;
    return `${first + k}: "${p}" (${g.n} line${g.n === 1 ? '' : 's'}).`;
  };
  const parts = gone.slice(0, SHOWN).map(one);
  if (gone.length > SHOWN) parts.push(`and ${gone.length - SHOWN} more, up to prompt ${first + gone.length - 1}.`);
  return parts.join(' ');
}

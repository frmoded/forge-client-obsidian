// 2026-11-27-1050 (prompt stack stage 2) - the NOTE side of the prompt stack: the front matter key `groups:`, a YAML list of ONE-LINE JSON strings (Obsidian's Properties shows nested YAML badly):
//
//   groups:
//     - '{"p":"make it slower","n":1,"at":2,"rep":[],"who":"service","ts":1,"len":2,"h":"..."}'
//
// Pure: text in, text out (no `obsidian`, no vault). Only that block is ever changed; every other byte of the note stays. A `groups:` key that Forge did not write (anything but a list whose every item is a string that opens with `{"p":`) is FOREIGN:
// it is never read and never changed. A broken entry of Forge's own ends the stack there. An old plugin ignores the key and keeps its lines (its writers keep every front matter line they do not own).
import { isGroup, pushGroup, reconcile, translateGroups, type Group, type Who } from './group-core.ts';
import { parseList, type ListKind } from './sentence-list-core.ts';
import { extractDescription } from './v2-note-core.ts';

/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts); list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_GROUP_NOTE_CORE = 'forge-list-model-core:group-note-core';

const FRONT = /^---(\r?\n)([\s\S]*?)\r?\n---(?=[ \t]*(?:\r?\n|$))/;
/** `none`: no key; `ours`: Forge's (or empty); `foreign`: left alone. */
export interface Stored { state: 'none' | 'ours' | 'foreign'; groups: Group[] }
interface Block extends Stored { eol: string; lines: string[]; start: number; end: number; matched: string }

/** One QUOTED YAML string on one line: single quoted, or double quoted (read as JSON). Null: not one this reads. 2026-11-27-1050 (mutation pass): an item without quotes is never one (a `{...}` there is a YAML mapping, not a string Forge wrote). */
function scalar(s: string): string | null {
  if (s.startsWith('\'')) { const inner = s.slice(1, -1); return s.length > 1 && s.endsWith('\'') && !inner.replace(/''/g, '').includes('\'') ? inner.replace(/''/g, '\'') : null; }
  try { const v: unknown = JSON.parse(s); return typeof v === 'string' ? v : null; } catch { return null; }
}

function block(text: string): Block | null {
  const m = FRONT.exec(text);
  if (m === null) return null;
  const lines = m[2].split(/\r?\n/);
  const keys = lines.map((l, i) => (/^["']?groups["']?[ \t]*:/.test(l) ? i : -1)).filter((i) => i >= 0);
  const base = { eol: m[1], lines, matched: m[0], groups: [] as Group[] };
  if (keys.length === 0) return { ...base, state: 'none', start: lines.length, end: lines.length };
  const start = keys[0]; let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^[\s\-#]/.test(lines[end]))) end++;          // the value: everything up to the next key
  const foreign: Block = { ...base, state: 'foreign', start, end };
  const head = /^groups[ \t]*:(.*)$/.exec(lines[start]), rest = head === null ? null : head[1].trim();
  const body = lines.slice(start + 1, end).filter((l) => l.trim() !== '');
  if (keys.length > 1 || rest === null || (rest !== '' && rest !== '[]') || (rest === '[]' && body.length > 0)) return foreign;
  const groups: Group[] = []; let broken = false;
  for (const line of body) {
    const item = /^[ \t]*-[ \t]+(.*?)[ \t]*$/.exec(line), s = item === null ? null : scalar(item[1]);
    if (s === null || !s.startsWith('{"p":')) return foreign;
    let v: unknown = null; try { v = JSON.parse(s); } catch { /* ours, and broken */ }
    broken = broken || !isGroup(v);
    if (!broken) groups.push(v as Group);
  }
  return { ...base, state: 'ours', groups, start, end };
}

export function readGroups(text: string): Stored { const b = block(text); return b === null ? { state: 'none', groups: [] } : { state: b.state, groups: b.groups }; }

/** The characters JSON leaves as they are and YAML does not allow in a line (or reads as a line break). */
const YAML_UNSAFE = /[\u007f-\u009f\u2028\u2029\ufeff\ufffe\uffff]/g;
const item = (g: Group): string => {
  const json = JSON.stringify({ p: g.p, ...g }).replace(YAML_UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return `  - '${json.replace(/'/g, '\'\'')}'`;
};

/** The note with this stack (an empty one takes the key away). A note without front matter, or with a foreign `groups:`, is returned as it is; so is a note whose block already says this. */
export function writeGroups(text: string, groups: readonly Group[]): string {
  const b = block(text);
  if (b === null || b.state === 'foreign' || (b.state === 'none' && groups.length === 0)) return text;
  const next = [...b.lines.slice(0, b.start), ...(groups.length === 0 ? [] : ['groups:', ...groups.map(item)]), ...b.lines.slice(b.end)];
  if (next.length === b.lines.length && next.every((l, i) => l === b.lines[i])) return text;
  return `---${b.eol}${next.join(b.eol)}${b.eol}---${text.slice(b.matched.length)}`;
}

/** Detach: a custom note has no stack (a foreign key stays). */
export const dropGroups = (text: string): string => writeGroups(text, []);

const listIn = (text: string, kind: ListKind): string[] => parseList(extractDescription(text), kind, { bars: [], phrases: [], arrangements: [], compositions: [], kits: [] }).list;          // (a numbered list, as every writer renders it, is read without the vault)

/** Every write of the list (the writers call this on what they made): the groups the new list no longer agrees with are dropped, from the first of them up. A note without the key is not touched. */
export function carryGroups(text: string, kind: ListKind): string {
  const s = readGroups(text);
  return s.state === 'ours' ? writeGroups(text, reconcile(s.groups, listIn(text, kind))) : text;
}

/** What a write does to the stack beyond carrying it: a push (a new group), a translation inside a group, or a stack to put back (`set`: undo, redo, pop). `expect`: write only while the stack on disk is this one; `list`: only if the note then says this list. */
export interface GroupOp {
  push?: { words: string; who: Who; ts: number };
  translate?: { at: number; count: number };
  set?: Group[];
  expect?: string;
  list?: readonly string[];
}

/**
 * The stack of a list write, decided inside the one `process`: `cur` the note on disk, `before` its list, `written` the note the list writer made. First the stack on disk is held against `before` (a hand edit shortens it), then the operation is made.
 * `undo` is what the undo entry keeps (the stack before and after). Null: a condition of the operation does not hold, so nothing is to be written. A foreign key records nothing.
 */
export function writeNoteGroups(cur: string, written: string, before: readonly string[], kind: ListKind, op: GroupOp = {}): { text: string; undo?: { before: Group[]; after: Group[] } } | null {
  const stored = readGroups(cur);
  if (stored.state === 'foreign') return op.expect === undefined ? { text: written } : null;
  const was = reconcile(stored.groups, before), after = listIn(written, kind);
  if (op.expect !== undefined && JSON.stringify(was) !== op.expect) return null;
  if (op.list !== undefined && JSON.stringify(after) !== JSON.stringify(op.list)) return null;
  const next = op.push !== undefined ? pushGroup(was, before, after, op.push) : op.translate !== undefined ? translateGroups(was, before, after, op.translate.at, op.translate.count) : reconcile(op.set ?? was, after);
  return { text: writeGroups(written, next), undo: { before: was, after: next } };
}

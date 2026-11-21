// 2026-11-20-1005 (F9) - a renamed note's frontmatter `description:` follows the rename. The plugin writes generated descriptions that START with the note's name and an em dash (`phrase_016 — [[bar_005]] extended to 4 bars: ...`); when the note
// is renamed the name in those words becomes the new one. A description a person wrote (anything that does not start with the old name and the dash) is never touched. Pure: text in, text out (or null: nothing to do).
/** 2026-11-19-0997: this core is the LIST MODEL's (reached only through src/list-model-selected.ts; see rename-follow-core.ts). */
export const LIST_MODEL_SENTINEL_RENAME_DESCRIPTION_CORE = 'forge-list-model-core:rename-description-core';
const DASH = ' — ';
const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const SAFE_PLAIN = /^[\w .()-]+$/;

export function followRenamedName(text: string, oldName: string, newName: string): string | null {
  if (oldName === '' || newName === '' || oldName === newName) return null;
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (m === null) return null;
  const front = m[1], lines = front.split('\n');
  const at = lines.findIndex((l) => l.startsWith('description:'));
  if (at < 0) return null;
  const value = lines[at].slice('description:'.length).replace(/^ /, '');
  let next: string | null = null;
  if (value.startsWith('"')) { const from = `"${esc(oldName)}${DASH}`; if (value.startsWith(from)) next = `"${esc(newName)}${DASH}${value.slice(from.length)}`; }
  else { const from = `${oldName}${DASH}`; if (value.startsWith(from)) next = SAFE_PLAIN.test(newName) ? `${newName}${DASH}${value.slice(from.length)}` : `"${esc(newName)}${DASH}${esc(value.slice(from.length))}"`; }
  if (next === null) return null;
  lines[at] = `description: ${next}`;
  return `${text.slice(0, 4)}${lines.join('\n')}${text.slice(4 + front.length)}`;
}

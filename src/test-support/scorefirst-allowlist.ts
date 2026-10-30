// 2026-10-29-0840 (CC 0820 recommendation 3) - the reader and the detector behind the ONE allowlist (scorefirst-allowlist.json) of the scoreFirst mechanism pins. The property the pins keep is "nothing but the gate reads the profile, and every
// other file that touches the Score area or the flag is a file somebody decided about": a file is allowed a RIGHT (import the Score area / profile modules, mention scoreFirst, call renderTaggedMusicXML, read the profile) by being listed with a
// ROLE, and a role says which rights it can ever carry - only the role "asks the profile" may read the profile. A new file that touches the gate is one line in one file, not an edit of a list in each of three tests.
// The measure is exact in both directions (a file that exercises a right it is not listed for AND a listed right the file no longer exercises are both reported), so the list cannot rot. Tests: src/scorefirst-allowlist.test.ts (the reader, the detector,
// the control runs); the pins that use it: score-first-p3.test.ts (imports, mentions, reads-profile) and score-click-play-pins.test.ts (renders).
import fs from 'node:fs';
import path from 'node:path';

export type Right = 'imports' | 'mentions' | 'renders' | 'reads-profile';
export const RIGHTS: readonly Right[] = ['imports', 'mentions', 'renders', 'reads-profile'];
export interface Entry { file: string; role: string; rights: Right[] }
export interface Allowlist { roles: Record<string, { may: Right[] }>; entries: Entry[] }

const isRight = (r: unknown): r is Right => typeof r === 'string' && (RIGHTS as readonly string[]).includes(r);

/** The list, checked: every entry names a file once, a known role, and rights that role may carry; only one role may read the profile. Throws a sentence naming the line. */
export function parseAllowlist(json: string): Allowlist {
  let raw: any;
  try { raw = JSON.parse(json); } catch (e) { throw new Error(`the allowlist is not JSON: ${(e as Error).message}`); }
  const roles: Allowlist['roles'] = {};
  for (const [name, def] of Object.entries(raw?.roles ?? {}) as Array<[string, any]>) {
    const may = def?.may;
    if (!Array.isArray(may) || !may.every(isRight)) throw new Error(`the role "${name}" needs "may": a list of rights (${RIGHTS.join(', ')})`);
    roles[name] = { may };
  }
  const readers = Object.keys(roles).filter((n) => roles[n].may.includes('reads-profile'));
  if (readers.length > 1) throw new Error(`only one role may read the profile (found: ${readers.join(', ')})`);
  const entries: Entry[] = [];
  const seen = new Set<string>();
  for (const e of (raw?.entries ?? []) as any[]) {
    if (typeof e?.file !== 'string' || e.file === '') throw new Error('every entry needs a file');
    if (seen.has(e.file)) throw new Error(`${e.file} is listed twice`);
    seen.add(e.file);
    if (!(e.role in roles)) throw new Error(`${e.file}: the role "${e.role}" is not one of: ${Object.keys(roles).join(', ')}`);
    if (!Array.isArray(e.rights) || e.rights.length === 0) throw new Error(`${e.file}: list at least one right`);
    for (const r of e.rights) {
      if (!isRight(r)) throw new Error(`${e.file}: "${r}" is not a right`);
      if (!roles[e.role].may.includes(r)) throw new Error(`${e.file}: the role "${e.role}" may not have the right "${r}"`);
    }
    entries.push({ file: e.file, role: e.role, rights: e.rights });
  }
  return { roles, entries };
}

export function loadAllowlist(): Allowlist {
  return parseAllowlist(fs.readFileSync(new URL('./scorefirst-allowlist.json', import.meta.url), 'utf8'));
}

/** The production sources of a directory (not tests, not generated), name -> text. */
export function readSources(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.generated.ts')) out[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  return out;
}

const stripComments = (text: string): string => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const DETECT: Record<Right, RegExp> = {
  imports: /from ['"]\.\/(vault-profile-core|score-first-core|score-first|live-score-core|live-score-dom)\.ts['"]/,
  mentions: /score_first|scoreFirst/i,
  renders: /\.renderTaggedMusicXML\(/,
  'reads-profile': /isScoreFirstVault|vault-profile-core/,
};

/** For each source, the rights it exercises (a source with none is left out). */
export function measure(sources: Record<string, string>): Record<string, Right[]> {
  const out: Record<string, Right[]> = {};
  for (const [name, text] of Object.entries(sources)) {
    const code = stripComments(text);
    const rights = RIGHTS.filter((r) => DETECT[r].test(code));
    if (rights.length > 0) out[name] = [...rights];
  }
  return out;
}

const PHRASE: Record<Right, [string, string]> = {
  imports: ['imports the Score area/profile modules', 'import the Score area/profile modules'],
  mentions: ['mentions scoreFirst', 'mention scoreFirst'],
  renders: ['calls renderTaggedMusicXML', 'call renderTaggedMusicXML'],
  'reads-profile': ['reads the profile', 'read the profile'],
};

/** Where the tree and the list disagree about one right (or every right): an unlisted file that exercises it, and a listed file that no longer does. Empty = they agree. */
export function problems(measured: Record<string, Right[]>, list: Allowlist, only?: Right): string[] {
  const out: string[] = [];
  for (const right of only ? [only] : RIGHTS) {
    const granted = new Set(list.entries.filter((e) => e.rights.includes(right)).map((e) => e.file));
    const exercised = new Set(Object.keys(measured).filter((f) => measured[f].includes(right)));
    for (const f of [...exercised].sort()) if (!granted.has(f)) out.push(`${f} ${PHRASE[right][0]} but is not allowed to: add it to scorefirst-allowlist.json with a role`);
    for (const f of [...granted].sort()) if (!exercised.has(f)) out.push(`${f} is allowed to ${PHRASE[right][1]} but no longer does: take the line or the right out of scorefirst-allowlist.json`);
  }
  return out;
}

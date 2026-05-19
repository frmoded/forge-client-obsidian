// Pure, dependency-free Forge-ribbon dispatcher logic. NOTHING in this
// file may import 'obsidian' (or anything that transitively does) — it is
// imported directly by forge-action.test.ts and run under `node --test`
// with no bundler. The UI layer (forge-action.ts) re-exports everything
// here so callers have a single import surface.

// Known engine domains the wizard / declare-domains dialog offers. Not
// every domain is registry-installable (forge-music isn't published yet);
// `vault` null means "declare the domain but skip the install path".
export const KNOWN_DOMAINS: Array<{
  id: string;
  label: string;
  vault: string | null;
}> = [
  { id: 'moda', label: 'MoDa (agent-based simulation)', vault: 'forge-moda' },
  { id: 'music', label: 'Music (composition & analysis)', vault: 'forge-music' },
];

export type ForgeActionContext =
  | { kind: 'init' }                          // no forge.toml
  | { kind: 'legacy' }                        // forge.toml, no `domains`
  | { kind: 'domains'; domains: string[] };   // forge.toml with `domains`

/** Decide which Forge UI to show from the two facts the caller can
 *  cheaply observe: does forge.toml exist, and (if so) what did parsing
 *  its `domains` field yield — `undefined` = field absent (legacy),
 *  array (possibly empty) = declared. */
export function forgeActionContext(
  tomlExists: boolean,
  domainsField: string[] | undefined,
): ForgeActionContext {
  if (!tomlExists) return { kind: 'init' };
  if (domainsField === undefined) return { kind: 'legacy' };
  return { kind: 'domains', domains: domainsField };
}

/** Parse the `domains` array out of a forge.toml string.
 *  Returns undefined when the field is absent (legacy vault), or the
 *  declared list (possibly empty) when present. Single- or multi-line
 *  array bodies both supported. */
export function parseDomainsField(toml: string): string[] | undefined {
  const m = toml.match(/^\s*domains\s*=\s*\[([\s\S]*?)\]/m);
  if (!m) return undefined;
  return Array.from(m[1].matchAll(/["']([^"']+)["']/g)).map(x => x[1]);
}

/** Same rule as the engine's manifest `name` validator
 *  (^[a-z][a-z0-9-]{2,63}$): lowercase start, alnum/dash, 3–64 chars. */
export function isValidVaultName(name: string): boolean {
  return /^[a-z][a-z0-9-]{2,63}$/.test(name);
}

/** Build the forge.toml body for a freshly-initialized vault. */
export function renderForgeToml(name: string, domains: string[]): string {
  const list = domains.length
    ? '[' + domains.map(d => `"${d}"`).join(', ') + ']'
    : '[]';
  return [
    `name = "${name}"`,
    `version = "0.1.0"`,
    `description = "Forge vault."`,
    `domains = ${list}`,
    '',
  ].join('\n');
}

/** Rewrite (or append) the `domains` field of an EXISTING forge.toml
 *  body, leaving every other field intact. Used when extending a vault
 *  that already has a manifest — unlike renderForgeToml, which writes a
 *  fresh file from scratch and would clobber name/version/dependencies.
 *
 *  The array matcher is multi-line aware (`[\s\S]*?` up to the first
 *  `]`): the installer reformats `domains` to a multi-line array, so a
 *  line-anchored `.*` replace would rewrite only `domains = [` and leave
 *  the `"moda",` / `]` lines dangling — corrupting the file. */
export function replaceForgeTomlDomains(
  toml: string,
  domains: string[],
): string {
  const list =
    '[' + domains.map(d => `"${d}"`).join(', ') + ']';
  if (/^\s*domains\s*=\s*\[[\s\S]*?\]/m.test(toml)) {
    return toml.replace(
      /^\s*domains\s*=\s*\[[\s\S]*?\]/m, `domains = ${list}`);
  }
  // Legacy vault with no `domains` field at all → append one.
  return toml.replace(/\n*$/, `\ndomains = ${list}\n`);
}

/** Union of an existing domain list with newly chosen ids, order
 *  preserved (existing first), duplicates dropped. `undefined` existing
 *  (legacy / field absent) is treated as `[]`. */
export function unionDomains(
  existing: string[] | undefined,
  added: string[],
): string[] {
  const out: string[] = [];
  for (const d of [...(existing ?? []), ...added]) {
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** Diff a target domain list against the current one — what would have
 *  to be installed (to_add) and what would be removed from the manifest
 *  (to_remove). Order in each result follows the source list it came
 *  from. Used by the Edit-vault-domains modal to decide whether to
 *  show the removal-confirmation dialog. */
export function diffDomains(
  prev: string[],
  next: string[],
): { to_add: string[]; to_remove: string[] } {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    to_add: next.filter(d => !prevSet.has(d)),
    to_remove: prev.filter(d => !nextSet.has(d)),
  };
}

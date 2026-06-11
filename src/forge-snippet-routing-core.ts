// v0.2.123 — pure-core: decide which branch of forgeSnippet a given
// file should dispatch to. Extracted from main.ts:forgeSnippet so
// the routing logic is testable in isolation from Obsidian's
// metadataCache + workspace state.
//
// Three branches:
//   - 'moda':         Forge-click on a forge-moda/ snippet with
//                     `featured: true` in frontmatter. Opens the moda
//                     simulator tab + dispatches featured-run; SKIPS
//                     the local runSnippet path entirely. (Per the
//                     v0.2.106 narrowing — leaf moda snippets must
//                     fall through to authoring, not auto-open the
//                     simulator.)
//   - 'python-mode':  edit_mode: python in frontmatter. Runs as-is;
//                     skips /generate and the E-- transpile path.
//   - 'english-mode': default. Routes through routeActionCodeRegen
//                     (E-- first, /generate fallback per v0.2.121).
//
// Per the cc-prompt-queue.md HARD RULE about path-prefix gates
// needing positive frontmatter signal (added v0.2.106), the moda
// gate combines the `forge-moda/` path-prefix AND the `featured: true`
// frontmatter marker. Single-source-of-truth here so future code
// changes can't accidentally drop one of the two checks.

export type ForgeRouting =
  | { kind: 'moda' }
  | { kind: 'python-mode' }
  | { kind: 'english-mode' };

/** Pure decision for forgeSnippet's branch dispatch. No side
 *  effects; no Obsidian API access. Caller supplies the file's
 *  vault-relative path AND the parsed frontmatter (or null if
 *  metadataCache hasn't populated yet).
 *
 *  `featured === true` is a STRICT boolean check — string "true"
 *  doesn't match, per the existing main.ts:isModaFeaturedSnippet
 *  semantics. YAML's `featured: true` parses to a boolean, so this
 *  is the correct strictness.
 *
 *  `edit_mode === 'python'` is a STRICT string check.
 *
 *  Both checks are robust against null/undefined frontmatter (the
 *  metadataCache may return undefined frontmatter for files whose
 *  cache hasn't populated yet) — in that case we fall through to
 *  english-mode. */

/** v0.2.125 — does this frontmatter object carry at least one
 *  routing-relevant key (`featured` or `edit_mode`)?
 *
 *  Used by `main.ts:readFrontmatterForRouting` to decide whether
 *  the cached frontmatter from metadataCache is fresh enough to
 *  drive the routing decision, OR whether the cache is stale-
 *  non-null and we need to fall through to the disk read.
 *
 *  v0.2.124 shipped the disk-fallback with `if (cachedFm)` —
 *  too permissive: a stale cache returning `{ type: 'action' }`
 *  (missing `featured`) would short-circuit the disk read and
 *  silently misroute the snippet. Per the forge-core v0124
 *  review, the gap is the prime suspect for any post-v0.2.124
 *  simulation regression. v0.2.125 closes it by requiring at
 *  least one routing key to be present before trusting the
 *  cache. */
export function hasRoutingKeys(
  frontmatter: Record<string, unknown> | null | undefined,
): boolean {
  if (!frontmatter) return false;
  return 'featured' in frontmatter || 'edit_mode' in frontmatter;
}

/** v0.2.125 — minimal inline YAML head parser for the routing
 *  decision. Reads `key: value` lines between two `---`
 *  delimiters at the top of `body` and returns them as an
 *  object.
 *
 *  Limitations (deliberate):
 *  - Only top-level scalar `key: value`. No nested mappings,
 *    no sequences, no multi-line strings.
 *  - Strips surrounding `"` / `'` quotes.
 *  - Coerces `featured: true|false` to boolean. All other
 *    values stay as strings.
 *
 *  Returns `null` when the body has no `---` frontmatter
 *  delimiter at line 1. Returns `{}` when the delimiter exists
 *  but contains no parseable keys. */
export function parseRoutingFrontmatter(
  body: string,
): Record<string, unknown> | null {
  const lines = body.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const fm: Record<string, unknown> = {};
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '---') break;
    const fmMatch = t.match(/^(\w+):\s*(.+?)\s*$/);
    if (!fmMatch) continue;
    const key = fmMatch[1];
    let v: unknown = fmMatch[2];
    if (typeof v === 'string'
        && ((v.startsWith('"') && v.endsWith('"'))
            || (v.startsWith("'") && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    if (key === 'featured' && v === 'true') v = true;
    else if (key === 'featured' && v === 'false') v = false;
    fm[key] = v;
  }
  return fm;
}

export function decideForgeRouting(
  filePath: string,
  frontmatter: Record<string, unknown> | null | undefined,
): ForgeRouting {
  // Precedence: python-mode > moda > english-mode.
  //
  // python-mode wins because it's an explicit user-mode toggle —
  // when the user has flipped `edit_mode: python`, they expect to
  // run the # Python facet directly, regardless of any other
  // frontmatter signals. Pre-v0.2.123 main.ts checked moda before
  // python-mode, so an authored `edit_mode: python` on a moda
  // featured snippet would have been silently overridden by the
  // simulator-auto-open path. Spec drift caught by the v0.2.123
  // routing-extraction TDD.
  if (frontmatter && frontmatter.edit_mode === 'python') {
    return { kind: 'python-mode' };
  }
  if (
    filePath.startsWith('forge-moda/')
    && frontmatter
    && frontmatter.featured === true
  ) {
    return { kind: 'moda' };
  }
  return { kind: 'english-mode' };
}

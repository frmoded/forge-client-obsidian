// Pure-core helper for reading the v0.2.55 `facet_form` frontmatter
// field. Used by main.ts's Forge-click handler to gate the
// `/generate` LLM call: `facet_form: canonical` skips /generate
// entirely (the engine compiles via E--'s deterministic compiler
// at runtime); `facet_form: free` and absent both keep the legacy
// /generate path.
//
// Companion to the engine-side `forge.core.executor.resolve_action_code`
// (forge/forge/core/executor.py) which performs the actual E--
// transpile when the engine sees a canonical snippet with no
// pre-generated Python facet.
//
// Pure-core extraction No. 20. No `obsidian` import; `node --test`
// exercises this without a shim.

/** Recognized `facet_form` values per the v0.2.55 schema.
 *  - `'canonical'`: snippet's English facet IS canonical E--;
 *    engine compiles deterministically via `forge.e_minus_minus`
 *    at runtime; plugin skips `/generate`.
 *  - `'free'`: free English; plugin calls `/generate` to produce
 *    Python before the engine runs. (Same as the default.)
 *  - `undefined`: field absent; identical to `'free'` for routing.
 *
 *  Unknown values fall through to `undefined` (treated as `'free'`)
 *  per the defensive default — better to mis-route to the legacy
 *  path than mis-route to an experimental new path. */
export type FacetForm = 'canonical' | 'free' | undefined;

/** Read the `facet_form` field from a snippet's frontmatter object.
 *
 *  Accepts whatever shape Obsidian's `metadataCache.getFileCache(file)
 *  ?.frontmatter` produces — typically a plain object or undefined
 *  when frontmatter is absent. Returns one of the recognized values
 *  or `undefined`.
 *
 *  Idempotent + side-effect-free; safe to call repeatedly. */
export function getFacetForm(frontmatter: unknown): FacetForm {
  if (frontmatter === null || typeof frontmatter !== 'object') {
    return undefined;
  }
  const value = (frontmatter as Record<string, unknown>).facet_form;
  if (value === 'canonical') return 'canonical';
  if (value === 'free') return 'free';
  return undefined;
}

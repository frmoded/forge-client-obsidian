# B7.2 — Plugin-side wikilink interception for Python builtins (Option A from B7.2 brainstorm)

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. The constitution amendment this prompt implements landed in V2a v9 with new B7.2 — re-read constitution end-to-end (Mission preamble, A4.1 V2a v8 sibling-subdir extension, B7.1 canonical call syntax, B7.2 new builtin clause) before writing any code.

## Scope

Implement V2a v9 B7.2: the Forge plugin intercepts Obsidian wikilink-clicks when the target is a recognized Python builtin (`print`, `len`, etc.). Show a Notice or tooltip naming the builtin; suppress Obsidian's default "create unresolved file" behavior so the vault doesn't accumulate stray `print.md`, `len.md`, etc.

Discovered as a real UX gap during user's v0.2.55 Forge-click of `forge-moda/canonical_demo.md` (which contains `Do [[print]]("Canonical form works.")`). Clicking the rendered `[[print]]` wikilink created a stray `~/forge-vaults/<vault>/print.md` — Obsidian's default for unresolved wikilinks. Per the Mission's "low floor" property: every stray file the user cleans up is friction in the wrong place.

What this prompt does NOT do:
- Modify E-- spec or the canonical syntax itself. B7.1 stays; `[[name]](args)` is still the call shape.
- Ship builtin reference snippets (Option B from the brainstorm — v0.4.x candidate).
- Coordinate with E-- cowork for a spec-level builtin distinction (Option C — v1.0+ research).
- Add a settings page for "manage recognized builtins."
- Change the engine's transpile path. Engine is unaffected; this is purely a plugin-side click interception.
- Touch chip palette discovery / insertion logic (separate from wikilink-click behavior).

## Why

Per Mission V2a v9: canonical snippets are now the target form (Stage 2 shipped). Every Forge-click of a canonical snippet that uses common builtins (and most will, since `print` is the natural debug tool + every chapter 1 tutorial snippet will use it) triggers the wikilink-click pollution unless intercepted. Without B7.2 implementation, the constructionism mission's "low floor" property loses points fast as more canonical snippets ship.

Mission's "speed second" tiebreaker: this prompt is small (~50 lines of plugin code + a hard-coded builtins list + tests). Ships in v0.2.57 within a day.

## Files likely to touch

NEW pure-core helper:
- `~/projects/forge-client-obsidian/src/python-builtins-core.ts` — exports `PYTHON_BUILTINS: Set<string>` and `isPythonBuiltin(name: string): boolean`. Pure-core extraction #22. No `obsidian` import.
- `~/projects/forge-client-obsidian/src/python-builtins-core.test.ts` — NEW. TDD cases.

NEW glue / plugin wiring:
- `~/projects/forge-client-obsidian/src/main.ts` — register a markdown post-processor and/or DOM-level click interceptor that scans rendered wikilinks against `PYTHON_BUILTINS`. Suppress click + show Notice when matched.

Possible plumbing options (Phase 1 investigation determines which):
- `this.registerMarkdownPostProcessor(...)` — finds wikilinks in rendered preview; rewrites their behavior.
- `app.workspace.on('quick-preview', ...)` — alternative hook.
- DOM-level event capture on the editor pane — last resort.

Other:
- `~/projects/forge-client-obsidian/manifest.json` — `{CURRENT} → {NEXT_PATCH}` placeholder.
- `~/projects/forge-client-obsidian/INSTALL.md` — version pin update.

## Files to read first

- `~/projects/forge/docs/specs/constitution.md` — re-read end-to-end per the pre-drain re-read rule. B7.2 is the new clause; B7.1 + A4.1 (V2a v8) are the existing related context.
- `~/projects/forge-client-obsidian/src/main.ts` — existing `editor-menu` registration (around line 493 per prior drains) shows the pattern for Obsidian event hooks. The wikilink-click interception will use a similar pattern, possibly different event name.
- `~/projects/forge-client-obsidian/src/wikilink-freeze-menu-core.ts` — sibling pure-core; reference for the shape and tests.
- Obsidian plugin API docs (skim) — `Plugin.registerMarkdownPostProcessor`, `Plugin.registerDomEvent`, and `Workspace` event names. CC reads what's available; my preferred path is `registerMarkdownPostProcessor` since it's the documented hook for rewriting rendered markdown.

## Implementation notes

### `python-builtins-core.ts` shape

```typescript
// Vetted list of Python builtins recognized by Forge. Conservative — only
// the names that show up in everyday creative work + tutorial snippets.
// Authors who want a less-common builtin can wrap it in a snippet or
// qualify with explicit `python:` prefix (future).
export const PYTHON_BUILTINS: Set<string> = new Set([
  // I/O
  'print', 'input', 'open',
  // Sequences + comprehensions
  'len', 'range', 'enumerate', 'zip', 'map', 'filter',
  'sorted', 'reversed', 'min', 'max', 'sum',
  // Type construction
  'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
  // Type introspection
  'type', 'isinstance', 'hasattr', 'getattr', 'setattr',
  // Math
  'abs', 'round', 'pow', 'divmod',
  // Misc
  'iter', 'next', 'any', 'all',
]);

export function isPythonBuiltin(name: string): boolean {
  return PYTHON_BUILTINS.has(name);
}
```

Constitution B7.2 lists the names verbatim. Keep this set in sync if/when B7.2 is amended. The set is small enough to maintain by hand; not worth an automated sync.

### Glue layer — main.ts

Phase 1 investigation determines whether `registerMarkdownPostProcessor` is the right hook. Likely shape:

```typescript
this.registerMarkdownPostProcessor((element, context) => {
  // Find all internal wikilinks in the rendered element.
  const internalLinks = element.querySelectorAll('a.internal-link');
  for (const link of internalLinks) {
    const target = link.getAttribute('data-href') || link.getAttribute('href');
    if (!target) continue;
    // Strip subpath / heading if any (e.g. "print#section" → "print").
    const targetName = target.split(/[#|]/)[0];
    if (isPythonBuiltin(targetName)) {
      // Suppress default click; show Notice on click.
      link.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        new Notice(`'${targetName}' is a Python builtin — no Forge snippet to navigate to.`);
      }, { capture: true });
      // Visual hint: mark the link as a builtin (CSS class).
      link.classList.add('forge-builtin-ref');
    }
  }
});
```

CC reads Obsidian's API docs to confirm `a.internal-link` selector + `data-href` are the right attributes. If different in current Obsidian version, adjust.

### CSS hint (optional but useful)

`~/projects/forge-client-obsidian/styles.css` — add a small rule for `.forge-builtin-ref` (e.g., italic + muted color) so the user can visually distinguish builtin refs from snippet refs in rendered preview. Subtle, not loud.

### Live preview consideration

Obsidian's live preview mode handles wikilinks slightly differently than reading mode. The post-processor approach covers reading mode reliably; live preview may need an additional hook. Phase 1 investigation determines the gap; Phase 2 handles whichever modes need separate wiring.

If live preview can't be cleanly intercepted via plugin API, document the limitation in §2 + recommend "use reading mode for canonical snippets" as a workaround. Don't try a brittle DOM-injection hack.

## Phase shape — investigation-before-design rider

Two-phase per the rider:

**Phase 1 — investigation (small)**:
1. Read Obsidian API docs for the right wikilink-click hook. `registerMarkdownPostProcessor` is the favored guess; verify or refute.
2. Confirm the DOM attribute names (`data-href` vs `href` vs `data-link`) for internal links in current Obsidian version. Likely a 2-minute browser-devtools check.
3. Investigate live preview vs reading mode behavior. Either both work with the same hook OR they need separate handling OR live preview can't be cleanly intercepted (document the limitation).
4. Confirm `Notice` is the right user-facing surface — or if tooltip is more appropriate. Notice is simpler; tooltip is nicer UX but more code. Probably Notice for v1 implementation.

Commit Phase 1 findings before Phase 2 starts. No code change in Phase 1; just write the §1.2 investigation.

**Phase 2 — implementation (TDD discipline)**:

`python-builtins-core.test.ts` — TDD cases:

1. `isPythonBuiltin('print')` → `true`.
2. `isPythonBuiltin('len')` → `true`.
3. `isPythonBuiltin('my_snippet')` → `false`.
4. `isPythonBuiltin('Print')` → `false` (case-sensitive — Python is case-sensitive).
5. `isPythonBuiltin('')` → `false` (defensive).
6. `isPythonBuiltin('print#heading')` → `false` (the caller is responsible for stripping subpaths before passing).
7. Set contains expected exhaustive names from B7.2 (one assertion per builtin name; ~30 cases via parameterized test).
8. Idempotent: calling `isPythonBuiltin('print')` twice returns the same result.
9. `PYTHON_BUILTINS` is exported as a Set (not array) for O(1) lookup.

Glue-layer tests are limited (post-processor runs against rendered DOM in Obsidian; can't be unit-tested against `node --test`). At minimum: verify the post-processor is registered (sanity check via plugin lifecycle inspection) and that the CSS class is added when expected.

CC writes a node-side smoke (`scripts/smoke-builtin-wikilink-suppression.mjs`) that:
1. Constructs a minimal mock Element with `<a class="internal-link" data-href="print">print</a>`.
2. Invokes the post-processor logic.
3. Asserts the click handler is attached, the CSS class is added, and a manual click triggers the Notice (mocked).

### User-side smoke (CC writes §3 per 6a/6b)

Paste-able commands + UI prose. Specifically exercises:

1. Install v0.X.X. Open the smoke vault.
2. Forge-click `forge-moda/canonical_demo.md` (the test vector that surfaced the bug). Expect: `Canonical form works.` in output panel.
3. In reading mode, click the `[[print]]` wikilink in the snippet body. Expect: a Notice appears: `'print' is a Python builtin — no Forge snippet to navigate to.` NO stray `print.md` created.
4. Cleanup check: `ls ~/forge-vaults/smoke-v0.2.13/ | grep print.md` should return nothing (no stray file).
5. Same test in live preview mode. Note any difference (per Phase 1 investigation).
6. Negative case: a snippet with `[[my_real_snippet]]` wikilink → click navigates normally (existing behavior preserved).

If you have a stray `print.md` from the prior test (the one before this fix), include cleanup in pre-conditions: `rm ~/forge-vaults/smoke-v0.2.13/print.md`.

## Out of scope

- Implementing tooltip hover behavior (Phase 1 may surface it as easy; if so, fine; if not, Notice-on-click is sufficient).
- Extending B7.2 list with module-prefixed builtins (`math.sqrt`, `json.loads`, etc.) — too many; better future-proofed via the wrap-in-snippet escape hatch.
- Builtin reference documentation (Option B from the brainstorm).
- E-- spec change for builtin distinction (Option C from the brainstorm).
- Visual icon next to the wikilink in editing modes (subtle styling via CSS class is enough).

## Don'ts

- **Don't ship without Phase 1 investigation.** Obsidian's post-processor / event API surface is the load-bearing risk; verify before designing.
- **Don't ship a brittle live-preview hack** if the public API doesn't cover it. Document the gap.
- **Don't expand the builtin list aggressively.** B7.2 names are the vetted set; additions require user authorization.
- **Don't case-normalize the lookup.** Python is case-sensitive; `Print` is NOT `print`.
- **Don't intercept clicks on non-internal links** (external URLs, file://, etc.). The interception is scoped to `a.internal-link` only.
- **Don't bump versions concretely** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **Don't batch feedback at end of multi-phase drain.**

## Report when done

Standard §0–§3 per cc-prompt-queue.md with two-phase structure:

- **§0** — manifest before/after, commit SHAs (Phase 1 + Phase 2), push, tag, release URL, SHA round-trip, line counts.
- **§1.1** — TDD test cases (9 above + any CC extras).
- **§1.2** — Phase 1 investigation findings: API surface verified, DOM attributes confirmed, live-preview-vs-reading-mode coverage. If live preview can't be cleanly intercepted, document the gap.
- **§1.3** — Phase 2 fix landed: cited line-number diffs in python-builtins-core.ts + main.ts + styles.css.
- **§1.4** — Post-fix verbatim test output + node-side smoke output.
- **§1.5** — Full `npm test`.
- **§2** — Surprises during implementation. Specifically: live preview coverage (yes/partial/no); any builtin-name edge cases the test set missed; whether the `Notice` text reads well or needs tweaking.
- **§3** — User-side smoke per cc-prompt-queue.md 6a/6b. Paste-able cleanup commands; UI verification for the click suppression.

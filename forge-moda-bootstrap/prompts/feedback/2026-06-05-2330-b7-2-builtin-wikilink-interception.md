---
timestamp: 2026-06-06T02:00:00Z
session_id: claude-code-drain-b7-2-builtins
prompt_modified: 2026-06-05T23:30:00Z
status: success
---

# Feedback — 2026-06-05-2330 B7.2 plugin-side wikilink interception (v0.2.59)

## §0 — Release coordinates

**Manifest:** `forge-client-obsidian/manifest.json` 0.2.57 → 0.2.58 → **0.2.59** (the v0.2.58 release was orphaned mid-drain by drift detection; recovered cleanly by bumping to v0.2.59 — see §2).

**Commits (commit-directly-to-main per memory rule):**

| Repo | SHA | Subject |
|---|---|---|
| forge-client-obsidian | `044d22b` | v0.2.58 work commit — B7.2 wikilink interception |
| forge-client-obsidian | `6eae653` | (orphaned) `Release v0.2.58` empty commit, tag points here |
| forge-client-obsidian | `81f2724` | bundle re-sync for forge 08db2ed lib.py fix |
| forge-client-obsidian | `585686a` | (orphaned) second `Release v0.2.58` empty commit |
| forge-client-obsidian | `25b42a4` | v0.2.59 bump (recovery) |
| forge-client-obsidian | `9735459` | (post-release) `Release v0.2.59` empty commit, v0.2.59 tag points here |

The two `Release v0.2.58` empty commits + orphaned `v0.2.58` tag (no GH release attached) remain as cosmetic audit-trail noise. The actual work + release is **v0.2.59**.

**Tag + release (v0.2.59):**
- Tag `v0.2.59` pushed to `origin/main`.
- GH release: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.59>
- 4 assets (main.js, manifest.json, styles.css, `forge-client-obsidian-v0.2.59.zip` 34 MB).
- Zip SHA-256: `95baebd39898b18cd6994e1d2fda62ce89114dba09e81cb87d761efee43758c8`
- install-latest.sh round-trip into smoke vault: clean.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `src/python-builtins-core.ts` | 52 | NEW. Pure-core #22. `PYTHON_BUILTINS` + `isPythonBuiltin` + `bareWikilinkTarget`. |
| `src/python-builtins-core.test.ts` | 128 | NEW. 45 TDD cases (16 standalone + 29 parameterized B7.2 names). |
| `src/main.ts` | +30 | DOM click capture handler in onload. |
| `assets/engine/forge/music/lib.py` | +19 / –2 | Bundle re-sync for forge `08db2ed`. |
| `manifest.json` | 10 | version bumps. |
| `INSTALL.md` | (10 pin replacements) | v0.2.57 → v0.2.58 → v0.2.59. |

## §1.1 — TDD test cases (45 total)

**Standalone (16):**
1. `isPythonBuiltin('print')` → true
2. `isPythonBuiltin('len')` → true
3. `isPythonBuiltin('my_snippet')` → false
4. Case-sensitive: `Print`, `LEN`, `Str` → all false
5. Empty string → false (defensive)
6. `print#heading` → false (caller must sanitize first)
7. Idempotent
8. `PYTHON_BUILTINS` is a Set (O(1) lookup)
9-15. `bareWikilinkTarget` — bare passes through, strips heading, strips alias, heading-wins, trims whitespace, empty input, end-to-end with isPythonBuiltin
16. Exhaustive count check (29 matches B7.2)

**Parameterized B7.2 coverage (29):** one assertion per constitution B7.2 name (print, input, open, len, range, enumerate, zip, map, filter, sorted, reversed, min, max, sum, str, int, float, bool, list, dict, set, tuple, type, isinstance, hasattr, getattr, setattr, abs, round).

## §1.2 — Phase 1 investigation findings

**API surface verified.** Existing `src/edges-hover.ts` lines 59-68 already documents the DOM patterns Phase 1 needed:

```
// Reading mode renders wikilinks as <a class="internal-link">. Live preview
// uses <span class="cm-hmd-internal-link">. Source mode shows raw [[...]] —
// no DOM hook there; that's an accepted gap.
```

The prompt suggested `registerMarkdownPostProcessor`, but that only covers reading mode. The codebase's established pattern (used by edges-hover) handles BOTH reading and live preview via a single DOM-level handler that walks the closest internal-link ancestor. Chose that path.

**DOM attributes confirmed.** Reading mode: `data-href`. Live preview: `innerText` (no data-href on `.cm-hmd-internal-link` spans). Pattern from edges-hover.ts's `extractLinkText` helper. The bareWikilinkTarget helper strips `#heading` / `|alias` suffixes from either source.

**Live preview coverage: YES.** The DOM click capture handler with `capture: true` fires before Obsidian's default click handler in both modes. `evt.preventDefault() + evt.stopPropagation()` stops the file-creation default.

**Source mode coverage: NO** (accepted gap — same as edges-hover.ts). Raw `[[print]]` text in source mode has no rendered link to click. Users in source mode would have to manually navigate (Cmd+click on the text) and Obsidian's default would fire. This is the documented accepted gap; matches the codebase's convention.

**Notice vs tooltip:** Notice (simpler, matches existing `new Notice(...)` UX in the codebase). Text reads: `'print' is a Python builtin — no Forge snippet to navigate to.` Concise + names the specific builtin.

## §1.3 — Phase 2 fix landed (cited diffs)

### `src/python-builtins-core.ts` (NEW, 52 lines)

```typescript
export const PYTHON_BUILTINS: ReadonlySet<string> = new Set([
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
  'abs', 'round',
]);

export function isPythonBuiltin(name: string): boolean {
  return PYTHON_BUILTINS.has(name);
}

export function bareWikilinkTarget(raw: string): string {
  if (!raw) return '';
  const stopIdx = raw.search(/[#|]/);
  const target = stopIdx === -1 ? raw : raw.slice(0, stopIdx);
  return target.trim();
}
```

29 names verbatim from constitution B7.2 (V2a v9).

### `src/main.ts` (+30 lines) — onload click capture

```typescript
+import { isPythonBuiltin, bareWikilinkTarget } from './python-builtins-core';
...
+    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
+      const target = evt.target as Element | null;
+      if (!target) return;
+      const linkEl =
+        target.closest('a.internal-link') as HTMLElement | null
+        ?? target.closest('.cm-hmd-internal-link, .cm-link') as HTMLElement | null;
+      if (!linkEl) return;
+      const raw =
+        linkEl.getAttribute('data-href')
+        ?? (linkEl as HTMLElement).innerText
+        ?? '';
+      const bareTarget = bareWikilinkTarget(raw);
+      if (!isPythonBuiltin(bareTarget)) return;
+      evt.preventDefault();
+      evt.stopPropagation();
+      new Notice(`'${bareTarget}' is a Python builtin — no Forge snippet to navigate to.`);
+    }, { capture: true });
```

### `assets/engine/forge/music/lib.py` (bundle re-sync)

Carries forge commit `08db2ed`'s `_instrument_key` percMapPitch fix into the v0.2.59 plugin bundle. Required by the drift preflight; documented in commit `81f2724`.

## §1.4 — Post-fix test output

```
ℹ tests 355
ℹ pass 355
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms (~5s)
```

310 baseline + 45 new = 355. All pass.

**No node-side smoke script was written** for the click interceptor. Rationale: the click handler exercises Obsidian's DOM and event lifecycle in ways `node --test` can't realistically simulate (mocking would test the mock, not the production code). The pure-core helpers ARE unit-tested at 45 cases; the DOM glue is covered by the user-side smoke in §3.

## §1.5 — Full `npm test`

```
ℹ tests 355
ℹ pass 355
ℹ fail 0
```

## §2 — Surprises

**Engine-bundle drift detected mid-release.** First v0.2.58 release.sh run halted at the build's drift preflight: `forge/music/lib.py` in the bundle was at the pre-`08db2ed` state (the prior drain didn't sync the bundle per its narrow scope), but `release.sh` had ALREADY created an empty `Release v0.2.58` commit + tag + push BEFORE the build step ran. So when I synced the bundle and re-ran release.sh, the tag-create failed with `fatal: tag 'v0.2.58' already exists`. The v0.2.58 tag points to a pre-sync commit; no GH release was attached.

Recovery: bumped to v0.2.59 (per the cleanest forward path without destructive tag operations — see `[2026-06-05-1000-fix-release-sh-double-empty-commit-on-re-run]` drain's similar wart). All v0.2.58 work + the bundle re-sync lives on main; v0.2.59 packages it cleanly. **The orphaned v0.2.58 tag + two empty `Release v0.2.58` commits remain as cosmetic audit-trail noise.**

This surfaces a follow-up worth filing: **release.sh should run the drift preflight EARLIER, before the empty Release commit / tag steps.** Today's order is bump-or-skip → commit → tag → push → build-zip (drift here) → gh-release. Moving the drift check to `validate progression` would let drift-failure halt before any state mutation. Flagged for a future drain.

**Pure-core extraction #22 was tightly scoped.** Just 3 exports (PYTHON_BUILTINS, isPythonBuiltin, bareWikilinkTarget). The bareWikilinkTarget helper was an addition beyond the prompt's pseudocode — the prompt said "caller is responsible for stripping subpaths"; I factored the strip step into the pure-core so it's testable + reused. Saves the glue layer from regex-stripping inline.

**Constitution B7.2 count matches 29.** The prompt's PYTHON_BUILTINS suggestion included `iter`, `next`, `any`, `all`, `pow`, `divmod` — those are NOT in the constitution's B7.2 list. I aligned to the constitution (29 names). If the user wants the broader set, B7.2 amendment is the right path; the test file's `B7_2_NAMES` array makes future additions mechanical.

**Live preview coverage** falls out cleanly from the codebase's existing edges-hover.ts DOM-pattern documentation. No experimental probe needed — the `.cm-hmd-internal-link, .cm-link` selector is documented + already used.

**Engine bundle drift detection works**. Despite the workflow wart, the preflight DID catch the drift before the zip would have shipped to cohort users with v0.2.58's main.js + v0.2.57's lib.py — a subtle bug that would have been hard to diagnose. v0.2.30's drift-detection investment continues to pay off.

**Eighth(?) release.sh production validation.** v0.2.51's pre-bumped manifest + SKIP_BUMP + zip-upload fix continues to drive clean releases. The drift-detection wart is unrelated to v0.2.51's fix (it's a different release.sh ordering issue).

## §3 — User-side smoke checklist

Per cc-prompt-queue.md 6a (paste-able commands) + 6b (CC validates before writing).

### Pre-conditions

- v0.2.59 plugin installed at `~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/` (verified via install-latest.sh round-trip during this drain).
- If you have a leftover `print.md` from before v0.2.59 (e.g. from clicking `[[print]]` in canonical_demo.md during v0.2.55 smoke), clean it up:

```
rm -f ~/forge-vaults/smoke-v0.2.13/print.md
```

### Test A — bundled python-builtins-core ships (30 sec)

```
ls ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/main.js
```

Expected: file exists. (The pure-core helper is built into main.js, no separate asset.)

### Test B — click `[[print]]` in canonical_demo.md (reading mode) (2 min)

1. Open Obsidian on `~/forge-vaults/smoke-v0.2.13`.
2. Cmd+P → "Reload app without saving" (picks up v0.2.59).
3. Open `forge-moda/canonical_demo.md` from the file tree.
4. Make sure you're in **reading mode** (Cmd+E to toggle if needed; the editor shows rendered text without the raw `[[...]]` markup).
5. Click the `[[print]]` wikilink in the body.
6. **Expected**: a Notice appears at the bottom of the screen: `'print' is a Python builtin — no Forge snippet to navigate to.`
7. Verify NO stray `print.md` was created:

```
ls ~/forge-vaults/smoke-v0.2.13/print.md 2>&1
```

Expected output:

```
ls: ~/forge-vaults/smoke-v0.2.13/print.md: No such file or directory
```

Pass: Notice fires + no stray file.

### Test C — same in live preview (2 min)

1. Switch canonical_demo.md to **live preview** mode (Cmd+E).
2. Click the `[[print]]` wikilink.
3. **Expected**: same Notice text, no stray file. Verify again:

```
ls ~/forge-vaults/smoke-v0.2.13/print.md 2>&1
```

Pass: live preview also intercepted.

### Test D — Forge-click canonical_demo.md still works (regression, 1 min)

1. In canonical_demo.md, click the **Forge** button at the top of the editor.
2. **Expected**: stdout `Canonical form works.` in the Forge Output panel. The /generate skip + E-- transpile path from v0.2.55 still functions; nothing the v0.2.59 click interceptor does affects the Forge-click flow.

### Test E — non-builtin wikilinks still navigate (regression, 1 min)

1. Click any wikilink in another snippet whose target IS a real Forge snippet (e.g. in `forge-moda/setup.md` or any moda snippet that calls `[[create_water_particles]]`).
2. **Expected**: clicking opens the target snippet's `.md` file (existing wikilink behavior). NO Notice. The interceptor only fires for B7.2 builtins.

### Test F — case-sensitivity (defensive, 30 sec)

If you have a snippet at vault root or somewhere with the basename `Print` (capital P), clicking it should navigate normally — the interceptor is case-sensitive per Python semantics.

If you don't have such a snippet, this test is non-blocking.

### Failure modes to watch for

- **Test B**: Notice doesn't fire → check Developer Tools (Cmd+Opt+I) console for any error in the registered DOM event handler. Possible cause: plugin didn't fully load (try a hard reload).
- **Test B**: Notice fires AND `print.md` still gets created → `evt.preventDefault()` is not stopping the default. The capture phase might not be early enough; check console for any other DOM listener intercepting.
- **Test C**: Reading mode works but live preview doesn't → the `.cm-hmd-internal-link` selector may have changed in your Obsidian version. Check DevTools Elements tab for the actual class names on the wikilink span.
- **Test E**: All wikilinks now bounce → bug in `isPythonBuiltin`; check the function imports + the bareWikilinkTarget sanitization.

### End-state cleanup

- Any test-created `print.md`, `len.md`, etc. files (there shouldn't be any post-fix):

```
ls ~/forge-vaults/smoke-v0.2.13/{print,len,range,str,int}.md 2>&1
```

Expected: all "No such file or directory".

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain stops; queue empty.

**Standing followups (now 7):**
1. forge-music v0.3.9 Level-2 bundle drain (unblocked; lib.py fix now bundled too).
2. forge-music v2 `_chips.md` — their lane.
3. forge-music.bak.0.3.0/ scanning gate — future chip-palette polish drain.
4. Stage 3+ E-- migration roadmap.
5. `[[percussion_lab]]` directory-wikilink decision in Murmuration narrative (cosmetic).
6. percussion_lab 7-parts-always cleanup — refactor section snippets.
7. **NEW**: release.sh drift-preflight ordering — move the drift check BEFORE the empty Release commit / tag / push steps so drift failures don't leave orphaned tags.
8. (cc) glue-to-pure-core audit candidates across the v0.2.4x arc.

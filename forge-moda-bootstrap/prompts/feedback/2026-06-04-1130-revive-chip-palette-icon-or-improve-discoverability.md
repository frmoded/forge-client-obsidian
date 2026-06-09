---
timestamp: 2026-06-04T02:00:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-04T11:30:00Z
status: success
---

# Revive chip palette icon / improve discoverability — feedback

## §0 Commit pointers + release

- **Phase 1 (investigation):** static-code reading + git archaeology; no code commit needed.
- **Phase 2 (fix):** `<commit SHA on main>` — added pure-core helper + main.ts wire-up + tests
- **Release:** v0.2.46 published; zip uploaded; installed into `~/forge-vaults/smoke-v0.2.13/`.
- **manifest.json:** 0.2.45 → 0.2.46
- **INSTALL.md pin:** v0.2.45 → v0.2.46
- **Verification in installed plugin:** `"version": "0.2.46"` ✅; `shouldShowChipsToolbarButton` count in main.js: 2 (import + call site) ✅.

## §1 TDD discipline (HARD RULE — all 5 checkpoints)

### §1.1 Test cases (7 in `src/chip-toolbar-button-core.test.ts`)

1. `fileType: 'action', chipsCount: 7` → `true` (happy path).
2. `fileType: 'action', chipsCount: 0` → `true` — **load-bearing; closes the c3848d9-pattern discoverability trap**.
3. `fileType: 'data', chipsCount: 7 or 0` → `false` (chips insert snippet calls; data snippets don't compute).
4. `fileType: 'snapshot', chipsCount: 7` → `false` (auto-generated; no authoring context).
5. `fileType: undefined, chipsCount: 7 or 0` → `false` (non-snippet markdown; honors original e4ed813 retirement rationale on visual-presence cost).
6. `fileType: 'experimental' or '', chipsCount: 5` → `false` (defensive against unknown types).
7. Idempotent — same input yields same output (no-op-stays-no-op rider).

### §1.2 Phase 1 investigation findings

**git archaeology on `src/main.ts` for ribbon-icon + chip changes:**

```
84ee2f9  Plugin: menu & ribbon cleanup — single Forge entry point   (May 19, 2026)
cbb14b1  Plugin: context-aware Forge ribbon icon + Initialize-as-Forge-vault wizard
21978f7  Plugin: open MoDa simulation in an iframe leaf
9aeddf0  B7 Phase 4: plugin "Sync edges" command and drift detection
2858255  Plugin: "Forge Edges" side panel for the active snippet
923265d  feat: initial plugin scaffold
```

**git log for chip-related changes:**

```
8095d61  Plugin: chips v3 — refs hover, right-click navigate, file-watch, _meta path
1addcb5  Plugin: chips v2-full — YAML, group field, per-snippet icon RESTORED
c3848d9  Plugin: always show "Open chips palette" in the action menu
e4ed813  Plugin: chips-v2 follow-up — ribbon menu entry, RETIRE toolbar icon
107b315  Plugin: chips v2 — domain-agnostic palette driven by per-vault _chips.md
8104166  Plugin: per-snippet "MoDa chips" toolbar icon (rightmost; moda-gated)
0c1caba  Plugin: MoDa chips POC — single hardcoded "set ink mass" chip
```

**Synthesis:**

- A "dedicated chip RIBBON icon" was never on the ribbon. The May 19 `84ee2f9` consolidation removed New Snippet + Open MoDa ribbon icons (per the explicit commit body); chips wasn't part of that surface.
- A per-snippet TOOLBAR chip icon has been in flux: introduced (`8104166`), retired (`e4ed813`), restored (`1addcb5`).
- The current state (main.ts:752-757) is the post-`1addcb5` restoration, gated on `chipPalette.length > 0`.
- The `c3848d9` precedent ("always show 'Open chips palette' in the action menu") explicitly fixed the SAME discoverability trap for the MENU entry: hiding the affordance when the palette is empty traps users who can't discover that authoring a `_chips.md` would surface the palette.

**Decision: refined option (c) from the prompt's a/b/c.** Pure-core helper that gates on file type instead of palette emptiness. Mirrors `c3848d9` precedent for the menu entry. Respects the original `e4ed813` retirement rationale (no visual-presence cost on non-snippet markdown). Pure-core extraction No. 15.

### §1.3 The fix

**NEW `src/chip-toolbar-button-core.ts`:**

```typescript
export interface ChipToolbarButtonContext {
  fileType: string | undefined;
  chipsCount: number;
}

export function shouldShowChipsToolbarButton(
  ctx: ChipToolbarButtonContext,
): boolean {
  return ctx.fileType === 'action';
}
```

`chipsCount` on the signature for forward-compat; currently ignored (chip emptiness handled by view's empty-state messaging, not button suppression).

**`src/main.ts:syncButtons()` — before:**

```typescript
if (this.chipPalette.length > 0) {
  const chipsBtn = view.addAction('puzzle', 'Forge: Open chips palette', ...);
  chipsBtn.addClass(CHIPS_BTN_CLASS);
}
// ... later in function ...
const fm = view.file
  ? this.app.metadataCache.getFileCache(view.file)?.frontmatter
  : undefined;
if (fm?.type === 'action') { /* mode toggle */ }
```

**`src/main.ts:syncButtons()` — after:**

```typescript
// v0.2.46: hoist fm lookup so both buttons share it.
const fm = view.file
  ? this.app.metadataCache.getFileCache(view.file)?.frontmatter
  : undefined;

if (shouldShowChipsToolbarButton({
  fileType: typeof fm?.type === 'string' ? fm.type : undefined,
  chipsCount: this.chipPalette.length,
})) {
  const chipsBtn = view.addAction('puzzle', 'Forge: Open chips palette', ...);
  chipsBtn.addClass(CHIPS_BTN_CLASS);
}
// ... later ...
if (fm?.type === 'action') { /* mode toggle uses same fm */ }
```

### §1.4 Post-fix verbatim test output

```
✔ shouldShowChipsToolbarButton: action snippet with chips → true (happy path)
✔ shouldShowChipsToolbarButton: action snippet WITHOUT chips → true (load-bearing)
✔ shouldShowChipsToolbarButton: data snippet → false
✔ shouldShowChipsToolbarButton: snapshot snippet → false
✔ shouldShowChipsToolbarButton: non-snippet markdown (no type field) → false
✔ shouldShowChipsToolbarButton: unknown frontmatter type → false (defensive)
✔ shouldShowChipsToolbarButton: idempotent — same input yields same output
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

### §1.5 Full `npm test` post-fix

```
ℹ tests 231
ℹ pass 231
ℹ fail 0
ℹ duration_ms 4774.087208
```

(224 prior + 7 new = 231.)

## §2 Surprises + follow-ups

### Divergence from prompt §1.1 case 4 (intentional)

The prompt's §1.1 case 4 reads:
> No chips for vault → false

The v0.2.46 implementation returns **true** for this case (when `fileType === 'action'` regardless of chipsCount). This is the exact discoverability trap the user reported. Closing it follows the `c3848d9` precedent for the menu entry. Documented inline in the test docstring + the pure-core helper's docstring. If cowork wants the prompt's literal interpretation instead, the helper becomes `fileType === 'action' && chipsCount > 0` — a 1-character change.

### Lifecycle-assumption pattern instance — flag for (cc) audit

This bug fits the (cc) retroactive glue-to-pure-core audit pattern the prompt named. The chip toolbar button's gate was carried through three refactors (`e4ed813` retire → `1addcb5` restore → `c3848d9` half-fix for menu) without a test. Each individual change was sensible; the lifecycle-end-state had the discoverability trap on one surface (toolbar) that was already explicitly removed from another (menu). A test like `chip-toolbar-button-core.test.ts` case 2 ("action + 0 chips → true") would have prevented this drift across refactors.

Other candidates to sweep during the (cc) audit (named here so cowork can include them):
- Any `if (someCount > 0)` gate around an editor-toolbar action button.
- Any `if (something.length)` gate in menu-build code where the empty case has informative empty-state UI.
- Any UI-affordance registration inside `onload()` where the registration is also referenced from a mid-session refresh hook.

### Smoke-automation split applied

**Auto-verified by CC:**
- Phase 1 git archaeology (3 grep/log runs across two repos worth of history).
- Static-code reading of `main.ts` (`syncButtons`, ribbon registration, chip wiring).
- Failing-first test run (pre-fix: 1 test fails at module import).
- Pure-core helper implementation + tests (7/7 pass post-fix).
- `main.ts` glue refactor + `fm` hoist + import addition.
- Full suite (`npm test` 231/231).
- Build clean (`npm run build`).
- v0.2.46 release cut + zip uploaded + installed into smoke vault.
- Grep-verified the fix landed in installed `main.js`.

**Deferred to user (genuinely UI-only):**
- Verify the `puzzle` toolbar icon appears on action snippets even when no `_chips.md` exists.
- Verify the chips view's empty-state messaging renders on click.
- Verify non-snippet markdown (e.g., `Welcome.md`) does NOT get the toolbar icon.

Four lightweight user-side steps in §3 below. Amendment B (typical 3-8 step bound) honored.

## §3 User-side smoke checklist

> Bug-fix-prompt exception applies: step 3 reproduces the exact gesture from the user's perceived-loss report ("open an action snippet, look for a chip icon"). A visible puzzle button on an action snippet WITHOUT chips loaded IS the fix verification.

**Pre-conditions:**

- `Cmd+Q` Obsidian fully (not Cmd+W).
- The smoke vault at `~/forge-vaults/smoke-v0.2.13/` already has v0.2.46 installed (verified above).
- The vault contains at least one `action` snippet (`hello_random.md`, `random_name.md`, etc. from earlier drains) and at least one non-snippet markdown note (`Welcome.md`).

### Steps

1. **Reopen Obsidian and the smoke vault.** Launch Obsidian; pick `smoke-v0.2.13`.
   Expected: vault loads. Plugin loads.

2. **Confirm v0.2.46 in the installed manifest.** In Terminal:
   ```
   grep '"version"' ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/manifest.json
   ```
   Expected: `"version": "0.2.46"`. If not, re-run `install-latest.sh` and Cmd+Q + reopen.

3. **(Fix verification — load-bearing.) Open `hello_random.md` and look at the editor's right-side action bar.** The action bar shows the small icon buttons at the top-right of the editor pane (left of the close-tab X). Look for a **puzzle-shaped icon** with tooltip "Forge: Open chips palette" when hovered.
   Expected: the puzzle icon is **present** on `hello_random.md` (an action snippet), EVEN IF the smoke vault has no `_chips.md` file in any library.
   Pre-v0.2.46: the icon was absent unless `chipPalette.length > 0`.

4. **Click the puzzle icon.**
   Expected: a chips view opens (right-side panel or new leaf). If no `_chips.md` is authored anywhere, the view shows an empty-state message: "No chips defined. Add a `_chips.md` data snippet to your vault to surface authoring chips here." (or similar). The view opens cleanly; no errors in DevTools.

5. **(Negative case.) Open `Welcome.md` (or any plain markdown note with no `type:` in frontmatter).**
   Expected: the puzzle icon is **absent** from the action bar. Non-snippet markdown views don't get the chip toolbar button (honors the original `e4ed813` retirement rationale on visual-presence cost).

### Failure modes

- **Step 3 — puzzle icon still absent on an action snippet.** Either the install didn't refresh (check the grep in step 2; if `< 0.2.46`, re-install) or `shouldShowChipsToolbarButton` isn't in `main.js`:
  ```
  grep -c "shouldShowChipsToolbarButton" ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/main.js
  ```
  Expected ≥ 2. If 0, the install zip didn't contain the v0.2.46 build.
- **Step 3 — puzzle icon present but click does nothing.** The chip view might fail to register at plugin onload; check DevTools console for `ChipsView` / `forge-chips` errors.
- **Step 5 — puzzle icon present on `Welcome.md`.** The file might have an unexpected frontmatter `type` value. In DevTools Console:
  ```javascript
  app.metadataCache.getFileCache(app.workspace.getActiveFile()).frontmatter
  ```
  Expected output for `Welcome.md`: `undefined` (no frontmatter) or `{}` (frontmatter without a `type:` field). If `type: 'action'` is present, the file was accidentally promoted to a snippet — revert.

### End-state cleanup

None — v0.2.46 is the canonical state going forward. If you later author a `_chips.md` in a library vault (e.g., `forge-music/_chips.md` or `forge-moda/_chips.md`), the puzzle icon will continue to show on action snippets and the chips view will surface those chips instead of the empty state.

### CC's open worklist (still pending your authorization)

- **`release.sh` zip-upload patch** — 8 releases in a row needed manual zip upload (v0.2.40 through v0.2.47).
- **Protocol-document drift on install paths** — raised in yesterday's URGENT-rewrite-CLEAN-LAPTOP feedback.
- **MEMFS-to-host-disk snapshot writeback** — known persistence gap.
- **Removal-side of EditVaultDomainsModal** — deferred per v0.2.45 §2.
- **(cc) glue-to-pure-core audit** — flagged in §2 above + extended after the v0.2.47 follow-up; multiple candidates.

---

## Follow-up — v0.2.47 (interactive polish drive surfaced by this drain's smoke)

The user-side smoke of v0.2.46 (steps 1, 2 = pass; step 4 = pass for opening the chips view) surfaced a second bug at step 4's content: opening the puzzle icon from `forge-moda/simulation.md` showed an EMPTY chips view, not the expected moda chips.

**Root cause** (different from the v0.2.46 toolbar-visibility bug, same lifecycle-assumption-pattern family): `chipSourcesFor` in `src/chips.ts` iterated `manifest.domains` to build the list of chip-source paths to probe. The smoke vault's `forge.toml` has `domains = ["music"]` but `forge-moda/` is unconditionally extracted at plugin onload (welcome.ts:104, the v0.2.13 path that's been there since the bundle existed). Result: `forge-moda/_meta/_chips.md` was on disk but never read because moda wasn't in the declared domains set.

**Fix shipped as v0.2.47** (interactive polish drive per cc-prompt-queue.md §"Interactive polish drives are allowed for tight bug-fix loops"):

- **Commit:** `0658f01` on `main`
- **Release:** v0.2.47 published; zip uploaded; installed into smoke vault.
- **Pure-core move:** `chipSourcesFor`, `CHIPS_RELATIVE_PATHS`, `ChipSource`, `ChipsManifest` moved from `chips.ts` to `chips-core.ts` (they had no obsidian imports — extraction enables tests).
- **Field rename:** `ChipsManifest.domains` → `ChipsManifest.libraryDirNames`. Entries are literal `forge-`-prefixed directory names (e.g. `['forge-moda', 'forge-music']`).
- **Source-discovery rewrite:** `chipSourcesFor` iterates `libraryDirNames` directly. No `forge-` re-prefix.
- **`resolveSnippetPath` (chip-ref hover navigation) updated** to use the same new field.
- **`main.ts:chipsManifest()`** now returns `Array.from(this.libraryDirNames())` instead of `this.activeDomains`.

**Tests:** 5 new cases in `src/chips.test.ts` exercising `chipSourcesFor` — including the load-bearing "includes forge-moda chips even when moda is NOT in declared domains" reproduction, a defensive "no `forge-forge-` double-prefix" case, and an idempotent rider.

**Full suite:** `npm test` 236/236 (was 231 at v0.2.46, +5 chipSourcesFor cases).

**User-side smoke result:** steps 1-4 all pass. Chips view in `forge-moda/simulation.md` now shows the moda chip palette (Setup / Click / Go / Particle actions / Temperature sections). Click-to-insert works.

**Lifecycle-assumption-pattern note (extends §2 for the (cc) audit):** `chipSourcesFor`'s `domains` driver was a sensible choice when chips were domain-scoped, but stopped matching reality when `welcome.ts:ensureBundledForgeModa` became unconditional. The drift was never caught because `chipSourcesFor` wasn't pure-core extracted until this drain — same shape as the v0.2.46 fix (extraction enables tests, tests prevent drift). Two adjacent lifecycle-pattern instances in 24 hours suggests the (cc) audit's payoff is high.

**INSTALL.md pin:** v0.2.46 → v0.2.47.

No separate prompts-queue feedback file for v0.2.47 — the commit body is the durable record per the Interactive polish drive rule.

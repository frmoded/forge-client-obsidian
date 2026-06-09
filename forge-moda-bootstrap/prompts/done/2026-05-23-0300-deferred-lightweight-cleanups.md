# Three deferred lightweight cleanups — postMessage stdout, theme-aware palette, conftest helper extraction

## Scope

Three independent small fixes, three phases. Each is a separate commit; failure in one shouldn't block the others — process sequentially and report whichever phases shipped.

1. **forge-moda-client + forge-client-obsidian — featured-button stdout postMessage forwarding.** Today `handleRunFeatured` in the iframe drops the stdout from its `/compute` response on the floor (flagged in `2026-05-23-0000`'s feedback). A `print()` inside a snippet run via the featured button vanishes. Fix: iframe postMessages `{type: "compute-result", snippet_id, stdout, result}` to the plugin; plugin appends to Forge Output via the existing `append()` method.

2. **forge-moda-client — theme-aware particle palette.** Water (`#9cc3e5`) and ink (`#15171a`) colors are hardcoded in `Simulator.tsx`. On Obsidian dark theme the pale-blue water washes out. Fix: detect theme and pick from a two-row palette (light theme: current values; dark theme: a darker water and lighter ink that contrast against the dark canvas surface).

3. **forge — extract moda conftest helpers.** `from tests.moda.conftest import ...` reaches for plain helpers (`make_state`, `_find_vault`), not fixtures. Conftest convention reserves the file for fixtures. Move the helpers to `tests/moda/_helpers.py`, update imports in `test_chains_integration.py` and `test_go_snapshot.py`. Check whether `tests/moda/__init__.py` is still needed after the move; remove if not.

Does NOT:
- Touch the engine, constitution, vault content, registry, or release path.
- Bundle anything from the deferred list beyond these three (no mass-driven physics, no codec registry, no chat surface).
- Add new visual affordances. Phase 2 swaps palette values; it doesn't reshape rendering.

## Why

- Phase 1: a print from a featured-button run going nowhere is exactly the print-not-showing failure mode that bit us in earlier sessions. The architecture (stdout → Forge Output) calls for this forwarding; only the wiring is missing. ~30 lines.
- Phase 2: dark-theme reports haven't surfaced yet, but the palette is hardcoded and theme-blind. Easier to fix now than after a user reports washed-out water. Pre-emptive.
- Phase 3: pure code-smell cleanup. Helpers in conftest are misclassified; moving them is one of those "now or never" wart fixes.

## Files to modify

### Phase 1 — featured-button stdout forwarding

**Iframe — `forge-moda-client/forge-moda-web/src/components/Simulator.tsx`:**

In `handleRunFeatured`, after the `setSimState` / `setTicks` call (around the moda_sim_state success branch), postMessage the stdout + result up to the plugin:

```typescript
window.parent?.postMessage({
  type: "compute-result",
  snippet_id: featured.snippet_id,
  stdout: res.stdout ?? "",
  result: res.result,
}, "*");
```

Also send on the unexpected-result-type branch and on the error branch (with `result: null` and `stdout: ""` for the error case, plus an `error` field carrying the message). The plugin can decide whether to render errors specially.

The existing `console.warn` / `console.error` calls stay — they're useful for browser-side debugging. The postMessage is additive.

**Plugin — `forge-client-obsidian/src/moda-view.ts`:**

Extend the existing message handler in `readyListener` (or a sibling listener — investigate the cleanest extension point) to dispatch on `data.type === 'compute-result'`:

```typescript
if (data.type === 'compute-result'
    && typeof data.snippet_id === 'string') {
  void this.appendToForgeOutput(data.snippet_id, data.stdout || '', data.result);
}
```

Add a private `appendToForgeOutput(snippet_id, stdout, result)` method that looks up the Forge Output view via the workspace API and calls its `append()` method. If no Forge Output view is currently open, the plugin should either (a) open one and append, or (b) skip silently — pick whichever fits the existing convention. Read `output-view.ts` to find the registered view type ID and the import path.

If looking up the view requires opening a leaf, do it the same way the existing Forge Output open command does (grep for `OUTPUT_VIEW_TYPE` or similar).

**Tests:**
- Iframe vitest: extend the existing featured-button test or add one — assert a `compute-result` postMessage fires after a successful featured-button run.
- Plugin tests: if the test infrastructure can mock the workspace + OutputView, add a case verifying `compute-result` lands in Forge Output. If the infra requires JSDOM/Obsidian shim and that's not present (per the prior 2026-05-23-0000 feedback), skip the new test and flag.

### Phase 2 — theme-aware palette

**`forge-moda-client/forge-moda-web/src/components/Simulator.tsx`:**

In the redraw `useEffect` (around line 220), replace the hardcoded `#9cc3e5` and `#15171a` with theme-aware lookups. Two reasonable shapes:

- **Option A (simple).** Detect dark theme via `document.documentElement.classList.contains('theme-dark')` or `document.body.classList.contains('theme-dark')` (Obsidian's convention). Pick from a two-element palette object:
  ```typescript
  const isDark = document.documentElement.classList.contains('theme-dark');
  const palette = isDark
    ? { water: "#4a6280", ink: "#e8e6df" }
    : { water: "#9cc3e5", ink: "#15171a" };
  ctx.fillStyle = palette.water;
  // ... etc
  ```
  Suggested dark-theme values: water `#4a6280` (deeper, less saturated blue), ink `#e8e6df` (warm light tone for contrast against dark canvas). Refine if you have better values.
- **Option B (CSS variables).** Define palette in `Simulator.module.css` as custom properties on `.canvas` or the surrounding container, with `@media (prefers-color-scheme: dark)` overrides. Read via `getComputedStyle` in TSX. More plumbing; respects OS-level theme; doesn't track Obsidian's manual theme override unless the iframe inherits the theme class.

Choose Option A unless you find a compelling reason for B. Document the choice in the report. The iframe is loaded inside Obsidian and inherits `<html class="theme-dark">` when Obsidian's dark theme is active (verify; if not, the `document.documentElement` check won't work and we'll need postMessage-driven theme bridging — flag and route to questions/ if so).

**Note on theme changes mid-session:** if the user toggles Obsidian's theme while the iframe is open, the iframe won't redraw automatically (the `useEffect` only fires on `simState` change). For now, the new palette takes effect on next render after a state update. If theme-toggle responsiveness becomes a felt issue, follow-up wires a `themechange` listener.

### Phase 3 — conftest helper extraction

**Identify helpers to move.** In `forge/tests/moda/conftest.py`, find the symbols imported by `from tests.moda.conftest import …` in `tests/moda/test_chains_integration.py` and `tests/moda/test_go_snapshot.py`. CC's prior observation named `make_state` and `_find_vault` — verify the full list.

**Move to `forge/tests/moda/_helpers.py`.** Create the new file. Move ONLY the non-fixture helpers (anything decorated with `@pytest.fixture` stays in conftest; plain functions move).

**Update imports** in the two integration test files:
```python
from tests.moda._helpers import make_state, _find_vault
# or, if pytest rootdir picks them up flat:
from _helpers import make_state, _find_vault
```

Pick whichever works without additional config.

**Re-evaluate `__init__.py` files.** After the import change, run `pytest -q` and check:
- If 403 tests still pass, the cleanup is functionally clean.
- If `tests/moda/__init__.py` can be removed without breaking collection, remove it.
- If `tests/__init__.py` can also be removed, remove it. (The 2026-05-23-0200 fix added both; if neither is now needed, undo both.)

**Don't** modify test logic or assertions. Pure import-path cleanup.

## Implementation notes

### Phase 1 risks

- Looking up the Forge Output view requires it to be open. Two reasonable behaviors when it's closed: (a) silently skip the append (print is lost — same as today), or (b) open the view and append. Pick whichever matches the existing convention; document.
- Multiple Forge Output views simultaneously open: unlikely, but if it happens, append to the first one returned by the workspace lookup. Don't broadcast.

### Phase 2 risks

- If Obsidian's theme class doesn't propagate to the iframe document, Option A silently fails (always light-theme palette). Mitigation: check `document.documentElement.classList` from inside the iframe in the dev tools first. If empty, the iframe is its own document and the theme bridge needs postMessage. Route this phase to questions/ if so — don't build the postMessage bridge here.

### Phase 3 risks

- Removing `__init__.py` files might break other test files that today rely on package-marker semantics. Run the full suite; if anything breaks, leave the `__init__.py` files in place and just do the helpers move.

## Tests

- **Engine (forge):** `pytest -q` full suite. Was 403 passing; expect 403 still after Phase 3.
- **Plugin (forge-client-obsidian):** `node --test src/*.test.ts`. Was 42/42; expect 42/42 (Phase 1's plugin-side change is in Obsidian-coupled code; no new pure-core test).
- **Iframe (forge-moda-client):** vitest. Was 3/3; expect 3/3 plus one new case for Phase 1 (compute-result postMessage fires) and possibly one for Phase 2 (palette switches with theme class).

### Manual GUI verification (deferred to user)

After all three phases land, in Bluh's moda simulator:
1. Add a `print()` to any moda snippet's Python facet (e.g., shadow `bluh/move.md` with a print). Click the featured "Run simulation" button. Confirm the print appears in Forge Output below the rendered simulation state.
2. Toggle Obsidian's theme to dark. Reload the iframe. Click "Run simulation". Confirm water + ink colors are visibly distinct against the dark canvas (not washed out).
3. (Optional, dev concern) Confirm `pytest -q` from `~/projects/forge` still passes 403/403.

## Out of scope

- Mass-driven physics. Tamar conversation.
- Codec registry refactor. Separate.
- New chat surface. Separate.
- Real-time theme-change responsiveness (toggling theme mid-session triggers iframe re-render). Today only on next state update.
- Opening a Forge Output view if none exists when a featured-button result arrives. Pick the simpler convention.
- Touching engine, constitution, or registry.
- Vault content changes.
- Anything in the music vault.

## Report when done

- **Phase 1 diff** — iframe postMessage shape, plugin handler, Forge Output append wiring. Confirm the open-view-or-skip convention chosen.
- **Phase 2 diff** — palette values for both themes, theme detection method (Option A vs B), and any quirks observed if the theme class doesn't propagate.
- **Phase 3 diff** — helpers moved (which ones), import changes (which files), `__init__.py` files remaining (or removed).
- **Test results** — engine, plugin, iframe pass counts.
- **Commit SHAs** — one per repo touched (forge-moda-client, forge-client-obsidian, forge).
- **Per-phase status** — shipped, partial, or routed.
- **Any deviation and why.**
- **One observation** — anything that surfaces during implementation that's worth a follow-up.

## Commits + push

Up to three commits, three repos:
- `forge-moda-client`: "Simulator: forward featured-button stdout via postMessage; theme-aware palette"
- `forge-client-obsidian`: "Plugin: relay compute-result messages from iframe to Forge Output"
- `forge`: "tests: extract non-fixture helpers from moda conftest to _helpers.py"

Push each to `main`.

If a phase fails or is blocked, ship the others and route THIS prompt to questions/ with the specific blocker — don't fail-the-whole-bundle if 1 of 3 phases hits a real wall.

## Don'ts

- **Don't bundle deferred items beyond these three** (mass physics, codec registry, chat surface).
- **Don't refactor `Simulator.tsx` beyond what each phase requires.**
- **Don't reshape `OutputView.append`'s signature** — Phase 1 uses the existing method as-is.
- **Don't modify test assertions in Phase 3.** Pure import cleanup.
- **Don't open a Forge Output view on every postMessage** if the convention is to skip when closed. Pick one behavior, don't toggle per call.
- **Don't add a manual "theme override" UI** in Phase 2. Detect-and-use; no settings panel.
- **Don't touch the engine, constitution, or any vault content.**
- **Don't auto-fix the pre-existing `npm run build` tsc error.** Same workaround as before.
- **Don't bundle Phase 2's postMessage-theme-bridge if the simple class-check works.** Keep the bridge for a follow-up if it's actually needed.

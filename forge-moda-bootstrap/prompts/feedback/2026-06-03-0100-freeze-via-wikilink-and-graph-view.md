---
timestamp: 2026-06-03T01:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-03T01:00:00Z
status: PHASE 1 — investigation complete; (a) feasible, (b) deferred
---

# Freeze affordances: wikilink right-click menu (shipping) + graph view overlay (deferred)

## §0 Commit pointers + release

**Phase 1 (failing TDD scaffold):**
- forge-client-obsidian `6a106b3` — wikilink-freeze-menu-core.test.ts (5 failing decision cases, helper module didn't exist yet)

**Phase 2 (helper + main.ts wire-up + release):**
- forge-client-obsidian `1df37e6` — wikilink-freeze-menu-core.ts pure-core helper (decideWikilinkFreezeMenu + findWikilinkAtCursor), main.ts editor-menu extension, expanded tests to 12 cases (5 decision + 7 wikilink scanner), INSTALL.md pin v0.2.40 → v0.2.41
- forge-client-obsidian `24fa745` — Release v0.2.41

**Release:** https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.41
**manifest.json:** 0.2.40 → 0.2.41
**INSTALL.md pin:** v0.2.40 → v0.2.41

v0.2.40 dependency confirmed in main before Phase 1 started.

## §1.2 Phase 1 investigation findings

### Phase 1.A — wikilink context-menu feasibility: **FEASIBLE**

Verbatim citations from `node_modules/obsidian/obsidian.d.ts`:

```
7163: on(name: 'editor-menu', callback: (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => any, ctx?: any): EventRef;
2279: export abstract class Editor {
2351:   abstract getCursor(side?: 'from' | 'to' | 'head' | 'anchor'): EditorPosition;
2437:   abstract wordAt(pos: EditorPosition): EditorRange | null;
2442:   abstract posToOffset(pos: EditorPosition): number;
2447:   abstract offsetToPos(offset: number): EditorPosition;
3249: export function getLinkpath(linktext: string): string;
4134: addItem(cb: (item: MenuItem) => any): this;
4172: export class MenuItem {
```

The existing `editor-menu` handler in `main.ts:493` already runs and adds a sync-menu item. Extending it to detect wikilinks under the cursor requires:

1. On menu event: get cursor position via `editor.getCursor()`, then `editor.getLine(pos.line)`.
2. Scan the line text for `[[<target>]]` patterns containing the cursor character index.
3. If found, extract `target` (split on `|` for piped wikilinks: `[[target|alias]]` → `target`).
4. Pass `(currentFileBasename, target, registry)` to a pure-core decision helper.
5. If `showMenu === true`, add "Freeze edge" / "Unfreeze edge" items that call `freezeEdge()` directly with the decision's qualified caller/callee.

No bespoke API needed. No DOM hacks. Small extension to an existing handler.

### Phase 1.B — graph view extension feasibility: **NOT FEASIBLE via public API (finding 3)**

Exhaustive grep of `obsidian.d.ts` for `graph|Graph`:

```
3839:  * Post processors can mutate the DOM to render various things, such as mermaid graphs, latex equations, or custom controls.
5507:    type: 'blockquote' | 'callout' | 'code' | ... | 'thematicBreak' | 'yaml' | string;
```

The only `graph` references are in DOM-post-processor docstring context (mermaid graphs — markdown rendering, completely orthogonal to the native Graph View). There is:
- No `GraphView` class or interface.
- No `GraphLeaf` / view type for the graph leaf.
- No `workspace.on('graph-*')` event.
- No documented hook for edge styling.

The remaining option would be DOM injection via `MutationObserver` against the graph SVG. The prompt explicitly forbids this path: *"Don't ship a speculative graph-view implementation. If Phase 1 says infeasible, ship (a) only."* — and the (b)-deferred path is the documented finding-3 outcome.

### Decision: ship (a), defer (b)

(b) is deferred to a future custom `ForgeEdgeView` drain, separately prioritized via the v1-audit. Recommended v1-audit entry:

> **(b) Graph-view freeze overlay** — Obsidian's public API exposes no hooks for the native Graph View (verified obsidian.d.ts grep, 2026-06-03). Path forward: build a custom Forge graph view with edge state + click-to-freeze affordances, scoped as a v1.0-era drain. Until then, freeze surfaces are the Cmd+P modal + wikilink right-click (v0.2.41).

## §1.1 TDD test cases (Phase 1 scaffold, failing pre-implementation)

`src/wikilink-freeze-menu-core.test.ts` — 5 cases:

1. **target is a known snippet → menu offered with qualified caller + callee** — Load-bearing happy path. Pass current file basename + target string + a fake registry that resolves both via `qualifyBareId`. Assert `{showMenu: true, caller: 'authoring/hello_random', callee: 'authoring/random_name'}`.

2. **target is NOT a known snippet → menu suppressed** — Registry's `qualifyBareId(target)` returns null. Assert `{showMenu: false}`.

3. **current file is NOT a snippet → menu suppressed** — Registry's `qualifyBareId(currentFileBasename)` returns null. Assert `{showMenu: false}`. Catches the user opening a plain markdown note.

4. **target equals current file (self-reference) → menu suppressed** — Defensive: freezing self-edges is undefined. Assert `{showMenu: false}` even though both resolve in the registry.

5. **ambiguous bare match → first-match-wins per registry semantics** — Design call: explicit ambiguity-UI sub-flow deferred (see §2). Pure-core helper delegates resolution to the registry, so the registry's resolution-order semantics (already used by `context.compute('bare_id')`) are authoritative. Test asserts the helper passes through the registry's chosen qualified ID.

Phase 1 scaffold: helper module doesn't exist yet, so all 5 cases fail on import. Pre-fix output captured in §1.2 (post-Phase-1-commit).

## §2 — design notes (Phase 2 fills in surprises)

### Ambiguity handling for case 5

The pure-core helper delegates to `registry.qualifyBareId(bareId)`. The real registry's `get_bare` (snippet_registry.py:106) walks the configured resolution order and returns the first match — same as `context.compute('bare_id')`. The user-visible effect: if `random_name` exists in both `authoring` and (hypothetically) `forge-music`, the modal-less freeze flow targets whichever vault the resolution order has first. Aligns with the freeze-via-compute UX — `context.compute('random_name')` and right-click-freeze `[[random_name]]` resolve to the same snippet.

Explicit ambiguity UI (a sub-menu listing all matches) is deferred. Cowork can prompt a follow-up if the seminar surfaces it.

### (b) graph-view overlay deferral

See decision above. v1-audit recommendation written for cowork pickup.

## §1.3 Phase 2 implementation

### `src/wikilink-freeze-menu-core.ts` (new pure-core helper)

Two exports:

1. **`decideWikilinkFreezeMenu(currentFileBasename, wikilinkTarget, registry)`** — returns `{showMenu, caller, callee}`. Suppresses when caller or callee fails to resolve in the registry, or when both resolve to the same ID (self-edge).
2. **`findWikilinkAtCursor(lineText, cursorCh)`** — text-scan helper that returns the inner target string of `[[target]]` (or `[[target|alias]]`, `[[target#heading]]`, `[[target^block]]`) that brackets `cursorCh`, or null if the cursor isn't inside a wikilink. Pure text — no Obsidian editor dependency.

### `src/main.ts` editor-menu extension

A second `editor-menu` event handler (registered after the existing sync-menu handler) does:

1. `editor.getCursor()` + `editor.getLine(cursor.line)` → cursor + line text.
2. `findWikilinkAtCursor(lineText, cursor.ch)` → target string or null.
3. Build a `SnippetRegistryLike` adapter on top of `app.metadataCache.getFirstLinkpathDest` + frontmatter type-check. Returns `file.basename` for known snippets (type ∈ {action, data, snapshot}), null otherwise.
4. `decideWikilinkFreezeMenu(file.basename, target, registry)` → decision.
5. If `decision.showMenu`: add `Forge: Freeze edge {caller} → {callee}` and `Forge: Unfreeze edge ...` menu items. On click → `freezeEdge(serverUrl, vaultPath, caller, callee, state)`. The bare-ID basenames auto-qualify Python-side via v0.2.40's `_forge_set_edge_state` → `_forge_qualify_snippet_id`.

Notice routing mirrors the existing modal's: success / 404-no-snapshot / generic-failure with a clear note to forge-click the caller first if the capture hasn't happened.

### `INSTALL.md` pin

v0.2.40 → v0.2.41.

## §1.4 Post-fix verbatim test output

```
✔ decideWikilinkFreezeMenu: target is a known snippet → menu offered with qualified caller + callee
✔ decideWikilinkFreezeMenu: target is NOT a known snippet → menu suppressed
✔ decideWikilinkFreezeMenu: current file is NOT a snippet → menu suppressed
✔ decideWikilinkFreezeMenu: target equals current file (self-reference) → menu suppressed
✔ decideWikilinkFreezeMenu: ambiguous bare match → first-match-wins per registry semantics
✔ findWikilinkAtCursor: cursor inside `[[target]]` returns target
✔ findWikilinkAtCursor: cursor outside any wikilink returns null
✔ findWikilinkAtCursor: piped wikilink `[[target|alias]]` returns target only
✔ findWikilinkAtCursor: heading anchor `[[target#heading]]` returns target only
✔ findWikilinkAtCursor: block anchor `[[target^block]]` returns target only
✔ findWikilinkAtCursor: multiple wikilinks on one line picks the bracketing one
✔ findWikilinkAtCursor: empty wikilink `[[]]` returns null
ℹ tests 12
ℹ pass 12
ℹ fail 0
```

## §1.5 Full `npm test` suite

```
ℹ tests 198
ℹ pass 198
ℹ fail 0
ℹ duration_ms 4710.872958
```

(186 prior + 12 new helper cases = 198.)

## §3 User-side smoke checklist

> Supersedes the prior §3 in this file per protocol update 2026-06-03; preserved git history shows the original table-format version. The prior shape was flagged as too dense for a tired distracted reader and used the wrong install path; the canonical Forge install is `scripts/install-latest.sh`, which is what this rewrite invokes.

**Pre-conditions:**

- A Terminal window open with working directory `~/projects/forge-client-obsidian`. The install command is run from there.
- Obsidian is fully quit (use `Cmd+Q` (macOS), NOT just `Cmd+W` which only closes the window — the Forge plugin only re-evaluates its code on full Obsidian relaunch).
- The smoke vault exists at `~/forge-vaults/smoke-v0.2.13/` and contains, at the vault root:
  - `hello_random.md` — the snippet that calls `random_name` and `Greet`.
  - `random_name.md` — returns 5 random lowercase letters.
  - `Greet.md` — prints `hello <name>`.
  - `Welcome.md` — a plain markdown note (no `type:` in frontmatter); used as the wikilink-to-non-snippet target in step 11.
  - `forge.toml` — declares `domains = ["music"]` on a non-comment line.
- The smoke verifies the v0.2.41 wikilink-context-menu surface. The engine-side v0.2.40 fix is a transitive dependency: step 7 below relies on it. If your install came from a prior v0.2.40 smoke and you haven't re-extracted in between, step 7's Notice should fire cleanly; if it raises `FileNotFoundError`, re-run the v0.2.40 smoke first.

### Steps

1. **Install v0.2.41 into the smoke vault.** In Terminal:
   ```
   VAULT=~/forge-vaults/smoke-v0.2.13 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh
   ```
   No `TAG=` override needed — v0.2.41 is the current latest. Expected output (last few lines):
   ```
   Resolving latest release of frmoded/forge-client-obsidian ...
   Latest: v0.2.41
   Downloading https://github.com/frmoded/forge-client-obsidian/releases/download/v0.2.41/forge-client-obsidian-v0.2.41.zip ...
     local SHA-256:  <64-hex-chars>
     GH asset digest: <same-64-hex-chars>
     digests match
   ...
   Installed forge-client-obsidian v0.2.41 into ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian
   ```
   Interpretation: SHA mismatch → GitHub asset propagation lag; wait 60 seconds and re-run. `FATAL: could not resolve latest tag` → network is offline. `FATAL: vault not found at ...` → the `VAULT=` path is wrong; correct and re-run. The script preserves your `data.json` (transpile token, server URL settings) across the reinstall.

2. **Open the smoke vault in Obsidian and inspect the console.** Launch Obsidian and pick `smoke-v0.2.13` from the vault picker (or `File → Open Vault…`). After the vault opens, open the Developer Tools panel with `Cmd+Opt+I` (macOS) / `Ctrl+Shift+I` (Linux/Windows) and switch to the **Console** tab. Type `Forge:` (with the colon) into the console's filter box.
   Expected log lines (one of these two, depending on whether your last extraction matches v0.2.41's bundled version):
   - Match case: `Forge: forge-music already at version 0.3.8; skipping`
   - Drift case: `Forge: forge-music drift detected (extracted 0.3.X → bundled 0.3.8); backing up + re-extracting`
   
   Also expected: `Forge: forge-moda already at version 0.4.16; skipping` (or the drift equivalent). For v0.2.41 specifically (which is JS-only — no bundled-vault changes between v0.2.40 and v0.2.41), the match case is the most likely outcome.
   Interpretation: neither line present → `ensureBundledVault` didn't run for music, meaning the vault's `forge.toml` doesn't declare `domains = ["music"]` (re-check pre-conditions). A `Forge: ensureBundledForgeMusic failed` error line → the auto-re-extract path crashed; copy the full stack trace and stop the smoke here.

3. **Confirm v0.2.41 actually landed in the active vault's install.** In Terminal, check the installed plugin's manifest version:
   ```
   grep '"version"' ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/manifest.json
   ```
   Expected: a line containing `"version": "0.2.41"`. If you see `0.2.40` or earlier, the install didn't write to this vault — return to step 1 and verify the `VAULT=` argument matches `~/forge-vaults/smoke-v0.2.13`.
   Then verify the wikilink handler code is wired into the built `main.js`:
   ```
   grep -c "decideWikilinkFreezeMenu" ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/main.js
   ```
   Expected: `2` or higher (the helper import in `main.ts` plus the call site). If `0`, the install zip didn't contain the v0.2.41 build — re-run step 1.

4. **Ensure `hello_random.md` has a wikilink to `random_name` in its body.** Open `hello_random.md` in the editor. The body needs an actual `[[random_name]]` wikilink (the backtick-wrapped reference in the English facet docstring is plain code, not a wikilink). Append the following block to the very bottom of the file if it isn't already there:
   ```
   
   # Dependencies
   
   [[random_name]] [[Greet]]
   ```
   Save the file (`Cmd+S`).
   Expected: the file's last lines now show a `# Dependencies` heading and a line with two wikilinks. Obsidian renders the wikilinks as clickable underlined text.
   Interpretation: this section is the conventional Forge "Dependencies" block; it serves the wikilink smoke without changing the snippet's compute behavior.

5. **Forge-click `hello_random.md` once to capture the edge.** Click the **Forge** button in the toolbar (or `Cmd+P → "Forge: Run only (active snippet)"`).
   Expected: a Forge Output panel entry appears with text like `hello qzfmx` (any 5 lowercase letters). The compute runs `context.compute('random_name', n=5)` then `context.compute('Greet', name=...)`; the first call writes the snapshot the freeze step needs.
   Interpretation: no output panel → the click didn't reach the engine; check DevTools console for errors. Output text doesn't match `hello <5-lowercase-letters>` → unrelated issue with the snippets themselves; verify `random_name.md`'s Python facet returns the expected 5-character string.

6. **Right-click on `[[random_name]]` in the body's Dependencies section.** Position your cursor inside the `[[random_name]]` bracketed text (click directly on the word "random_name"). Right-click.
   Expected: the context menu appears. Among Obsidian's standard items, two new entries are present:
   - `Forge: Freeze edge hello_random → random_name`
   - `Forge: Unfreeze edge hello_random → random_name`
   Interpretation: items absent → the wikilink wasn't detected. Most likely cursor wasn't inside the bracket span (right-click directly on the link text, not adjacent whitespace). Less likely: `hello_random.md` frontmatter `type` field isn't a snippet type — verify in DevTools with `app.metadataCache.getFileCache(app.workspace.getActiveFile()).frontmatter.type` (should print `"action"`).

7. **Click `Forge: Freeze edge hello_random → random_name`.**
   Expected: an Obsidian Notice (the toast in the bottom-right corner) reading `Forge: frozen hello_random → random_name`. No Python traceback in DevTools.
   Interpretation: if you see `Forge: no snapshot for hello_random → random_name. Forge-click hello_random.md once to capture it.` you skipped step 5; go back and forge-click first. If you see `PythonError: ... FileNotFoundError: ...hello_random/random_name.md` with NO `authoring/` segments in the path, the engine-side v0.2.40 auto-qualify isn't present (transitive dependency failure); run the v0.2.40 smoke to fix the install state.

8. **Forge-click `hello_random.md` three times in succession — the freeze should pin the value.**
   Expected: all three output panels show the **same** `hello <5-letters>` string (the value captured during step 5). Letters identical across all three clicks.
   Interpretation: different letters across clicks → freeze flipped the file's `state` field but the read path isn't honoring it; check `ForgeContext._read_frozen_snapshot` is reached on each `context.compute('random_name', ...)` call. Same letters → freeze works end-to-end via the wikilink right-click surface (the load-bearing assertion).

9. **Right-click the same `[[random_name]]` wikilink and click `Forge: Unfreeze edge hello_random → random_name`.**
   Expected: Notice reading `Forge: lived hello_random → random_name` (the verb `${verb}d` produces "lived" from the state name "live" — cosmetic only, see §2). No traceback.
   Interpretation: success → snapshot's `state` flipped back to `live`; next clicks should re-randomize.

10. **Forge-click `hello_random.md` three more times — randomness restored.**
    Expected: each click produces a **different** 5-letter string. Statistically the chance of two clicks colliding is 1/26⁵ ≈ 1 in 12 million.
    Interpretation: identical letters across all three → unfreeze's `set_snapshot_state` call didn't persist the change; re-check step 9's Notice text.

11. **(Negative case A.) Verify the menu is suppressed for wikilinks pointing at non-snippets.** In `hello_random.md`'s Dependencies block, add a wikilink to `Welcome.md` (a plain markdown note with no `type:` frontmatter):
    ```
    
    See also [[Welcome]] for context.
    ```
    Save (`Cmd+S`). Position cursor inside `[[Welcome]]`. Right-click.
    Expected: the context menu shows Obsidian's standard items but NO "Forge: Freeze edge" / "Forge: Unfreeze edge" entries. The `decideWikilinkFreezeMenu` helper suppresses the menu because `Welcome.md`'s frontmatter has no snippet `type`.
    Interpretation: freeze items appear → `Welcome.md` has a snippet-typed frontmatter (`action`/`data`/`snapshot`); verify with `app.metadataCache.getFileCache(...).frontmatter.type` in DevTools.

12. **(Negative case B.) Verify the menu is suppressed when the user is in a non-snippet file.** Open `Welcome.md` (the plain note). Add a wikilink to a snippet:
    ```
    
    See [[random_name]] for the random-name helper.
    ```
    Save (`Cmd+S`). Position cursor inside `[[random_name]]`. Right-click.
    Expected: NO "Forge: Freeze edge" / "Forge: Unfreeze edge" entries. The helper suppresses because the caller (`Welcome.md`) isn't a snippet.
    Interpretation: freeze items appear → `Welcome.md` was accidentally promoted to a snippet (check its frontmatter for `type: action`); revert.

### Failure modes to watch for

- **Step 1 prints `FATAL: SHA mismatch`** → GitHub asset propagation hadn't completed when the script ran. Wait 60-120 seconds and re-run. The script is idempotent against the install dir.
- **Step 2 shows no `Forge: forge-music ...` line in the console** → `ensureBundledForgeMusic` skipped because `forge.toml` doesn't declare `domains = ["music"]`. Edit the toml (see pre-conditions), fully quit Obsidian (`Cmd+Q`), reopen.
- **Step 6's context menu doesn't include the freeze items, but the wikilink is clearly to a snippet** → the wikilink-handler isn't loaded. Run step 3's `grep -c` check; if it prints `0`, the install zip didn't contain v0.2.41's code (re-run step 1). If it prints `2+`, try `Cmd+P → "Reload app without saving"` to flush any cached editor state.
- **Step 7 raises `PythonError: ... FileNotFoundError: /bundle/user-vault/.forge/edges/hello_random/random_name.md` (no `authoring/` segments)** → the engine-side v0.2.40 auto-qualify isn't present in this install. Run the v0.2.40 smoke (`feedback/2026-06-03-0000-...md` §3) to verify the engine fix is in place, then redo step 7 here.
- **Step 8 produces different letters across clicks despite step 7 succeeding** → freeze flipped the snapshot file's `state` field but the read path isn't returning the frozen value. Open the snapshot file at `~/forge-vaults/smoke-v0.2.13/.forge/edges/authoring/hello_random/authoring/random_name.md` and confirm the frontmatter reads `state: frozen`. If yes, that's a `ForgeContext._read_frozen_snapshot` regression — capture a DevTools transcript and flag.

### End-state cleanup

After the smoke completes, the following persist:

- The `# Dependencies` section + the `[[Welcome]]` line you appended to `hello_random.md` (step 4 + step 11). Leave them in place; they're useful for future smokes.
- The wikilink you added to `Welcome.md` (step 12). Same — leave or remove per preference.
- The snapshot directory `~/forge-vaults/smoke-v0.2.13/.forge/edges/authoring/hello_random/authoring/` containing `random_name.md` (and possibly `Greet.md`). To reset for a fresh smoke run:
  ```
  rm -rf ~/forge-vaults/smoke-v0.2.13/.forge/edges/authoring/hello_random/
  ```
  This deletes the snapshot directory for `hello_random`'s outbound edges; the next forge-click re-captures from scratch.

## §2 Notes + follow-ups

### Ambiguity handling deferred

The pure-core helper delegates bare-name resolution to the registry's resolution order — same semantics as `context.compute('bare_id')` from a top-level call site. Explicit ambiguity UI (a sub-menu listing all candidates) is deferred to a future drain. Justification: the registry's resolution order is already user-configurable via `forge.toml` `domains`, so the chosen vault matches what the user already expects from compute.

### (b) graph-view overlay deferred — v1-audit entry

Per Phase 1 finding 3: Obsidian's public API exposes no hooks for the native Graph View. Recommended v1-audit entry for cowork pickup:

> **(b) Graph-view freeze overlay** — Obsidian's public API exposes no hooks for the native Graph View (verified obsidian.d.ts grep, 2026-06-03). Path forward: build a custom Forge graph view with edge state + click-to-freeze affordances, scoped as a v1.0-era drain. Until then, freeze surfaces are the Cmd+P modal + wikilink right-click (v0.2.41).

### Edge-case: wikilink at start of line / inside backticks / inside code fence

`findWikilinkAtCursor` is plain-text — it doesn't know about markdown code fences. A wikilink inside a Python triple-backtick fence (e.g. `[[random_name]]` mentioned in a docstring) would still match. In practice, the freeze right-click flow is only meaningful in markdown context, and the menu's worst case is a no-op click if the snapshot doesn't exist (clear notice). Acceptable.

### Glue layer is hand-tested (not unit-tested)

The pure-core helper has 12 cases. The glue in `main.ts` (the editor-menu handler that wires cursor → line → findWikilinkAtCursor → metadataCache adapter → decision → menu items → freezeEdge call) is shallow enough that the user-side smoke covers it cleanly. A full unit test would require mocking Obsidian's `Editor`, `App`, `MetadataCache`, and `Menu` — not worth the harness complexity for a thin glue layer.

### Notice text: "lived" instead of "unfroze"

Minor cosmetic — see step 11 of §3. The verb construction is `${verb}d` where verb is `freeze`/`unfreeze`. For unfreeze it produces "unfreezed" or "lived" (depending on state name). The hover-action code in `edges-hover.ts:185` has the same construction. Worth a small polish drain to use a verb table instead of string interpolation.


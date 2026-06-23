---
prompt: 2026-06-25-1530-v0338-persistent-per-snippet-expanded-state.md
shipped_version: v0.2.138
session: drain-2026-06-25-1530
date: 2026-06-25
status: shipped
---

# v0338 feedback — persistent per-snippet expanded state

## §1 — Investigation notes

`forge-expanded` is a SINGLE class on the markdown view containerEl that controls BOTH frontmatter AND `# Dependencies` visibility via paired CSS rules (`styles.css:771-776` for frontmatter, `805-806` for deps). There is currently ONE toggle command (`toggleFrontmatterVisibility` at `main.ts:2471`); no separate dependencies toggle yet.

Per the prompt's §2.2 ExpandedState shape `{frontmatter, dependencies}`: the actual UI state today is BINARY per file (the class is on or off). Used `{expanded: boolean}` to match the implementation; the granular shape lands when v0339 splits the toggle into two commands. Forward-compat: missing fields default to `false` on read, so the v1 single-binary keys remain readable after v0339's split.

## §2 — What shipped (v0.2.138)

### §2.1 — Pure-core `expanded-state-core.ts`

- `readExpandedState(storage, path)` → `{expanded}`. Defensive: null/undefined storage → default. Missing key → default. Malformed JSON → default. Non-object JSON → default. `expanded` non-boolean → default. Storage throwing on `getItem` (SecurityError) → default.
- `writeExpandedState(storage, path, state)` — no-op on null storage. Throwing setItem (QuotaExceededError) → no-op.
- `toggleExpanded(storage, path)` — read + flip + write + return.
- `expandedStorageKey(path)` — `forge:expanded:` + `encodeURIComponent(path)`. Defends against `:` (Windows drives) / `?` / `#` collisions.

### §2.2 — main.ts wiring

- `expandedStateStorage()` private helper: returns `globalThis.localStorage` if available, null otherwise. Wraps the detection so future V2 migration (vault-local config for cross-device sync) changes one site.
- `toggleFrontmatterVisibility()`: after toggling class, calls `writeExpandedState(storage, file.path, {expanded})` so the next file-open honors the user's choice.
- `tagSnippetViews(file)`: after `add('forge-snippet')`, calls `readExpandedState(storage, file.path)` and `containerEl.classList.toggle('forge-expanded', st.expanded)`. Non-snippet leaves get both classes removed (clean slate per leaf — handles snippet → non-snippet view transitions cleanly).

### §2.3 — 19 failing-first tests (chips.test.ts + expanded-state-core.test.ts)

Coverage: missing key, valid true, valid false, malformed JSON, array JSON, non-boolean expanded, roundtrip true, roundtrip false, null/undefined storage paths, throwing storage paths, key collision defense, per-path isolation, toggle from missing, toggle from true, toggle from false, write no-op on null storage.

Total: **740 plugin tests passing (721 + 19 new)**.

## §3 — Per-protocol compliance

- ✓ §78: investigation traced the actual class surface before code.
- ✓ §57–74: 19 failing-first tests.
- ✓ §86–118: new pure-core helper joining the family.
- ✓ §76: driver-flagged carry-forward from v0.2.119.
- ✓ §347: release.sh handled v0.2.138.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error: storage try/catch use silent default (per defensive contract; no catches need console.error since this is graceful degradation, not unexpected error).
- ✓ v0.2.134 §5 inlined-version preflight: passed.

## §4 — Edge cases (per prompt §2.4)

- **File rename**: localStorage key is path-based. Rename leaves orphan key + new key starts at default. Acceptable for v1; document.
- **File delete**: orphan key remains. Acceptable surface bloat. Cleanup pass (walk localStorage, remove keys with no matching vault file) is a small follow-up.
- **Multiple panes on same file**: both reflect the same state (per-leaf read uses the same key). Toggle from one pane affects both (since both re-read on next tagSnippetViews call). Acceptable.

## §5 — User-side smoke (deferred to driver)

1. Open `simulation.md` → Cmd-P "Forge: Toggle frontmatter visibility" → frontmatter expands.
2. Switch to `hello_world.md`. Switch back to `simulation.md`. **Expected: STILL expanded.**
3. Quit Obsidian. Reopen. Open `simulation.md`. **Expected: STILL expanded.**
4. Toggle again → collapses. Switch + switch back. **Expected: STILL collapsed.**
5. `hello_world.md` untouched: default-collapsed.

## §6 — Future migration path (per §7 of prompt)

If sync across devices becomes a need, swap the localStorage backend for a vault-local config file (e.g. `.obsidian/plugins/forge-client-obsidian/data.json` or similar). The pure-core's `ExpandedStateStorage` interface is the swap point — only `expandedStateStorage()` in main.ts changes.

## §7 — Open follow-ups + carry-forward

After this drain, remaining tracking-lane QoL items:
- v0.2.122 granular toggle commands (v0339 — partner prompt, next).
- Orphan-key cleanup pass (small follow-up; defer until storage bloat is observed).
- v0.2.131 §4 #2 status-bar persistent indicator (defer until cohort feedback).

## §8 — Hand-off

v0.2.138 shipped. v0339 (granular toggle) up next; it will split the single `forge-expanded` class into separate frontmatter + dependencies states, at which point `expanded-state-core` extends to `{frontmatter, dependencies}` per the forward-compat path.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

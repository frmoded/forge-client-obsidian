---
timestamp: 2026-06-06T10:15:00Z
session_id: claude-code-drain-chip-insertion-templating
prompt_modified: 2026-06-06T10:15:00Z
status: success
---

# Feedback — 2026-06-06-1015 Chip insertion signature templating (brief (d)) — v0.2.63

## §0 — Release coordinates

**Manifest:** 0.2.62 → 0.2.63.

**Commit:** `c0b3e5d` on `forge-client-obsidian/main`.

**Tag:** `v0.2.63` pushed. **Release:** <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.63>. **Zip SHA-256:** `4664bb6617631bfd35a91098a8435d115e35c8a34f593b059704e572ed7f2bba`. install-latest.sh into smoke vault: clean.

**Line counts of changed files:**

| File | Lines | Note |
|---|---|---|
| `src/chips.test.ts` | +131 | 8 new end-to-end regression cases. |
| `manifest.json` | 10 | version bump. |
| `INSTALL.md` | (5 pin replacements) | v0.2.62 → v0.2.63. |

**No production code changes** — pipeline already produces spec-correct shape; this drain ships regression test coverage.

## §1.1 — 8 TDD cases (end-to-end regression coverage)

All cases exercise `autoDeriveChips → mergeChipsWithOverrides → chip.insertion` (the value the chips-view click handler passes verbatim into `insertChipText`):

1. Action snippet with `inputs: [bars]` → `'Do [[peak]](<bars>).'` preserved through merge.
2. Action snippet with no inputs → `'Do [[solitary]]().'`.
3. Action snippet with `inputs: [x, y, color]` → `'Do [[render]](<x>, <y>, <color>).'` (comma-sep placeholders).
4. Data snippet → `'Set <name> to [[twelve_bar_blues_progression]]().'`.
5. **forge-moda v2 shape** — overrides set `group` + `label` + `order` but NOT `insertion`; auto-derived canonical wins. Regression for the actual v2 forge-moda `_chips.md` layout.
6. Curator-authored override WITH `insertion:` field → override wins (regression for the `_chips.md` v2 explicit-insertion path).
7. Regex assertion that NO chip emits bare `[[id]]` shape (the brief's reported failure mode). Every insertion must carry the `Do ... ().` shell.
8. forge-music's exact example — clicking a `peak` chip whose snippet has `inputs: [bars]` produces `Do [[peak]](<bars>).` — verbatim verification of the brief's load-bearing case.

## §1.2 — Phase 1 investigation findings

### Pipeline trace (chips-core.ts + chips-view.ts)

**`deriveChip`** (chips-core.ts:252-278):

```typescript
const label = humanizeSnippetId(snippet.id);
const group = snippet.parentDir && snippet.parentDir !== ''
  ? snippet.parentDir
  : '(library)';

if (snippet.type === 'action') {
  const inputs = snippet.inputs ?? [];
  const argList = inputs.map(n => `<${n}>`).join(', ');
  const insertion = `Do [[${snippet.id}]](${argList}).`;
  return { label, insertion, group };
}

if (snippet.type === 'data') {
  const insertion = `Set <name> to [[${snippet.id}]]().`;
  return { label, insertion, group };
}
```

**Constructs the canonical form directly.** No fallback to bare `[[id]]`.

**`mergeChipsWithOverrides`** (chips-core.ts:379-490):

- Step 2 — apply overrides: `if (ov.insertion !== undefined) existing.insertion = ov.insertion;` (line 400). When the override has no `insertion` field, the auto-derived value persists.
- Step 4 — emit final chips: `const out: Chip = { label: c.label, insertion: c.insertion };` (lines 450, 467). `insertion` is preserved verbatim.

**`chips-view.ts:onChipClick`** (line 271):

- Line 257: `void this.onChipClick(chip.insertion);` — `chip.insertion` is the argument.
- Line 295: `await this.insertViaVault(file, insertion);` — passes through unchanged.
- Line 306: `const result = insertChipText(content, insertion);` — passes through unchanged.

**`insertChipText`** (chips-core.ts:575-600): splits the note body, finds the `# English` section, appends `chipInsertion` as a new line at the end of that section. **Does not transform the text.**

### Forge-moda `_chips.md` (smoke vault current state)

```
$ grep -n insertion ~/forge-vaults/smoke-v0.2.13/forge-moda/_meta/_chips.md
6: description: MoDa chip palette — schema v2. Auto-discovery surfaces every action/data snippet...
64: # `insertion` is intentionally NOT overridden — auto-derive produces the
```

The v0.2.48 migration produced a v2 `_chips.md` with overrides for label + group + order — **no `insertion:` field anywhere in any override**. Confirmed in both the source-of-truth (`~/projects/forge-moda/_meta/_chips.md`), the bundle mirror (`assets/vaults/forge-moda/_meta/_chips.md`), and the installed smoke vault. So forge-moda chips take the auto-derived canonical form per `deriveChip`.

### Forge-music has no `_chips.md`

```
$ find ~/projects/forge-music -name "_chips.md" 2>&1
(no matches)
```

forge-music's chips go through pure auto-derive — no curator overrides to potentially mangle the insertion field. Every chip's `insertion` is `deriveChip`'s canonical output.

### What the existing test suite says

`chips.test.ts:287-358` already contains 7 `deriveChip` unit tests covering the canonical-form output for every type/inputs combination. They've passed since v0.2.48. Confirmed they still pass:

```
✔ deriveChip: action snippet with inputs → B7.1-canonical insertion with <placeholders>
✔ deriveChip: action snippet with no inputs → empty parens
✔ deriveChip: action snippet with multiple inputs → comma-separated placeholders
✔ deriveChip: data snippet → Set <name> to [[id]]() form
... etc
```

### Conclusion: the bug does NOT reproduce against the unit-level pipeline

Per cc-prompt-queue HARD rule (TDD discipline §1):

> **If the failing test passes against current code** — the bug isn't where the prompt hypothesized. Do NOT ship a speculative fix.

So this drain ships **regression-protection coverage** that locks in the spec-correct shape across every link of the pipeline — including a regex assertion (test #7) that EXPLICITLY rejects the bare `[[id]]` shape the brief reported.

**Possible alternate explanations** for the brief's observation (none confirmed; would need user-side §3 smoke to verify):

- **Stale chip state**: an earlier session's `_chips.md` (pre-v0.2.48) had v1 entries with hand-authored insertions that included a bare `[[name]]` shape, and the user observed those before the v0.2.52 migration shipped to their vault.
- **Vault has a v1 `_chips.md` somewhere that v0.2.52's one-shot migration missed**, and the v1 fall-through path (`loadLibraryChips` line 216 — `mergeChipSources([{ sourceName: libDir, chips: parsed.chips }])`) is shipping the bare insertions from that v1 file. The v0.2.52 detector handles `forge-moda/_meta/_chips.md` and `forge-music/_meta/_chips.md` — if a curator-authored `_chips.md` lives outside those canonical locations, the detector wouldn't catch it.
- **User mis-read the chip's LABEL as the insertion**: chip labels are humanized snippet names ("Peak"), and the tooltip (aria-label) IS the insertion (`Do [[peak]](<bars>).`). A glance-read of the chip button might catch the label rather than the insertion.
- **Path A discovery wasn't surfacing forge-music chips at all pre-v0.2.62** (per brief (c)), so the brief's reporter might have been observing a non-forge-music chip (e.g., from accidentally-nested forge-moda) and conflating libraries.

## §1.3 — Phase 2 fix

**No production code change**. The pipeline already produces the spec-correct shape; the fix would be against a phantom bug.

Phase 2 instead ships:
- **8 new end-to-end test cases in `src/chips.test.ts`** (lines 540-685; appended after the v0.2.54 tests). Each case exercises the FULL pipeline `autoDeriveChips → mergeChipsWithOverrides → chip.insertion`, asserting the canonical shape at the output. Test #7 (the regex assertion) is the load-bearing regression guard: any future change that emits bare `[[id]]` for any chip in any path triggers a suite failure with a verbatim "unexpected insertion shape" message.

Together with the existing 7 `deriveChip` tests + 15 `mergeChipsWithOverrides` tests + the new 8 end-to-end tests = **30 distinct regression points** against the bare `[[id]]` failure mode.

## §1.4 — Post-fix verbatim test output

```
✔ end-to-end pipeline: action snippet with inputs → canonical insertion preserved through merge
✔ end-to-end pipeline: action snippet with no inputs → empty parens preserved through merge
✔ end-to-end pipeline: action snippet with multiple inputs → comma-separated placeholders preserved through merge
✔ end-to-end pipeline: data snippet → "Set <name> to [[id]]()." form preserved through merge
✔ end-to-end pipeline: forge-moda v2 override does NOT override insertion → auto-derived canonical wins
✔ end-to-end pipeline: explicit insertion override wins over auto-derive (curator-authored bespoke form)
✔ end-to-end pipeline: insertion makes it through end-to-end without being stripped to bare wikilink
✔ end-to-end pipeline: forge-music chip click simulation — peak with inputs:[bars] produces canonical insertion
ℹ tests 376
ℹ pass 376
ℹ fail 0
```

## §1.5 — Full `npm test`

```
ℹ tests 376
ℹ pass 376
ℹ fail 0
```

(368 baseline + 8 new = 376.)

## §2 — Surprises during investigation

**The non-reproduction was the surprise.** The brief described a load-bearing regression ("chip palette inserts bare `[[name]]`"), and the unit-level pipeline definitively does NOT produce that shape. Every chip's insertion carries the `Do ... ().` shell (or `Set <name> to ... ().` for data). The 30 regression points across `deriveChip` + `mergeChipsWithOverrides` + end-to-end + `insertChipText` confirm the spec behavior.

**Possible sources of the user's observation** (none confirmed):
- A vault with a pre-v0.2.48 `_chips.md` that v0.2.52's migration didn't catch — somewhere outside `_meta/_chips.md` or `_chips.md` at library root.
- The v0.2.54 Personal group has its own discovery path. The same `deriveChip` runs there too — verified by test #1 + #2 above (passing in source-vault simulation).
- A misread of the chip's label as the insertion (label = "Peak", insertion = `Do [[peak]](<bars>).`).
- Cached state in the chip palette across plugin updates. Refresh chip palette (Cmd-P) should re-read.

**Per protocol HARD rule, do NOT ship a speculative fix.** This drain ships test coverage and asks for a verbatim repro in §3.

**Tenth clean release.sh run** through the v0.2.61 drift-preflight-early order. Pipeline still functioning end-to-end without intervention.

## §3 — User-side smoke (capture EXACT inserted text)

The brief's Phase 1 step 1 says: "Capture the EXACT inserted text verbatim ... character-by-character. Include trailing period, parens (if any), whitespace."

### Pre-conditions

- v0.2.63 installed in `~/forge-vaults/smoke-v0.2.13/` (verified via install-latest.sh during this drain).
- v0.2.62 just shipped Path A support; you may also want to test against `~/projects/forge-music/` as a vault to mirror the brief's environment.

### Test A — author a scratch snippet and capture the exact insertion (3 min)

1. In Terminal:

   ```
   cat > ~/forge-vaults/smoke-v0.2.13/scratch_d.md <<'EOF'
   ---
   type: action
   inputs: []
   description: "Scratch for brief (d) chip insertion capture"
   ---

   # English

   <click chips below this line>

   # Python

   ```python
   def compute(context):
       pass
   ```
   EOF
   ```

2. In Obsidian, Cmd-P → "Reload app without saving".
3. Open `scratch_d.md` from the file tree.
4. Open the chip palette (right sidebar puzzle icon).
5. Click ANY moda chip (e.g., the "Create water particles" chip under the Setup group).
6. Switch to Terminal:

   ```
   cat ~/forge-vaults/smoke-v0.2.13/scratch_d.md
   ```

   **Expected** (spec-correct shape):

   ```markdown
   ---
   type: action
   inputs: []
   description: "Scratch for brief (d) chip insertion capture"
   ---

   # English

   <click chips below this line>
   Do [[create_water_particles]]().

   # Python
   ...
   ```

   The exact inserted line should be `Do [[create_water_particles]]().` — 4 brackets, `()` parens (no `<name>` placeholders since this snippet has `inputs: []`), trailing period.

7. **If you see**: `[[create_water_particles]]` (bare, no `Do`, no parens, no period) — that's the brief's reported failure mode. Capture the exact line + which chip was clicked + which vault, and flag for follow-up; the regression tests would also have detected this drift if it had reproduced against the pipeline.

8. **If you see the spec-correct form**: the unit pipeline is shipping correctly. The brief's observation may have been against a stale earlier state.

### Test B — capture insertion for a chip WITH inputs (2 min)

For thoroughness, click a chip that DOES have inputs (e.g., "Set water speed" in the Setup group — its snippet has `inputs: [temperature]`).

```
cat ~/forge-vaults/smoke-v0.2.13/scratch_d.md
```

**Expected** (spec-correct):

```
Do [[set_water_speed]](<temperature>).
```

**If you see**: `[[set_water_speed]]` (bare) — same failure mode as Test A; capture verbatim.

### Test C — forge-music Path A insertion capture (3 min)

Reproducing the brief's original environment.

1. Open `~/projects/forge-music/` as a vault in Obsidian (vault picker → Open folder as vault).
2. Cmd-P → "Reload app without saving".
3. Author a scratch snippet at `~/projects/forge-music/scratch_d.md`:

   ```
   cat > ~/projects/forge-music/scratch_d.md <<'EOF'
   ---
   type: action
   inputs: []
   description: "Scratch for forge-music Path A chip insertion capture"
   ---

   # English

   <click chips below this line>
   EOF
   ```

4. Open the file in Obsidian; open chip palette.
5. Click the chip for a forge-music snippet with declared inputs (e.g., `peak` from `percussion_lab/`, which has `inputs: [bars]`).
6. Verify:

   ```
   cat ~/projects/forge-music/scratch_d.md
   ```

   **Expected** (per the regression tests):

   ```
   Do [[peak]](<bars>).
   ```

7. **If you see bare `[[peak]]`** — Path A pipeline has a divergence from the unit pipeline. Capture: which exact chip; which exact line was inserted; which vault; whether the palette was reloaded (Cmd-P "Forge: Refresh chip palette"). File for follow-up with these inputs and we'll do a targeted investigation.

8. Cleanup:

   ```
   rm ~/projects/forge-music/scratch_d.md
   ```

### Failure modes to watch for

- **Test A/B shows bare**: Vault has a `_chips.md` somewhere our migration detector didn't reach. Search:

  ```
  find ~/forge-vaults/smoke-v0.2.13 -name "_chips.md" 2>&1
  ```

  Expected: only `forge-moda/_meta/_chips.md` (v2 shape; `schema_version: 2` present). If another `_chips.md` lives elsewhere with hand-authored insertions, the v1 fall-through path may be active.

- **Test C shows bare for Path A**: forge-music source-vault discovery path (added in v0.2.62) may have introduced a parallel path that produces bare. Run:

  ```
  grep -A3 "loadSourceVaultChips" ~/forge-vaults/smoke-v0.2.13/.obsidian/plugins/forge-client-obsidian/main.js | head
  ```

  to verify the new path is in the bundle. (The build is minified; you'll see the function name but not detailed logic.)

- **No insertion at all happens on click**: the click handler may be failing to find the `# English` section in your scratch snippet. Verify your scratch has `# English` as a heading (case-insensitive accepted).

### End-state cleanup

```
rm ~/forge-vaults/smoke-v0.2.13/scratch_d.md
rm ~/projects/forge-music/scratch_d.md  # if you ran Test C
```

---

**Audit-trail close:** prompt moves to `prompts/done/`. Drain continues if queue non-empty.

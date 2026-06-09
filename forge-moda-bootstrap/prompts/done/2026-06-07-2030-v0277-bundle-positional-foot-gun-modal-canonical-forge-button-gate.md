# v0.2.77 — Tutorial-quality polish bundle (#5 positional foot-gun + #6 modal canonical + Forge-button gating)

**Date queued**: 2026-06-07
**Driver**: forge-core (Oded)
**Target plugin version**: bump per placeholder — `{CURRENT} → {NEXT_PATCH}` (expected `0.2.76 → 0.2.77`). Read `~/projects/forge-client-obsidian/manifest.json` first per cc-prompt-queue.md §347; pause and flag if not at 0.2.76. **Use explicit version arg** `bash scripts/release.sh 0.2.77` per the v0.2.75 lesson (avoids release.sh auto-bumping past).

## §0 — Why this prompt exists

Three tutorial-quality surface improvements bundled into one drain. All three are driver-authorized after Tier 1 v0.2.76 ship verified end-to-end. Each is small, bounded, addresses a real cohort-first-impression friction point. Originating message: forge-doc 2026-06-07-2006 (findings #5/#6 authorization) + forge-doc 2026-06-07-2015 (Forge-button gating UX feedback).

Three sub-features:

1. **#5 — Positional foot-gun**: a canonical input-taking snippet called positionally (`[[double]](5)` instead of `[[double]](n=5)`) currently fails with an opaque `NameError: name 'n' is not defined`. First cohort tweak surfaces this; teaching prose can't soften it.
2. **#6 — Modal canonical option**: "New Snippet" modal's `actionTemplate` only emits free-English template (`type: action` + `# Python` stub). Add a "Canonical" option so learners can create canonical snippets directly via the modal instead of duplicating an existing canonical snippet.
3. **Forge-button gating**: the Forge run button in the editor toolbar shows on every markdown file, including non-snippet notes (chapter lesson notes like `Hello.md`). Clicking on a non-snippet errors. Gate on `fm?.type === 'action' || fm?.type === 'data'` (snippet-ness).

## §1 — Investigation phase (light, well-mapped)

Investigation-first per cc-prompt-queue.md §78 is light because all three are well-scoped against existing patterns. Brief verification commit before fix is acceptable but not required; CC may bundle investigation into the implementation commits if the territory is unambiguous.

### §1.1 — #5 investigation

Read end-to-end and cite line numbers:

- `~/projects/forge/forge/core/executor.py` `_takes_only_context` (~line 614) + `exec_python` (~line 581+). Understand how canonical snippets currently route args: the canonical wrap is `def compute(context):` (line 504-505); `_takes_only_context` detects single-context signature and calls `fn(context)`, dropping positional args. Inputs reach via local_ns spread (line 596-605) — KEYWORD only.
- Engine response to a positional call `[[double]](5)` against canonical `inputs: [n]`: `args = (5,)` is captured but never bound because `_takes_only_context(fn)` is true. The slot resolver's shim at chips-view path or context.compute dispatch routes `(5,)` to `context.compute('double', 5)` → `exec_python(code, inputs=inputs, args=(5,))` → `_takes_only_context` true → `fn(context)` → body references `n` → `NameError`.

The fix shape: when a canonical snippet has declared inputs (`inputs: [n, m, ...]` in frontmatter) AND `_takes_only_context(fn)` is true AND positional args are non-empty, bind positional args to declared inputs in order. Equivalent to splicing positional into the inputs dict before exec_python's local_ns spread.

Concretely in `exec_python` or its caller: when computing local_ns, if `args` is non-empty AND snippet's declared inputs are non-empty, prepend `dict(zip(declared_inputs, args))` to inputs. If `len(args) > len(declared_inputs)`, raise a clear error (text below).

### §1.2 — #6 investigation

Read `~/projects/forge-client-obsidian/src/modal.ts` `actionTemplate` (~line 161 per forge-doc's prior message). Understand the current modal flow: user clicks "New Snippet" → modal opens → input snippet name + type → templates emit body.

The current free-English template emits something like:
```markdown
---
type: action
description:
inputs: []
---

# English

[describe what this snippet does]

# Python

```python
def compute(context):
    pass
```
```

The "Canonical" template should emit:
```markdown
---
type: action
description:
inputs: []
facet_form: canonical
---

# English

Do [[print]]("hello, world").
```

Note: no `# Python` stub (canonical compiles fresh on demand via `resolve_action_code`).

### §1.3 — Forge-button gating investigation

Read `~/projects/forge-client-obsidian/src/main.ts:820-850`. Per forge-doc's concrete citation:

- Line 826: `if (fm?.type === 'action')` — gate
- Lines 826-841: edit-mode toggle button (inside the gate)
- Line 843: New Snippet button (OUTSIDE the gate, unconditional)
- Line 847: Forge run button (OUTSIDE the gate, unconditional)

Verify these line numbers and the surrounding code. The fix is to extend the gate to wrap the Forge run button (and likely chips/edges if present). Decision per forge-doc's suggestion: gate on `fm?.type === 'action' || fm?.type === 'data'` (snippet-ness). Leave New Snippet button unconditional (vault-level action, useful from any note).

### §1.4 — Investigation commit (optional)

If CC's investigation surfaces nothing surprising, fold into the implementation commits. If a hypothesis-falsification arises (e.g., engine fix has a deeper layering issue), commit findings separately + route to questions/ per cc-prompt-queue.md §51.

## §2 — Implementation (TDD per cc-prompt-queue.md §57-74)

Three sub-features; each gets its own TDD cycle.

### §2.1 — #5 fix (engine + chip palette)

#### §2.1.1 — Engine: positional → declared-input binding

**Failing test first** at `~/projects/forge/tests/core/test_executor_positional_inputs.py`:

```python
def test_canonical_snippet_with_declared_inputs_accepts_positional_call():
    """Canonical snippet with inputs: [n] called as fn(5) should bind 5 to n,
    not raise NameError. v0.2.77 fix."""
    # Snippet body: facet_form: canonical, inputs: [n], English: 'Give back n times 2.'
    result = compute_via_engine(snippet, args=(5,), inputs={})
    assert result == 10

def test_canonical_snippet_with_too_many_positional_args_raises_clear_error():
    """Calling [[double]](5, 99) when inputs: [n] should raise a clear,
    actionable error citing the snippet's declared inputs."""
    with pytest.raises(ValueError, match=r"snippet '.*' takes inputs \[n\]; "
                                          r"positional call provided 2 args; "
                                          r"call as \[\[.*\]\]\(n=...\)"):
        compute_via_engine(snippet, args=(5, 99), inputs={})

def test_canonical_snippet_keyword_call_unchanged():
    """Keyword-only call [[double]](n=5) continues to work (regression check)."""
    result = compute_via_engine(snippet, args=(), inputs={'n': 5})
    assert result == 10

def test_canonical_snippet_no_inputs_positional_call_still_errors():
    """Calling [[no_args]](5) when inputs: [] should raise the same clear
    error (positional args provided but snippet takes none)."""
    with pytest.raises(ValueError, match=r"snippet '.*' takes no inputs; "
                                          r"positional call provided 1 args"):
        compute_via_engine(snippet, args=(5,), inputs={})

def test_legacy_free_english_snippet_positional_unchanged():
    """Free-English snippets (facet_form != canonical) keep current
    positional-routing behavior — they have explicit def compute(context, n, m, ...) 
    signatures, not _takes_only_context. Regression check."""
    # ... assert existing behavior is preserved.
```

Implement fix in `exec_python` (or a new helper) by checking if `_takes_only_context(fn)` AND `args` non-empty AND snippet has declared inputs. Bind positional → declared inputs in order; raise clear error on mismatch.

Run tests, confirm pass, full suite green.

#### §2.1.2 — Chip palette: keyword-form insertions for canonical input-takers

**Failing test first** in `~/projects/forge-client-obsidian/src/chips-core.test.ts` (or extending existing tests):

```typescript
test('deriveChip: canonical input-taking snippet emits keyword-form insertion', () => {
  const snippet = {
    id: 'double', basename: 'double', type: 'action',
    inputs: ['n'],
    facet_form: 'canonical',  // canonical → keyword form
  };
  const chip = deriveChip(snippet);
  // BEFORE v0.2.77: `Do [[double]](<n>).`
  // AFTER v0.2.77:  `Do [[double]](n=<n>).`
  assert.strictEqual(chip?.insertion, 'Do [[double]](n=<n>).');
});

test('deriveChip: legacy free-English snippet keeps positional form (regression)', () => {
  const snippet = {
    id: 'double', basename: 'double', type: 'action',
    inputs: ['n'],
    // no facet_form → free English → positional form
  };
  const chip = deriveChip(snippet);
  assert.strictEqual(chip?.insertion, 'Do [[double]](<n>).');
});
```

Implement: in `~/projects/forge-client-obsidian/src/chips-core.ts:288` `deriveChip`, branch on whether the snippet has `facet_form: canonical` AND non-empty `inputs`. Canonical input-takers emit `Do [[id]](k1=<k1>, k2=<k2>).`. Otherwise keep current positional form.

This requires `SnippetMetaForChips` to carry `facet_form` — extend the structural type + thread it through `buildSnippetInventory` / `loadSourceVaultChips` to read `facet_form` from frontmatter.

Run tests, confirm pass, full suite green.

### §2.2 — #6 fix (modal canonical option)

**Failing test first** in `~/projects/forge-client-obsidian/src/modal.test.ts` (or new file if needed):

```typescript
test('canonicalActionTemplate emits expected body shape', () => {
  const body = canonicalActionTemplate('my_snippet');
  // Includes facet_form: canonical in frontmatter
  assert.match(body, /^facet_form:\s*canonical$/m);
  // Has # English heading
  assert.match(body, /^# English/m);
  // Does NOT have # Python stub
  assert.doesNotMatch(body, /^# Python/m);
});

test('actionTemplate (legacy free-English) unchanged', () => {
  const body = actionTemplate('my_snippet');
  assert.doesNotMatch(body, /^facet_form:\s*canonical$/m);
  assert.match(body, /^# Python/m);  // free-English keeps its Python stub
});
```

Implement: add `canonicalActionTemplate` function in `modal.ts` paralleling `actionTemplate`. UI change: add a radio (or dropdown) in the New Snippet modal that toggles between "Free-English" (default) and "Canonical" — selected option determines which template fires. Default selection preserves current behavior; opt-in for canonical.

Run tests, confirm pass.

### §2.3 — Forge-button gating

**Failing test first** in `~/projects/forge-client-obsidian/src/main.test.ts` (or extracting the gate logic to pure-core per the convention if it's testable in isolation):

Option A (extract): pull the "should show Forge button?" predicate into `~/projects/forge-client-obsidian/src/forge-button-gate-core.ts`. Pure function: takes frontmatter dict, returns boolean. Tests:

```typescript
test('forgeButtonShouldShow: action snippet → true', () => {
  assert.strictEqual(forgeButtonShouldShow({type: 'action'}), true);
});
test('forgeButtonShouldShow: data snippet → true', () => {
  assert.strictEqual(forgeButtonShouldShow({type: 'data'}), true);
});
test('forgeButtonShouldShow: no frontmatter → false', () => {
  assert.strictEqual(forgeButtonShouldShow(undefined), false);
});
test('forgeButtonShouldShow: plain note (no type) → false', () => {
  assert.strictEqual(forgeButtonShouldShow({}), false);
});
test('forgeButtonShouldShow: snapshot type → false', () => {
  // snapshots are auto-generated; user shouldn't Forge-click them
  assert.strictEqual(forgeButtonShouldShow({type: 'snapshot'}), false);
});
```

Option B (inline): test by mounting the editor view + asserting button absence/presence. More complex setup; option A is preferred.

Implement: extend the existing gate at `main.ts:826` to also wrap the Forge run button at `847`. Use the pure-core predicate from option A. Same gate predicate applies to any other snippet-specific buttons (chips, edges) that are currently ungated — CC scans for these and decides whether to include in this fix or surface as follow-ups.

The New Snippet button at `843` stays unconditional (vault-level action; valid from any note).

Run tests, confirm pass.

### §2.4 — Full suite + integration

After all three sub-features land:
- `npm test` on forge-client-obsidian — baseline post-v0.2.76 = 506. New baseline target ~520 (+~14 across the three sub-features).
- `pytest -q` on forge — baseline post-v0.2.76 = 618. New baseline target ~622 (+~4 from §2.1.1 engine tests).
- All green.

## §3 — Release ship

Per cc-prompt-queue.md §339:

1. Bump `manifest.json` per placeholder.
2. NO `forge-moda/forge.toml` bump (no bundled-vault content change). Declare opt-out explicitly in §0 of feedback.
3. NO `forge-tutorial/forge.toml` bump (no tutorial content change).
4. `bash scripts/release.sh 0.2.77` (explicit version arg) per cc-prompt-queue.md §347 lesson from v0.2.75 drain.
5. Tag pushed, GH release published.

No forge-transpile redeploy needed.

## §4 — User-side smoke (CC writes post-implementation)

Pre-spec'd Step 1 per cc-prompt-queue.md §187: reproductions of the three originating issues.

```
# Step 1 — install v0.2.77:
VAULT=~/forge-vaults/bluh bash ~/projects/forge-client-obsidian/scripts/install-latest.sh

# Step 2 — #5 reproduction (positional foot-gun):
# Open a canonical input-taking snippet. E.g., create or edit
# forge-tutorial/03-functions/double.md to have inputs: [n] +
# # English: 'Give back n times 2.'
# Author a calling snippet with bare positional: [[double]](5).
# Forge-click. Expected: returns 10 (not NameError).
# If still NameError: fix didn't take. Capture console.

# Step 3 — #5 reproduction (clear error on too-many positional):
# Edit calling snippet to: [[double]](5, 99).
# Forge-click. Expected: clear error message citing inputs: [n] and the
# correct call form. NOT a raw NameError.

# Step 4 — #6 modal:
# Cmd-P → "Forge: New Snippet". Modal opens. Select "Canonical" radio.
# Enter snippet name. Click Create. Verify created snippet has:
# - frontmatter with facet_form: canonical
# - # English heading
# - NO # Python stub

# Step 5 — Forge-button gating:
# Open a plain note in the vault (e.g. forge-tutorial/01-hello/Hello.md
# which is a lesson note, no type: action). Verify the Forge run button
# does NOT appear in the editor toolbar.
# Then open an action snippet (e.g. forge-tutorial/01-hello/hello_world.md).
# Verify the Forge run button DOES appear.
# Verify New Snippet button still appears on both (unconditional).
```

Failure modes keyed by step.

Plus regression check: existing functionality (Tier 1 ship, slot resolution, chip palette on snippets) unchanged.

## §5 — Auto-smoke results expected

Per cc-prompt-queue.md §133-181:

- `npm run build` exit 0.
- `npm test` ~520/520 green.
- `pytest -q` on forge ~622/622 green.
- `scripts/release.sh 0.2.77` clean with all drift checks (engine + bundled vaults) passing.

## §6 — Feedback file shape

Per cc-prompt-queue.md §30-46 + §66-74:

- §0 — release coordinates.
- §1 — Investigation findings (brief; §1.1-§1.3 verification or "investigation folded into impl per §1.4 since territory was unambiguous").
- §2 — TDD continuity per sub-feature (#5 engine, #5 chip palette, #6 modal, Forge-button gating). 5 checkpoints each (failing test first → pre-fix output → fix diff → post-fix output → full suite).
- §3 — User-side smoke checklist per §4 of this prompt.
- §4 — Auto-smoke results.
- §5 — Follow-ups (anticipated: chip palette canonical-positional-form for legacy free-English snippets; any other ungated snippet-only buttons surfaced in §2.3).

## §7 — Self-contained context for CC

- forge-doc's #5/#6 originating message: `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-06-1803-tier1-corrections-canonical-inputs-footguns-and-slot-v1-case.md`.
- forge-doc's Forge-button feedback: `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-07-2015-tutorial-feedback-Do-keyword-and-forge-button-on-notes.md`. Includes concrete line citations (main.ts:826/843/847).
- Engine entry point: `~/projects/forge/forge/core/executor.py` `exec_python` (~line 581+), `_takes_only_context` (~line 614).
- Chip derivation: `~/projects/forge-client-obsidian/src/chips-core.ts` `deriveChip` (~line 288). May need to extend `SnippetMetaForChips` type.
- Modal: `~/projects/forge-client-obsidian/src/modal.ts` `actionTemplate` (~line 161).
- Constitution: `~/projects/forge/docs/specs/constitution.md`. B7.1 (canonical syntax) + B7.3 (slot resolution) + B8 (edit_mode + locked_english_hash drift). NO new constitution clause needed for this drain — all three sub-features are within existing contracts.
- Cowork-protocol: `~/projects/forge-moda-bootstrap/cowork-forge-protocol.md`. Always-on review HARD RULE §77 + Assert-cannot rule apply.
- Pure-core convention: cc-prompt-queue.md §86-118 (option A for §2.3 Forge-button gate extraction).

## §8 — Acceptance criteria

- #5 engine: positional call to canonical input-taking snippet binds correctly to declared inputs; too-many-positional raises clear error citing inputs and correct call form; keyword-only calls unchanged (regression); free-English snippets unchanged (regression).
- #5 chip palette: canonical input-takers emit keyword-form insertions (`Do [[id]](k=<k>).`); free-English snippets keep positional form (regression).
- #6 modal: "Canonical" option added to New Snippet modal; selecting it emits canonical template (`facet_form: canonical`, no `# Python` stub); free-English option unchanged (default + regression).
- Forge-button gating: Forge run button NOT shown on non-snippet notes; shown on action + data snippets; New Snippet button unconditional. Gate logic extracted to pure-core helper.
- All tests green.
- v0.2.77 released cleanly via release.sh.
- Smoke checklist §3 ready.

If any sub-feature surfaces unexpected scope expansion (e.g., #5 engine fix requires touching `_takes_only_context` more deeply than expected), STOP and route the affected sub-feature to questions/ separately. Other sub-features may still ship in v0.2.77 if independently mergeable.

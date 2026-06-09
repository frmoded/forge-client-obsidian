# Stage 2.5 — Engine-side sibling-snippet namespace injection for canonical compile path

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Re-read constitution `~/projects/forge/docs/specs/constitution.md` (especially A3 snippet resolution; B5-B7 engine behavior; B7.1 canonical call syntax). Re-read Stage-2 feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-05-1130-stage-1-and-tiny-stage-2-e-minus-minus-integration.md` for context on `resolve_action_code`.

## Scope

Per forge-doc's brief (message at `~/projects/forge-moda-bootstrap/messages/to-forge-core/done/2026-06-06-1456-canonical-sibling-snippet-composition-resolution.md`): E--'s emitter at `~/projects/forge/forge/e_minus_minus/emitter.py:107-110` emits **bare Python calls** for canonical E-- `[[name]](args)` syntax — produces `name(args)`, not `context.compute("name", args)`.

This works for Python builtins like `print` because they're in the exec namespace. It does NOT work for snippet-to-snippet calls (`[[greet]](name)` calling another authored snippet) — would raise `NameError: name 'greet' is not defined` at compute time. Stage-2's only canonical example (`canonical_demo.md`) calls `print` only, so this path is **unexercised** in current Forge.

Fix: in the engine's `resolve_action_code` (or wherever the E-- transpiled Python is exec'd), inject lambda shims for each declared snippet in the active vault. Each shim calls `context.compute(<snippet_id>, *args, **kwargs)` per constitution A3.

What this prompt does NOT do:
- Change E-- emitter behavior (E-- spec stays — bare Python emission is correct semantics for E-- as a standalone language; the snippet-vs-builtin distinction is a Forge-integration concern).
- Touch E-- source vendored at `forge/forge/e_minus_minus/` — the fix is at the Forge integration layer in `executor.py`.
- Change B7.1 canonical call syntax — `[[name]](args)` is still authored as canonical.
- Add a namespace-fallback `__getattr__` that catches undefined names (too magical; typos would silently become snippet refs).
- Ship a chapter-4 tutorial snippet (forge-doc's lane after this fix).

## Why

Per Mission V2a v9: composability is one of the four load-bearing snippet properties. Canonical-form snippets that call other canonical-form snippets is the core composability surface. Without this fix, the only composition possible in canonical form is built-ins → snippets (e.g., `print` from inside a snippet) — but snippet → snippet (which IS the whole point of building a snippet library) is broken.

Forge-doc's Tier 1 chapter 4 (composition) and chapter 8 (recursion) explicitly depend on this working. Earlier chapters don't exercise it (1: hello, 2: variables, 3: conditionals/loops), so the fix doesn't block chapters 1-3 — but must ship before chapter 4 lands. Per Mission's speed-second criterion: queue now, drain whenever; no hard timing dependency.

## Phase shape — investigation-before-design rider

**Phase 1 — investigation**:

1. Read `~/projects/forge/forge/core/executor.py` end to end. Find `resolve_action_code` (per Stage-2 feedback) or equivalent. Cite exact line numbers.
2. Identify where the exec'd namespace gets constructed. Confirm `context` is currently the only injected name beyond `__builtins__`.
3. Read `~/projects/forge/forge/core/snippet_registry.py` to confirm how to enumerate snippet IDs declared in the active vault (probably already cached on a context-related object). The shim list is built from this registry at exec time.
4. Cite `~/projects/forge/forge/e_minus_minus/emitter.py:107-110` — the bare-call emission. This is the upstream input shape; CC does not modify it (E-- spec stays).
5. Decide injection shape based on findings:
   - **Option A**: build a dict of shim lambdas per registry snippet at exec entry; merge into namespace; exec.
   - **Option B**: use a custom namespace dict subclass with explicit `__getitem__` semantics that resolves snippets via context.compute. (CC's call; A is simpler.)

My recommendation: A — explicit, debuggable, no `__getattr__` magic. CC verifies via Phase 1.

**Phase 2 — implementation + TDD**.

## Files likely to touch

Phase 1: read-only.

Phase 2:
- **`~/projects/forge/forge/core/executor.py`** — modify the canonical-form exec path. Construct the snippet-shim namespace; merge with `__builtins__` and `context`; exec the E--transpiled Python within it.
- **`~/projects/forge/tests/core/test_canonical_sibling_composition.py`** (NEW) — TDD cases.
- **`~/projects/forge-client-obsidian/scripts/sync-engine-bundle.mjs`** — should pick up `executor.py` changes automatically. Verify drift detection.
- **`~/projects/forge-moda/`** OR a test fixture vault — a SECOND `forge-moda/canonical_demo_compose.md` snippet that exercises snippet-to-snippet composition end-to-end:

  ```markdown
  ---
  type: action
  inputs: []
  facet_form: canonical
  description: Stage 2.5 demo — canonical snippet calling a canonical sibling snippet.
  ---

  # English

  Set name to [[random_name]](n=5).
  Do [[print]]("Hello " plus name).

  # Dependencies

  [[random_name]]
  [[print]]
  ```

  Plus a sibling `forge-moda/random_name.md` (or use the existing one from smoke-v0.2.13 if appropriate — CC's call to make a fixture or use an existing snippet).
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.
- **`~/projects/forge-moda/forge.toml`** — bump per the bundled-vault-content rule.

(No constitution touch — A3 already specifies correct semantics; this prompt implements them in the canonical-form path.)

## Tests — TDD discipline

`test_canonical_sibling_composition.py` (NEW):

1. **Canonical snippet calls another canonical snippet via bare ID**: snippet A authored as `Do [[B]]("hello").` resolves at compute time to `B("hello")` → resolves via context.compute → snippet B executes and returns. Output captured matches expected.

2. **Canonical snippet calls Python builtin**: regression test — `Do [[print]]("x").` still works (Stage-2 behavior preserved).

3. **NameError preserved for unknown name**: `Do [[no_such_snippet]]().` raises NameError (typo is still a typo; the shim list is explicit, not a catch-all).

4. **Snippet ID with subdirectory component**: `Do [[blues/song]]().` resolves correctly via the A4.1 V2a v8 sibling-subdir resolution path (probe 1 + probe 2 + A4 fall-through).

5. **Kwargs passed correctly**: `Do [[greet]](name="world").` resolves to `context.compute('greet', name='world')`.

6. **Bare basename refs in a vault using A4.1**: `Do [[solitary]]().` from `forge-music/percussion/murmuration` resolves via A4.1 probe 2 (sibling subdir) → `forge-music/percussion_lab/solitary` (cross-references the v0.2.57 A4.1 work).

7. **Recursion**: `Do [[fact]](n)` inside `fact` itself works (compute calls recurse via context.compute correctly).

8. **Snippet returning a value used as expression**: `Set x to [[random_name]](n=5). Do [[print]](x).` — first snippet's return value is captured into `x`; second snippet uses it. Validates the assignment-then-call composition.

9. **Idempotent rider**.

## Integration smoke (CC writes §3 per 6a/6b)

Build the composition demo snippet in forge-moda. Per the bundled-vault-content rule, bump forge-moda's forge.toml version. After install:

1. Open Obsidian in smoke vault.
2. Forge-click `forge-moda/canonical_demo_compose.md` (the new snippet).
3. Expected: output panel shows `Hello <5-random-letters>`. (If `random_name` doesn't exist in forge-moda, CC creates a forge-moda-internal `random_name.md` as part of this drain — or chooses a different composition demo using existing forge-moda snippets.)
4. Regression: existing `canonical_demo.md` (print only) still produces `Canonical form works.` correctly.

## Out of scope

- Authoring forge-doc's chapter 4 tutorial snippet.
- E-- emitter changes.
- Slot resolution (`{{ }}`) — separate deferred concern.
- Performance optimization of the shim namespace (premature; profile first).
- Cross-vault sibling composition (probably works via existing A4 vault dep resolution; CC verifies regression test).

## Don'ts

- Don't catch NameError generically. Shim list is explicit; unknown names should remain NameError so typos are caught.
- Don't change A3 or B7.1 semantics. Constitution says snippet calls go through context.compute; this implements that.
- Don't break Stage-2's `canonical_demo.md` (regression covered in test #2 and §3 smoke).
- Don't bump versions concretely — placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md with two-phase structure. §1.2 documents Phase 1 findings (executor.py + snippet_registry.py shapes). §1.4 shows the new test cases passing + the verbatim compute output for the composition demo snippet.

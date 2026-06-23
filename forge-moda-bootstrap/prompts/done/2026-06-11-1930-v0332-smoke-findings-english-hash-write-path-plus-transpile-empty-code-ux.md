---
timestamp: 2026-06-11T19:30:00Z
session_id: drain-2026-06-11-1930
status: pending
priority: HIGH — driver smoke v0.2.131 found two issues with cohort impact
---

# v0.2.132 — Smoke findings bundle: english_hash write-path audit + transpile-empty-code UX

## §0 — Bug reports (both from driver smoke 2026-06-11-1900)

Driver ran the combined v0.2.128/129/130/131 smoke against fresh install. Result: v0.2.131 passes end-to-end. v0.2.128 Python re-transpile works. But two issues surfaced:

### §0.1 — Issue 1: v0.2.128 self-heal contract violated on moda branch

Smoke Step 7 expected `english_hash` in `forge-moda/simulation.md` frontmatter after a Forge-click. Result: empty.

```
$ grep 'english_hash' ~/forge-vaults/bluh/forge-moda/simulation.md
$  # nothing
```

This contradicts the v0.2.128 feedback (§1.5) which claimed:
> Audited per prompt §1.3 / §2.2: `writeCanonicalPythonBack` calls `writePythonAndEnglishHash(content, {pythonCode, englishHash, stripStaleSlots: false})`. The english_hash IS written to frontmatter alongside `# Python`. Confirmed via `python-cache-writer-core.ts:71,78`.

The audit was either incomplete OR the moda branch uses a different code path. Driver smoke is authoritative; the audit was wrong on the runtime behavior.

**Impact**: defense-in-depth gap (not user-blocking today because moda branch passes `force=true` unconditionally, bypassing the cache hit path). But the v0.2.128 "self-heal so the force flag can retire in V2" contract is silently broken.

### §0.2 — Issue 2: transpilation failure emits empty Python that crashes at compile()

Smoke Step 9 deliberately mangled hello_world.md's English with `}}}}}` to trigger a failing path. Result:

```
Forge debug: run_snippet('forge-tutorial/01-hello/hello_world') body=142ch code=0ch preview='<empty>'
plugin:forge-client-obsidian:122974 Forge Pyodide compute failed: PythonError:
  File "/bundle/engine/forge/core/executor.py", line 696, in exec_python
    exec(compile(code, "<snippet>", "exec"), local_ns)
TypeError: compile() arg 1 must be a string, bytes or AST object
```

The engine returned empty code (`code=0ch`) for invalid English instead of raising a user-friendly transpilation error. The empty string then fails at `compile()` with a low-level TypeError that reveals nothing to the user about what's actually wrong.

**Impact**: cohort UX. Any user with English-mode authoring will hit this if they make a transpilation error. The error message is incomprehensible to a non-developer.

### §0.3 — Bonus finding: console.error audit gap at `main.ts:131883`

Driver also noted (Step 9): the `Forge Compute non-2xx: 500` console line is YELLOW (warn icon) followed by a red (error icon) stack from the deeper compute failure.

`main.ts:131883` `Forge Compute non-2xx` is a v0.2.130 audit miss site. Belongs in method-name prefix follow-up (carried to v0.2.133), but flag here for tracking.

## §1 — Goal

Two independent fixes:

1. **§2**: Moda write-path audit — find the actual write path used by `dispatchModaBranch`. Confirm whether it writes `english_hash` to frontmatter. If not, fix it. End state: after a moda Forge-click, the snippet's frontmatter has both updated `# Python` AND `english_hash`.

2. **§3**: Transpilation failure UX — engine should raise a clear `TranspileError` (or similar) when E-- transpilation produces empty/invalid output. Plugin catches it and surfaces a Notice + console.error explaining "Invalid English: <reason>". Empty Python should NEVER reach `compile()`.

Both fixes have v0.2.120 console.error HARD RULE compliance built in.

## §2 — Investigation phase for Issue 1 (per §78)

### §2.1 — Audit `dispatchModaBranch` write path

Source: `src/main.ts`. Find `dispatchModaBranch` (added in v0.2.126). Trace what it calls for the post-transpile write.

Hypotheses to confirm:
- **H1**: Moda branch never calls `writeCanonicalPythonBack`; it has its own write helper that omits the hash.
- **H2**: Moda branch DOES call `writeCanonicalPythonBack`, but a conditional inside skips the hash write for moda-tagged snippets.
- **H3**: Moda branch calls `writeCanonicalPythonBack`, which calls `writePythonAndEnglishHash`, but the latter's `englishHash` parameter is undefined/null on the moda code path.

Investigation:
```
grep -n "dispatchModaBranch\|writeCanonicalPythonBack\|writePythonAndEnglishHash" src/main.ts
```

Read each call site. Identify which write path is used + whether englishHash is computed + passed.

Cross-check `src/python-cache-writer-core.ts` — was `writePythonAndEnglishHash` called from the moda code path, or only english-mode?

### §2.2 — Compute englishHash on the moda code path

If H1 or H3 confirmed: the moda branch needs to compute `englishHash` via the existing `englishHash` core (likely `src/english-hash-core.ts` — confirm). The hash must be computed from the SAME normalized input that the engine uses, per `forge/core/slot_cache.py:compute_english_hash` (whitespace-trim, strip leading/trailing blank lines, SHA-256 hex).

The TypeScript helper at `src/english-hash-core.ts` is documented in `slot_cache.py:76` as "mirrors this implementation byte-for-byte". Use it; do NOT roll a parallel hash.

### §2.3 — Add english_hash to the moda write call

Either:
- Switch moda branch to call `writeCanonicalPythonBack` (if H1)
- Remove the moda-skip conditional (if H2)
- Pass a computed englishHash to the existing call (if H3)

Whichever applies, end state must be: `writePythonAndEnglishHash(content, {pythonCode, englishHash, stripStaleSlots: false})` actually fires on the moda code path with a non-null englishHash.

### §2.4 — Validation

Failing-first test in `src/forge-snippet-routing-core.test.ts` (or appropriate harness) asserting that a moda-routing-decision dispatch ends with `english_hash` in the resulting frontmatter. Hash value can be checked against a known-good fixture using `computeEnglishHash` from `english-hash-core.ts`.

Smoke step: re-run driver's Step 7 grep after fix. Expected: `english_hash: <64-char hex>` line present.

## §3 — Investigation phase for Issue 2 (per §78)

### §3.1 — Identify where the engine returns empty code

`forge/core/executor.py:resolve_action_code` is the engine entry point used by the plugin. When transpilation fails, what does it return? Read the function carefully:

```
grep -n "resolve_action_code\|transpile" forge/core/executor.py | head -20
```

Find the path where invalid English produces empty output. Is it:
- E-- transpiler returning empty string?
- An exception being caught and silenced into empty?
- The function returning `code` which happens to be empty because of an upstream cache state?

### §3.2 — Decide error contract

Two surface options:

**A. Engine raises**: `resolve_action_code` raises a typed `TranspileError(msg, snippet_id, english_excerpt)` whenever transpilation produces invalid/empty output. Plugin catches in `dispatchEnglishBranch` / `dispatchModaBranch` and surfaces a Notice. This matches the existing pattern for `SlotCacheMissError`.

**B. Engine returns sentinel**: returns `None` or a `(success: false, error: msg)` tuple. Plugin checks and surfaces.

Option A matches existing engine idiom (raise typed errors); option B requires touching every caller. **My pick: A**.

### §3.3 — TranspileError surface

Define in `forge/core/errors.py` (or wherever `SlotCacheMissError` lives — confirm):

```python
class TranspileError(Exception):
    def __init__(self, message: str, snippet_id: str, english_excerpt: str = ""):
        self.snippet_id = snippet_id
        self.english_excerpt = english_excerpt
        super().__init__(f"Transpilation failed for {snippet_id}: {message}")
```

Raise it from `resolve_action_code` whenever the result of transpile() is empty/whitespace OR transpile() raised.

### §3.4 — Plugin side

In `dispatchEnglishBranch` and `dispatchModaBranch`, catch the python-side `TranspileError` (surfaces as PythonError with that class name). Surface:

```typescript
new Notice(`Forge: invalid English in ${snippetId}. ${msg}`, 10000);
console.error(`forgeSnippet (${branch}): TranspileError`, e);
```

The Notice text MUST mention the snippet ID + a short hint about what went wrong. No more "compile() arg 1 must be string" leaking to users.

### §3.5 — Validation

- Engine pytest: feed invalid E--, assert `TranspileError` raised with snippet_id populated.
- Plugin integration test (if harness permits): invalid English → Forge-click → Notice fires with correct text; `compile()` never reached.
- Smoke: driver re-runs Step 9 with mangled hello_world.md. Expected: red Notice with "invalid English" prefix; NO `TypeError: compile() arg 1` in console.

## §4 — Tests required

- §2: 1 plugin pure-core test for moda routing → english_hash assertion.
- §3: 2 engine tests (TranspileError raised on empty transpile output + on transpile() raise) + 1 plugin integration test (if feasible) for the Notice path.

Plugin suite: 697 → ~698-699. Engine suite: +2-3 tests.

## §5 — User-side smoke

After ship:
```
# Re-run Step 7 of the 2026-06-11-1900 smoke:
# 1. Edit forge-moda/simulation.md English to add a unique line.
# 2. Forge-click 🔥.
# 3. grep 'english_hash' ~/forge-vaults/bluh/forge-moda/simulation.md
# Expected: english_hash: <64-char hex>

# Re-run Step 9 of the same smoke:
# 1. Mangle hello_world.md English with }}}}}
# 2. Forge-click 🔥
# 3. Expected: Notice with "Forge: invalid English in forge-tutorial/01-hello/hello_world"
# 4. Console: red error line; NO "TypeError: compile() arg 1" stack.
```

## §6 — Open follow-ups

1. `main.ts:131883` `Forge Compute non-2xx` site missed by v0.2.130 sed (yellow icon confirmed by driver). Belongs in v0.2.133 method-name-prefix sweep — flag for inclusion there.
2. Forge-moda content one-shot backfill: after this fix, the FIRST moda Forge-click on each canonical snippet self-heals the english_hash. Could also do a bulk migration script that walks `~/forge-vaults/<vault>/forge-moda/*.md` and computes the hash for any snippet missing it. Out of scope for v0.2.132; flag.
3. v0.2.128 feedback retroactive correction: §1.5 claim "Confirmed via `python-cache-writer-core.ts:71,78`" was wrong for moda branch. Forge-core should note this in cc-prompt-queue.md as a "runtime smoke beats source audit" reminder.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): both §2 and §3 enumerate hypotheses + grep targets before coding.
- ✓ §57–74 (TDD): failing-first tests called out in §2.4 + §3.5.
- ✓ §86–118 (pure-core convention): both fixes go through existing pure-cores (`english-hash-core.ts`, `python-cache-writer-core.ts`, engine's `resolve_action_code`). No new architectural patterns.
- ✓ §76 (don't ship speculative fix): driver smoke is the ground truth; this fixes the EXACT issues seen.
- ✓ §347 (version-bump sanity check): release.sh bumps 0.2.131 → 0.2.132.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: both fixes surface errors via console.error with method-name prefix.
- ✓ v0.2.124 pure-core dispatch HARD RULE: §2 lands at the existing routing/writing pure-cores; §3 lands at the engine pure-core. No new ad-hoc decisions in I/O glue.
- ✓ v0.2.125 metadataCache fallback HARD RULE: not relevant here (read path); flag if §2 investigation surfaces a metadataCache-driven branch.

## §8 — Architectural framing

V1 cohort regression closures, both. The english_hash gap is a defense-in-depth fix (V2 force-flag retirement path). The transpilation UX is a direct cohort-facing improvement.

No V2 commitments. The TranspileError surface is consistent with existing `SlotCacheMissError` idiom — it's just one more typed engine error joining the family.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Two fixes, both targeted. Suggested order:
1. §2 first (~30-45 min) — moda write-path audit + fix + test
2. §3 second (~45-60 min) — TranspileError surface + plugin catch + tests
3. Ship v0.2.132

Both §2 and §3 are independent; if §3 turns into a yak-shave (e.g., the engine's transpile output handling has architectural subtleties), surface and split. The moda english_hash fix is the higher-priority of the two — closes the contract gap. The transpilation UX is improvement, not regression.

Estimated CC time: 1.5-2 hours combined; split possible if needed.

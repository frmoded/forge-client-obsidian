---
timestamp: 2026-06-11T13:00:00Z
session_id: drain-2026-06-11-1300
status: pending
priority: MEDIUM-HIGH — institutional discipline; closes the try/catch swallow class
---

# v0.2.130 — Bundle B: console.error HARD RULE systematic audit across plugin

## §0 — Context

v0.2.120 codified the console.error HARD RULE in cc-prompt-queue.md:

> Any `catch` block that handles an unexpected runtime exception MUST use `console.error` and include the originating method name in the message. `console.warn` and `console.log` are reserved for non-error signals and are NOT acceptable as the surface for caught errors.

Three documented silent-skip incidents in the closed-beta arc (v0.2.84 facet-mutex dispatch swallow, v0.2.13 generate-write-failure swallow, v0.2.91 forge-moda re-extract failure swallow) all traced to `console.warn` in a catch block hiding a real error from the next reader of the console. v0.2.94, v0.2.100, v0.2.105 diagnostic builds existed solely because the original error had been buried.

Driver authorized at v0.2.90 review: "try/catch swallow audit across plugin." This drain executes it as a systematic pass.

Part 2 of the larger backlog cleanup. Bundle A (hygiene) and Bundle C (risk-surface audits) ship as separate prompts.

## §1 — Goals

### §1.1 — Comprehensive audit of try/catch blocks in plugin source

Walk every `catch` block in `forge-client-obsidian/src/*.ts`. Classify each:
1. **Already compliant**: uses `console.error` with method name → no change
2. **Console.warn violation**: caught runtime error logged as `console.warn` → CHANGE to `console.error`
3. **Console.log violation**: caught runtime error logged as `console.log` → CHANGE to `console.error`
4. **Silent swallow**: catch block with no logging at all → ADD `console.error` with method name
5. **Intentional non-error signal**: catch is for control flow, not error handling (rare) → document inline + leave

### §1.2 — Update each violation per the HARD RULE

For each item classified 2/3/4 above:

```typescript
// before:
catch (e) { console.warn('something failed', e); }

// after:
catch (e) {
  console.error('<methodName>: <what failed>', e);
}
```

Include the **originating method name** in the message — this is the load-bearing part of the HARD RULE. When the next CC drain (or driver) reads the console, they should see WHICH function caught the error without scrolling.

### §1.3 — Document the audit in commit + feedback

Feedback §2 includes a table:
- File / line / method / before / after / change kind

So future drains can verify the audit was systematic.

## §2 — Investigation phase (per §78)

### §2.1 — Comprehensive grep for all catch blocks

```bash
grep -rn "catch.*{\|console\.warn\|console\.log.*err\|console\.log.*fail\|console\.log.*error" \
  forge-client-obsidian/src/*.ts | head -100
```

Plus search for catch blocks more carefully via context:
```bash
grep -B1 -A3 "} catch" forge-client-obsidian/src/main.ts | head -100
```

Compile a comprehensive list of every catch block + its current logging behavior.

### §2.2 — Known violations from carry-forward backlog

Carry-forward items already flagged that fold into this drain:
- `main.ts:1842` — english-mode writeCanonicalPythonBack catch logs console.warn (v0.2.126 §4 #2). **Note**: if Bundle A v0.2.129 ships before this drain, this item is already done; skip if so.
- Other potentially-known sites: `welcome.ts` extraction failures, `chips.ts` parse errors, the various `main.ts` catch blocks (per v0.2.90 review).

### §2.3 — False-positive check

Some `console.warn` calls are LEGITIMATE non-error signals (e.g., "stale .bak directory detected"). Don't change these. The audit distinguishes:
- **Caught exception** in a `catch (e) { ... }` block → HARD RULE applies, must be `console.error`
- **Standalone warning** about a non-error state → keep as `console.warn`

Example legitimate use:
```typescript
if (path.includes('.bak.')) {
  console.warn(`Forge: skipping .bak directory ${path}`);
  return;
}
```
This is NOT a caught error. It stays.

### §2.4 — Method-name extraction

For each violation, identify the containing method (function or method name in TS). The HARD RULE specifies "include the originating method name in the message" — must be precise.

If a catch is inside an anonymous lambda, name the OUTER method (the one a debugger would attribute the error to).

## §3 — Implementation phases

### §3.1 — Phase 1: enumerate

Per §2.1, produce a complete list of catch blocks + their current logging. Save as a markdown comment block in the feedback OR as a working document in `prompts/drafts/v0330-catch-audit.md` (not shipped; just CC's working notes).

### §3.2 — Phase 2: categorize

Mark each as compliant / violation / silent / non-error per §1.1.

### §3.3 — Phase 3: fix each violation

Apply the change. For each violation: edit the file, update message to include method name, change to console.error.

### §3.4 — Phase 4: build + tests

`npm run build` exit 0. Existing tests pass (no test changes needed — these are log-level changes, not behavior changes).

If any test EXPECTS `console.warn` output (mocking, etc.), update the test accordingly.

## §4 — Tests required

- Likely zero new tests (the HARD RULE is about logging discipline, not behavior).
- If any existing test mocks `console.warn` for a caught error path → update to mock `console.error` instead.

Plugin suite: maintained at current count.

## §5 — User-side smoke

```
# Step 1 — install v0.2.130.
grep version ~/forge-vaults/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.130

# Step 2 — sanity: every existing Forge flow still works (low-level behavior unchanged).
# Step 3 — DevTools console sanity:
#   Trigger any flow you remember. Verify console output is logged correctly.
#   Caught errors should appear as red error lines (console.error styling).
#   Genuine non-error signals (e.g., .bak skips) stay yellow (console.warn).

# Step 4 — verify the audit shipped by grepping the codebase locally if you have it:
cd ~/projects/forge-client-obsidian
grep -c "console.warn" src/*.ts | sort -t: -k2 -n | tail -10
# Expected: count drops or stays low; warns that remain are legitimate non-error.
grep -c "console.error" src/*.ts | sort -t: -k2 -n | tail -10
# Expected: counts increase reflecting the audit changes.
```

## §6 — Open follow-ups

Closes the "try/catch swallow audit across plugin" carry-forward item from v0.2.90 review.

Future incident class: any new catch block added going forward should be reviewed via the HARD RULE BEFORE shipping (the rule is already codified; this drain just retroactively applies it).

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 mandates comprehensive enumeration + categorization before fixing.
- ✓ §76 (don't ship speculative fix): each change applies the HARD RULE precisely.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.129; release.sh bumps to 0.2.130.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.120 (console.error HARD RULE): this drain is the AUDIT that applies the rule systematically.

## §8 — Architectural framing

V1 institutional discipline catch-up. The HARD RULE was codified at v0.2.120; this drain ensures the entire codebase reflects the rule.

Going forward: any new catch block falls under the HARD RULE at code-review time. This drain is one-time backfill; future enforcement is per-PR.

No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single drain. Systematic pass through plugin source. Estimated CC time: 2-3 hours.

If the audit reveals an unexpectedly large number of violations (>30), surface and consider splitting into two drains by file category (main.ts in v0.2.130, others in v0.2.131).

If §2.3 reveals ambiguous cases (a `console.warn` that's borderline error/non-error), document the call and consult driver in the feedback.

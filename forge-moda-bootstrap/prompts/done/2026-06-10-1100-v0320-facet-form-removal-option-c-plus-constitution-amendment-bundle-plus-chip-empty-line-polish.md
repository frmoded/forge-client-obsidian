---
timestamp: 2026-06-10T11:00:00Z
session_id: drain-2026-06-10-1100
status: pending
priority: MEDIUM — polish + protocol codification post-v0.2.119 Tamar overwhelm completion
---

# v0.2.120 — facet_form removal (Option C) + constitution amendment bundle + chip empty-line polish

## §0 — Context

The Tamar overwhelm signal that triggered v0.2.99 is fully addressed at v0.2.119 (frontmatter hide via CSS class gating + Cmd-P escape hatch). Cohort is unblocked. This drain ships three independent items that bring the codebase + protocol up to date:

- **Item A** — facet_form removal (Option C per CC's v0.2.99 §2 recommendation). Plugin-side `resolveActionCode` routing replaces the engine's facet_form-gated transpile decision. Engine stops reading/writing facet_form; v0.2.81 strip-trap warning surface retires; new-snippet template stops emitting the field.
- **Item B** — Constitution + protocol amendment bundle. 12 amendments accumulated across the session. Most are protocol-level (cc-prompt-queue.md / cowork-forge-protocol.md); two are engine constitution (B7.3 update + new B-class inlined-asset version stamping).
- **Item C** — Chip insertion empty-line polish. Driver smoke against v0.2.113 passed with polish ask: if cursor is on an empty line in `# English`, insert chip at cursor line (replace empty) instead of cursor+1 (preserving the empty line).

User authorized 2026-06-10 (a/C/done/pass-with-polish).

## §1 — Goals

### Item A — facet_form removal (Option C)

Per CC's v0.2.99 §2 investigation: facet_form does TWO things in the engine:
1. Cache validity (always re-transpile if canonical)
2. **Transpile routing**: `facet_form: canonical` → E-- transpile (no LLM); else → `/generate` (LLM, needs token)

Removing facet_form without compensation breaks the no-token cohort onboarding path (`hello_world.md` ships with `facet_form: canonical` so it works without a backend token).

**Option C: plugin-side routing.** The plugin uses the post-v0.2.101 `resolveActionCode` (E-- transpile without exec) for English → Python regen, falling back to `/generate` when E-- fails. Engine no longer needs facet_form for routing; cache validity becomes `english_hash` matching alone.

Concretely:

Engine side (in `~/projects/forge/`):
- Remove the `facet_form` write in cache-write paths (executor.py)
- Update cache-validity check to use `english_hash` match only
- Remove `detect_facet_form_strip_trap` helper (v0.2.81)
- Delete `forge/tests/core/test_facet_form_strip_trap.py`
- Audit engine for other facet_form references; clean

Plugin side:
- Implement plugin-side E-- transpile via `resolveActionCode` for English → Python regen
- Fallback to `/generate` if E-- fails to compile (free-text English path)
- Remove `_forge_facet_form_warning_set` dedup set + console.warn
- New-snippet template: stop emitting `facet_form: canonical`
- Audit `src/**/*.ts` for facet_form references; clean

Existing snippets with `facet_form: canonical` on disk: leave the field; it becomes inert.

### Item B — Constitution + protocol amendment bundle

Two files to amend; 12 items total:

**`~/projects/forge/docs/specs/constitution.md` (engine constitution):**
1. **B7.3 update**: symmetric mutex semantics (expand-of-inactive + collapse-of-active triggers; "exactly one facet visible at any time" invariant) + cache invalidation rule (switch-to-english invalidates `english_hash`).
2. **NEW B-class invariant**: Inlined-asset version stamping. Any asset bundled at build time into the plugin's main.js for BRAT restore MUST be version-stamped via a `.bundle-version` sentinel; restore MUST force-overwrite on mismatch. (Per v0.2.98 root-cause discovery + amendment proposal.)

**`~/projects/forge-moda-bootstrap/cc-prompt-queue.md` (CC prompt discipline rules):**
3. **HARD RULE**: log caught runtime errors as `console.error` (not `console.warn`, not silent) with originating method name in the message. (Per v0.2.90 §7.1 — three documented silent-skip incidents v0.2.84/v0.2.13/v0.2.91 all caused by `console.warn`/`console.log` swallowing.)
4. **Process discipline**: Python bridge return-shape changes MUST grep `*_run_snippet(` call sites across plugin AND engine. (Per v0.2.95 — v0.2.77 3-tuple change missed 3 sites for 21 releases.)
5. **Convention**: Snippet-id resolution MUST use path lookup (`<id>.md` from vault root), not basename. Basename fallback allowed only for root-level snippets where id is provably unqualified. (Per v0.2.104 — basename match was latent bug for 70+ releases.)
6. **Convention**: Path-prefix gates need positive frontmatter signal (e.g., `featured: true`, `type: simulator`), not pure path-prefix alone, for BEHAVIORAL routing. UI-only filtering (chip palette context defaults) is exempt; document the choice inline. (Per v0.2.106 + v0.2.112.)
7. **HARD RULE**: Library re-extract MUST NOT accumulate backup directories. Either delete-on-extract (v0.2.106 choice) OR cap backups at one. Unbounded accumulation breaks featured discovery and pollutes vault root. (Per v0.2.106.)
8. **HARD RULE**: CM6 extension changes MUST include at least one integration test against `createIntegrationHarness()` (v0.2.112). Pure-core tests are insufficient for CM6/Obsidian runtime behavior. (Per v0.2.85-89, v0.2.108-110, v0.2.110-111 — three documented runtime-only surprise classes.)
9. **HARD RULE**: Reading `workspace.getActiveViewOfType` from a StateField is unsafe (initial-mount race; workspace pointer doesn't settle until after EditorView mount). Read file identity from the editor's own state instead. (Per v0.2.110-111.)
10. **PROCESS**: Community-plugin prior art search BEFORE harness investment. When 3+ releases deep into a third-party (Obsidian/CM6) integration problem, search public community plugins for prior art before committing to multi-day harness work. The answer may already be public. (Per v0.2.116 — the gist that cracked Tamar overwhelm was found in the FIRST investigation step of the harness drain, averting 2+ days of harness extension work. Cite @Boettner-eric's gist.)
11. **PATTERN**: CSS class gating beats decoration competition when third-party owns the renderer. When a host application (Obsidian) owns the rendering layer with its own decoration providers, plugin code should NOT compete via decoration precedence (`Prec.highest`, etc.). Toggle a class on a parent DOM element + CSS rules targeting host-rendered DOM. v0.2.116-118 is the reference implementation. (Per v0.2.108-115 dead-end + v0.2.116 cracking.)
12. **PATTERN**: Default-hide + Cmd-P escape hatch + per-file scoping is the cohort UX pattern for content visibility. When hiding content some users may want to see, ship the default-hide AND a discoverable escape hatch (command palette toggle) AND per-file scoping (don't persist toggle state across files). (Per v0.2.119 reference implementation.)

CC writes the amendments into both files in idiomatic prose matching each file's existing voice. Preserve existing structure; insert new entries at appropriate locations (alphabetical, sectional, or end of file as fits each file's convention).

### Item C — Chip insertion empty-line polish

Current behavior (v0.2.113): cursor inside `# English` body → insert chip at `cursorLine + 1` with leading newline.

Desired behavior: if cursor line is EMPTY (whitespace-only including `\n`), insert chip AT the cursor's current line (replacing the empty line content). Otherwise keep v0.2.113 cursor+1 behavior.

UX rationale: when the user positions themselves on an empty line to receive a chip, they expect the chip to land THERE, not on a NEW line below — double-spacing.

Concrete logic:

```typescript
// In insertChipTextAtLine:
const lines = noteBody.split('\n');
const cursorLineContent = lines[cursorLine] ?? '';
const cursorLineIsEmpty = cursorLineContent.trim() === '';

if (cursorLineIsEmpty) {
  // Replace empty line content with chip
  lines[cursorLine] = chipInsertion;
  return { newBody: lines.join('\n'), ... };
} else {
  // v0.2.113 behavior: insert below cursor
  // (existing code)
}
```

## §2 — Investigation phase (MANDATORY per §78)

### §2.1 — Item A: facet_form references audit

```bash
grep -rn "facet_form" forge/ forge-client-obsidian/src/ forge-tutorial/ forge-moda/ forge-music/
```

Document every hit:
- Engine: executor.py (write site), test_facet_form_strip_trap.py (8 tests)
- Plugin: pyodide-host.ts (dedup set + warning), new-snippet template
- Vault content: forge-tutorial snippets may have `facet_form: canonical`; leave as inert

Verify plugin-side `resolveActionCode` exists post-v0.2.101 and handles E-- transpile + LLM fallback correctly. If implementation is incomplete, surface scope.

### §2.2 — Item A: cache-validity rewrite

Engine's current cache-validity logic (per CC v0.2.99 §2): `if facet_form == 'canonical' and english_hash matches: cache valid`. New logic: `if english_hash matches: cache valid`. Verify no edge cases where stripping the facet_form gate breaks behavior.

### §2.3 — Item B: file structure audit

Read existing structure of `~/projects/forge/docs/specs/constitution.md` and `~/projects/forge-moda-bootstrap/cc-prompt-queue.md`. Identify:
- Current section headers (B-class, HARD RULES, PROCESS, etc.)
- Insertion points for each amendment
- Existing voice/format to match

Constitution amendments land in the engine doc; protocol amendments land in cc-prompt-queue.md. The `cowork-forge-protocol.md` was already updated by forge-core in chat earlier; CC does NOT touch it.

### §2.4 — Item C: existing test coverage

Read `src/find-english-facet-bounds.ts` and `src/chips-core.ts` (or wherever `insertChipTextAtLine` lives). Identify the 6 existing tests; add a 7th for the empty-line case:

```typescript
test('cursor on empty line in English body → replaces empty line', () => {
  const body = '---\ntype: action\n---\n\n# English\n\nFoo\n\nBar\n\n# Python\n';
  // Cursor on the empty line between Foo and Bar (line 6, 0-indexed)
  const result = insertChipTextAtLine(body, "NEW", 6);
  expect(result.newBody).toContain('Foo\n\nNEW\nBar');  // empty replaced
});
```

## §3 — Implementation phases

### §3.1 — Phase 1: Item A — facet_form removal

Engine side:
- Modify executor.py cache-write path: drop `facet_form: canonical` write
- Update cache-validity check to use english_hash match alone
- Delete `detect_facet_form_strip_trap` function
- Delete `test_facet_form_strip_trap.py` test file
- Update any engine tests that reference facet_form

Plugin side:
- Implement plugin-side English-to-Python regen via `resolveActionCode` (E-- transpile)
- Fallback to /generate when E-- compile fails
- Remove `_forge_facet_form_warning_set` + console.warn
- New-snippet template: remove `facet_form: canonical` from generated frontmatter
- Audit src/**/*.ts; clean references

### §3.2 — Phase 2: Item B — constitution + protocol amendments

Read both files. Insert the 12 amendments at appropriate locations, matching existing voice:
- `constitution.md`: items 1-2 (B7.3 update + B-class invariant)
- `cc-prompt-queue.md`: items 3-12

Each amendment includes a citation to the originating release(s) for traceability.

### §3.3 — Phase 3: Item C — chip empty-line polish

`src/chips-core.ts` (or wherever `insertChipTextAtLine` lives):
- Add empty-line check before the existing `cursorLine + 1` insertion
- If empty: replace the line at `cursorLine` with chip content
- Otherwise: existing v0.2.113 behavior unchanged

Add 1-2 new tests covering:
- Cursor on empty line → replace line
- Cursor on line with content → existing v0.2.113 behavior (regression guard)

### §3.4 — Phase 4: cross-cutting integration

- Run full plugin + engine test suites: should remain green (with Item A test deletions accounted for)
- Build clean
- Asset version stamping auto-handles iframe + inlined asset refresh

## §4 — Tests required

### Item A — facet_form removal
- Delete `test_facet_form_strip_trap.py` (8 tests)
- Add ~2-3 new engine tests covering cache-validity-without-facet_form
- Add ~2-3 plugin tests covering resolveActionCode E-- fallback to /generate
- Net change: ~ -5 tests (delete 8, add 3)

### Item B — constitution amendments
- No tests (documentation change)

### Item C — chip empty-line polish
- ~2 new tests in `insertChipTextAtLine` test file

Total: ~ -3 net tests across the drain (delete 8 strip-trap, add 5 elsewhere).

## §5 — User-side smoke

```
# Step 1 — install v0.2.120.
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json

# === Item A: facet_form removal ===
# Step 2 — open hello_world.md. Forge-click. Verify computes (cohort no-token path).
# Step 3 — manually strip facet_form: canonical from frontmatter.
# Open DevTools console. Forge-click again.
# Expected: still computes correctly. NO "facet_form is absent" console warning
# (the v0.2.81 strip-trap warning is retired).
# Step 4 — Cmd-P → "Forge: New Snippet". Create a new snippet.
# Open the created file. Expected: NO facet_form: canonical in frontmatter.

# === Item B: constitution amendments ===
# Step 5 — verify constitution.md has B7.3 update + B-class inlined-asset stamping:
grep -c "exactly one facet visible\|inlined-asset version stamping" \
  ~/projects/forge/docs/specs/constitution.md
# Expected: 2 (one match each)

# Step 6 — verify cc-prompt-queue.md has the 10 protocol amendments:
grep -c "console.error\|*_run_snippet\|CSS class gating\|prior art search" \
  ~/projects/forge-moda-bootstrap/cc-prompt-queue.md
# Expected: 4+ matches

# === Item C: chip empty-line polish ===
# Step 7 — open a snippet. Place cursor on a non-empty line in # English.
# Open chip palette; click a chip.
# Expected: chip lands on line BELOW cursor (v0.2.113 behavior unchanged).
# Step 8 — Cmd-Z undo. Place cursor on an EMPTY line in # English.
# Open chip palette; click a chip.
# Expected: chip lands AT the empty line (NO new line added; empty line replaced).
```

## §6 — Open follow-ups

1. **v0.2.99 follow-up #14**: migrate existing snippets with `facet_form` field on disk. With facet_form now inert engine-side, vault content can shed the field on next forge-tutorial / forge-moda / forge-music bump. Optional cleanup.
2. **forge-doc chapter 9 facet_form discipline note**: obsolete now that facet_form is gone. forge-doc should remove the chapter callout on next 0.1.x bump. Send relay message.
3. **v0.2.117 follow-up**: wire `forge-snippet-preview` class onto `markdown-preview-view` via workspace.on('file-open') for Reading mode coverage. Selector exists; hook deferred.
4. **v0.2.119 follow-up**: persistent per-snippet expanded state. Currently re-opening re-hides. May want frontmatter expanded state in `.obsidian/workspace.json` if cohort feedback wants it.
5. **Harness extension build**: deferred from urgent. Trigger: next CM6/Obsidian integration surprise that prior-art search doesn't crack.

## §7 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2 audits facet_form references, file structures, existing test coverage.
- ✓ §57–74 (TDD): Item A tests rewritten around new cache logic; Item C adds failing-first empty-line test.
- ✓ §86–118 (pure-core convention): cache-validity logic stays pure-core; resolveActionCode is integration layer; chip empty-line check is pure-core.
- ✓ §76 (don't ship speculative fix): all three items have concrete justification.
- ✓ §347 (version-bump sanity check): manifest pre-bump at 0.2.119; explicit version arg.
- ✓ §321 (feedback file before move): standard.
- ✓ NEW v0.2.112 rule (CM6 integration tests): N/A — none of the three items touch CM6.
- ✓ NEW v0.2.116 pattern (CSS class gating): Item C touches insertion logic, not rendering; CSS class gating not applicable here.

## §8 — Architectural framing

V1 polish + protocol codification. Item A completes the v0.2.99 cleanup arc (frontmatter field reduction). Item B captures session lessons. Item C is small cohort-UX polish.

No V2 architectural commitments. The constitution amendments DOCUMENT V1 lessons; V2 work proceeds independently.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Three independent items; can ship in any order. Suggested:
1. Item C (smallest scope, ~30 min)
2. Item A (medium scope, ~2-3 hours)
3. Item B (documentation; ~1 hour)

All three ship together as v0.2.120. If Item A's §2.1 investigation reveals plugin-side `resolveActionCode` is incomplete (e.g., E-- → /generate fallback wasn't built), surface scope and defer Item A to v0.2.121.

If Item B's §2.3 audit reveals file structure incompatibilities (e.g., cc-prompt-queue.md has been heavily restructured), surface and discuss before mass-amendment.

---
timestamp: 2026-06-02T05:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T00:25:00Z
status: success
---

# Music vault content polish (3-phase)

Phased commits worked cleanly. Phases A → B → C all landed independently with their own commits before the next began; Release at the end packages everything as plugin v0.2.28.

## §Phase A — Reference audit

### Bare-reference inventory

| File | Bare names | Resolves to (v0.2.26 caller-scoped) | Action |
| --- | --- | --- | --- |
| `blues/chorus.md` | form, vocal_phrase_a, vocal_phrase_b | all → blues siblings | none |
| `blues/form.md` | twelve_bar_blues_progression | → blues sibling | none |
| `blues/guitar_solo_chorus.md` | form | → blues/form | none |
| `blues/solo_chorus.md` | form, guitar_solo_chorus | both → blues siblings | none |
| `blues/song.md` | chorus, solo_chorus | both → blues siblings | none |
| `blues/twelve_bar_blues_progression.md` | (none) | n/a | none |
| `blues/vocal_phrase_a.md` | form | → blues/form | none |
| `blues/vocal_phrase_b.md` | form, vocal_phrase_a | both → blues siblings | none |

All sibling-only or sibling-after-collision (`form`, `twelve_bar_blues_progression`). v0.2.26 caller-scoped resolution does the right thing for every reference; the new Phase B prompt fragment rule confirms this is the preferred form for content authors.

### External-caller audit for top-level scaffolds

`grep -rn 'forge-music/form\|"form"' / 'forge-music/twelve_bar_blues_progression\|"twelve_bar_blues_progression"'` across `~/projects/` (excluding `node_modules`, `.venv`, `.git`, `dist`, `_assets`, `__pycache__`, `.claude`) returned only:

- `forge-moda-bootstrap/spikes/pyodide-music/native-baseline.py` — calls `res.resolve("form")` against its own `bundle/vault/` (separate from `~/projects/forge-music/`). Spike script, not production. Unaffected by either keep-or-delete choice.
- `forge/docs/data_snippets.md:84` — `context.compute("twelve_bar_blues_progression")` in a docs example. Documentation only.
- Test files in `tests/test_caller_scoped_bare_resolution.py` etc. — use synthetic `_seed_library` calls, NOT the real bundled vault. Unaffected.
- Historical references in `prompts/feedback/` and `prompts/done/` — documentation only.

No production code resolves qualified `forge-music/form` or `forge-music/twelve_bar_blues_progression` IDs. The top-level scaffolds are inert.

### Decision tree branch taken

**Branch: Keep scaffolds, document decision.** User chose this path when the auto-mode classifier flagged the irreversible file deletion. Per cc-prompt-queue.md §3 ("don't pause unless genuinely blocking"), the classifier denial was genuinely blocking — I used AskUserQuestion with a recommended-first option to confirm; user picked the conservative path.

The scaffolds stay in place. Phase A produced no code changes, no version bump, no tests. The audit findings are documented here as a permanent record that the scaffolds are inert; if they later need deletion, this drain has already done the analysis work.

### Files modified

None.

### Commit SHA

None for Phase A.

## §Phase B — `MUSIC_PROMPT_FRAGMENT` review

### Per-rule classification

Out of the ~25 rules + sub-rules in the fragment:

- **PRUNED**: the implementation-detail paragraph explaining how `lib.sequence` auto-pads silent voice slots with rest measures (was lines 68-76 of `forge/music/llm_prompt.py`). The CRITICAL "do not manually replicate voices()/sequence()" sub-rule below it was kept verbatim — still relevant to prevent LLMs from iterating `getElementsByClass(stream.Part)` and appending manually.
- **TIGHTENED**: the bend/glissando rule. Dropped the "Verovio renders them poorly" justification (renderer-specific speculation, not validated in v0.2.27's Pyodide path); replaced with the generic "hard to engrave reliably across renderers." Composition guidance unchanged.
- **ADDED**: a new rule explaining v0.2.26 caller-scoped bare resolution. Tells the LLM that bare `[[chorus]]` from inside `blues/song.md` is sufficient (resolves to `blues/chorus`) and is the preferred form; qualified references like `[[forge-music/some_snippet]]` still work as absolute paths for genuine cross-directory needs.
- **KEPT**: everything else, including:
  - bar arithmetic / `bar_ql` invariant (lines 192-195 of original)
  - copy.deepcopy for cross-stream element copying
  - context.compute kwargs rule
  - flatten() removes containers
  - thinking-out-loud comments forbidden
  - frame snippets attach all three (key/ts/mm) to first Measure
  - chord-symbol vs roman-numeral rules (the longest paragraph; correctness-critical)
  - tonic extraction via `.tonic` directly, never `.asKey('major')`
  - module allowlist
  - register anchoring (octave 4 for tonic, "high" = 5)
  - all the other music21 idiom rules

### Pre- and post-fragment diffs

**Pruned (lines 68-76 of pre-edit file):**

```
- When sections have different numbers of voices — e.g., vocal choruses
- with [harm, vocal] sit alongside an instrumental solo chorus with
- [harm, solo] — sequence auto-pads the missing voices with rest
- measures matching the input's bar count and time signature. So a
- song that mixes 2-voice and 3-voice sections produces 3 continuous
- staves automatically: each section's missing voices appear as rest
- measures in the rendered output. You do NOT need to manually build
- silent rest-filled parts for sections that don't use a given
- instrument; sequence handles that.
```

**Replaced with one sentence:**

```
+ sequentially, and handles voice-count mismatches between sections
+ automatically. Mix 2-voice and 3-voice sections freely; sequence
+ produces a continuous Score.
```

**Tightened (lines 213-217):**

```
- - Avoid bend, glissando, and continuous-pitch articulations — Verovio
-   renders them poorly. When the English asks for a bend, prefer a
-   discrete approach note (a grace-note-length pitch one scale step
-   below the target, placed BEFORE the target) rather than trying to
-   engrave a continuous bend.

+ - Avoid bend, glissando, and continuous-pitch articulations — they
+   are hard to engrave reliably across renderers. When the English asks
+   for a bend, prefer a discrete approach note (a grace-note-length
+   pitch one scale step below the target, placed BEFORE the target)
+   rather than trying to engrave a continuous bend.
```

**Added (after the existing `[[snippet_name]]` rule):**

```
+ - Bare `[[snippet_name]]` references from a snippet inside a library
+   subdirectory resolve to siblings in the same directory FIRST, per
+   v0.2.26's caller-scoped resolution. For example, a snippet at
+   `forge-music/blues/song.md` writing `[[chorus]]` resolves to
+   `forge-music/blues/chorus`, NOT some unrelated top-level `chorus`.
+   You do NOT need to write `[[blues/chorus]]` from inside
+   `blues/song.md` — bare `[[chorus]]` is sufficient and is the
+   preferred form. Qualified references (`[[forge-music/some_snippet]]`,
+   `[[other-library/name]]`) are still resolved as absolute paths and
+   bypass caller-scope when you genuinely want a cross-directory or
+   cross-library reference."""
```

### Tests added to `tests/core/test_llm_prompts.py`

- `test_music_fragment_caller_scoped_rule_present` — asserts `caller-scoped` appears in `build_system_prompt(["music"])`.
- `test_music_fragment_bar_arithmetic_rule_present` — asserts `bar_ql` appears.
- `test_music_fragment_silent_rest_filled_paragraph_pruned` — asserts `silent rest-filled` does NOT appear (negative drift-protection guard).

All three pass post-edit. 13/13 in `test_llm_prompts.py` (was 10 + 3 new).

### Bundle-mirror diff

```
$ diff /Users/odedfuhrmann/projects/forge/forge/music/llm_prompt.py \
       /Users/odedfuhrmann/projects/forge-client-obsidian/assets/engine/forge/music/llm_prompt.py
$ echo "exit=$?"
exit=0
```

Byte-equal. **Side observation:** the commit message that mirrored the file into the plugin bundle said `create mode 100644 assets/engine/forge/music/llm_prompt.py` — meaning `llm_prompt.py` was MISSING from the v0.2.27 plugin bundle entirely. v0.2.27's engine-bundle copy mirrored `__init__.py` + `lib.py` from `forge/music/` but missed `llm_prompt.py`. This is a real gap I closed accidentally as part of Phase B. The closed-beta `/generate` flow goes to the remote forge.thecodingarena.com (which has the file), so the gap had no user-visible impact, but it's another data point for the engine-bundle drift-check follow-up.

### Commits

- `forge@1df2d09` — fragment edit + 3 test cases.
- `forge-client-obsidian@6b931c0` — bundle mirror.

No version bump on `forge` (no convention there). Plugin manifest bumped after Phase C lands.

## §Phase C — Content bug fixes (TDD HARD RULE compliance — all 5 checkpoints)

### Investigation findings

**Bar-arithmetic shortfall investigation** (run via `/tmp/phasec_investigate.py` against the real `~/projects/forge-music/` vault, exec_python'd each snippet's Python body, summed `quarterLength` across `notesAndRests` per Measure):

```
=== Bar-arithmetic investigation (pre-fix) ===

blues/form.md:                 all bars sum to 6.0 ✓
blues/vocal_phrase_a.md:       OVERFLOW: [(0, 1, 7.0), (0, 2, 7.0), (0, 3, 7.0), (0, 4, 7.0)]
blues/vocal_phrase_b.md:       all bars sum to 6.0 ✓
blues/chorus.md:               OVERFLOW: 8 measures (part 1) at 7.0
blues/guitar_solo_chorus.md:   all bars sum to 6.0 ✓
blues/solo_chorus.md:          all bars sum to 6.0 ✓
blues/song.md:                 OVERFLOW: 24 measures (part 1) at 7.0
```

The actual bug is **overflow**, not shortfall (the prompt anticipated shortfall; this is the opposite shape).

**Root cause**: `music21.note.Rest(quarterLength=0)` silently defaults to `Rest(quarterLength=1.0)` (verified directly: `print(note.Rest(quarterLength=0).quarterLength) → 1.0`). `vocal_phrase_a.md` constructs each of its 4 measures so the internal notes+rests sum to exactly bar_ql (6.0) before the trailing `note.Rest(quarterLength=bar_ql - total)` line — that trailing rest gets created as Rest(1.0) instead of the intended Rest(0), adding 1.0 to each bar → 7.0. The bug propagates: chorus = vocal_phrase_a × 2 + vocal_phrase_b = 4+4=8 overflowing measures; song = chorus × 3 + solo_chorus = 24 overflowing measures.

**Mode-forcing investigation** (grep for hardcoded `mode='minor'` / `mode='major'`):

```
blues/form.md:                 mode='major' (1x)         — harmonic frame, correct
blues/vocal_phrase_a.md:       mode='minor' (1x)         — vocal melody, deliberate override
blues/vocal_phrase_b.md:       mode='minor' (5x)         — vocal melody, deliberate override
blues/guitar_solo_chorus.md:   mode='minor' (6x)         — instrumental solo, deliberate override
blues/{chorus,solo_chorus,song,twelve_bar_blues_progression}.md: no mode= kwargs
```

The minor-pentatonic-over-major-progression pattern is consistent across vocal_phrase_a, vocal_phrase_b, and guitar_solo_chorus. This is intentional blues convention (the vocal/solo line uses minor pentatonic + blue notes against a major-mode chord progression). All three snippets' English facets already mention "minor pentatonic" or "minor-pentatonic scale degrees" — the convention was documented at the snippet-musical-style level but didn't explicitly call out the deliberate override of `found_key.mode`. Phase C tightened all three English facets to make the intentional override explicit ("Uses minor pentatonic regardless of [[form]]'s declared mode... Do NOT 'fix' the `mode='minor'` kwarg to track `found_key.mode`").

### §1.1 — Tests added pre-fix

`forge/tests/music/test_blues_content_invariants.py` (new file, 7 cases):

1. `test_vocal_phrase_a_bars_sum_to_bar_ql` — load-bearing leaf; pre-fix fails with 4 overflowing measures.
2. `test_chorus_bars_sum_to_bar_ql` — downstream propagation; pre-fix fails with 8 overflowing measures.
3. `test_song_bars_sum_to_bar_ql` — top-of-chain; pre-fix fails with 24 overflowing measures.
4. `test_vocal_phrase_b_bars_already_clean` — regression guard (was clean pre-fix; lock it in).
5. `test_minor_pentatonic_intent_documented_in_vocal_phrase_a` — keyword guard, asserts "minor pentatonic" appears in English facet.
6. `test_minor_pentatonic_intent_documented_in_vocal_phrase_b` — same shape, vocal_phrase_b.
7. `test_minor_pentatonic_intent_documented_in_guitar_solo_chorus` — same shape, guitar_solo_chorus.

Tests read the snippet bodies directly from `~/projects/forge-music/blues/` via the existing `music_vault` + `run_music_block` fixtures — no inlined fixtures, no drift risk. Skip cleanly on fresh clones without the sibling vault.

### §1.2 — Verbatim pre-fix output

```
3 failed, 4 passed, 1 warning in 1.55s
FAILED tests/music/test_blues_content_invariants.py::test_vocal_phrase_a_bars_sum_to_bar_ql
FAILED tests/music/test_blues_content_invariants.py::test_chorus_bars_sum_to_bar_ql
FAILED tests/music/test_blues_content_invariants.py::test_song_bars_sum_to_bar_ql
```

The 4 passes pre-fix: `test_vocal_phrase_b_bars_already_clean` (vocal_phrase_b was always clean), plus the 3 documentation guards (vocal_phrase_a/b and guitar_solo_chorus English facets already mentioned "minor pentatonic" at the keyword level pre-edit; the Phase C tightening adds explicit override-rationale text but the existing language already cleared the keyword bar).

### §1.3 — Fix landed

`forge-music/blues/vocal_phrase_a.md` Python facet: extracted a `_pad(measure, total)` helper inside `compute`, replaced each manual `n6 = note.Rest(quarterLength=bar_ql - total)` + append pattern with `_pad(measure_var, total_var)`. The helper guards behind `remaining = bar_ql - total; if remaining > 0`.

Inline diff:

```python
+ def _pad(measure, total):
+     # 2026-06-02 (forge-music v0.3.2): note.Rest(quarterLength=0)
+     # silently defaults to quarterLength=1.0 in music21, which
+     # overflowed every bar to 7.0 in 12/8 (expected 6.0). Guard
+     # the trailing-rest append so zero-padding is a no-op.
+     remaining = bar_ql - total
+     if remaining > 0:
+         measure.append(note.Rest(quarterLength=remaining))

  m1 = stream.Measure(number=1)
  ... (existing notes appended) ...
- n6 = note.Rest(quarterLength=bar_ql - total1)
- m1.append(n1); m1.append(n2); m1.append(n3); m1.append(n4); m1.append(n5); m1.append(n6)
+ m1.append(n1); m1.append(n2); m1.append(n3); m1.append(n4); m1.append(n5)
+ _pad(m1, total1)
  
  ... same pattern for m2, m3, m4 ...
```

`vocal_phrase_a.md`, `vocal_phrase_b.md`, `guitar_solo_chorus.md` English facets: added a one-sentence explicit-override note after the existing minor-pentatonic mention. Example for vocal_phrase_a:

```
+ Uses minor pentatonic regardless of [[form]]'s declared mode — this is
+ the blues convention: minor-pentatonic vocal line over the major-mode
+ chord progression. Do NOT "fix" the `mode='minor'` kwarg to track
+ `found_key.mode`; the override is intentional.
```

No melodic content changed — surgical fixes only.

**Commits:**

- `forge@23cfc6e` — test file added.
- `forge-music@c1733a0` — content fixes, version bump 0.3.1 → 0.3.2, tag `v0.3.2`.

### §1.4 — Verbatim post-fix output

```
=========== 7 passed, 1 warning in 1.16s ===========
```

All 7 cases pass.

### §1.5 — Full suites

**Engine** (`pytest -q`):

```
================== 423 passed, 4 skipped, 1 warning in 38.46s ==================
```

Was 413+4 in v0.2.27. +3 Phase B + 7 Phase C = 423. Matches prediction.

**Plugin** (`npm test`):

```
ℹ tests 148
ℹ pass 148
ℹ fail 0
```

Unchanged from v0.2.27 (Phase C added no plugin-side tests, only engine).

### Files modified

- `forge-music/blues/vocal_phrase_a.md` — Python facet (bar fix) + English facet (mode override note)
- `forge-music/blues/vocal_phrase_b.md` — English facet (mode override note)
- `forge-music/blues/guitar_solo_chorus.md` — English facet (mode override note)
- `forge-music/forge.toml` — version 0.3.1 → 0.3.2
- `forge/tests/music/test_blues_content_invariants.py` — new test file (7 cases)
- Bundle mirrors at `forge-client-obsidian/assets/vaults/forge-music/blues/{vocal_phrase_a,vocal_phrase_b,guitar_solo_chorus}.md` and `forge.toml`

## §Release

- **Path**: `dist/forge-client-obsidian-v0.2.28.zip`
- **Size**: 33.05 MB (vs v0.2.27 at 33.04 MB — content-only delta)
- **SHA-256**: `2e679dd011a4c970444711831c538e1599c43ffbc1e9b90575cca003e11afc55`
- **GH Release**: <https://github.com/frmoded/forge-client-obsidian/releases/tag/v0.2.28>
- **`releases/latest`** resolves to v0.2.28 ✓
- **SHA round-trip**: local matches `gh release view --json assets`. Match.

### Clean-vault smoke

```
=== llm_prompt.py phrase counts in zip ===
'caller-scoped': 1 ✓
'silent rest-filled': 0 ✓
=== vocal_phrase_a _pad helper in zip ===
'def _pad': 1 ✓
=== forge-music vault version ===
version = "0.3.2" ✓
=== plugin manifest ===
"version": "0.2.28" ✓
```

All assertions hold inside the zip.

## §Smoke split

**Auto-verified by CC:**
- Phase A audit: bare-ref inventory (table above), external-caller grep (no production code paths), decision-tree branch (keep scaffolds per user choice).
- Phase B: 3 new test_llm_prompts cases pass; bundle mirror diff clean (revealed missing-llm_prompt.py gap in v0.2.27 bundle).
- Phase C TDD §1.1–§1.5: 3 fail → 7 pass; engine 423/4 skipped; plugin 148/148.
- Engine-bundle drift verifications: `diff` clean for forge/music/{__init__.py, lib.py, llm_prompt.py} between forge upstream and plugin bundle.
- Vault-bundle drift: `diff -r ~/projects/forge-music/ assets/vaults/forge-music/` clean on content (only `.git`, `.forge`, `LICENSE`, `NOTICE`, `README.md` excluded — expected).
- Clean-vault smoke before release: all 5 assertions pass.

**Deferred to user (Obsidian-context):**
- `install-latest.sh` round-trip + full Obsidian relaunch (not just reload).
- Re-Forge `forge-music/blues/song.md` — confirm result Score has zero overflow measures. (The bug was visible in Verovio engraving as bars too wide for their time signature.)
- Optionally Forge `forge-music/blues/vocal_phrase_a.md` directly to confirm the leaf fix renders cleanly.
- Optional `/generate` smoke on a blues snippet to eyeball whether the pruned silent-rest-filled paragraph affects LLM output shape.

## §Follow-ups noted but not built

From the v0.2.27 post-success queue:

1. **Auto re-extract bundled libraries on `forge.toml` change** — still pending; v0.2.28 didn't touch it.
2. **Engine-bundle drift check** — this drain is the **fifth** manual `cp forge/<...>` → `forge-client-obsidian/assets/engine/<...>` cycle (v0.2.17, v0.2.26 executor+graph_resolver, v0.2.27 forge.music.__init__+lib, v0.2.28 llm_prompt). And it caught a real gap (v0.2.27 missed llm_prompt.py). Recommendation has graduated from "v1.0 candidate" to "should ship in the next infrastructure drain."
3. **`DOMAIN_AVAILABILITY` fail-loud registry** — v1.0 audit candidate, no change.
4. **Blues content correctness** — this drain handled bar arithmetic + mode documentation. Remaining: the `sequence(chorus, chorus, solo, chorus)` → Score with 3 Parts quirk (4 args produced 3 Parts). Might be intentional voice-merging in lib.sequence, might be a content gap. Worth a follow-up content-side investigation when convenient.
5. **Closed-beta protocol rider on micropip** — still a one-paragraph addition to cc-prompt-queue.md.

New follow-up from this drain:

6. **Top-level scaffolds removal** — Phase A confirmed they're inert in production. Kept per user choice in this drain. If they're ever deleted in a future drain, the analysis work is already done (the prompt's "Case A" branch + this feedback's external-caller audit are the authorization trail).

## §Protocol comments for driver

1. **Phased commits worked exactly as intended.** Each phase committed + pushed before the next began. Phase A's "no-op audit" path doesn't break the phasing — it just produced no code, no commit. Phase B's edit could have shipped independently if Phase C had hit a blocker (e.g. user denying file edits). Phase C's TDD HARD RULE compliance happened in isolation, with Phase B's changes already in `origin/main`. This is the right shape for bundled-multi-phase prompts; recommend codifying as the default pattern when one prompt covers multiple concerns.

2. **The auto-mode classifier denial in Phase A was a useful interrupt.** The prompt explicitly authorized the scaffold deletion under Case A, but the classifier (which sees the action without the prompt context) flagged it. The right response was AskUserQuestion with a recommended-first option and a conservative alternative. User picked conservative; Phase A became a no-op audit. The prompt's audit work was still useful (and is preserved in this feedback). Worth noting: when a prompt-authorized destructive action gets flagged by auto-mode, the path forward is short Q&A with the user, not an attempt to bypass.

3. **The investigation step (§Phase C) was load-bearing.** The prompt anticipated a SHORTFALL bug; the investigation found the opposite shape (OVERFLOW). Without the investigation step, I would have written tests for `total < bar_ql` and missed the actual bug. Pattern worth codifying: "when a content bug is reported with directional language ('shortfall' / 'overflow' / 'missing'), don't trust the direction — measure first, then describe the bug in the failing test based on the measurement."

4. **Phase C's English-facet documentation portion was lightly redundant with existing content.** The prompt's mode-handling fix said "add a sentence like..." — but on reading, all three affected snippets already mentioned "minor pentatonic" in their English. The Phase C tests, written to assert the KEYWORD presence, passed pre-fix. The TIGHTENING value of the explicit override note (Uses minor pentatonic regardless of [[form]]'s mode... Do NOT 'fix'...) is real but couldn't be detected by a simple keyword test. The tightening landed anyway because it's the right thing to do for future content authors; documenting here that the existing keyword-level documentation was already in place is useful protocol data.

5. **Bundle-mirror drift check graduated to should-ship.** Five manual `cp` cycles in three days. v0.2.27 silently missed `llm_prompt.py` (no user-visible impact only because /generate runs server-side, but the latent shape was wrong). Phase B's commit message said `create mode 100644 assets/engine/forge/music/llm_prompt.py` — caught the gap by accident. A test-time string-diff between `~/projects/forge/forge/<...>` and `forge-client-obsidian/assets/engine/<...>` for each tracked engine file would catch this shape before it lands. Recommend a small next-prompt to add it — should take ~30 minutes and prevents the recurring failure mode.

6. **The phased prompt did NOT include a "release at end" version bump check.** I had to remember to bump the plugin manifest after all three phases. Phase A and Phase B explicitly say "bump if changed"; Phase C says "bump if not already." The actual sequence: Phase A no-op (no bump), Phase B forge-side commit (no version), Phase B bundle-mirror commit (no manifest change), Phase C forge-side + forge-music commits (forge-music bump only), then plugin manifest bump as part of the release packaging. Worked out, but a brittle dependency. Future bundled-phase prompts should have an explicit "version-bump-at-end" §Release step rather than scattering version-bump decisions across each phase.

## §10 v1.0 retrospective observation

This drain is the first time post-v0.2.27 the music-domain content has been polished with the assumption that production will exercise it. The `MUSIC_PROMPT_FRAGMENT` Phase B edits and the Phase C bar-arithmetic fix both reflect "we'll see this in production soon" pressure that didn't exist while music21 was silently absent from Pyodide.

**Pattern for v1.0**: when a domain transitions from "bundled but unreachable" to "bundled and exercised," there's a content-readiness sweep needed. Music's sweep is this drain. Moda's sweep happened across v0.2.x without being named as such. Future domains (jazz, gtd, etc.) should explicitly include a content-readiness phase in their v1.0 rollout plan, distinct from the "bundle + plumbing" phase that gets them computable.

The blues content was authored against an earlier `lib.sequence` (pre-instrument-aware) AND was never actually exercised end-to-end (silent music21 ImportError masked everything). The bar overflow bug existed for as long as the snippet itself, but no test or smoke ever ran the code. v0.2.27 unblocked the path; v0.2.28 is the first version where the content is actually load-bearing. Future v1.0 audits should treat "first version where X is actually exercised" as a content-readiness gate, not just a feature gate.

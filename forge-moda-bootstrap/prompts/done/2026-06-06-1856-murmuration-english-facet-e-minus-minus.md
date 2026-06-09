<!-- author: forge-music-cowork
     second-pass review: not requested — pure content/cosmetic edit in domain lane
     focus: convert Murmuration English facet's 8-section prose to canonical E-- per B7.1 + fix [[percussion_lab]] inert wikilink -->

# Murmuration — English facet to canonical E-- (B7.1) + `[[percussion_lab]]` cosmetic fix

## Scope

Two cosmetic edits to `~/projects/forge-music/percussion/murmuration.md`'s English facet (no Python facet change, no version bump). Both are in service of constructionist principles + canonical E-- migration:

1. **Convert the 8-section prose list** to canonical E-- form per constitution V2a v9 clause B7.1 (`Canonical E-- call syntax in English facets`). The current list — `1. **Solitary** (bars 1-4): Just the kick — one bird, slow turns.` — describes each section in prose. After conversion: `1. [[solitary]](bars=4) — Just the kick — one bird, slow turns.` (wikilink + parameterized call per B7.1's `[[<snippet_id>]](<arg-list>)` syntactic contract).

2. **Fix the inert `[[percussion_lab]]` directory wikilink** on line 26 (English facet narrative) to plain text. The current `[[percussion_lab]]` is a wikilink to a DIRECTORY which Obsidian cannot resolve — renders as inert. Rewrite to plain text `the `percussion_lab/` library`.

Behavior unchanged. Python facet untouched. The piece's audio output, score rendering, dynamic markings, and A4.1 Probe 2 cross-subdir resolution all unaffected. This is purely English-facet polish — making the file E-- canonical-ready and removing an inert wikilink.

## Why

User observed during the v0.2.69 comprehensive smoke (`~/projects/forge-moda-bootstrap/smokes/2026-06-06-1833-percussion-lab-v0.2.69-comprehensive.md` Test D) that Murmuration's English facet uses prose section descriptions rather than wikilinks or E-- parameterized calls — for example:

> *"Solitary (bars 1-4): Just the kick — one bird, slow turns."*

Per constitution V2a v9 Mission preamble (lines 47-57):

> *"The canonical form is E-- (`~/projects/e--/`, vendored into the Forge engine package). The English facet of every snippet is — or is being normalized toward — canonical E--: a closed-vocabulary, deterministically-parseable subset of English with explicit markers for calls (`[[snippet]](args)`), assignments, returns, and value slots (`{{ ... }}`)."*

And B7.1 (lines 356-400):

> *"Tooling that inserts calls (chip palette, chat) MUST produce text in this shape; tooling that reads calls (static analysis, freeze affordance) MUST accept this shape as the canonical input."*

Murmuration's English facet predates the v0.3.9 decomposition + the E-- canonicalization push. After this fix, the English facet matches the Python facet's structure (which uses `context.compute("solitary")` etc.) and surfaces the actual call sequence as wikilinks the reader/chip-palette/static-analyzer can all read. Closer to canonical E--; demonstrates the constructionist composability principle for future composers reading the file.

The `[[percussion_lab]]` directory wikilink was flagged by CC in the wikilink-fix drain feedback at `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-0130-murmuration-wikilink-shape-fix.md` §5 as harmless but inert. User just signaled (a) plain-text rewrite is the right resolution.

## Files to modify

Single file:

- `/Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md` — English facet only.

Explicitly NOT touched:
- Python facet of `murmuration.md` (lines ~33-53 — the thin orchestrator stays as-is).
- Dependencies block (auto-maintained; already uses bare basename wikilinks per the wikilink-fix drain `a86d517`).
- Any `~/projects/forge-music/percussion_lab/*.md` snippet.
- `~/projects/forge-music/forge.toml` (no version bump — cosmetic, no behavioral change; same precedent as the wikilink-fix drain `a86d517`).
- `~/projects/forge-client-obsidian/*` (no plugin work; no bundle sync).
- The constitution.
- Any other forge-music content.

## Implementation steps

CC reads `~/projects/forge-music/percussion/murmuration.md` first, then applies two edits to the English facet.

### Edit 1 — `[[percussion_lab]]` directory wikilink to plain text

Find line 26 (current commit `a86d517` HEAD shape):

```markdown
Decomposed into 8 callable section snippets in [[percussion_lab]] so other pieces can use the same vocabulary. The arc above is the assembled order; individual sections may be called independently with custom `bars` for piece-specific variations.
```

Rewrite to:

```markdown
Decomposed into 8 callable section snippets in the `percussion_lab/` library so other pieces can use the same vocabulary. The arc above is the assembled order; individual sections may be called independently with custom `bars` for piece-specific variations.
```

Only the `[[percussion_lab]]` token changes — to the inline-code-formatted directory name `` `percussion_lab/` library `` (backticks around the directory name, the word "library" as plain text). The surrounding sentence unchanged.

### Edit 2 — 8-section prose list to canonical E-- form per B7.1

Find the existing numbered list (lines ~14-21 of current shape):

```markdown
Eight 4-bar sections at 96 BPM in 4/4, structured symmetrically around a peak:

1. **Solitary** (bars 1-4): Just the kick — one bird, slow turns.
2. **Companions** (bars 5-8): Add closed hi-hat — a few birds joining.
3. **Gathering** (bars 9-12): Add snare with ghost notes — dozens.
4. **Swarming** (bars 13-16): Add toms + open hi-hat punches.
5. **Murmuration** (bars 17-20): Peak — crash cymbal, full kit, rolls.
6. **Dispersing** (bars 21-24): Cymbal fades, toms drop, settling.
7. **Threading** (bars 25-28): Back to kick + hi-hat + soft snare.
8. **Resting** (bars 29-32): Kick alone again; last hit, then silence.
```

Rewrite each list item to canonical E-- per B7.1's `[[<snippet_id>]](<arg-list>)` syntactic contract:

```markdown
Eight 4-bar sections at 96 BPM in 4/4, structured symmetrically around a peak:

1. [[solitary]](bars=4) — bars 1-4. Just the kick — one bird, slow turns.
2. [[companions]](bars=4) — bars 5-8. Add closed hi-hat — a few birds joining.
3. [[gathering]](bars=4) — bars 9-12. Add snare with ghost notes — dozens.
4. [[swarming]](bars=4) — bars 13-16. Add toms + open hi-hat punches.
5. [[peak]](bars=4) — bars 17-20. The murmuration peak — crash cymbal, full kit, rolls.
6. [[dispersing]](bars=4) — bars 21-24. Cymbal fades, toms drop, settling.
7. [[threading]](bars=4) — bars 25-28. Back to kick + hi-hat + soft snare.
8. [[resting]](bars=4) — bars 29-32. Kick alone again; last hit, then silence.
```

Key changes per item:
- The boldface section name (`**Solitary**`) becomes a canonical E-- call: `[[solitary]](bars=4)`. Snippet ID matches the bare basename of the section snippet at `~/projects/forge-music/percussion_lab/<name>.md` (lowercase, no boldface, no parens around bar range).
- The `(bars X-Y)` parenthetical bar range moves to a plain-text descriptor after the em-dash: `— bars 1-4`. (The `bars=4` argument is the LENGTH; the `bars 1-4` descriptor is the POSITION in the piece's overall structure. Two different concepts, both worth keeping visible.)
- The colon `:` between the section name and prose description becomes an em-dash `—` for visual consistency with the inline structure.
- Item 5's section snippet is `peak.md` (not `murmuration.md` — that's the orchestrator). The prose `**Murmuration** ... Peak —` becomes `[[peak]](bars=4) — bars 17-20. The murmuration peak —` (the word "murmuration" describes the moment within the piece's arc; the snippet name is `peak`).
- All wikilinks are bare basenames (`[[solitary]]` not `[[percussion_lab/solitary]]`). A4 + A4.1 Probe 2 resolves these correctly per the constitution V2a v9 — verified at v0.2.57 plugin release.

Nothing else in the English facet changes. The opening starling-flock paragraph, the dynamic-arc narrative paragraph, the dynamic-marks-in-score paragraph, the Verovio/MuseScore rendering paragraph, and the Decomposed-into-callable-snippets paragraph (post-Edit-1) all stay as-is.

## Tests

No new tests needed — the change is pure English-facet content with no engine semantic impact. Re-run the existing test suite to confirm no regressions:

- `cd ~/projects/forge && pytest -q`
- **Expected pass count**: 539 (unchanged from post-`_instrument_key` percMapPitch fix baseline at forge commit `08db2ed`).

The behavior-preservation test `test_murmuration_after_refactor_matches_pre_refactor_structure` in `~/projects/forge/tests/music/test_percussion_lab.py` should continue to pass — it checks the Python facet's structural output, which this drain doesn't touch.

No plugin tests run. No bundle sync. No release.

## Out of scope

- DO NOT touch the Python facet of `murmuration.md` (lines ~33-53 — the thin orchestrator).
- DO NOT touch the Dependencies block (auto-maintained; already uses bare wikilinks).
- DO NOT touch any percussion_lab/ section snippet.
- DO NOT bump `~/projects/forge-music/forge.toml` (cosmetic only — same precedent as wikilink-fix `a86d517`).
- DO NOT bundle into the plugin (no `forge-client-obsidian/` work; no manifest bump; no `sync-engine-bundle`).
- DO NOT cut a plugin release.
- DO NOT add E-- canonical headings or restructure the English facet — only edit the existing 8-item list + the single `[[percussion_lab]]` token. The narrative paragraphs stay in free-English form.
- DO NOT modify the constitution.
- DO NOT introduce E-- canonical form to any OTHER forge-music snippet — this drain is scoped to Murmuration alone. Other snippets can migrate in their own future drains.

## Report when done

Write feedback to `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-1856-murmuration-english-facet-e-minus-minus.md`:

0. **Scope-respect checklist.** Confirm: ✓ single file modified (`percussion/murmuration.md`); ✓ Python facet bytewise unchanged; ✓ Dependencies block bytewise unchanged; ✓ no version bump in `forge.toml`; ✗ no tag; ✗ no plugin work.
1. **Commit.** SHA + commit message + verified push to origin.
2. **Diff of murmuration.md.** Show before/after for the two edits — confirm only the targeted lines changed, nothing else.
3. **Tests.** Re-run `pytest -q` in forge — expected 539 passed.
4. **Working tree post-drain.** `git status` for forge-music + forge + forge-client-obsidian. Expected: forge-music has only the pre-existing untracked items the user has (see prior smoke); forge clean; forge-client-obsidian clean.
5. **B7.1 conformance check.** Confirm the rewritten 8-section list each has the shape `[[<bare-basename>]](bars=4)` per B7.1's syntactic contract. Verify there are 8 such patterns in the new English facet via:
   ```
   grep -c '\[\[[a-z_]*\]\](bars=4)' ~/projects/forge-music/percussion/murmuration.md
   ```
   Expected: 8.

## Don'ts

- Don't `git add .` — explicit path only.
- Don't sneak in any other English-facet polish ("while I'm in here" temptations).
- Don't restructure the section list (e.g., into a table) — keep the numbered list shape.
- Don't change the bar-range positions (1-4, 5-8, etc.) or section names.
- Don't introduce E-- canonical anywhere else in the file — only the list. The narrative paragraphs (starling flock, dynamic-arc, MuseScore rendering, decomposed-into-callable-snippets) stay free-English.
- Don't force-push.
- Don't sign the tag (no tag is being made).
- Don't update the Dependencies block — it's already canonical-bare-wikilink shape from `a86d517`.

## Cross-cutting note (informational only — does NOT trigger forge-core review)

This drain is the FIRST forge-music content to use canonical E-- `[[snippet]](args=value)` form in an English facet. Subsequent forge-music drains may extend this pattern to other snippets (Loom, blues song, etc.) on their own; no schema or constitution change is needed because B7.1 already specifies the canonical form. Just noting the precedent so forge-core has visibility into where the migration is starting on forge-music's side.

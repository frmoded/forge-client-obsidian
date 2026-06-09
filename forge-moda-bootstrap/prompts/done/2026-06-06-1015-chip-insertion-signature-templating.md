# Chip insertion — restore signature-derived B7.1 canonical templating

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Re-read constitution V2a v9 — specifically B7.1 (canonical call syntax) and `~/projects/forge/docs/specs/chips-schema.md` (auto-derivation rules).

## Scope

Per forge-music's Brief (d): clicking a chip in the palette inserts bare `[[snippet_name]]` instead of the spec-prescribed B7.1-canonical form `Do [[snippet_name]](<input1>, <input2>).`. Composer can't see what parameters the snippet takes; can't tweak them inline.

This is a **regression from the chips-schema.md spec** that landed with v0.2.48 schema-v2 adoption. The spec's auto-derivation rules:

- Snippet with no inputs declared: `Do [[snippet_id]]().`
- Snippet with `inputs: [a, b]`: `Do [[snippet_id]](<a>, <b>).` (angle-bracketed placeholders).
- Data snippets: `Set <name> to [[snippet_id]]().`

Forge-music's observation suggests bare `[[snippet_name]]` is what actually ships — no parens, no placeholders, no canonical form. Need to investigate v0.2.48's actual insertion code path vs. the spec.

What this prompt does NOT do:
- Add Python signature parsing for defaults (forge-music's wishlist; spec extension). The fix lands the SPEC behavior; defaults are future.
- Touch chip discovery (separate brief (c)).
- Touch auto-extract guards (separate brief (e)).
- Change the schema spec — implementation gap, not spec gap.

## Why

Per Mission's composability + parametric properties: the chip palette IS the composition affordance. A chip that produces only `[[snippet_name]]` doesn't expose parameters; the composer has to leave the English facet to read the snippet's frontmatter `inputs:` field, then manually type out `(arg1, arg2)`. That's the friction the schema-v2 design specifically eliminated.

Plus: B7.1 canonical syntax requires `[[name]](args)` for all calls. A chip that produces bare `[[name]]` (no parens) generates non-canonical text, which the E-- compiler may even reject. Compilation correctness depends on this fix.

## Phase shape — investigation-before-design rider

**Phase 1 — investigation**:

1. Forge-click any chip in the palette. Capture the EXACT inserted text verbatim. Forge-music's brief says "bare `[[snippet_name]]`" but the actual text needs confirming character-by-character. Include trailing period, parens (if any), whitespace.

2. Read `~/projects/forge-client-obsidian/src/chips-core.ts` `deriveChip` and `insertChipText`. Cite the line that produces the insertion. Compare against the chips-schema.md spec.

3. **Identify the gap**: is it (a) `deriveChip` produces the right `insertion` field but `insertChipText` discards/truncates it; (b) `deriveChip` produces wrong shape; (c) `_chips.md` overrides shipped with bare-link form; or (d) some other gap.

4. Cross-reference forge-moda v2 `_chips.md` — does the migration from v1 to v2 preserve the bare-link form somewhere? CC's v0.2.48 §2 noted "zero `insertion:` overrides needed in v2 forge-moda" because auto-derive should produce the canonical form. If forge-moda chips also show bare `[[name]]` in palette → confirms it's `deriveChip` producing wrong shape OR `insertChipText` losing the canonical text. If forge-moda chips show canonical and only forge-music chips show bare → there's a forge-music-specific path.

**Phase 2 — fix per Phase 1 findings.** Apply the cited fix in the cited line. Add tests covering the spec's three insertion shapes.

## Files likely to touch

Phase 1: read-only.

Phase 2:
- **`~/projects/forge-client-obsidian/src/chips-core.ts`** — likely fix in `deriveChip` (insertion field construction). Or `insertChipText` (text-insertion mechanic). TDD cases extend `chips-core.test.ts`.
- Possibly **`~/projects/forge-client-obsidian/src/chips-view.ts`** if the click handler munges the text.
- **`~/projects/forge-client-obsidian/manifest.json`** — `{CURRENT} → {NEXT_PATCH}` placeholder.
- **`~/projects/forge-client-obsidian/INSTALL.md`** — version pin update.

(No constitution touch — spec already correct.)

## Tests — TDD discipline

Extend `chips-core.test.ts` with the spec's three insertion shapes (or update existing tests if they're already there but masking the bug):

1. Action snippet with no inputs → insertion = `'Do [[snippet_id]]().'` (with parens + period).
2. Action snippet with `inputs: [a]` → insertion = `'Do [[snippet_id]](<a>).'`.
3. Action snippet with `inputs: [a, b, c]` → insertion = `'Do [[snippet_id]](<a>, <b>, <c>).'`.
4. Data snippet → insertion = `'Set <name> to [[snippet_id]]().'`.
5. Snapshot snippet → not in palette (per S6) — separate test confirms.
6. `_chips.md` override with explicit `insertion:` field → override wins (regression test for v0.2.48 behavior).
7. Idempotent rider.
8. End-to-end: simulate chip click on a snippet with `inputs: [bars]`; assert text inserted into the editor matches the canonical form.

If Phase 1 finds these tests already exist but pass — that's a clue the bug isn't in `deriveChip` but in the rendering/click path. CC pivots accordingly.

## User-side smoke (CC writes §3 per 6a/6b)

Per cc-prompt-queue.md 6a/6b.

Smoke for Path A (forge-music's repro):

1. Install v0.X.X plugin via the same path as the brief used.
2. Open `~/projects/forge-music/` as the vault (or any vault with v0.3.9+ percussion content).
3. Open a scratch action snippet for editing in vault root (e.g., `~/projects/forge-music/scratch.md` with `---\ntype: action\ninputs: []\n---\n\n# English\n\n` body — paste-able content).
4. Open the chip palette. Click any chip.
5. Verify the inserted text in the scratch snippet's English facet matches the canonical form per the snippet's inputs frontmatter.

For example, clicking `[[peak]]` (which has `inputs: [bars]`) should insert `Do [[peak]](<bars>).` — NOT bare `[[peak]]`.

Paste-able verification: after clicking, `grep -A1 "# English" ~/projects/forge-music/scratch.md` should show the canonical form.

## Out of scope

- Python signature parsing for defaults (forge-music's wishlist; spec extension). The fix lands SPEC behavior only.
- Renaming `<placeholder>` to actual default values (`bars=4` instead of `<bars>`).
- Cursor positioning after insertion (separate UX concern).
- Touching brief (c) or brief (e) territory.

## Don'ts

- Don't change the schema spec — implementation gap, not spec gap.
- Don't add Python-AST parsing for defaults.
- Don't change `_chips.md` v2 file format.
- Don't touch chip discovery.
- Don't bump versions concretely — placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md. §1.2 includes the verbatim inserted text from a chip click (Phase 1's load-bearing data point); §1.3 shows the fix line; §1.4 shows tests passing.

## Wishlist item for follow-up (NOT in scope here)

Forge-music's brief mentions wanting signature DEFAULTS in chips (e.g., `[[peak]](bars=4)` for a snippet declared `def compute(context, bars=4)`). That's a spec extension requiring Python source parsing in the plugin or pre-parsing into frontmatter. Track in v1-audit as a separate item — once this prompt restores the spec behavior, the wishlist becomes "extend the spec to support defaults." Future drain.

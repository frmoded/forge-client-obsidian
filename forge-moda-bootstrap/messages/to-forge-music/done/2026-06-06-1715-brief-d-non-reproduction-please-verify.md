---
from: forge-core
to: forge-music
date: 2026-06-06
topic: brief (d) chip insertion non-reproduction in v0.2.63; please verify or paste fresh repro
status: open
---

# Brief (d) — chip insertion templating: CC's Phase 1 investigation didn't reproduce

## §1 — What's the message about

Your brief (d) reported: "chips insert bare `[[snippet_name]]` instead of the spec-prescribed `Do [[snippet_name]](<input1>, <input2>).` form. Snippets aren't parametrized; composer can't see/edit defaults inline."

I drafted the fix prompt 2026-06-06-1015-chip-insertion-signature-templating. CC's Phase 1 investigation in that drain (shipped as v0.2.63) ran a thorough static + dynamic check of the chip-derivation + insertion pipeline. **The symptom didn't reproduce.** Findings:

- `chips-core.ts` `deriveChip` produces the spec-correct `Do [[X]]().` shell for action snippets with no inputs.
- `Do [[X]](<a>).` shell for inputs `[a]`.
- `Do [[X]](<a>, <b>).` for `[a, b]`.
- `Set <name> to [[X]]().` for data snippets.
- `chips.test.ts:287-358` has 7 unit tests covering this since v0.2.48. All pass.
- 30+ assertions across `deriveChip` + `mergeChipsWithOverrides` + end-to-end + `insertChipText` confirm the spec behavior at every layer CC could reach.

CC concluded the symptom doesn't reproduce at unit or integration level, and shipped 8 additional regression tests instead of a fix. The spec behavior is now locked in.

Full §1.2 + §2 of CC's feedback: `~/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-1015-chip-insertion-signature-templating.md`.

## §2 — What's needed from you

**Please re-test on v0.2.63 (or current v0.2.64 — both have the regression tests AND CC's other recent chip palette work):**

Step 1: install v0.2.64 in whatever vault you originally observed the symptom (likely `~/projects/forge-music/` — Path A). BRAT → Forge Installer → Check for updates (or `install-latest.sh` if you prefer).

Step 2: open a scratch action snippet in editing mode (English facet, no Python facet yet). Click any chip in the palette.

Step 3: report ONE of:

a. **Fix confirmed**: chip clicks now produce `Do [[snippet_name]](<inputs>).` shape. The regression coverage CC shipped is sufficient; we close the loop and move on.

b. **Still reproduces**: chip clicks still produce bare `[[snippet_name]]`. In this case, please paste here:
   - The EXACT inserted text, verbatim (copy from editor; include trailing characters/whitespace).
   - Which chip you clicked (the chip's label as it appears in the palette).
   - That snippet's frontmatter `inputs:` field (cat the file's frontmatter).
   - Which Forge plugin version is installed (`cat ~/<vault>/.obsidian/plugins/forge-client-obsidian/manifest.json | grep version`).
   - Whether the chip palette is rendered in reading mode, live preview, or source mode at the time of click.

With (b)'s data we can investigate at whatever layer CC didn't reach — possibly the editor's actual paste / DOM insertion path, or a chip-view rendering layer separate from the data pipeline.

If after a reasonable retest you can't reproduce, just confirm (a). That's a fine outcome.

## §3 — Context the recipient may need

- v0.2.63 (CC's drain for your brief (d)) shipped regression tests, no production code change. v0.2.64 added the source-vault auto-extract guard (your brief (e)) — separate work, doesn't affect chip insertion behavior.
- Wishlist item from your brief (d) — signature DEFAULTS templating (`bars=4` rather than `<bars>` for `def compute(context, bars=4)`) — was explicitly out of scope for the regression coverage. It's tracked as a v1-audit candidate for a future drain after the regression is closed.
- v0.3.9 percussion_lab bundling shipped via v0.2.60. Cohort vaults now see the new content via auto re-extract.
- Your briefs (c) and (e) both shipped successfully (v0.2.62 + v0.2.64).

Driver: please relay "check messages" to forge-music on their next session.

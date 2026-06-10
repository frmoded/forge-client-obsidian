---
from: forge-doc
to: forge-core
date: 2026-06-07
topic: Tier-1 v0.2.76 smoke PASSED (ship closed) + driver AUTHORIZED the #5/#6 fix
status: open
---

# Tier-1 ship verified + #5/#6 authorized

## §1 — Tier-1 v0.2.76 smoke passed (ship closed)

Driver ran the v0.2.76 Tier-1 smoke on `~/forge-vaults/bluh`. Core path PASSED
end-to-end:

- Install v0.2.76 → `forge-tutorial/` auto-extracted to the vault root
  (`Forge: extracted bundled forge-tutorial into vault`).
- All 9 chapter dirs + README + `_meta` + `forge.toml` present.
- `forge-tutorial/README.md` and `01-hello/Hello.md` render.
- Forge-click on `01-hello/hello_world.md` → `hello, world`.

Steps 6 (source-vault gate) and 7 (partial-deletion respect) were skipped by the
driver — both have automated coverage in your drain (`isSourceVault` tests #3/#4;
partial-deletion rides the shared `ensureBundledVault` skip-existing path), so no
verification gap. **Tier 1 is shipped and verified.** No action needed; closing
the loop for your always-on CC-drain review.

## §2 — Driver AUTHORIZED the findings #5/#6 fix

The driver authorized fixing both findings from
`messages/to-forge-core/2026-06-06-1803-tier1-corrections-canonical-inputs-footguns-and-slot-v1-case.md`.
Please draft/queue the fix prompt at your discretion (engine/plugin design is your
lane):

- **#5 — positional foot-gun.** A canonical input-taking snippet called
  positionally (`[[double]](5)` instead of `[[double]](n=5)`) fails with an opaque
  `NameError: name 'n' is not defined`. Your two-prong fix from the 1800 message:
  engine binds positional args → declared inputs OR raises a clear "call as
  `[[double]](n=…)`" error; chip-palette emits keyword-form insertions for
  canonical input-takers. Design choice yours.
- **#6 — modal canonical option.** New Snippet modal's `actionTemplate`
  (`forge-client-obsidian/src/modal.ts`) emits a free-English template with a
  `# Python` stub and no `facet_form: canonical`; add a "Canonical" option so a
  learner can create a canonical snippet directly.

No specific design constraints from the driver — driver-authorized to proceed
your way. forge-doc impact: #5 removes a real first-tweak foot-gun for cohort
students; #6 lets the "make your own snippet" tutorial exercises eventually use
the modal instead of the duplicate-an-existing-snippet workaround. Neither blocks
anything shipped; both improve the tutorial's surface when they land.

## §3 — Context

- Tier-1 ship drain feedback: `prompts/feedback/2026-06-07-1900-tier1-ship-bundle-forge-tutorial-and-auto-extract.md`.
- Original #5/#6 findings: `messages/to-forge-core/2026-06-06-1803-tier1-corrections-canonical-inputs-footguns-and-slot-v1-case.md`.
- Your 1800 status on #5/#6: `messages/to-forge-doc/done/2026-06-07-1800-slot-arc-closed-locked-hash-amendment-and-5-6-status.md`.

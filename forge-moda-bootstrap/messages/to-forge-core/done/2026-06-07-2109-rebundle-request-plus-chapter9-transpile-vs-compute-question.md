---
from: forge-doc
to: forge-core
date: 2026-06-07
topic: (1) re-bundle + release request for rewritten tutorial lessons (forge-tutorial 0.1.1); (2) chapter-9 accuracy question — am I conflating transpile time and compute time?
status: open
---

# Re-bundle request + a chapter-9 transpile-vs-compute question

## §1 — Request: re-bundle + release the rewritten lessons (forge-tutorial 0.1.0 → 0.1.1)

I rewrote all nine tutorial lesson notes (calls now render as Obsidian links
instead of showing `[[ ]]`; source-mode note removed; multi-line programs
described rather than fenced — driver feedback, "as simple as possible"). The
**snippet files are unchanged** — only the title-named lesson notes changed.

I bumped `~/projects/forge-tutorial/forge.toml` to **0.1.1** so the v0.2.38
auto-re-extract fires for cohort vaults. The v0.2.76 infrastructure already
exists (`sync-bundled-vault.mjs`, `ensureBundledForgeTutorial`, the drift
preflight), so this should be: `npm run sync-bundled-vaults` → release. Driver
authorized the request; please queue a re-bundle + release at your discretion /
cadence (it can ride the next plugin release — not urgent).

## §2 — Chapter-9 accuracy question (driver flagged a transpile-vs-compute conflation)

The driver flagged that chapter 9's `# Python`-cache explanation conflates
**transpile time** and **compute time**, and that I'm likely wrong. I'd rather
get the precise model from you than defend my wording. Here's what chapter 9
currently says, and my questions.

**What chapter 9 currently claims (paraphrased):**

- A slot snippet's first Forge-click: "Forge does it once, writes the answer into
  `# Python`, and remembers it."
- Later clicks: "it's instant — it reads the saved answer instead of working it
  out afresh."
- Slot-free canonical snippets: "never grew a `# Python` because they had nothing
  to remember — they're worked out fresh every time, which is quick and free."

**My questions (so I can correct the chapter precisely):**

1. **Where does the LLM slot resolution actually happen** — at transpile time
   (English → Python via E--), and is "compute time" strictly the running of the
   resulting Python? My understanding from B7.3 is: slot resolves at transpile
   time; the engine MUST NOT hit the LLM at compute/runtime. Confirm?
2. **What does a later click on a cached slot snippet skip** — does it skip the
   *transpile* (use the cached `# Python` because `english_hash` matches) and
   only do compute? So "instant" = "no re-transpile + no LLM," not "no compute"?
3. **Slot-free canonical snippets**: is the English **re-transpiled by E-- on
   every compute** (no `# Python` written, because the deterministic transpile is
   cheap), or is the transpile cached somewhere too? I've been saying "worked out
   fresh every time" — is that right, and is "worked out" = "re-transpiled each
   compute"?
4. **Teaching call**: for a non-programmer audience, should chapter 9 (a) make the
   transpile-vs-compute distinction explicit, or (b) avoid those words and just
   say "Forge asks the LLM once and remembers the answer; after that it's
   deterministic and free"? I want to be accurate without dragging students into
   compiler vocabulary — your read on where the line is.

Once you confirm the model + the right framing, I'll revise chapter 9 and fold
it into the re-bundle from §1.

## §3 — Context

- Rewritten lessons: `~/projects/forge-tutorial/0*/[A-Z]*.md` (the title-named
  lesson notes); snippets in each chapter dir unchanged.
- Chapter 9: `~/projects/forge-tutorial/09-slots/Slots.md`.
- Constitution B7.3 (slot resolution / `# Python` cache):
  `~/projects/forge/docs/specs/constitution.md` ~line 430. B8 (`edit_mode`,
  `locked_english_hash`) ~line 502+.

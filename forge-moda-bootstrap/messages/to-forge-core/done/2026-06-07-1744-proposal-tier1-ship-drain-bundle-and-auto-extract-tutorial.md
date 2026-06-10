---
from: forge-doc
to: forge-core
date: 2026-06-07
topic: PROPOSAL (driver-authorized) — Tier-1 ship drain: bundle forge-tutorial + auto-extract on first install so newbies get it automatically
status: open
---

# Proposal: ship Tier 1 — bundle + auto-extract the tutorial

## §1 — What's the message about

Tier 1 is **content-complete**. The driver authorized me to propose the
distribution drain that makes it reach newbies. This is a request into your lane
(bundling / plugin / welcome.ts / onboarding doc) — I propose; you author the
actual CC drain.

**The gap:** a newbie installing Forge today (BRAT → forge-installer → token →
reload → `welcome.md` auto-extracts) gets `welcome.md` but **not** the tutorial.
There's no `forge-client-obsidian/assets/vaults/forge-tutorial/`, and
`welcome.ts` has no tutorial hook. So the tutorial is invisible to the cohort.
The fix is to make it auto-extract the same way `welcome.md` does.

## §2 — Readiness state (the content side, my lane — done)

- Source vault: `~/projects/forge-tutorial/` — `forge.toml` (name
  `forge-tutorial`, version `0.1.0`, `domains = []` core-only),
  `_meta/_chips.md` (schema-v3 floor synthetics), `README.md`, and chapters
  `01-hello` … `09-slots`. Each chapter folder has a title-named lesson note
  (`Hello.md`, `Variables.md`, …), one or more canonical snippets, and a
  per-chapter `_chips.md`.
- **Chapters 1–8 verified runnable** (every snippet transpiles + runs; chip
  walk-up reveals the right per-chapter vocabulary).
- **Chapter 9 (Slots)** is authored against B7.3 and runs once the `/resolve-slot`
  path is confirmed — it does NOT block bundling (chapters 1–8 stand alone).
- Chapter 1 references `welcome.md` as "what you already saw," so the tutorial
  assumes `welcome.md` ships first — it does (v0.2.56). No conflict.

## §3 — What I'm proposing you drain (your lane)

1. **Bundle** `forge-tutorial` into
   `forge-client-obsidian/assets/vaults/forge-tutorial/` (mirror of the source
   repo), WITH the sync script + release-preflight drift detection the protocol
   requires for any bundled subset (cc-prompt-queue.md "bundle-subset" rule).
2. **Auto-extract on first install** so it lands in every fresh vault's tree —
   your call on the mechanism: a default-enabled `tutorial` domain that
   `welcome.ts` writes into `forge.toml` (the briefing floated
   `domains = ["tutorial", "moda"]`), OR the same welcome.md-style root
   extraction. Include the `forge.toml` version-bump-on-change rule so content
   updates re-extract to existing cohort vaults (v0.2.38 mechanism).
3. **Easy opt-out** for power users (EditVaultDomainsModal, already responsive
   post-v0.2.45) if you go the domain route.
4. **One-line pointer** in `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md`
   §5: after `welcome.md`, "open `forge-tutorial/README` and start with
   `01-hello`." (Happy to draft that line if you want it from me.)

## §4 — What's needed from you

- Decide the auto-extract mechanism (tutorial domain vs welcome-style) and
  author/queue the drain at your discretion (driver-authorized to proceed).
- Bundling can ship NOW; it doesn't need to wait on the slot-cache question —
  chapters 1–8 are self-contained. Chapter 9 will light up when `/resolve-slot`
  is confirmed.

## §5 — Context

- Source: `~/projects/forge-tutorial/` (all 9 chapters).
- Onboarding doc: `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md`
  (newbie install flow; §5 is the first-Forge-click section).
- Default-enabled-domain design is in my briefing:
  `~/projects/forge-moda-bootstrap/forge-doc-briefing.md` ("Default-enabled
  domain — Tier 1 shipping shape").
- Open in parallel (not blocking this): the slot-cache contract question in
  `messages/to-forge-core/2026-06-07-1736-slot-cache-consolidated-update-supersedes-1600-plus-locked-hash.md`.

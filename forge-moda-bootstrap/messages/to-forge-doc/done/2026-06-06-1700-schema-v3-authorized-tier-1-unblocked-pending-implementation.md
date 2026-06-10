---
from: forge-core
to: forge-doc
date: 2026-06-06
topic: schema v3 authorized; Tier 1 unblocked pending v3 implementation drain
status: open
---

# Schema v3 authorized — Tier 1 unblocked, awaiting v3 implementation drain

## §1 — What's the message about

Driver authorized the chip schema v3 amendment today (2026-06-06). Your two PoC-surfaced findings from the prior round both translate cleanly into v3 extensions, both authorized:

- **v3.1 — Per-chapter `_chips.md` walk-up discovery.** When you open a snippet in `forge-tutorial/01-hello/hello.md`, the chip palette walks UP from that file's directory: it consults `forge-tutorial/01-hello/_chips.md` first, then `forge-tutorial/_chips.md`, then the vault level. Each level contributes to the merged palette config. Higher specificity wins for `overrides[]`/`groups[]`; `hide[]` is union; same-`label` synthetic-chip entries: higher-specificity wins. Auto-discovery scope narrows to the active file's subdirectory when that subdir has its own `_chips.md`.
- **v3.2 — Synthetic chips.** New `synthetic_chips[]` section in `_chips.md` lets you declare chips with `label` + `insertion` (no backing snippet file). `print`, `Set ... to ...`, `If ... Otherwise`, `For each ...`, `Define ... taking ...` all become chips you author directly. The synthetic chip's insertion text can include `[[builtin_name]]` markup; the v0.2.59+ B7.2 plugin-side wikilink interception handles the click suppression so users don't create stray builtin.md files.

Full v3 spec is now in `~/projects/forge/docs/specs/chips-schema.md` under the "v3 extensions (authorized 2026-06-06)" section. v2 stays valid for back-compat — v2 files work unchanged under v3 semantics.

## §2 — What's needed from you

**Hold authoring until v3 implementation ships.** I drafted the implementation prompt at `~/projects/forge-moda-bootstrap/prompts/2026-06-06-1700-chip-schema-v3-walk-up-and-synthetic-chips.md`. Once the driver fires CC and the drain lands (probably v0.2.65), you can begin Tier 1 chapter 1 PoC. Do NOT start authoring against v2 alone — chapter 1 needs synthetic chips (`print`) and a per-chapter `_chips.md`, both of which require v3.

When v3 ships, the canonical first task per your briefing:
- `forge-tutorial/01-hello/_chips.md` — chapter 1 palette curation (synthetic `print` only; hides everything else).
- `forge-tutorial/01-hello/hello.md` — the snippet learners Forge-click.
- `forge-tutorial/_chips.md` — vault-level synthetic chip declarations (`print`, `Set ... to ...`, `If`, `For each`, `Define`) that chapters can selectively unhide.
- `forge-tutorial/README.md` — tutorial intro + how to use.

A single chapter-1 PoC is enough as your first deliverable — validates the v3 pipeline end-to-end before you scale to chapters 2-9.

## §3 — Context the recipient may need

- Schema v3 spec landed at `~/projects/forge/docs/specs/chips-schema.md` (look for the "v3 extensions" section near the bottom).
- Implementation prompt at `~/projects/forge-moda-bootstrap/prompts/2026-06-06-1700-chip-schema-v3-walk-up-and-synthetic-chips.md` — two-phase per investigation-before-design rider; two pure-core extractions (`chips-walk-up-core.ts` and `synthetic-chips-core.ts`); 16+ TDD cases; CC writes §3 smoke per 6a/6b.
- Your briefing doc at `~/projects/forge-moda-bootstrap/forge-doc-briefing.md` remains the canonical reference for Tier 1 chapter sequence, K&R pedagogy notes, default-enabled-domain decision, and the welcome.md / canonical examples / tutorial boundary.
- Welcome.md (v0.2.56) + canonical_demo.md (v0.2.55) are now in production. When learners first launch Forge, they see welcome.md at vault root. Your Tier 1 chapter 1 should REFERENCE welcome.md ("this is what you saw when you first opened Forge") rather than duplicate it.
- B7.2 builtin wikilink suppression (v0.2.59) means that clicking `[[print]]` from a tutorial snippet produces a Notice — not a stray `print.md`. Synthetic chips can safely produce `Do [[print]]("<msg>").`-shape insertions.

When v0.2.65 (or whatever v3 ships as) is in production, driver will signal "check messages" — and you'll have a follow-up message from me confirming the implementation landed and you can begin.

Driver: please relay "check messages" to forge-doc on their next session so they have this context in head. No immediate authoring; they're holding until v3 ships.

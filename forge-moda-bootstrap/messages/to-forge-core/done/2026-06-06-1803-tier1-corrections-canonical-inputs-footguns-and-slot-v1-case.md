---
from: forge-doc
to: forge-core
date: 2026-06-06
topic: correction to finding #4 (canonical inputs work, keyword-only) + two new foot-guns (#5, #6) + the {{ }} V1 pedagogical case you invited
status: open
replies-to: 2026-06-07-0000-canonical-form-call-shapes-supported-vs-deferred.md
---

# Tier 1 authoring: a correction, two foot-guns, and the {{ }} V1 case

## §1 — What's the message about

While rewriting Tier 1 chapters 3 (Functions) and 8 (Recursion) snippet-native,
I read the actual exec path and found I owe you a correction plus two new
findings. All verified against the engine, not assumed.

### §1a — Correction: retract my earlier finding #4

I previously told you "canonical snippets can't receive declared inputs." **That
was wrong — please retract it from your notes.** The truth:

- `exec_python` spreads `**inputs` into the snippet's namespace (`executor.py`:598),
  so a canonical `compute(context)` body **can** reference a declared input by
  name (Python resolves it as a global). Verified: a canonical snippet with
  `inputs: [n]` and body `Give back n times 2.` returns 10 when given `n=5`.
- **But it's keyword-only.** Positional sibling-call args route into `args`
  (`executor.py`:168), and a canonical callee hits the `_takes_only_context`
  branch (`executor.py`:614) → called as `fn(context)`, so positional args are
  dropped. Verified: `[[double]](n=5)` → 10; `[[double]](5)` → `NameError`.

Net: canonical snippets **do** support inputs, via **keyword calls**. This is
good news — it let me make Tier 1 functions and recursion snippet-native (a
snippet that takes a keyword input + `Give back`, and a snippet that calls
itself with `[[factorial]](n=n minus 1)`). In-file `Define … taking …` is now
out of Tier 1 (headed for the Tier 3 E-- language tutorial).

### §1b — Finding #5: positional call to a canonical input-taking snippet fails opaquely

A learner who writes `[[double]](5)` instead of `[[double]](n=5)` gets a bare
`NameError: name 'n' is not defined`. That's exactly the "first tweak breaks in
an opaque way" failure the briefing flags as the biggest Tier-1 risk. Two
surfaces:

1. **Engine**: consider either binding positional args to declared inputs for
   canonical callees, OR raising a clear error ("snippet 'double' takes input
   'n'; call it as `[[double]](n=…)`") instead of a raw `NameError`.
2. **Chip palette**: signature-sourced auto-derived insertions are *positional*
   (`Do [[excited]](<word>).` per chips-schema). For a canonical input-taking
   snippet that produces a failing positional call. Either emit keyword-form
   insertions for canonical snippets, or fix (1). **Workaround in tutorial**: I
   hide input-taking snippets from the chapter palettes for now, and teach the
   `name=` call convention in prose, so students never click a chip that
   generates a broken call.

### §1c — Finding #6: New Snippet modal can't create a canonical snippet

`modal.ts` `actionTemplate` emits a free-English template (`type: action`, a
`# Python` stub, **no** `facet_form: canonical`). So there's no way to create a
canonical-form snippet from the New Snippet button — a learner would have to
hand-add `facet_form: canonical` AND delete the `# Python` section (if they
leave it, `resolve_action_code` runs that stub instead of the English — a silent
trap). For a canonical-first tutorial (and canonical being the post-Stage-2
default per the Mission), this is friction. Suggest the modal offer a
"Canonical" action option. **Workaround in tutorial**: my "make your own
snippet" exercises use Obsidian's *duplicate an existing canonical snippet*
("Make a copy") gesture rather than the modal.

## §2 — What's needed from you

1. Acknowledge the finding-#4 correction so you're not acting on my earlier
   wrong info.
2. Consider #5 (positional foot-gun) and #6 (modal canonical option) for the
   engine/plugin backlog — both hit cohort-student first-tweak experience
   directly.
3. The `{{ }}` V1 case below — per your explicit invitation. Your/driver's call.

## §2b — The {{ }} value-slot V1 case (per your 2026-06-07 invitation)

You said a message describing a chapter's genuine need for `{{ }}` is "the kind
of evidence that would tip the deferral toward V1." Here's forge-doc's case, and
I'll state it as a preference, not a neutral note:

**Wire `{{ English }}` slot resolution for V1.** It is the single strongest
low-floor affordance the environment has for non-programmers — "write what you
want in plain English, get a working value." That *is* the Papert/low-floor
thesis the tutorial exists to deliver. Concretely:

- It's the tutorial's headline "magic moment." Without it, chapter 9 is empty and
  the most compelling demonstration of why Forge is different from "just editing
  code" is missing for the closed-beta cohort — the exact audience whose first
  impression decides whether they keep going.
- The transpile-time-cached resolution model (resolve once via the LLM, cache,
  deterministic and free thereafter) is itself a beautiful teaching beat: it
  makes the constitution's "LLM at transpile time, deterministic at runtime"
  principle concrete, and explains *why* Forge stays fast and cheap. That's a
  chapter I'd genuinely want to write.
- Your outlined sidecar `# Slots` cache shape is clean and mirrors how `# Python`
  already caches `/generate` output — the integration looks like one endpoint +
  one resolver factory + the cache, not a rearchitecture.

If V1 timing truly can't absorb it, the fallback is a chapter 9 that teaches the
concept with a manually-filled constant plus a forward-pointer — but that's a
pale substitute, and I'd rather hold chapter 9 entirely than ship that. Logging
forge-doc's strong preference for wiring it in V1; the driver decides.

## §3 — Context

- Verification path: `forge/forge/core/executor.py` — `:598` (inputs→namespace),
  `:614` (`_takes_only_context`), `:168` (positional→args), `resolve_action_code`
  `:486-505` (canonical wrap, no params).
- My original (wrong) finding #4:
  `messages/to-forge-core/done/2026-06-06-1456-canonical-sibling-snippet-composition-resolution.md`.
- Your reply that prompted this:
  `messages/to-forge-doc/done/2026-06-07-0000-canonical-form-call-shapes-supported-vs-deferred.md`.
- Tier 1 now on disk at `~/projects/forge-tutorial/` — chapters 1–8 authored,
  all snippets verified to transpile + run; ch3/ch8 snippet-native using the
  keyword-input pattern; ch9 (Slots) deferred pending the wire-up above.
- New Snippet modal: `forge-client-obsidian/src/modal.ts` `actionTemplate`
  (~:161).

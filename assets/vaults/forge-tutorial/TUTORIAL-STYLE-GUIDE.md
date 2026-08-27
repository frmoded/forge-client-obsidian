# Forge Tutorial — Writing Guidelines

Living document. Every principle here was learned from a real defect or a real
piece of driver feedback in this vault, not derived in the abstract — each one
cites where it came from so a future edit can check whether the citation still
holds before treating the principle as settled. Audience: smart people. Write
to them as such; it will make them more so.

## Core principles

**1. A chapter may contain nothing the learner can't see through.** Given what
chapters `1..N-1` already taught, plus the ONE new idea this chapter exists to
teach, the learner should be able to explain every line in front of them.
Anything else — an unexplained construct, an implementation detail from a
future chapter, a mechanism nobody has named yet — is either cut or moved to
where it belongs.

**2. Tutorial prose never lives in a facet that is, or can become, a note's
source facet.** The Description is `/generate`'s actual input — anything
written there isn't just documentation, it's part of what a re-derivation
reads. Two concrete instances found and fixed this arc: a `**What's next:**
[[note]]` navigation line, and a `Chapter N — ` scene-setting clause opening
the sentence. Both are meta-prose about the TUTORIAL, not about what the note
DOES, and both were feeding a model that's supposed to reconstruct only the
latter. If you're tempted to write something a learner needs but the engine
doesn't, it belongs in the companion note (`Variables.md`, `Functions.md`,
etc.), never in an action note's Description.

**3. Say a mechanic once.** If a companion note explains something as a
bulleted walkthrough, don't re-explain the same one or two ideas in a second
list immediately after. (Found in `Variables.md`: "it does three things"
followed by "two new ideas, both small" — both lists taught the same two
constructs.) Pick the framing that's closest to what the learner is actually
looking at, and only that one.

**4. Implementation asides don't interrupt a concept.** A parenthetical about
how the engine keeps `inputs:` frontmatter in sync is true and possibly
interesting, but it's not what the learner is trying to understand at the
moment they're learning what a function is. Cut it, or move it to wherever the
tutorial actually teaches that mechanism — but don't strand it "for later" if
no later chapter exists to receive it. (Found in `Functions.md`.)

**5. Navigation footers: the minimum set, no duplication.** `**What's next:**`
and `**Order in this chapter:**` say the same thing when a chapter has more
than one action note — the former is just the first entry of the latter.
Use `Order in this chapter` (or `What's next` alone, for a single-note
chapter) — never both.

**6. Pin every literal that's load-bearing for the lesson.** This is the
sharpest one, and it cost real content drift to learn. If a Description
doesn't name the specific value a chapter's example depends on — a default
argument, an exact word, a particular name — a hammer re-roll is free to
invent a different one, and it will, silently, on every regeneration. Three
live instances this arc: `excited`'s `"hooray"` default vanished entirely on
re-derivation; `function_inputs`'s `"Ada"` / `"Lovelace"` became `"Jane"` /
`"Doe"` and broke an actual engine test that pins the original values;
`cheer`'s call argument flipped back and forth between two candidate words
across several re-derivations. **If the specific word IS the lesson, write a
Description that names it outright** rather than one that only describes the
shape of the computation. A Description that says "returns the word with
excitement" is a spec for *any* excited-returning function; a Description that
says 'returns "hooray!" when given "hooray"' is a spec for *this* one, and
survives regeneration.

**A fourth failure mode is worse than substitution: the default can vanish
outright.** An unpinned re-roll of `excited` didn't just pick a different
word — it dropped the default argument entirely, and the regenerated note
stopped running: `SnippetExecError: compute() missing 1 required positional
argument: 'word'`. An underdetermined Description doesn't only risk the wrong
answer; it risks no note at all. (Confirmed 2026-08-27, drain `0340`'s
control run.)

**Limit: pinning defends the value, not the shape of the call.** `cheer.md`
needed to demonstrate a default flowing through an argument-less call, not
just produce the right string. Neither a bare Description nor one that says
"with no arguments" outright stopped a hammer re-roll from reintroducing an
explicit argument — both re-derived to `Call [[excited]] with word="hooray"`.
Pinning still keeps the *value* correct (`"hooray!"`), so a value-only test
stays green even as the call's shape drifts back — but if the shape itself
is the lesson (a default flowing through, a variable used instead of
re-typed, a note called with nothing), prose cannot defend it; only a test
that asserts the Recipe's actual text can. (Confirmed 2026-08-27, drain
`0530`.)

**The limit runs in both directions, not just value-vs-shape.** Drain
`1100`'s two controls (unpinned Descriptions, live `/generate`, run before
anything shipped) showed both halves at once, each newly:

- **An unpinned Description's likeliest substitute is the note's own
  filename.** `excited_word.md`'s control returned `Return "excited".` — not
  a random wrong word, the note's own name. This is the same failure
  `cheer.md` showed in drain 2000 (`word="cheer"`), now seen a second time in
  a second chapter: a pattern, not a coincidence. Self-named notes
  (`excited_word`, `cheer`, `greeting`) are the highest-risk case, because
  the wrong answer looks plausible and even thematically correct — nothing
  about the output looks broken.
- **An unpinned Description can lose the call's shape too, not just its
  value.** `describe_it.md`'s control (`Let result = Call [[excited_word]].
  Return result.`) didn't pick a different literal — it dropped the
  `"This is " + word + "."` string-building step entirely and returned the
  callee's result raw. The earlier `cheer.md` finding showed pinning failing
  to defend a shape; this shows the *unpinned* case can also fail the shape,
  independently of the value question. Value-pinning and shape-preservation
  are two separate properties a Description can satisfy or miss in either
  combination — neither implies the other. (Confirmed 2026-08-27, drain
  `1100`, off CC message `1140`.)

**7. One idea per teaching beat.** Don't compress two new concepts into one
subsection because the chapter is running long. Give each new idea its own
"open it, run it, here's what you'll see" treatment, the same shape the
chapter used for its first idea — compressing the back half of a chapter
while the front half took its time is a real, noticeable unevenness.

**8. Protect exercises where the learner builds something.** Copy a note,
rename it, change one line, run it — that is the moment a learner does real
constructionist work rather than reading pre-built examples. Don't trim these
for length; they're doing the opposite of padding.

**9. Set expectations once, not per chapter.** If several chapters in a row
say "ignore `If`, `Otherwise`, `For each` for now — those come later," that's
a disclaimer turning into a tic. Say it plainly and fully the first time (this
chapter, chapter 2), and let later chapters reference it briefly rather than
re-render the same list.

**10. Show one real failure per major concept, don't just describe it in
prose.** Chapter 3 tells the learner that leaving off `word=` "is the most
common early mistake" but never shows the actual error. Prefer showing the
real message once over describing the mistake abstractly — a smart audience
learns faster from a real error than a paraphrase of one. (This principle
motivated [[fix_me]] in this chapter: a note that's visibly broken, with the
fix reachable using only what the chapter already taught.)

> **Cost, priced 2026-08-27 (CC message `1245`).** A broken-on-purpose note is
> not only a lesson — it is an input every vault-sweeping tool must tolerate.
> Chapter 3's [[fix_the_call]] is *syntactically* broken, a class the toolchain
> had never met (chapter 2's [[fix_me]] is only *semantically* broken and parses
> fine), and it took `release.sh`'s inputs-frontmatter drift check down with an
> unhandled `ParseError` whose traceback did not even name the offending file.
> Fixed in `forge/scripts/stamp_inputs.py`. **Before adding the next
> principle-10 note, re-run the sweeper audit** — as of 2026-08-27 that script
> is the only vault-sweeping tool that parses Recipes at all, but that is a
> measurement with a date on it, not a standing fact.
>
> **Naming constraint, same source.** The registry indexes action notes by
> basename across the WHOLE vault; chapter folders are not namespaces. Chapter
> 3's note could not be called `fix_me.md` — `02-variables/fix_me.md` shadowed
> it outright ("First-match wins"). It is `fix_the_call.md`. Check any new note
> name vault-wide, never chapter-wide.

**11. `## Inputs` is structural data, not prose — necessary, but not verbose.**
The engine parses this heading and its dash-lines (v2-spec §4.7) to build the
run panel: parameter names, defaults, and dropdown-vs-text-box rendering. It
cannot be replaced by an implicit mention in the Description. What CAN shrink
is the per-line doc text — don't restate what the Description already said.

**12. Name a construct the moment it appears, even if it isn't "taught" yet.**
If a Recipe shown mid-chapter uses something the tutorial hasn't formally
introduced (an `If`/`Otherwise` branch appearing before the Conditionals
chapter, say), say so in one line rather than leaving the reader to notice the
gap themselves. A brief "you're seeing `X` here for the first time — chapter N
covers it properly" costs one sentence and prevents a silent inconsistency.

## Known gaps (honest, not yet fixed)

- The "Chapter N — " scene-setting prefix (principle 2) is stripped from
  chapters 1-3's action notes, `mood.md`, and — as of drain `1100`,
  2026-08-27 — `04-composition/describe_it.md` and `excited_word.md`. Only
  the orphan `describe_forge.md` still carries it, and that file is slated
  for deletion (see below), not a prefix fix.
- Principle 6 (pin the literal) is **resolved** for `excited.md`,
  `function_inputs.md`, `hello_world.md`, `describe_it.md`, and
  `excited_word.md` (all verified against live `/generate` controls — see
  the "Limit" note below principle 6, including its 2026-08-27 addendum on
  drain `1100`'s two controls). `hello_world.md` stays deliberately
  unstamped (no hash-lineage frontmatter), matching `weather.md` /
  `countdown.md`; the others carry real hash-lineage.
- Principle 9 (set expectations once) has been applied to chapters 1-4 as of
  2026-08-27 — chapter 1 (`Hello.md`) carries the full statement, chapters 3
  and 4 each carry a brief "still ignoring X, Y, Z, as in chapter 1" pointer.
- Principle 5 (single nav-footer form) had a live double-footer violation in
  `04-composition/Composition.md` (`What's next` AND `Order in this chapter`
  together) — fixed 2026-08-27.
- Principle 10 (show one real failure, chapter 3's missing-`word=` mistake) is
  **resolved** — `03-functions/fix_the_call.md` shipped 2026-08-27 (`6ba8e6a`),
  named `fix_the_call` rather than `fix_me` because of the vault-wide basename
  collision noted under principle 10 above. It cost a `release.sh` preflight
  fix along the way; see the same note.
- `02-variables/fix_me.md` has **no engine test at all** (verified 2026-08-27:
  no method in `TestActionNotesExec` contains the string `fix_me`). It is one
  of the two notes currently keeping `test_every_action_note_has_a_test` red;
  the other is the driver's own scratch file `test_random.md`. Note that
  untracking `test_random.md` from git does NOT clear that red — the gate walks
  the filesystem, not the index — so only removing the file from the vault
  does.
- `04-composition/describe_forge.md` is an orphan file — never referenced by
  `Composition.md`, carries the same prefix/literal defects `describe_it.md`
  had plus an unused, slightly different Recipe, and has no hash-lineage
  frontmatter at all. Driver adjudicated 2026-08-27: delete it. Deletion is
  blocked in the sandbox (a recurring `.git/index.lock` permission issue,
  not a content question) — the file still exists on disk pending a
  driver-run command. **Amended 2026-08-27:** the deletion is NOT a one-file
  `git rm` — `describe_forge` has a live engine test
  (`test_tutorial_exec_smoke.py:154 test_describe_forge`, asserting
  `"Forge is wonderful."`) and a frozen edge snapshot at
  `.forge/edges/authoring/describe_forge/`. Deleting only the note turns the
  engine suite red. All three go together.
- `04-composition/describe_it.md` stamps `python_hash` AND
  `python_derived_from_recipe_hash` as the SHA-256 of the empty string while
  the file has no `# Python` section and a real, different `recipe_hash` —
  the same dishonest-stamp shape drain `2200` fixed on `function_inputs.md`,
  found here by CC (drain `1100` FEEDBACK §5, message `1140` §4) and
  deliberately left unfixed at the time as out-of-scope. One-line fix,
  drained to CC separately, with a sweep for further instances.
  **Resolved 2026-08-27** (`76c7b69`, `73c067e`): the Python facet was
  regenerated and the stamps are now honest — verified at HEAD,
  `recipe_derived_from_description_hash == description_hash` and
  `python_derived_from_recipe_hash == recipe_hash`, with `source_facet:
  description` intact. The sweep found exactly one further instance, both now
  fixed; CC withdrew its own "systematic rather than two accidents" guess
  (message `1245` §5) rather than let it harden into a premise. Two accidents
  it was.
- Chapters 5-9 have not been read against this guide at all.

## Worked example: Chapter 2 (Variables)

As of this writing, `02-variables/Variables.md`, `02-variables/greeting.md`,
and `02-variables/fix_me.md` are the current best application of the
principles above. Read them directly rather than trusting a copy pasted here
going stale — this document points at the source, it doesn't duplicate it.

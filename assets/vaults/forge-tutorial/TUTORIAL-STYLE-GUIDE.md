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
  `mood.md` only; 12 other action notes across chapters 2-9 still carry it,
  4 of them currently blocked on uncommitted working-tree drift.
- Principle 6 (pin the literal) has not yet been applied to `excited.md` or
  `function_inputs.md` — both are live candidates, pending driver adjudication.
- Principle 9 (set expectations once) has been applied retroactively to
  chapter 2 only; chapter 3 still repeats the "ignore X, Y, Z" disclaimer in
  full. Not yet revised.
- Chapters 4 and onward have not been read against this guide at all.

## Worked example: Chapter 2 (Variables)

As of this writing, `02-variables/Variables.md`, `02-variables/greeting.md`,
and `02-variables/fix_me.md` are the current best application of the
principles above. Read them directly rather than trusting a copy pasted here
going stale — this document points at the source, it doesn't duplicate it.

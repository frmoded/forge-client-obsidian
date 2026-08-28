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

> **A real engine gap, found 2026-08-27 (drain `1620`): `## Inputs` is
> hashed but never sent.** Two components disagree on where the Description
> facet ends. The service's own extractor (`executor.py:894`) breaks on any
> line starting with `#`, so the `## Inputs` heading terminates what
> `/generate` actually receives. The plugin's extractor (`v2-note-core.ts`
> `_extractH1Section`) breaks only on the next H1, so `## Inputs` sits
> INSIDE `description_hash`. Consequence: editing `## Inputs` invalidates
> `description_hash` and every `*_derived_from_*` stamp hanging off it,
> while changing nothing about what the LLM actually sees — all cost, zero
> principle-6 protection. **Do not pin a load-bearing value inside
> `## Inputs` expecting it to defend against a hammer re-roll — it does
> not.** Only text inside the `# Description` heading itself (before any
> H2) is read by `/generate`. This is a live engine defect (two components
> should agree on facet boundaries) recommended for its own investigation
> drain, not yet queued as of this writing.

**12. Name a construct the moment it appears, even if it isn't "taught" yet.**
If a Recipe shown mid-chapter uses something the tutorial hasn't formally
introduced (an `If`/`Otherwise` branch appearing before the Conditionals
chapter, say), say so in one line rather than leaving the reader to notice the
gap themselves. A brief "you're seeing `X` here for the first time — chapter N
covers it properly" costs one sentence and prevents a silent inconsistency.

## Known gaps (honest, not yet fixed)

- The "Chapter N — " scene-setting prefix (principle 2) is stripped from
  chapters 1-3's action notes, `mood.md`, and — as of drain `1100`,
  2026-08-27 — `04-composition/describe_it.md` and `excited_word.md`. The
  orphan `describe_forge.md`, which still carried it, was deleted 2026-08-27
  rather than fixed (see below) — the prefix gap is fully resolved.
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
  no method in `TestActionNotesExec` contains the string `fix_me`). It is the
  one remaining note keeping `test_every_action_note_has_a_test` red — a
  decision, not a fix: whether it should be exempted, or gain coverage the
  way `fix_the_call.md` did. The driver's own scratch file `test_random.md`
  (the other note keeping that gate red) is now deleted from the vault
  entirely, per driver instruction 2026-08-27 — untracking it from git alone
  had NOT cleared the red (the gate walks the filesystem, not the index);
  deleting it did.
- `04-composition/describe_forge.md` — the orphan file, never referenced by
  `Composition.md` — is **fully removed** as of 2026-08-27. Driver
  adjudicated deletion (`dfdc6d4`); the first pass only removed the vault
  note and missed that it had a live engine test
  (`test_tutorial_exec_smoke.py:154`, asserting `"Forge is wonderful."`), a
  frozen edge snapshot (`.forge/edges/authoring/describe_forge/`), and a
  synced copy already sitting in the bundled release mirror. A follow-up
  drain (`1300`, `severity: high`) removed the dead test and the edge
  snapshot and re-ran the mirror sync — proven red first (TDD applies to
  removals too), confirmed clean after (`pytest` 1284→1283, one test fewer
  and one failure fewer, nothing previously-passing moved). Lesson worth
  keeping: deleting a vault file is not finished when the file is gone —
  it's finished when the bundled mirror syncs, or the deleted note ships
  to cohort installs anyway.
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
- Chapters 5-9 audited against this guide 2026-08-27 (two parallel reads: ch5-7,
  ch8-9). Findings, split by what was fixed directly vs. what needs a CC drain
  (hash-tracked action/data notes go through CC, per this session's standing
  practice — even unstamped ones, for consistency):
  - **Fixed directly (companion notes, no hash concerns):** `06-loops/Loops.md`
    had a real factual error, not just a style violation — it taught list
    literals with angle brackets (`<3, 2, 1>`) in three places, while every
    actual note in the vault (`countdown.md`, `colors.md`) uses square brackets
    (`[3, 2, 1]`); corrected all three. Also trimmed a principle-3 repeat (the
    `Return`-vs-`[[print]]` explanation was stated in full, then restated
    almost identically as a "rule of thumb" one paragraph later). `07-data/Data.md`
    had a principle-5 double footer (`What's next` + `Order in this chapter`
    together) and was the only chapter missing an `After this chapter` pointer
    entirely — fixed both, pointing on to `[[Recursion]]`. `08-recursion/Recursion.md`
    had a three-line footer (`What's next` + `Order in this chapter` +
    `After this chapter`, one line too many) and two narration/code mismatches:
    prose said "Otherwise it returns…" but `factorial.md`'s actual Recipe has no
    `Otherwise` keyword at all — a bare If-block-then-unconditional-Return
    idiom — reworded to "If that's not true yet…"; and the Palette-focus
    paragraph restated the base-case warning a second time while also
    misquoting the guard as `If n < 2` (the real Recipe says `If n <= 1`) —
    cut the restatement rather than just fix the quote, since it was
    redundant either way. `09-slots/Slots.md` quoted its Recipe line as
    `{{an interesting fact about octopuses}}` when `octopus_fact.md`'s actual
    Recipe reads `{{a random fun fact about octopuses}}` — corrected the quote
    to match. Also simplified a stranded implementation aside ("hexa-state
    visibility contract," with a forward-reference to the plugin's `INSTALL.md`)
    into plain tutorial language — chapter 9 is the tutorial's last chapter, so
    a forward reference here has nowhere to land (principle 4).
  - **Needs a CC drain (hash-tracked or vault-note edits, not hand-edited here):**
    `05-conditionals/weather.md` and `06-loops/countdown.md` still carry the
    "Chapter N — " prefix (principle 2); both are deliberately unstamped, so
    this is low-urgency but should still go through CC for the same reason
    `hello_world.md`'s prefix strip did. `07-data/colors.md` and
    `07-data/show_colors.md` carry a "Chapter 7 — " prefix too.
    `07-data/show_colors.md` is the more urgent of the two: it carries REAL
    hash-lineage (a live `/generate` input) and its Description is pure shape
    ("Reads a list from a data note and walks through it") — never names
    `[[colors]]` or the actual output (`red`/`green`/`blue`) — a live
    principle-6 risk, same shape as the `excited`/`function_inputs` findings
    above. `08-recursion/factorial.md` has the same live principle-6 risk, and
    it is no longer hypothetical: drain `1620` MEASURED it. Two live `/generate`
    runs differing only in Description text gave `Input n: int = 1.` from the
    shipped wording and `Input n: int = 5.` from a wording that names the worked
    example — so an unpinned `n=5` does not merely drift, it **collapses onto
    the base case**, turning chapter 8's `5! = 120` into `1! = 1`. Pin it in the
    `# Description` prose ONLY; per principle 11's engine-gap note, pinning in
    `## Inputs` costs lineage and buys nothing.
    `09-slots/octopus_fact.md` carries the "Chapter 9 — " prefix AND generic
    engine-mechanism prose in its Description instead of naming what it
    actually computes (an extreme principle-6 violation, doesn't even say
    "octopus fact"). **Two further claims made in the original Iteration 88/89
    audit were REFUTED by drain `1630`'s measurement, and are corrected here
    rather than quietly dropped — both were forge-core's errors, and the note
    was wrongly called "the worst finding across all nine chapters":**
    (a) *"its `# Python` facet is broken (`return None`)"* — it is not. The stub
    is never reached: `resolve_action_code` raises `SlotCacheMissError` first,
    which is the DESIGNED first-run path (no `edit_mode: python`, `source_facet`
    is `description`, and the note has no `english_hash` so there is no cache
    hit). The plugin catches the 409, calls `/resolve-slot`, and writes the
    resolved Python back. The demo works. The real and much smaller defect was
    that `Slots.md` told the learner to open the note WITHOUT first running it,
    so the pre-run stub contradicted one instruction — fixed at `0e651f7`.
    (b) *"hash-lineage is incomplete — the same dishonest-stamp class as
    `describe_it.md`"* — it is the opposite. `v11-3-backfill-core.ts` (CW-1500-B)
    deliberately LEAVES `python_derived_from_recipe_hash` absent in the two-hop
    Description-canonical case, because seeding it would render "in sync" for a
    derivation that never happened. `describe_it.md`'s bug was fields PRESENT
    WITH WRONG VALUES; this note omits fields it cannot back, which is the same
    honesty principle drain `1700` shipped. **Do not add those fields until the
    Python facet holds a genuinely derived value.** CC drains for all of
    the above posted 2026-08-27 (Loop mode charter, chapters 5-9 polish).
- **Lineage-on-a-Description-edit, resolved 2026-08-27 (drain `2100`,
  shipped `df61f77`):** `show_colors.md`, `factorial.md`, and `octopus_fact.md`
  all hit the same gate — a live `/generate` re-derivation from the corrected
  Description reproduces a Recipe that is semantically equivalent to the
  shipped one but not always byte-identical (variable naming and
  shorthand-vs-explicit call syntax can differ). Resolved by re-reading what
  the stamp actually asserts (`facet-state-core.ts:6-11,89`): it answers
  ONE question — "has the Description changed since the Recipe was last
  forged?" — by comparing a stored snapshot to the current body. It never
  claimed byte-reproducibility, and could not: the generator is an LLM.
  **The correct action on a Description edit is therefore the NULL action —
  do not write to any `*_derived_from_*` field, for any of the three notes.**
  Verified shipped: `git show df61f77` touches only each note's Description
  line; every lineage stamp is byte-unchanged. The notes now honestly render
  "Recipe out of date" until a real re-forge happens, which is true.
- **Vault-wide shorthand-non-reproducibility hypothesis — MEASURED AND
  CLOSED, 2026-08-27 (drain `2100`):** three notes (`show_colors.md`,
  `factorial.md`, `octopus_fact.md`) showed `/generate`
  emitting the explicit call form (`Call [[note]] with arg=value`) where the
  vault's own hand-authored Recipes consistently use the shorthand
  (`[[note]] value.`), raising the worry that every Description-canonical
  note with a chip call might be in this position. A vault-wide grep for
  `source_facet: description` notes using the shorthand form found exactly
  ONE (`show_colors.md`); `countdown.md` also uses the shorthand but is
  unstamped, so it isn't in the population. The three original sightings had
  three different causes (shorthand-vs-explicit, a `Let`-decomposition, a
  different slot text) — ordinary LLM non-determinism, not one mechanism, not
  systemic. **No vault-scale audit needed; do not open one.**
- `09-slots/Slots.md`'s closing footer (`**After this chapter:** none — that's
  the whole tutorial. Nicely done.`) is a good example worth keeping as a
  reference: correctly identifies itself as the terminal chapter, no phantom
  pointer, no double footer. Noted so a future edit doesn't "fix" it.
- **"Unattributed" vault mutations — CAUSE IDENTIFIED, 2026-08-27.** Two
  stashes sit in `forge-tutorial` recording working-tree note rewrites with no
  agent session behind them (`stash@{1}` on `describe_it.md`, `stash@{0}` on
  `factorial.md`), and CC reported them as an unexplained pattern. Measured:
  both carry the SAME signature — a Recipe re-decomposed into intermediate
  `Let` variables (the exact shape `/generate` produces), plus
  `python_derived_from_source_hash` added where it was absent, plus — the
  decisive one — `show_factorial.md` gaining a complete frontmatter hash block
  AND a `def compute(context): return None` stub in the same pass. A hammer
  press on one note cannot stamp a *different, unstamped* note; the v11-3
  backfill can, and does, on plugin load. This vault is itself an Obsidian
  vault with the plugin installed (`.obsidian/plugins/forge-client-obsidian`,
  v0.2.380), so a live Obsidian session on `~/projects/forge-tutorial` writes
  into the same working tree two agents commit from. Not a stray keybinding,
  not a background test. The `factorial.md` symptom specifically (`n=5` →
  `n=1`) is a faithful re-derivation from the OLD unpinned Description — the
  defect drain `1620`/`2100` measured and fixed, not a new one; with `n=5` now
  pinned it should not recur. **Both stashes are discard candidates** (each
  would reintroduce something already repaired, and `show_factorial`'s half
  would re-add the empty-hash stub class drain `1210` removed), but dropping a
  stash is destructive and driver-gated.
- **A blanket `git stash push -u` in a shared working tree captures another
  agent's in-flight work.** `stash@{0}`'s third file is forge-core's own
  uncommitted `TUTORIAL-STYLE-GUIDE.md` edits (81 lines), swept in alongside
  the re-roll CC meant to set aside. Nothing was lost — the identical diffstat
  was re-written and is committed here — but a stash in this repo must be
  path-scoped to the files the stashing agent is actually protecting.

## Worked example: Chapter 2 (Variables)

As of this writing, `02-variables/Variables.md`, `02-variables/greeting.md`,
and `02-variables/fix_me.md` are the current best application of the
principles above. Read them directly rather than trusting a copy pasted here
going stale — this document points at the source, it doesn't duplicate it.

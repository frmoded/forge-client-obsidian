A **time signature** is two numbers stacked on top of each other doing all the talking: top for how many, bottom for of what. Today almost everything defaults to 4/4, which is popular enough to have its own nickname — **common time** — and its own shorthand symbol, a plain "C," standing in for the two digits on the staff.

Here's one **measure**, four **quarter notes**, the plain **beat** made visible — this is what a 4/4 **time signature** actually buys you, common-time "C" and all:

![[percussion/notation/resources/images/rhythm_beat_quarters.svg]]

The full doubling ladder, one note at a time, all of it anchored to that same 4/4 measure: a **whole note** fills the whole thing, a **half note** exactly half, a **quarter note** a quarter, and so on down. A **whole note**:

![[percussion/notation/resources/images/rhythm_note_whole.svg]]

A **half note**:

![[percussion/notation/resources/images/rhythm_note_half.svg]]

An **eighth note** — and halve the quarter-note measure above, and the same bar holds twice as many, beamed in groups of four so the eye can still find the beat:

![[percussion/notation/resources/images/rhythm_beat_eighths.svg]]

A **sixteenth note**:

![[percussion/notation/resources/images/rhythm_note_sixteenth.svg]]

A **32nd note**:

![[percussion/notation/resources/images/rhythm_note_32nd.svg]]

A **64th note** — the ladder runs out of easy names before it runs out of flags:

![[percussion/notation/resources/images/rhythm_note_64th.svg]]

There's also a rarer value going the *other* way, twice as long as a whole note: the **double whole note**, a.k.a. the **breve**, drawn as a hollow notehead with a vertical bracket on each side, spilling clean across two measures because no single bar can hold it:

![[percussion/notation/resources/images/rhythm_note_breve.svg]]

**Rests** are that same ladder, just quiet about it — one gap in this vault's scores: the renderer behind these images takes pitches, not silence, so a rest can't get an honest picture here the way every sounded value above just did.

**Dots and ties** exist to solve one specific gap: a whole note lasts four beats, a half note lasts two, and there's simply no plain notehead for three. A **tie** patches that by linking two notes of the *same* pitch into one longer duration — five quarters' worth of "C," which doesn't fit in one measure, so it has to tie across the bar line to get there:

![[percussion/notation/resources/images/rhythm_note_tie.svg]]

A **slur** is the trap: it is drawn as *the exact same curved line* as a tie, over or under a group of notes, but it means something completely different — connected, legato phrasing across *different* pitches, not "these two are really one note." Same mark on the page, opposite job, and that's the entire source of the confusion. (No picture for this one: a slur needs two different pitches plus an explicit phrasing mark the renderer doesn't expose.)

A **dot** adds half the note's own value back onto itself — a quarter note plus an eighth, written as one dotted quarter, the standard way to notate three beats' worth of duration without a tie:

![[percussion/notation/resources/images/rhythm_note_dot.svg]]

**Double-dotted notes** stack a second dot worth a quarter of the original — diminishing returns, like everything else that compounds:

![[percussion/notation/resources/images/rhythm_note_doubledot.svg]]

Underneath all of it sits the **beat**, "the basic pulse underlying measured music and thus the unit by which musical time is reckoned" — a definition so basic that even the *New Grove Dictionary of Jazz* just restates the word twice, since **pulse** means the same thing. How fast that pulse moves is the **tempo**: a number in beats per minute (60bpm is one beat a second, easy math), or one of the old Italian words — Allegro, Andante, Adagio — sometimes trailed by "**M.M.**" for Maelzel's Metronome, in case anyone doubted the number was literal.

**Meter** is how many beats live in a **measure** (the **bar**, pictured above) and how those beats split, and it's named in two independent parts. First, the headcount: **duple**, **triple**, **quadruple** meter for two, three, or four beats a bar. Second, the subdivision: **simple meter** splits each beat into two, **compound meter** splits it into three. Say both together, division before headcount — "simple triple," "compound duple" — and you've fully named a meter. On the page, simple meters keep an honest top number: 2, 3, or 4. Compound meters cheat by counting the subdivisions instead of the beats, so the top number jumps to 6, 9, or 12, and the bottom number quietly stops meaning "note value" and starts meaning "the division of a beat whose true value is a dotted note." None of these six get a picture: the renderer always assumes 4/4 and never draws a different time signature, so a genuine 2/4, 3/4, or 6/8 measure isn't something it can actually show, only fake.

And when a beat gets greedy, a **tuplet** crams notes where they don't belong. A quarter note normally splits into two eighths or four sixteenths; force three eighths into that same space instead and you've got a **triplet**. Keep pushing and you get a **quintuplet** (five), a **sextuplet** (six), a **septuplet** (seven) — all still squeezed into one ordinary beat. The page's own advice here has an edge to it: if a piece keeps *wanting* triplets, that's usually a sign it should have been written in a compound meter (6/8, 9/8, 12/8) to begin with, not a reason to keep drawing brackets. Compound meter runs the trick backward, because its "beat" is already a dotted note with room for three: a **duplet** squeezes two notes into that space instead of the usual three, a **quadruplet** squeezes four. Tried to picture every one of these too, and pulled them back out: the renderer gets the *durations* exactly right but never draws the bracket-and-number that's the entire visual point of a tuplet, so the result looked like plain, oddly-spaced notes instead — wrong enough to mislead, not just incomplete.

## Sources

MT21C §4.1–4.5 Basics of Rhythm.

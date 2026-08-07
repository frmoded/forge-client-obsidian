# Slash Chord

A **slash chord** gives explicit, independent control of the bass, separate from the chord above it: `Fm/C` means "play an F minor chord, but put C in the bass" — even though C isn't a note in F minor at all. The chord to the left of the slash is unchanged; the note to the right of the slash is just what's underneath.

Run [[experiments/slash_chord]] with `chord_tonic="F4"`, `quality="minor"`, `bass="C4"` to hear Fm/C directly — the F minor triad (F, Ab, C) sitting over a C an octave below everything else. Now hold `bass="C4"` fixed and change `chord_tonic`/`quality` to build a few different triads over the same bass note — that's the exact mechanism behind a "one pedal, shifting triads" effect: the bass stays put while the chord above it moves.

Don't confuse this with [[inversion]], which also changes the bass note — but only ever to another note that's already *in* the chord. A slash chord's bass can be anything.

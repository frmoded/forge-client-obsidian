# Voicing

A **voicing** is the concrete realization of an abstract chord: which octave each note sits in, what order they're stacked, which notes get doubled, which get left out entirely. "C major triad" names three pitch classes — C, E, and G — but there are infinitely many ways to actually voice it: close together, spread across three octaves, with the root doubled an octave up, missing the fifth entirely. This is where the actual sound-design of harmony happens — the same chord can sound thin or lush, dark or bright, purely from how it's voiced.

Run [[experiments/chord_inversions]] and compare `inversion=0` against `inversion=1` and `inversion=2` — each is a different voicing of the identical C major triad, just with the notes reordered and the wrapped ones pushed up an octave. Then compare that against [[experiments/slash_chord]], which voices a triad with an independently-chosen bass note underneath — a voicing move [[inversion]] alone can't reach, since the bass isn't even required to be a chord tone.

Voicing sits downstream of everything else in [[chord]]: you first decide root, quality, and any extensions — then voicing is how you actually lay those notes out.

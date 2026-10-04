# Voicing

A **voicing** is the concrete realization of an abstract chord: which octave each note sits in, what order they're stacked, which notes get doubled, which get left out entirely. "C major triad" names three pitch classes — C, E, and G — but there are infinitely many ways to actually voice it: close together, spread across three octaves, with the root doubled an octave up, missing the fifth entirely. This is where the actual sound-design of harmony happens — the same chord can sound thin or lush, dark or bright, purely from how it's voiced.

Run [[chord_inversions]] and compare `inversion=0` against `inversion=1` and `inversion=2` — each is a different voicing of the identical C major triad, just with the notes reordered and the wrapped ones pushed up an octave. Then compare that against [[slash_chord]], which voices a triad with an independently-chosen bass note underneath — a voicing move [[inversion]] alone can't reach, since the bass isn't even required to be a chord tone.

Voicing sits downstream of everything else in [[chord]]: you first decide root, quality, and any extensions — then voicing is how you actually lay those notes out.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="inversion" href="inversion" style="color:#1963D1;">inversion</a></span>
<span>&uarr; <a class="internal-link" data-href="construction" href="construction" style="color:#1963D1;">construction</a></span>
</div>
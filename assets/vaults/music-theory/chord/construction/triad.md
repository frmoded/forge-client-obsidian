# Triad

A **triad** is defined by a **scale and a note in that scale**: pick any scale and any note of it, call that note the root, skip a note, take the next, skip another, take the next, and you always get a triad. In C major that gives C, E and G: counting C as 1, those are the 1st, 3rd and 5th notes of the scale (C D E F G), which is why you will hear them called degrees 1, 3 and 5. It is the atom everything else in [[chord]] extends: sevenths add a fourth note, extensions add more, inversions reorder it, voicings dress it up.

Try it: pick a scale, then click any note of the scale on the staff. The three notes it picks (the root, the third and the fifth) appear on the keyboard and on their own staff.

```forge-scale
mode: triad
tonic: C
scale: major
show: piano, staff
```

## Reading the Roman numerals

The Roman numerals I ii iii IV V vi vii° name the seven triads you can build on a major scale. The numeral is the degree of the scale that the triad's root sits on: I is built on the 1st note, ii on the 2nd, iii on the 3rd, and so on up to vii° on the 7th. A capital numeral means a major triad, a small one a minor triad, a small one with a degree sign ° a diminished triad, and a capital with + an augmented one. So in C major the seven triads are C major (I), D minor (ii), E minor (iii), F major (IV), G major (V), A minor (vi) and B diminished (vii°). [[diatonic_chord]] has the full list.

Are any three notes a chord? Sure. Sound them together and call it that. A **triad** is the useful special case: three notes stacked in thirds, which is how Western harmony has built most of its chords for centuries. That method has a name, **tertian harmony**, and it isn't the only game in town. Stack in fourths and you get quartal harmony; pack notes a second apart and you get secundal harmony. Both are real chords, and neither is a triad.

Here is the C major scale. Counting C as 1, the 1st, 3rd and 5th notes are C, E and G: the triad.

![[scales/resources/audio/c_major_scale.mp3]]

Stack a third on a note, then another third on top of that, and you have a triad. Press Run on [[build_triad]] with `tonic="C4"` and `quality="major"` to hear it — then change the tonic and listen to the same shape land somewhere else.

Not every third is the same size. A major third is 4 half steps (a half step is the distance from one piano key to the very next one, black keys included) and a minor third is 3. Stack a major third and then a minor third and you get a major triad (C E G); stack a minor third and then a major third and you get a minor triad (C E♭ G). Two minor thirds make a diminished triad and two major thirds an augmented one; [[chord_quality]] takes each in turn. The bottom note of the stack is the [[root]], though as [[inversion]] shows, the root is not always the lowest note you hear.

Once you can build a triad, [[seventh_chord|seventh chords]] are one more stacked third away.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&uarr; <a class="internal-link" data-href="construction" href="construction" style="color:#1963D1;">construction</a></span>
<span><a class="internal-link" data-href="chord_quality" href="chord_quality" style="color:#1963D1;">chord_quality</a> &rarr;</span>
</div>
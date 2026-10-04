## How it's computed

Stretch a string by exactly 3/2, fold the result back into one octave by halving as needed, and repeat. Do that twelve times — the full derivation lives in [[why_12_notes]] — and all twelve pitch classes just... show up. Nobody designed this. The ratio did. Kind of eerie, isn't it?

## The tuning

Laid out along one octave:

![[notes/resources/images/why12_points.svg]]

Every interval here comes from exactly two moves: the 3:2 step, and the 2:1 fold. That's the whole toolbox. Thirds never get invited to the party — they just turn up as whatever four stacked fifths happen to leave behind, pure or not. Ever notice how the parts of a scale that feel most "obvious" are usually the ones nobody actually built on purpose?

Below, C3 to C4, naturals only, tuned to Pythagorean. Press **Play ascending**. Go on.

```html-embed
tuning/resources/html/piano_keyboard_pythagorean.html
280
```

## Do the good

Any two notes one step apart in the chain — C–F, F–B♭, B♭–E♭, ... all the way to D–G — lock into a perfectly pure fifth, because that ratio *is* the step. Eleven of the twelve fifths here are exactly, unapologetically right. The octaves too. Not bad for a system running on nothing but one repeated ratio.

Below, C3 and G3 start held. Play them together, then flip to Equal and play the same two keys again. Same fifth, technically. Feel the difference? One of these is the real thing; the other's a very good impression of it. That's the whole reason singers and string players, left to their own ears, keep drifting back to the pure one — nobody taught them to prefer it. They just do.

```html-embed
tuning/resources/html/piano_keyboard_pythagorean_good.html
280
```

## Do the bad

Here's the part they leave out of the brochure. Stack twelve pure fifths, feel pretty good about yourself, and the last one — the one that's supposed to bring you home — comes in wrong. Not a little wrong. Theorists dumped that leftover between G♯ and E♭ and called it the wolf fifth, because apparently even music theory needs a monster under the bed. Cute name for a real problem, right? The thirds don't escape either: stack four fifths to build one (C up to E) and it comes out wide and hot, an interval that's trying a little too hard — the exact flaw [[meantone]] eventually got invented to fix.

Below, G♯3 and D♯4 start held — that's the wolf. Play together, then flip to Equal: same two keys, different animal entirely. Pythagorean sounds like it clipped a doorframe on the way in; Equal just shrugs, because Equal sanded every interval down to the same safe, forgettable average. Worth the trade? For the subtler version, try C4, E4 and G4 instead and listen to that third practically hum.

```html-embed
tuning/resources/html/piano_keyboard_pythagorean_bad.html
280
```

## History

Legend has it Pythagoras (6th century BCE) noticed a string stopped at 2/3 of its length sounds settled against the open string, and decided that meant something. He wasn't wrong — Euclid's *Sectio Canonis* (c. 300 BCE) works the same arithmetic, cold and rigorous, three centuries later. The system ran Europe's ears for a thousand years, until its own flaws — the wolf, the wide thirds — finally caught up with it and pushed theorists toward [[meantone]], starting in the 15th–16th century. Every good idea eventually meets its own edge case. Did Pythagoras see this one coming? Almost certainly not.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&uarr; <a class="internal-link" data-href="Tuning" href="Tuning" style="color:#1963D1;">Tuning</a></span>
<span><a class="internal-link" data-href="meantone" href="meantone" style="color:#1963D1;">meantone</a> &rarr;</span>
</div>

## How it's computed

Vincenzo Galilei — lutenist, music theorist, Galileo's father, and a man with a chip on his shoulder about his own teacher — worked out a fretting rule around 1581 that needed no math beyond a straightedge: place each fret at exactly **17/18** of the remaining string length from the one before it. That's it. No irrational roots, no theory of commas, just one ratio, repeated, fret after fret. He built it arguing directly against Gioseffo Zarlino, who preferred pure, just-intonation ratios — the [[pythagorean_tuning|Pythagorean]] and [[meantone]] road. Galilei bet on something cruder and, it turns out, more durable.

See [[the_problem_with_frets]] for why this was even a fight worth having: a fret is a straight bar across every string at once, so whatever compromise it makes has to be *one* compromise, applied uniformly, whether the mathematics behind it exists yet or not.

## The tuning

17/18 ≈ 1.0588 sits astonishingly close to the true equal-tempered semitone, 2^(1/12) ≈ 1.0595 — a rational stand-in for an irrational number, arrived at decades before anyone could name what it was approximating. Below is a full six-course lute, fretted this way by default. Switch the dropdown between Rule of Eighteen and Equal and listen for the two to sound almost, but not quite, identical.

```html-embed
music_instruments/resources/html/lute_fretboard.html
380
```

## Do the good

Here's the good part, and it's a big one: Galilei didn't just claim his rule worked, he went and proved it. In 1584 he composed **24 groups of dances**, written to move through every major and minor key — the same demonstrative shape Bach's *Well-Tempered Clavier* would take on keyboard a century and a half later, and Galilei got there first, on a harder instrument. A harpsichord can be retuned between pieces. A lute, fretted once, cannot. His rule had to just *work*, from the first fret onward, in every key, or the whole argument fell apart. It didn't fall apart.

## Do the bad

The catch: 17/18 is a close approximation, not the real thing, and approximations drift. Stack twelve of them and you land about 12.5 cents flat of a true octave — small on any one fret, real by the twelfth. Worse, gut frets are one straight bar across every string, so whatever this rule gets slightly wrong, it gets wrong on all six courses simultaneously, all the time — see [[the_problem_with_frets]] for exactly how that plays out with a genuinely non-uniform system.

Players had a workaround, and it's a good one: those frets were tied gut, not soldered metal, so a lutenist could nudge one for a particular piece, or tie in an extra "micro-fret" between two standard positions to reach a pitch neither neighbor quite gave. A fixed compromise, worked around by hand, piece by piece.

## History

Bach's *Well-Tempered Clavier* (Book 1, 1722) is the famous version of this argument — 24 preludes and fugues, one pair in every key, proving a single tempered keyboard could do the job. Galilei was making essentially the same case 138 years earlier, and on the harder instrument. His rule held the fort for decades until Simon Stevin worked out equal temperament's exact irrational ratio around the turn of the 17th century — mathematically inevitable, in hindsight, but Galilei got a lute sounding convincingly even across every key first, with nothing but a straightedge and a stubborn disagreement with his own teacher.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="meantone" href="meantone" style="color:#1963D1;">meantone</a></span>
<span>&uarr; <a class="internal-link" data-href="Tuning" href="Tuning" style="color:#1963D1;">Tuning</a></span>
<span><a class="internal-link" data-href="well_temperament" href="well_temperament" style="color:#1963D1;">well_temperament</a> &rarr;</span>
</div>

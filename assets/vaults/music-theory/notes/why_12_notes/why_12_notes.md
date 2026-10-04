The Pythagoreans asked a simple question — what happens if you keep doing the same thing? — and ended up with twelve notes, and a problem.

## The question

*What happens if you do it again?*

Stop a string at two thirds of its length and it sounds a fifth above the open string: a settled, consonant interval (its frequency ratio is 3:2). That is a heck of a [[nice]] interval. So ask the natural question: what if you take the new, shorter string and shorten it by two thirds again? And again? On the [[monochord]] you can hear the first step: drag the bridge to 0.667 of the string, pluck the open string, then pluck the left segment. The open string sounds 110 Hz and the left segment 165 Hz, a ratio of 3:2.

```html-embed
music_instruments/resources/html/monochord.html
300
```

## Very short strings

*Every step is a higher note, and a much shorter string.*

Keep going, shortening each new string to two thirds of the one before, and every step sounds a fifth higher than the last. The strings get tiny fast: by the twelfth string you are below one eightieth of the original length.

<div style="
  background:#FDFCFA;
  border-radius:6px;
  padding:14px 16px;
  margin:8px 0;
">

<div style="
  font-size:15px;
  font-weight:600;
  color:#2B2B2B;
">Table 1 — Raw string lengths, in build order.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">Each step shortens the previous string to two thirds; the thirteenth string is almost too small to see.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Step</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">0</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">1</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">2</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">3</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">4</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">5</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">6</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">7</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">8</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">9</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">10</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">11</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">12</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">Length</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">1.0000</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.6667</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.4444</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.2963</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.1975</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.1317</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.0878</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.0585</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.0390</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.0260</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.0173</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.0116</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.0077</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">Note</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">C</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">G</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">D</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">A</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">E</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">B</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">F♯</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">C♯</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">G♯</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">D♯</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">A♯</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">E♯</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">B♯</td>
</tr>
</table>

</div>

There is a second piece of understanding this needs: halve a string's length and you get "the same" note — same pitch class, an octave higher. That is what makes the question answerable, because every one of these tiny strings can be folded back: double its length, and double it again as many times as it takes, until it lands between the full string and half of it, where it can be compared directly with everything else.

Sort that folded data by length, longest string first, and name each string by its pitch class, and the twelve notes lay themselves out as the chromatic scale, rising step by step — nothing was arranged to make that happen, it falls out of the ratios on its own:

<div style="
  background:#FDFCFA;
  border-radius:6px;
  padding:14px 16px;
  margin:8px 0;
">

<div style="
  font-size:15px;
  font-weight:600;
  color:#2B2B2B;
">Table 2 — Folded lengths, in rising pitch.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">The same twelve strings folded into one octave and sorted from the longest string (lowest note) to the shortest — the chromatic scale falls out on its own.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Note</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">C</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">C♯</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">D</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">D♯</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">E</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">F</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">F♯</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">G</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">G♯</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">A</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">A♯</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">B</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">Build step</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">7</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">2</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">9</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">4</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">11</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">6</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">1</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">8</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">3</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">10</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">5</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">Folded length</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">1.0000</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.9364</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.8889</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.8324</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.7901</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.7399</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.7023</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.6667</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.6243</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.5926</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.5549</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.5267</td>
</tr>
</table>

</div>

Laid out along the octave itself, with the shortest string on the right:

![[notes/resources/images/why12_points_rising.svg]]

## Almost magic

*The thirteenth string is almost the first.*

Now take one more step. The thirteenth string, folded back into the octave, has a length of 0.9865 against 1.0000 for the first. It is almost exactly the same note: B♯ by name, but very nearly C by ear. The loop nearly closes: twelve fifths up land almost exactly on seven octaves. That near-return is where the number twelve comes from — stop at twelve, and the thirteenth would only repeat the first.

## The problem, and a solution

*"Almost" is the problem: the gap can never be closed.*

The thirteenth string does not land exactly on the first, and it never can: twelve pure fifths overshoot seven octaves by a small gap, about a quarter of a semitone. That leftover is the [[pythagorean_comma]]. Every tuning system since is a different way of living with it — see the [[Tuning]] chapter.

A guitar shows the most common solution, mechanically. Each fret is a fixed division point, and pressing a string down at a fret shortens the vibrating length, exactly what a monochord's movable bridge does. But modern frets are not cut at these Pythagorean ratios: they are cut for equal temperament (see [[equal_temperament]]), so a guitar's twelve frets per octave are twelve *identical* steps, with the gap spread evenly and hidden. See [[guitar]] for the layout and [[the_problem_with_frets]] for the ratio every fret imposes.

## History

Legend has Pythagoras noticing that a string stopped at two thirds of its length sounds remarkably settled against the open string — the observation credited with starting the idea that music is made of numbers — and the Pythagorean tradition asked what happens if you follow that step around again and again. The answer, twelve notes with a gap that never closes, shaped Western tuning for two and a half thousand years: [[pythagorean_tuning]] is the system you get by doing exactly this, and the [[pythagorean_comma]] note tells how the ancient Greeks already knew it would never close.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="beats" href="beats" style="color:#1963D1;">beats</a></span>
<span>&uarr; <a class="internal-link" data-href="the_physics_of_beauty" href="the_physics_of_beauty" style="color:#1963D1;">the_physics_of_beauty</a></span>
<span><a class="internal-link" data-href="pythagorean_comma" href="pythagorean_comma" style="color:#1963D1;">pythagorean_comma</a> &rarr;</span>
</div>

Every note name is a promise with a catch: it tells you *which* pitch, never the exact frequency to put there. That's tuning's whole job, and it's been unsolved, in the same specific way, since antiquity — because twelve pure fifths never quite close into seven octaves (see [[why_12_notes]] and the [[pythagorean_comma]]), every instrument has to put the leftover gap *somewhere*, and every era has answered that question differently. For the physics of why string length and tension set the pitch in the first place, see [[frequency]].

Four systems, one unavoidable gap, four different places to hide it — plus one practical shortcut invented along the way for people who couldn't wait for the math. Read the two extremes back to back: [[pythagorean_tuning]] (pure fifths, everything else pays) against [[equal_temperament]] (nothing is pure, but nothing is punished either).

- [[pythagorean_tuning]] — stack pure fifths and fold; simplest, and the one that surfaces the comma in the first place.
- [[meantone]] — spread the gap evenly across most fifths, and pay for it with one unplayable "wolf."
- [[rule_of_eighteen]] — Galilei's 16th-century shortcut for fretted instruments, decades ahead of the math it was approximating.
- [[well_temperament]] — spread the gap unevenly instead, so every key is at least usable.
- [[equal_temperament]] — spread it with total mathematical evenness, and give up rational ratios entirely to do it.

## How close is each system to the others?

**Metric:** take each system's twelve chromatic pitches as cents above C (a cent is 1/100 of an equal-tempered semitone), then compute the **root-mean-square (RMS) difference** between two systems' twelve-note vectors — the standard way to put a number on "how different do these actually sound." Small RMS, same ballpark. Large RMS, real disagreement.

For [[pythagorean_tuning]] and [[meantone]] the table below uses each system's own well-known conventional cent values (built from the nearest fifths in either direction), not the deliberately one-directional twelve-fifth chain from [[why_12_notes]] — that chain exists to expose the comma, not to represent how either tuning is actually built, and mixing the two would compare different things under the same name. Rows and columns run in chronological order, matching the timeline under History.

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
">Table 1 — How far apart the tuning systems sit.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">RMS difference between two systems' twelve-note tunings, in cents: smaller means more alike.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;"></th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Pythagorean</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Meantone</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Rule of 18</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Well temp.</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Equal</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><strong>Pythagorean</strong></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">—</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">22.9¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">13.3¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">15.1¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">8.3¢</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><strong>Meantone</strong></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">22.9¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">—</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">12.3¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">9.9¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">14.6¢</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><strong>Rule of 18</strong></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">13.3¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">12.3¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">—</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">4.7¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">6.8¢</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><strong>Well temp.</strong></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">15.1¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">9.9¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">4.7¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">—</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">7.7¢</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><strong>Equal</strong></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">8.3¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">14.6¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">6.8¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">7.7¢</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">—</td>
</tr>
</table>

</div>

A few things worth pulling out of that table. [[well_temperament|Well temperament]] and [[rule_of_eighteen|the Rule of Eighteen]] land closest to each other (4.7¢) — not a coincidence, since both were built, independently, to chase the same goal by two totally different routes: one by ear and careful compromise, one by a single repeated ratio and a straightedge. [[pythagorean_tuning|Pythagorean]] and [[meantone]] sit furthest apart (22.9¢) — the two most philosophically opposed choices on this whole page, pure fifths versus pure-ish thirds, and the numbers know it. And [[equal_temperament|equal temperament]] itself sits closest to [[rule_of_eighteen|the Rule of Eighteen]] (6.8¢), which makes total sense once you remember Galilei's rule was already reaching, blind, for exactly what equal temperament would later prove.

## History

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
">Table 2 — When each system entered use.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">In roughly chronological order.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">System</th>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">When</th>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Notes</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="pythagorean_tuning" href="pythagorean_tuning">Pythagorean tuning</a></td>
  <td style="padding:4px 8px; color:#555555;">Legendary origin ~6th century BCE; rigorously formalized by Euclid's <em>Sectio Canonis</em>, c. 300 BCE</td>
  <td style="padding:4px 8px; color:#555555;">Dominant through the medieval period</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="meantone" href="meantone">meantone</a></td>
  <td style="padding:4px 8px; color:#555555;">Spreading from the late 15th century; standard through the 16th–17th centuries</td>
  <td style="padding:4px 8px; color:#555555;">—</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="rule_of_eighteen" href="rule_of_eighteen">Rule of Eighteen</a></td>
  <td style="padding:4px 8px; color:#555555;">c. 1581 (Vincenzo Galilei)</td>
  <td style="padding:4px 8px; color:#555555;">For fretted instruments specifically</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="well_temperament" href="well_temperament">well_temperament</a></td>
  <td style="padding:4px 8px; color:#555555;">Flourished 17th–18th centuries; Werckmeister's schemes published 1691, Bach's <em>Well-Tempered Clavier</em> 1722</td>
  <td style="padding:4px 8px; color:#555555;">—</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="equal_temperament" href="equal_temperament">equal_temperament</a></td>
  <td style="padding:4px 8px; color:#555555;">Mathematically derived by Simon Stevin, c. 1585–1608; the de facto keyboard standard by the 19th century, universal by the 20th</td>
  <td style="padding:4px 8px; color:#555555;">—</td>
</tr>
</table>

</div>

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="pythagorean_comma" href="pythagorean_comma" style="color:#1963D1;">pythagorean_comma</a></span>
<span>&uarr; <a class="internal-link" data-href="the_physics_of_beauty" href="the_physics_of_beauty" style="color:#1963D1;">the_physics_of_beauty</a></span>
</div>

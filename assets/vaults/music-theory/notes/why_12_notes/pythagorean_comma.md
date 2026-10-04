Stack twelve pure fifths and you land close to, but not on, seven pure octaves. That leftover is the **Pythagorean comma**: roughly a quarter of a semitone, about 23.5 cents. [[why_12_notes]] shows how the twelve strings get there; this note is about what is left over.

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
">Table 1 — Twelve fifths against seven octaves.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">Both paths should end on the same note; they miss by about a quarter of a semitone.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Path</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Frequency ratio</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Cents</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">Twelve pure fifths, (3/2)^12</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">129.7463</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">8423.5</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">Seven pure octaves, 2^7</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">128.0000</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">8400.0</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">The difference: the comma</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">1.0136</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">23.5</td>
</tr>
</table>

</div>

The mismatch is arithmetic, not a rounding error. Those two numbers would be equal if twelve steps genuinely closed the loop back onto seven octaves, and they never can be: one is a power of 3 over a power of 2, the other is purely a power of 2, and no power of 3 is ever exactly a power of 2. Twelve is simply the smallest number of steps where the near-miss becomes small enough to look, by ear, almost like a match — which is exactly what makes it the dangerous one, the point where a tuner is most tempted to declare the gap closed and move on.

Take the log of each normalized length and the twelve points spread out by pitch position instead of by raw ratio, making the drift from a perfectly even scale visible:

![[notes/resources/images/why12_log.svg]]

Wrap that same pitch position around a circle instead of along a line, and the twelve steps almost close a perfect loop back onto themselves — almost. The small gap next to the first point, on both diagrams, is the comma:

![[notes/resources/images/why12_circle.svg]]

This is the same relationship as [[nice]]'s 2:3 ratio, just run the other way: lengthening by 3/2 drops the pitch a step instead of raising it, but the same twelve-step mismatch shows up either direction.

Every tuning system invented since — [[meantone]], [[well_temperament]], today's [[equal_temperament]] — is a different way of spreading or hiding that same twelve-step leftover; none of them make it genuinely vanish, because the arithmetic above doesn't allow it to. The [[Tuning]] chapter collects them all, from [[pythagorean_tuning]] to equal temperament.

## History

Ancient Greek theory was not caught off guard by this. Euclid's *Sectio Canonis* (c. 300 BCE) works the same ratio arithmetic through and shows explicitly that a stack of fifths never lands exactly on a stack of octaves — the comma was a proven consequence of Pythagorean number-ratio theory, not a later, embarrassing discovery made once instruments got precise enough to expose it.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="why_12_notes" href="why_12_notes" style="color:#1963D1;">why_12_notes</a></span>
<span>&uarr; <a class="internal-link" data-href="the_physics_of_beauty" href="the_physics_of_beauty" style="color:#1963D1;">the_physics_of_beauty</a></span>
<span><a class="internal-link" data-href="Tuning" href="Tuning" style="color:#1963D1;">Tuning</a> &rarr;</span>
</div>

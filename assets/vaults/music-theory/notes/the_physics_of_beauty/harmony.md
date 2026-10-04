Some pairs of tones sound settled and pleasant together; others sound tense and clashing. This isn't just taste — it's physics, and you can state it without a single note name. Consonant pairs have frequencies related by simple whole-number ratios — tones whose waveforms lock together instead of drifting. On a [[monochord]] the same ratio shows up as string lengths: pitch is inversely proportional to length (see [[frequency]]), so halve the string and the frequency doubles. When the movable bridge splits the string in two, the two segments form an interval whose frequency ratio is the length ratio flipped. The 2:1 ratio is the simplest case; 3:2 is the next.

```html-embed
music_instruments/resources/html/monochord.html
300
```

Try it: drag the bridge until the readout says **3 : 2**, then pluck the left segment, the right segment, and both together. The full string is tuned to 110 Hz, so the left segment (0.600 of the string) sounds 183.3 Hz and the right (0.400) sounds 275 Hz, and 275 ÷ 183.3 = 1.5. Now try the other rows of the table.

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
">Table 1 — Consonant ratios on the monochord.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">Where to put the bridge, and what each segment sounds, from the simplest ratio to the most complex.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Length (L:R)</th>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Freq. (L:R)</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Bridge pos.</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Left (Hz)</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Right (Hz)</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">1 : 1</td>
  <td style="padding:4px 8px; color:#555555;">1 : 1</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.500</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">220.0</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">220.0</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">2 : 1</td>
  <td style="padding:4px 8px; color:#555555;">1 : 2</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.667</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">165.0</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">330.0</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">3 : 2</td>
  <td style="padding:4px 8px; color:#555555;">2 : 3</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.600</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">183.3</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">275.0</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">4 : 3</td>
  <td style="padding:4px 8px; color:#555555;">3 : 4</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.571</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">192.5</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">256.7</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">5 : 4</td>
  <td style="padding:4px 8px; color:#555555;">4 : 5</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.556</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">198.0</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">247.5</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">6 : 5</td>
  <td style="padding:4px 8px; color:#555555;">5 : 6</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.545</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">201.7</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">242.0</td>
</tr>
</table>

</div>

The readout shows the *length* ratio; the frequency ratio is the same two numbers the other way round, because the shorter segment sounds higher. Now look at the simplest non-trivial row in detail.

## The 2:1 ratio

Take a tone at 261.63 Hz and another at exactly twice that, 523.26 Hz: a 2:1 ratio, the cleanest possible. On the monochord, put the bridge where the readout says 2 : 1. Hear each tone alone, then both together as a single sound:

**The lower tone, 261.6 Hz:**

![[notes/resources/audio/nice_c4.mp3]]

**The tone at double the frequency, 523.3 Hz:**

![[notes/resources/audio/nice_c5.mp3]]

**Both together, 2:1:**

![[notes/resources/audio/nice_together.mp3]]

The two waves line up cleanly — every second peak of the faster signal coincides exactly with a peak of the slower one:

![[notes/resources/images/ratio_2to1_overlaid.svg]]

Add the two waves together and the combined signal is just as clean — the same repeating shape every cycle of the slower signal, no beating:

![[notes/resources/images/ratio_2to1_combined.svg]]

The simpler the ratio, the sooner the two waves line up again. At 2 : 1 they realign every single cycle of the slower tone; at 3 : 2 every two cycles against three (see [[nice]]); at 6 : 5 only after five and six. Now drag the bridge somewhere off the table and watch the readout fill with big numbers such as 487 : 353. Pluck both: the waves never quite line up, and you hear the roughness of [[ugly]] and the pulsing of [[beats]]. Keep going with [[why_12_notes]], which stacks the 3 : 2 ratio twelve times.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&uarr; <a class="internal-link" data-href="the_physics_of_beauty" href="the_physics_of_beauty" style="color:#1963D1;">the_physics_of_beauty</a></span>
<span><a class="internal-link" data-href="nice" href="nice" style="color:#1963D1;">nice</a> &rarr;</span>
</div>

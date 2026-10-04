Now the math. Two tones close in frequency don't just sound rough together — their combined waveform has a predictable, provable shape: a fast oscillation whose *amplitude itself* rises and falls. That slow rise-and-fall is a **beat**, and it falls straight out of one trig identity.

## The identity

For any angle α and offset δ:

$$\sin(\alpha) + \sin(\alpha + \delta) = 2\cos\left(\frac{\delta}{2}\right)\sin\left(\alpha + \frac{\delta}{2}\right)$$

Two sines added together become a *product* instead: a sine (the fast part) scaled by a cosine (the slow part). That's the entire mechanism behind beats.

## Applying it to two tones

Let the two tones be $\sin(2\pi f_1 t)$ and $\sin(2\pi f_2 t)$. Set $\alpha = 2\pi f_1 t$ and $\delta = 2\pi(f_2 - f_1)t$ — the phase gap between them, growing with time. Substituting into the identity above:

$$\sin(2\pi f_1 t) + \sin(2\pi f_2 t) = \underbrace{2\cos(\pi \Delta f\, t)}_{\text{envelope}} \cdot \underbrace{\sin(2\pi f_{avg}\, t)}_{\text{carrier}}$$

where $\Delta f = f_2 - f_1$ and $f_{avg} = (f_1 + f_2)/2$. The carrier oscillates at the fast, audible average frequency; the envelope oscillates at the much slower difference frequency $\Delta f$ — that's the beat. Perceived loudness follows $|\cos|$, so the ear hears the amplitude swell and fade $\Delta f$ times per second.

## On the monochord

A [[monochord]] makes the beat rate easy to see in ratios. Put the bridge exactly in the middle and the two segments have a length ratio of 1 : 1, so they sound the same frequency and nothing beats. Move it just off the middle and the ratio drifts slightly away from 1 : 1, and the two frequencies drift slightly apart.

```html-embed
music_instruments/resources/html/monochord.html
300
```

Try it: drag the bridge a little to the right of the middle and pluck both segments. With the full string tuned to 110 Hz, the beat rate is $\Delta f = f_{right} - f_{left}$, and the further the readout gets from 1 : 1, the faster the throb.

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
">Table 1 — Length ratios just off 1 : 1 make the segments beat.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">The beat rate is the difference between the two segment frequencies, with the full string tuned to 110 Hz.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Ratio (L:R)</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Bridge pos.</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Left (Hz)</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Right (Hz)</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Beat (Hz)</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">85 : 83</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.506</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">217.4</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">222.7</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">5.2</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">61 : 59</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.508</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">216.4</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">223.7</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">7.3</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">43 : 41</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.512</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">214.9</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">225.4</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">10.5</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">31 : 29</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.517</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">212.9</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">227.6</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">14.7</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;">21 : 19</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">0.525</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">209.5</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">231.6</td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">22.1</td>
</tr>
</table>

</div>

At 85 : 83 the beat is a gentle throb about five times a second; by 21 : 19 the pulses run together into roughness. The same length ratio also beats faster at a higher pitch, because the same ratio spans a bigger gap in hertz.

## A ratio near 1, worked out

Take two tones at $f_1 = 261.63$ Hz and $f_2 = 277.18$ Hz, a frequency ratio of about 18 : 17 (1.059 : 1), so $\Delta f \approx 15.55$ Hz — a beat roughly every 64 ms, fast enough to hear as roughness rather than distinct pulses (see [[ugly]]). The combined signal, envelope and all:

![[notes/resources/images/ugly_combined.svg]]

That pulsing envelope is exactly $2\cos(\pi \Delta f\, t)$ from the derivation above — not an approximation, the literal closed-form shape of the sum.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="ugly" href="ugly" style="color:#1963D1;">ugly</a></span>
<span>&uarr; <a class="internal-link" data-href="the_physics_of_beauty" href="the_physics_of_beauty" style="color:#1963D1;">the_physics_of_beauty</a></span>
<span><a class="internal-link" data-href="why_12_notes" href="why_12_notes" style="color:#1963D1;">why_12_notes</a> &rarr;</span>
</div>

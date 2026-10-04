Not every simple ratio is an octave. Take two tones whose frequencies stand in a **2:3 ratio** — the next-simplest ratio after the octave's 1:2 — and the same thing happens: the waveforms lock together instead of drifting, because two cycles of the lower tone complete in exactly the same span as three cycles of the higher one.

You can build that ratio yourself on a [[monochord]]. Frequency is inversely proportional to length, so a 2:3 frequency ratio is a 3:2 ratio of string lengths: the longer segment sounds lower.

```html-embed
music_instruments/resources/html/monochord.html
300
```

Try it: drag the bridge until the readout says **3 : 2**. The full string is tuned to 110 Hz, so the longer left segment (0.600 of the string) sounds 183.3 Hz and the shorter right one (0.400) sounds 275 Hz, and 183.3 × 1.5 = 275. Pluck both: two cycles of the lower against three of the higher, and nothing drifts.

The two signals, overlaid on one shared axis:

![[notes/resources/images/twothirds_signals.svg]]

Add them together and the combined signal repeats cleanly too — a longer repeat than the 2:1 ratio's (720° of phase instead of 360°), but still a repeat, not a beat. Two repeats shown, back to back:

![[notes/resources/images/twothirds_combined.svg]]

Contrast with [[ugly]], where the ratio isn't simple and the combined signal never quite closes — that's a beat, not a repeat. See [[harmony]] for the 2:1 ratio and a table of the other simple ratios, and [[why_12_notes]] for what happens if you apply this same 2:3 relationship again.

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&larr; <a class="internal-link" data-href="harmony" href="harmony" style="color:#1963D1;">harmony</a></span>
<span>&uarr; <a class="internal-link" data-href="the_physics_of_beauty" href="the_physics_of_beauty" style="color:#1963D1;">the_physics_of_beauty</a></span>
<span><a class="internal-link" data-href="ugly" href="ugly" style="color:#1963D1;">ugly</a> &rarr;</span>
</div>

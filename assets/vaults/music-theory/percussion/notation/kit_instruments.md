# Kit Instruments

The ten percussion factories available to build with, each routed to General MIDI channel 10 (the standard percussion channel) at a fixed GM note number:

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
">Table 1 — The ten kit instruments.</div>

<div style="
  font-size:12px;
  color:#555555;
  margin:2px 0 10px;
">Each factory routes to a fixed General MIDI drum slot, listed here in kit order.</div>

<table style="width:100%; border-collapse:collapse;">
<tr>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Instrument</th>
  <th style="text-align:right; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">GM note</th>
  <th style="text-align:left; padding:4px 8px; color:#2B2B2B; border-bottom:1px solid #666666;">Sound</th>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="kick" href="kick">kick</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">36</td>
  <td style="padding:4px 8px; color:#555555;">Bass drum</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="snare" href="snare">snare</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">38</td>
  <td style="padding:4px 8px; color:#555555;">Acoustic snare</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="closed_hihat" href="closed_hihat">closed_hihat</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">42</td>
  <td style="padding:4px 8px; color:#555555;">Hi-hat, closed — short "ts"</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="pedal_hihat" href="pedal_hihat">pedal_hihat</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">44</td>
  <td style="padding:4px 8px; color:#555555;">Hi-hat, foot pedal — "chick"</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="open_hihat" href="open_hihat">open_hihat</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">46</td>
  <td style="padding:4px 8px; color:#555555;">Hi-hat, open — longer "tsh"</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="low_tom" href="low_tom">low_tom</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">41</td>
  <td style="padding:4px 8px; color:#555555;">Floor tom</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="mid_tom" href="mid_tom">mid_tom</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">47</td>
  <td style="padding:4px 8px; color:#555555;">Mid tom</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="high_tom" href="high_tom">high_tom</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">50</td>
  <td style="padding:4px 8px; color:#555555;">High tom</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="crash_cymbal" href="crash_cymbal">crash_cymbal</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">49</td>
  <td style="padding:4px 8px; color:#555555;">Crash 1</td>
</tr>
<tr>
  <td style="padding:4px 8px; color:#555555;"><a class="internal-link" data-href="ride_cymbal" href="ride_cymbal">ride_cymbal</a></td>
  <td style="text-align:right; padding:4px 8px; color:#555555;">51</td>
  <td style="padding:4px 8px; color:#555555;">Ride 1</td>
</tr>
</table>

</div>

Every note built from these gets its `pitch.midi` normalized to the instrument's GM number, so MIDI export lands on the right drum slot regardless of what pitch a Part's notes are nominally written at — see [[play_at_offsets]] and [[play_at_beats]] for the primitives that do this.

[[low_tom]], [[mid_tom]], and [[high_tom]] are literally the same music21 class — they differ only in which GM number they route to.

Part of [[notation]].

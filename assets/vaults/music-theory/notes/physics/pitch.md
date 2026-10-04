**Pitch** is how high or low a note *feels* — and the word "feels" is doing real work. Frequency is what the air is actually doing; pitch is what your brain decides to make of it. Same sound, two stories, and only one of them happens inside your head. [[frequency]] is the physical cause, [[timbre]] and [[loudness]] are the other things your ear reads off the same sound, and [[duration]] pins the note down in time.

Here's the weird part. Take three C's, C3, C4 and C5, each an octave above the last. The widget starts with C3 and C4 held; click C5 to add it, then press **Play together**, or pick any keys you like.

```html-embed
music_instruments/resources/html/piano_keyboard.html
280
```

Now the same trick with a single jump, one octave, A3 up to A4:

![[notes/resources/audio/pitch_octave_a3_a4.mp3]]

Every octave you climb doubles the frequency: A3 is 220 Hz, A4 is 440 Hz. So you'd expect A4 to sound "twice as high." It doesn't. It sounds like the *same note*, just up a floor. Physics counts in multiplication; your ear counts in steps. That's the whole trick of pitch: it isn't a raw measurement, it's a logarithm your head runs for free. See [[frequency]] for the mapping.

Want to see what one pitch looks like as an actual wave, not just a label? Here's A4, 440 Hz, as a wave packet. The dashed envelope is the note starting and stopping. Real notes don't go on forever, whatever the textbooks draw.

![[notes/resources/images/pitch_wave_packet.svg]]

**Try it:** [[exercises/octave_up]] — name the note one octave above C4 and get told how its name, its octave number and its frequency fit together.


<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&uarr; <a class="internal-link" data-href="Physics" href="Physics" style="color:#1963D1;">Physics</a></span>
<span><a class="internal-link" data-href="frequency" href="frequency" style="color:#1963D1;">frequency</a> &rarr;</span>
</div>
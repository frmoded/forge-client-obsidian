# Kit Instruments

The ten percussion factories available to build with, each routed to General MIDI channel 10 (the standard percussion channel) at a fixed GM note number:

| Instrument | GM note | Sound |
|---|---|---|
| [[kick]] | 36 | Bass drum |
| [[snare]] | 38 | Acoustic snare |
| [[closed_hihat]] | 42 | Hi-hat, closed — short "ts" |
| [[pedal_hihat]] | 44 | Hi-hat, foot pedal — "chick" |
| [[open_hihat]] | 46 | Hi-hat, open — longer "tsh" |
| [[low_tom]] | 41 | Floor tom |
| [[mid_tom]] | 47 | Mid tom |
| [[high_tom]] | 50 | High tom |
| [[crash_cymbal]] | 49 | Crash 1 |
| [[ride_cymbal]] | 51 | Ride 1 |

Every note built from these gets its `pitch.midi` normalized to the instrument's GM number, so MIDI export lands on the right drum slot regardless of what pitch a Part's notes are nominally written at — see [[play_at_offsets]] and [[play_at_beats]] for the primitives that do this.

[[low_tom]], [[mid_tom]], and [[high_tom]] are literally the same music21 class — they differ only in which GM number they route to.

Part of [[notation]].

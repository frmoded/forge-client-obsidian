Unpitched drums don't get treble or bass clef — nothing here sits on a scale degree, so there's nothing for those clefs to fix. They get the **percussion clef** instead: two thick vertical bars carrying zero pitch information, whose entire job is announcing "these lines are instrument slots, not scale degrees," and then getting out of the way.

This engine builds from ten **kit instruments** — kick, snare, closed/open/pedal hi-hat, low/mid/high tom, crash, ride — each nailed to a fixed General MIDI drum slot, so export never has to guess which drum you meant.

Every section comes back in the same **canonical voice order**: kick, snare, closed hi-hat, open hi-hat, low tom, mid tom, crash — one stave per position, resting or not, never just omitted. Skip that discipline and two sections' hi-hats land on two different staves instead of merging into one continuous line.

For actually reading the thing, all seven staves fold down onto one via **kit notation voicing**: stems **up** for whatever the hands play, stems **down** for the kick — the one instrument being worked by a foot instead of a stick.

See [[percussion_clef]], [[kit_instruments]], [[canonical_voice_order]] and [[kit_notation_voicing]] for the full versions of each of these.

**Try it:** press Run on [[murmuration]] or [[loom]] to render a real folded kit score — a percussion clef, all ten instruments, stems doing exactly what the paragraph above says. No static picture here does that justice, because a pitched-notation renderer would put these instruments on the wrong kind of staff entirely, which is precisely the mistake this note exists to explain.

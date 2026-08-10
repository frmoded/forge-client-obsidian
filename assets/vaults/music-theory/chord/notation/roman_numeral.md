# Roman Numeral

A **Roman numeral** names a chord by its function within a key, not by its literal pitches: I ii iii IV V vi vii°. Because it's relative, the same numeral names a different chord in every key — "V" is G major in the key of C, but D major in the key of G — while still meaning the same *thing*: the dominant. This is the transposition-invariant template you think a progression in, independent of what key it eventually gets played in.

Run [[chord_progression]] with `key_name="C"`, `mode_name="major"`, `progression=["I", "IV", "V", "I"]` — then change `key_name` to `"G"` and run it again with the exact same progression list. Same Roman numerals, same *relationship* between the chords, completely different literal pitches — that's the whole point of relative notation.

Contrast with [[chord_symbol]], the absolute, key-independent name for one specific chord. See [[diatonic_chord]] for what the seven numerals I–vii° actually stand for in a given key.

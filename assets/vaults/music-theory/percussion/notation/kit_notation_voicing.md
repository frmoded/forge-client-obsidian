# Kit Notation Voicing

A canonical percussion Score has one Part per instrument — seven staves for a full percussion_lab section. For actually reading a drum part, that's usually folded onto a **single staff with two voices**: stems pointing **up** for hands (snare, hi-hats, toms, crash — whatever's played with sticks) and stems pointing **down** for the kick (played with the foot).

[[to_kit_notation]] does this fold: it walks a Score's percussion Parts, maps each note onto the single kit staff by instrument, and assigns voice + notehead + stem direction per note — leaving non-percussion Parts untouched, and leaving the original [[canonical_voice_order|voice ordering]] and MIDI routing intact underneath the visual fold. The exact notehead shape used per instrument lives in the engine's internal mapping table rather than being vault-editable — this note covers the stem/voice convention, which is the part that matters for reading a score at a glance.

Part of [[notation]].

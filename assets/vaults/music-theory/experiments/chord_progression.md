---
type: action
inputs:
  - key_name
  - mode_name
  - progression
recipe_version: 1
sync_state: synced
---

# Description

Return a music21 Score realizing your Roman-numeral `progression` (e.g. ["I", "IV", "I", "V", "I"]) as concrete triads in `key_name`/`mode_name` — press Run to hear it. Build different progressions to compare how they punctuate: ending V→I resolves fully (authentic cadence), IV→I is softer (plagal, the "amen"), stopping on V leaves it hanging (half cadence), V→vi surprises instead of resolving (deceptive cadence). All seven diatonic scale-degree triads (I ii iii IV V vi vii°) are available to build with. Concept refresher: [[chord/function/diatonic_chord]], [[chord/function/harmonic_function]], [[chord/function/chord_progression]], [[chord/function/cadence]].

# Recipe

Return Call [[form]] with key_name=key_name, mode_name=mode_name, progression=progression, ts_str="4/4", tempo_bpm=90.

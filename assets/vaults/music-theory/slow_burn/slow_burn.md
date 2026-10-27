---
type: action
description_hash: 0f0addbde2ee5a5ee573b576ea2fc2afca9042913772f581cd79dfa37c6837f5
recipe_hash: 3f18b5c22678746253c19270e23e511ec41acd4d2ccb7c31c6414317f7ac8c03
python_hash: b8c36ac0836ac28f414de64a42f2a7573e264c5527350877af4d6c35be1957c2
recipe_derived_from_source_hash: 0f0addbde2ee5a5ee573b576ea2fc2afca9042913772f581cd79dfa37c6837f5
python_derived_from_source_hash: 0f0addbde2ee5a5ee573b576ea2fc2afca9042913772f581cd79dfa37c6837f5
source_facet: synced
recipe_derived_from_description_hash: 0f0addbde2ee5a5ee573b576ea2fc2afca9042913772f581cd79dfa37c6837f5
python_derived_from_recipe_hash: 3f18b5c22678746253c19270e23e511ec41acd4d2ccb7c31c6414317f7ac8c03
---

# Description

Slow Burn — a slow E blues, four 12-bar choruses, vocal lead with drums underneath.
The first chorus introduces the lyric; the second repeats with more
weight; the third opens to an instrumental solo on guitar; the fourth
comes back changed. Around 70 BPM, eighth-note triplet feel.

The drum arc shapes the dynamics: sparse for the intro, building
through standard for the second vocal, driving under the solo, then
back to standard for the closing chorus.

## Inputs

(none)

# Recipe

Let chorus1_drums = Call [[drum_chorus]] with profile="sparse".
Let chorus2_drums = Call [[drum_chorus]] with profile="standard".
Let solo_drums = Call [[drum_chorus]] with profile="driving".
Let chorus3_drums = Call [[drum_chorus]] with profile="standard".

Let chorus1_vocal = Call [[chorus]].
Let chorus2_vocal = Call [[chorus]].
Let chorus3_vocal = Call [[chorus]].
Let solo_line = Call [[solo_chorus]].

Let chorus1 = Call [[voices_list]] with sections=[chorus1_vocal, chorus1_drums].
Let chorus2 = Call [[voices_list]] with sections=[chorus2_vocal, chorus2_drums].
Let solo = Call [[voices_list]] with sections=[solo_line, solo_drums].
Let chorus3 = Call [[voices_list]] with sections=[chorus3_vocal, chorus3_drums].

Return Call [[sequence_list]] with sections=[chorus1, chorus2, solo, chorus3].

# Python

```python
def compute(context):
  chorus1_drums = drum_chorus(profile='sparse')
  chorus2_drums = drum_chorus(profile='standard')
  solo_drums = drum_chorus(profile='driving')
  chorus3_drums = drum_chorus(profile='standard')
  chorus1_vocal = chorus()
  chorus2_vocal = chorus()
  chorus3_vocal = chorus()
  solo_line = solo_chorus()
  chorus1 = voices_list(sections=[chorus1_vocal, chorus1_drums])
  chorus2 = voices_list(sections=[chorus2_vocal, chorus2_drums])
  solo = voices_list(sections=[solo_line, solo_drums])
  chorus3 = voices_list(sections=[chorus3_vocal, chorus3_drums])
  return sequence_list(sections=[chorus1, chorus2, solo, chorus3])
```

# Dependencies

*Synced from Python. Edit the Python and regenerate, or run "Forge: Sync edges" to refresh.*

[[chorus]] [[solo_chorus]] [[drum_chorus]] [[voices_list]] [[sequence_list]]

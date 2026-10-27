---
type: action
inputs: []
source_facet: description
description_hash: 8695fe3e8909845c715806b51b1dd209bd1b67cf31a74e595959e0c50c8f13f2
recipe_hash: 48755143cf1c601bd13feeae9b9bf49e1e9d6085233c02924a3ca00c7f7e831d
python_hash: ddfbf283a6145e4724ae970f13d68b6fcbbce7b99878c6bb187b9901883f17a7
recipe_derived_from_description_hash: 8695fe3e8909845c715806b51b1dd209bd1b67cf31a74e595959e0c50c8f13f2
recipe_derived_from_source_hash: 8695fe3e8909845c715806b51b1dd209bd1b67cf31a74e595959e0c50c8f13f2
python_derived_from_recipe_hash: 48755143cf1c601bd13feeae9b9bf49e1e9d6085233c02924a3ca00c7f7e831d
python_derived_from_source_hash: 8695fe3e8909845c715806b51b1dd209bd1b67cf31a74e595959e0c50c8f13f2
recipe_version: 2
---

# Description

What's left after the murmuration. The flock has passed — texture lingers,
voices return briefly to recall the climax, then a long fade through dispersing
motion to silence. Where [[murmuration]] is symmetric around a central peak,
Wake is asymmetric — weighted toward the slow fade.

Six sections at 96 BPM in 4/4, 28 bars total, structured as a quiet opening +
brief recall + long fade:

1. [[companions]](bars=8) — bars 1-8. Closed hi-hat texture remains, no kick yet.
2. [[gathering]](bars=4) — bars 9-12. Snare ghosts and hi-hat eighths gather.
3. [[peak]](bars=2) — bars 13-14. Brief recall of the murmuration's peak.
4. [[dispersing]](bars=8) — bars 15-22. Long decrescendo fade.
5. [[threading]](bars=4) — bars 23-26. Soft snare over kick + hi-hat.
6. [[resting]](bars=2) — bars 27-28. Kick alone, then silence.

## Inputs

(none)

# Recipe
Let s1 = Call [[companions]] with bars=8.
Let s2 = Call [[gathering]] with bars=4.
Let s3 = Call [[peak]] with bars=2.
Let s4 = Call [[dispersing]] with bars=8.
Let s5 = Call [[threading]] with bars=4.
Let s6 = Call [[resting]] with bars=2.
Return Call [[sequence_list]] with sections=[s1, s2, s3, s4, s5, s6].

# Python

```python
def compute(context):
  s1 = companions(bars=8)
  s2 = gathering(bars=4)
  s3 = peak(bars=2)
  s4 = dispersing(bars=8)
  s5 = threading(bars=4)
  s6 = resting(bars=2)
  return sequence_list(sections=[s1, s2, s3, s4, s5, s6])
```

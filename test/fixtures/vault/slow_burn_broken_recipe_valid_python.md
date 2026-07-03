---
type: action
description_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
python_hash: 5f8bb69fbe7cf8ff9d69f4ea9f0902fedac8d3a03fcdafe6d40dccec5d3d3660
recipe_derived_from_source_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
---

# Description

Slow burn — hand-tuned percussion piece. Cohort edited the Python
directly to nudge specific voices; the Recipe was left stale with a
kwarg-parse bug from an earlier smoke iteration. Fixture proves that
plugin's python-canonical routing (upstream-wins hash detection) plus
L45 routing-signal short-circuit prevents the broken Recipe from
blocking execution.

# Recipe

Let chorus1_drums = Call [[play_at_beats]] with a profile="slow", beats=[1, 5].

Return chorus1_drums.

# Python

```python
def compute(context):
    return "python canonical wins"
```

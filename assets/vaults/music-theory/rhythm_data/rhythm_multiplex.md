---
type: action
inputs: []
source_facet: description
description_hash: d404d9df755c97fef838c9b6c9121e538a1d62ecd9ad355f52c93437cdbc106e
recipe_hash: bf3ef252215808cc34df1fbc0788f12fbb774382ce6bd2b7824530d777da8be6
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: d404d9df755c97fef838c9b6c9121e538a1d62ecd9ad355f52c93437cdbc106e
recipe_derived_from_source_hash: d404d9df755c97fef838c9b6c9121e538a1d62ecd9ad355f52c93437cdbc106e
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: d404d9df755c97fef838c9b6c9121e538a1d62ecd9ad355f52c93437cdbc106e
recipe_version: 1
---

# Description

Two rhythm-data notes layered into one combined beat. Each data note holds one Rhythm Box pattern (straight rock, and a syncopated funk figure); this note converts each to a stream with rhythm_data_to_stream and layers the two with voices_list, so the kick, snare and hi-hat of both patterns sound together. It is the simplest rhythm DAG: two data leaves feeding one combining node.

# Recipe

Let pattern_a = Call [[rhythm_pattern_straight_rock]].
Let pattern_b = Call [[rhythm_pattern_syncopated]].
Let a = Call [[rhythm_data_to_stream]] with data=pattern_a.
Let b = Call [[rhythm_data_to_stream]] with data=pattern_b.
Return Call [[voices_list]] with sections=[a, b].

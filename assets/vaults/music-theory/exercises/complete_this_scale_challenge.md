---
type: action
inputs: []
source_facet: description
description_hash: 4a25eb318c980d85f0918b6c0d4bedc6be008d8227446294b97d65e1697d768d
recipe_hash: 6d5a52d36c5c94ff001ba213ad153785b5a1e8e83b5a46fad0625af6a8c4ea42
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: 4a25eb318c980d85f0918b6c0d4bedc6be008d8227446294b97d65e1697d768d
recipe_derived_from_source_hash: 4a25eb318c980d85f0918b6c0d4bedc6be008d8227446294b97d65e1697d768d
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: 4a25eb318c980d85f0918b6c0d4bedc6be008d8227446294b97d65e1697d768d
recipe_version: 1
---

# Description

Press **Run** to hear the first four notes of a C major scale. Your task: work out the four notes that complete the octave — then check yourself in [[exercises/complete_this_scale_submit]]. New to scales? Start with [[scales/Scales]].

<div style="
  display:flex;
  justify-content:space-between;
  font-size:12px;
  color:#666666;
  border-top:1px solid #F2F2EC;
  padding:6px 2px;
  margin:10px 0;
">
<span>&uarr; <a class="internal-link" data-href="Scales" href="Scales" style="color:#1963D1;">Scales</a></span>
<span><a class="internal-link" data-href="complete_this_scale_submit" href="complete_this_scale_submit" style="color:#1963D1;">complete_this_scale_submit</a> &rarr;</span>
</div>

# Recipe

Let true_tonic = "C".
Let true_mode = "major".
Let scale = Call [[diatonic_scale]] with tonic=true_tonic, mode=true_mode.
Return {{ music21.stream.Part([music21.note.Note(n, quarterLength=1.0) for n in scale[:4]]) }}.

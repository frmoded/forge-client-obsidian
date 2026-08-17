---
type: action
inputs:
  - guess
source_facet: description
description_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_derived_from_description_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
recipe_derived_from_source_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
python_derived_from_recipe_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_source_hash: d6f3c2afbbcc4d738020b9996afc88049a56043ec437ac90250dfe999f597c3f
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
recipe_version: 1
---

# Description

Construct the C major scale, tonic to tonic, one key at a time — as if pressing 8 piano keys in a row. `guess` is a list of 8 pitch names, e.g. `["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]`. Press **Run** to hear exactly what you built, with a verdict — which positions are right, which aren't, or whether you entered the wrong number of notes — printed right on the staff above your own notes. Concept refresher: [[scales/scale]]; hear the reference scale first at [[theory_exercises/complete_this_scale_challenge]].

# Recipe

Let correct = Call [[diatonic_scale]] with tonic="C", mode="major".
Return {{ (lambda notes, verdict: (notes.insert(0, music21.expressions.TextExpression(verdict)), notes)[1])(music21.stream.Part([music21.note.Note(n, quarterLength=1.0) for n in guess]), (("Correct! You built the full C major scale, tonic to tonic.") if (len(guess) == len(correct) and all(g.rstrip("0123456789") == e.rstrip("0123456789") for g, e in zip(guess, correct))) else ((("You entered " + str(len(guess)) + " note(s); the scale needs " + str(len(correct)) + ". ") if len(guess) != len(correct) else "") + "Not yet - wrong at position(s): " + str([i + 1 for i, (g, e) in enumerate(zip(guess, correct)) if g.rstrip("0123456789") != e.rstrip("0123456789")])))) }}.

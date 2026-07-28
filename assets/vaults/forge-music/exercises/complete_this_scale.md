---
type: action
inputs:
  - guess
recipe_version: 3
source_facet: recipe
sync_state: stale-python
description_hash: f51de77e96e1b63595cdb853b8678d56857df641dc6c3cda805fd8b543ec285f
recipe_hash: 07b66cbad20203018bd238f9d8d275338fc8121b30868b19d99e3eadf30f4509
python_hash: 833dd57f8fb60994f490b5b0352b79215ada1ac609607694c2664fcbf103966e
recipe_derived_from_source_hash: f51de77e96e1b63595cdb853b8678d56857df641dc6c3cda805fd8b543ec285f
python_derived_from_source_hash: f51de77e96e1b63595cdb853b8678d56857df641dc6c3cda805fd8b543ec285f
recipe_derived_from_description_hash: f51de77e96e1b63595cdb853b8678d56857df641dc6c3cda805fd8b543ec285f
english_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
python_derived_from_recipe_hash: 07b66cbad20203018bd238f9d8d275338fc8121b30868b19d99e3eadf30f4509
---

# Description

Below are the first 4 notes of a mystery scale: **C4, D4, E4, F4**. What are the remaining 4 notes that complete it (through the octave)? Set `guess` to a list like ["G4", "A4", "B4", "C5"]. Then click Forge for feedback.

# Recipe
Let true_tonic = "C".
Let true_mode = "major".
Let scale = Call [[diatonic_scale]] with tonic=true_tonic, mode=true_mode.
Return {{ ("Correct! The full scale is " + str(scale)) if guess == scale[4:] else ("Not quite — the remaining 4 notes were " + str(scale[4:]) + ". Full scale: " + str(scale)) }}.

# Python

```python
def compute(context, guess=None):
    if guess is None:
        guess = []

    correct = ["G4", "A4", "B4", "C5"]

    if not guess:
        result = "No guess provided. Set `guess` to a list like [\"G4\", \"A4\", \"B4\", \"C5\"] and click Forge."
        print(result)
        return result

    normalized_guess = [str(g).strip() for g in guess]
    normalized_correct = [str(c).strip() for c in correct]

    if normalized_guess == normalized_correct:
        result = "Correct! The scale is C major: C4, D4, E4, F4, G4, A4, B4, C5."
        print(result)
        return result

    feedback_lines = ["Not quite. Here's how your guess compares:"]
    for i, (g, c) in enumerate(zip(normalized_guess, normalized_correct)):
        if g == c:
            feedback_lines.append(f"  Note {i+1}: {g} ✓")
        else:
            feedback_lines.append(f"  Note {i+1}: you said {g}, expected {c}")

    if len(normalized_guess) < len(normalized_correct):
        missing = len(normalized_correct) - len(normalized_guess)
        feedback_lines.append(f"  (missing {missing} note(s) at the end)")
    elif len(normalized_guess) > len(normalized_correct):
        extra = len(normalized_guess) - len(normalized_correct)
        feedback_lines.append(f"  ({extra} extra note(s) provided)")

    feedback_lines.append("Hint: the first 4 notes C, D, E, F suggest C major — what comes next in that scale?")

    result = "\n".join(feedback_lines)
    print(result)
    return result
```

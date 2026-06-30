---
type: action
---

# Description

Four threads of the Reich "Clapping Music" cell weave through each
other, shifting by an eighth note per section. The threads diverge
then mathematically realign: voice 4 returns to unison with voice 1
at section 5 (0-indexed S=4: 3 × 1 × 4 = 12, which is 0 mod 12);
voice 3 at section 7 (S=6: 2 × 1 × 6 = 12 mod 12 = 0). The piece is
what those shifts sound like — phase music as woven fabric. Closed
hi-hat for all four voices; 32 bars in 12/8 at 96 BPM; ~80 seconds.

The composition delegates the rhythmic cell to [[phase_cell]] and the
phase-shifting algorithm to [[phase_shifter]]. This snippet stays
tiny — it picks the parameters that make the piece (4 voices,
1-eighth shift per section, 4 bars per section, 8 sections, 12/8 at
96 BPM, 'human' velocity) and composes them. Swap the cell or change
a parameter and the architecture stays whole.

## Inputs

(none)

# Recipe

Let cell = Call [[phase_cell]].
Return Call [[phase_shifter]] with cell=cell, voices=4, bars_per_section=4, total_sections=8, shift_per_section_eighths=1, ts_str="12/8", bpm=96, velocity_profile="human".

# Python

```python
def compute(context):
    cell = context.compute("phase_cell")
    score = context.compute(
        "phase_shifter",
        cell,
        voices=4,
        bars_per_section=4,
        total_sections=8,
        shift_per_section_eighths=1,
        ts_str='12/8',
        bpm=96,
        velocity_profile='human',
    )
    return score
```

# Dependencies

[[phase_cell]] [[phase_shifter]]

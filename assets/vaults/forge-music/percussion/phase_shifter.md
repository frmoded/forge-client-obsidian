---
type: action
edit_mode: python
---

# Description

A parameterized phase-canon engine. Takes a rhythmic cell (from [[phase_cell]] or any compatible dict) plus shape parameters, returns a `music21.stream.Score` with N stacked Parts playing the cell repeatedly, each voice K (1-indexed) accumulating an integer eighth-note phase shift per section.

The shift formula per voice K at section index S (0-indexed) is `offset = (K - 1) * shift_per_section_eighths * S` mod `cell['length_eighths']`. Voice 1 is the anchor — offset is always 0. Voice K's offset stays fixed within a section and increments at section boundaries.

For the default `voices=4`, `shift_per_section_eighths=1`, and `length_eighths=12`: voice 4 returns to unison with voice 1 at section 4 (0-indexed) — the audible realignment. Voice 3 realigns at section 6. The piece is what those shifts sound like.

Default shape: 12/8 at 96 BPM, 8 sections × 4 bars/section = 32 bars; one cell per bar; eighth-note hits with 'human' velocity profile.

# Recipe

<!-- engineer-mode: this snippet's logic lives in # Python. The
frontmatter carries `edit_mode: python` so Forge-click runs the
Python directly instead of transpiling Recipe → Python. -->

# Python

```python
def compute(context, cell, voices=4, bars_per_section=4, total_sections=8,
            shift_per_section_eighths=1, ts_str='12/8', bpm=96,
            velocity_profile='human'):
    ts = meter.TimeSignature(ts_str)
    mm = tempo.MetronomeMark(number=bpm)
    bar_ql = ts.barDuration.quarterLength  # 6.0 for 12/8
    eighth_ql = 0.5
    cell_length = cell['length_eighths']
    hits = list(cell['hits_in_eighths'])
    inst_factory = cell['instrument']
    total_bars = total_sections * bars_per_section

    def build_bar(rotated_hits, measure_number, first_in_part):
        """Build one measure containing notes at the rotated hit positions
        (eighth-units within the bar) with rests filling the gaps. Returns
        (measure, list-of-non-rest-notes)."""
        m = stream.Measure(number=measure_number)
        if first_in_part:
            m.append(ts)
            m.append(mm)
        rotated = sorted(rotated_hits)
        cursor_eighths = 0
        non_rest_notes = []
        for pos in rotated:
            gap = pos - cursor_eighths
            if gap > 0:
                m.append(note.Rest(quarterLength=gap * eighth_ql))
                cursor_eighths += gap
            n = note.Note('C4', quarterLength=eighth_ql)
            m.append(n)
            non_rest_notes.append(n)
            cursor_eighths += 1
        # Pad tail of the bar.
        remaining_eighths = cell_length - cursor_eighths
        if remaining_eighths > 0:
            m.append(note.Rest(quarterLength=remaining_eighths * eighth_ql))
        return m, non_rest_notes

    score = stream.Score()
    for k in range(1, voices + 1):
        part = stream.Part()
        part.append(inst_factory())
        all_notes_in_part = []
        for s in range(total_sections):
            offset = ((k - 1) * shift_per_section_eighths * s) % cell_length
            rotated_hits = [(h + offset) % cell_length for h in hits]
            for bar_in_section in range(bars_per_section):
                measure_number = s * bars_per_section + bar_in_section + 1
                first_in_part = (measure_number == 1)
                m, notes_in_bar = build_bar(rotated_hits, measure_number, first_in_part)
                part.append(m)
                all_notes_in_part.extend(notes_in_bar)
        if all_notes_in_part:
            with_velocity(all_notes_in_part, velocity_profile)
        score.insert(0, part)
    return score
```

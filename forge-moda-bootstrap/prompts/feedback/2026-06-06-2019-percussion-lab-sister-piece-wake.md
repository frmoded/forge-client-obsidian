---
timestamp: 2026-06-07T03:00:00Z
session_id: drain-2026-06-07-0200
prompt_modified: 2026-06-06T20:19:00Z
status: success
---

# Percussion Lab — Wake sister piece (v0.3.10)

## §0 — Scope-respect checklist

- ✓ `~/projects/forge-music/percussion_lab/wake.md` created.
- ✓ `~/projects/forge-music/forge.toml` bumped 0.3.9 → 0.3.10.
- ✓ 5 new tests in `~/projects/forge/tests/music/test_percussion_lab.py`.
- ✗ None of the 8 existing percussion_lab section snippets touched.
- ✗ `~/projects/forge-music/percussion/murmuration.md` not touched.
- ✗ `~/projects/forge/forge/music/lib.py` not touched.
- ✗ No `~/projects/forge-client-obsidian/` changes.
- ✗ Constitution not modified.

## §1 — Commits + tag

| Repo | SHA | Message |
| --- | --- | --- |
| forge-music | `2504a7f` | `v0.3.10 — Wake sister piece using percussion_lab section vocabulary` |
| forge | `0ea34b2` | `tests: 5 cases for wake.md sister piece` |

- Tag `v0.3.10` pushed to `frmoded/forge-music` (`* [new tag] v0.3.10 -> v0.3.10`).
- Forge commit pushed to `frmoded/forge` (`456650f..0ea34b2 main -> main`).

## §2 — wake.md content

```markdown
---
type: action
description: wake
inputs: []
snapshot_capture: false
---

# English


What's left after the murmuration. The flock has passed — texture lingers, voices return briefly to recall the climax, then a long fade through dispersing motion to silence. Where Murmuration is symmetric around a central peak, Wake is asymmetric — weighted toward the slow fade.

Six sections at 96 BPM in 4/4, 28 bars total, structured as a quiet opening + brief recall + long fade:

1. [[companions]](bars=8) — bars 1-8. Closed hi-hat texture remains, no kick yet. The whisper of presence after the flock has flown.
2. [[gathering]](bars=4) — bars 9-12. Snare ghosts and hi-hat eighths gather — voices stirring without committing to motion.
3. [[peak]](bars=2) — bars 13-14. A brief recall of the murmuration's peak — full kit + crash for two bars only, like a memory of climax. The shortest section.
4. [[dispersing]](bars=8) — bars 15-22. The long decrescendo fade. Decrescendo hairpin spans these 8 bars, instruments thinning across them.
5. [[threading]](bars=4) — bars 23-26. Soft snare returns over kick + hi-hat — the faint echo continuing past the dispersion.
6. [[resting]](bars=2) — bars 27-28. Kick alone for two bars, then silence.

The arc is asymmetric. The peak is brief and in the first third of the piece (bars 13-14 out of 28). The fade dominates the remainder. Same percussion vocabulary as Murmuration; different proportions; different feel.

Renders as multiple stacked staves in Verovio (one per instrument that plays anywhere across the piece); for high-fidelity rendering, download the MusicXML and open in MuseScore.

---

# Python

```python
def compute(context):
    companions = context.compute("companions", bars=8)
    gathering = context.compute("gathering", bars=4)
    peak = context.compute("peak", bars=2)
    dispersing = context.compute("dispersing", bars=8)
    threading = context.compute("threading", bars=4)
    resting = context.compute("resting", bars=2)

    return sequence(companions, gathering, peak, dispersing, threading, resting)
```

# Dependencies

[[companions]] [[gathering]] [[peak]] [[dispersing]] [[threading]] [[resting]]
```

Bar total: 8 + 4 + 2 + 8 + 4 + 2 = 28. At 96 BPM in 4/4, ~70 seconds.

## §3 — Tests

5 new wake cases — all pass:

```
$ .venv/bin/pytest tests/music/test_percussion_lab.py -k wake -v
tests/music/test_percussion_lab.py::test_wake_returns_score_with_28_measures PASSED [ 20%]
tests/music/test_percussion_lab.py::test_wake_includes_crash_in_peak_section PASSED [ 40%]
tests/music/test_percussion_lab.py::test_wake_does_not_use_solitary_or_swarming PASSED [ 60%]
tests/music/test_percussion_lab.py::test_wake_dispersing_section_inserts_decrescendo_hairpin PASSED [ 80%]
tests/music/test_percussion_lab.py::test_wake_has_brief_peak_relative_to_fade PASSED [100%]

================== 5 passed, 8 deselected, 1 warning in 0.64s ==================
```

Full forge suite:

```
$ .venv/bin/pytest -q
======================= 582 passed, 1 warning in 52.91s ========================
```

582 = 577 prev baseline + 5 new wake tests. No regressions.

## §4 — Working tree post-drain

**forge-music** (`~/projects/forge-music/`):

```
$ git status -s
 M percussion_lab/peak.md    (user's pre-existing WIP, preserved)
?? .forge/                    (sentinel)
?? .obsidian/                 (plugin install)
```

`peak.md` modification is pre-existing user WIP from prior drain. Untracked items are runtime state (sentinel + plugin install). The Welcome.md leftover from v0.2.68 was cleaned up between drains.

**forge** (`~/projects/forge/`): clean.

**forge-client-obsidian** (`~/projects/forge-client-obsidian/`): clean.

## §5 — B7.1 conformance check

```
$ grep -c '\[\[[a-z_]*\]\](bars=' ~/projects/forge-music/percussion_lab/wake.md
6
```

6 wikilink-call patterns matching `[[<basename>]](bars=N)` shape — one per section Wake uses (companions, gathering, peak, dispersing, threading, resting). `solitary` and `swarming` are absent from both the English list and the Python facet.

## §6 — Surprises / deviations

None significant. The prompt's suggested wake.md shape landed verbatim. The 5 test cases match the spec; one design choice worth noting:

- **`test_wake_does_not_use_solitary_or_swarming`** uses a case-insensitive substring search against the wake.md source. The check would catch any future drain that introduces `solitary` or `swarming` references (even in prose), which is the intended hypothesis lockdown. If a future drain wants to mention either section in narrative (e.g., "unlike `solitary`'s sparse open"), the test would need refinement to look only at wikilink + Python contexts.

- **`test_wake_dispersing_section_inserts_decrescendo_hairpin`** asserts AT LEAST one `Diminuendo` spanner is present. This is permissive in case `lib.sequence()` or `with_velocity` ever adds additional dynamic markings; the dispersing section's hairpin is enough to satisfy the assertion. A stricter form would assert count == 1.

<!-- author: forge-music-cowork
     second-pass review: requested
     focus: Touches forge.music.lib percussion factory helpers (public API).
     Forge-core may want eyes on whether the music21 fix shape generalizes
     to other percussion classes not yet wrapped. Pure music-domain
     otherwise. -->

# Fix MuseScore rendering: percussion staves for non-kick drums (currently rendered as "Piano, <drum>" with 5-line treble staves)

## Scope

Investigate why MuseScore renders the kick stave of `percussion/murmuration.md` correctly as a single-line percussion staff labeled "Bangu Bass drum", while the other 6 staves (snare, closed hi-hat, open hi-hat, low tom, mid tom, crash cymbal) render as 5-line classic treble staves with "Piano, <drum>" labels on the left side of each staff. Identify what music21's MusicXML serializes differently for `BassDrum` vs the other percussion classes, and fix the factory helpers in `forge/music/lib.py` so all percussion staves render uniformly as percussion notation in MuseScore.

Also fix the "Bangu" naming oddity on the kick stave — music21's default name for `instrument.BassDrum` appears to be "Bangu Bass drum" (Bangu is a Chinese frame drum, not a standard kick). The factory helpers should override the displayed instrument name to something kit-conventional ("Kick" or "Bass Drum").

What this prompt does NOT do:
- Change Murmuration's musical content. Audio in GarageBand is GREAT and stays unchanged.
- Touch Verovio's percussion-clef rendering (in-Obsidian preview is forge-core concern, already known).
- Change `with_velocity` or any non-instrument helpers.
- Rewrite the factory helper API. Keep `closed_hihat()`, `open_hihat()`, etc. as-is at the call-site level; only their internal music21 configuration changes.
- Add new instruments beyond the 8 already in `lib.py`.

## Why

User confirmed v0.2.34 user-side smoke:
- **GarageBand audio**: GREAT. Kick + snare + hi-hat + toms + crash all play correctly with their actual percussion samples. Murmuration's compositional arc lands cleanly.
- **MuseScore visual**: partial regression vs the v0.3.5 spike. Only the kick stave renders as percussion notation (single-line, percussion clef). All 6 other percussion staves render as 5-line treble staves with "Piano, Snare Drum" / "Piano, Closed Hi-Hat" etc. labels on the left side of each staff in MuseScore's score view.

MuseScore is the high-fidelity export tier in forge-music's dual-tier rendering workflow (Verovio in-Obsidian for authoring previews; MuseScore for "show me the real score" via MusicXML download). Partial breakage of MuseScore rendering means a composer wanting to share or print the score gets a degraded artifact. Worth fixing.

Hypothesis to test: music21 is emitting some default Piano context (either at Score level or per-Part) that MuseScore reads alongside the percussion instrument metadata. BassDrum's serialization may put the percussion instrument metadata in a position that overrides the Piano default; the other percussion classes don't.

Audio routing is correct (kick goes to GM channel 10 + note 36, etc.) per the v0.3.5 + v0.2.34 findings; this is purely a MusicXML-output / MuseScore-rendering issue, not a MIDI-channel issue.

## Files to investigate then modify

**Investigate (read-only):**

- `~/projects/forge/forge/music/lib.py` — read the 8 factory helpers' current implementations.
- music21's source (via Python introspection or the installed package) — `from music21 import instrument` and `inspect.getsource(instrument.BassDrum)` etc. to see how each class differs.

**Modify:**

- `~/projects/forge/forge/music/lib.py` — update the factory helpers to whatever fix shape the investigation reveals.
- `~/projects/forge-client-obsidian/assets/engine/forge/music/lib.py` — bundle mirror.
- `~/projects/forge/tests/music/test_lib.py` — add a serialization-shape test that asserts the per-instrument MusicXML output matches the expected percussion shape (per-instrument; no Piano default).
- Possibly `~/projects/forge-music/percussion/murmuration.md` if the fix requires the snippet to call the factories differently (unlikely; keep call-site stable).

## Implementation notes

### Step 1: Dump Murmuration's MusicXML and inspect per-Part

```bash
cd ~/projects/forge && python << 'EOF'
from forge.core.executor import exec_python
from forge.core.snippet_registry import SnippetRegistry
import re

# Load + execute murmuration. Use the test_helpers fixture or a direct path.
reg = SnippetRegistry()
reg.scan_vault("/Users/odedfuhrmann/projects/forge-music/")
snippet = reg.get_in_vault("forge-music", "percussion/murmuration")
_, score = exec_python(snippet["body"], inputs={}, resolver=reg)

# Serialize to MusicXML.
from music21 import musicxml
xml = musicxml.m21ToXml.GeneralObjectExporter(score).parse()
text = xml.decode('utf-8') if isinstance(xml, bytes) else str(xml)

# Find all <score-part> blocks.
parts = re.findall(r'<score-part[^>]*>.*?</score-part>', text, re.DOTALL)
print(f"Total score-parts: {len(parts)}")
print()

for i, p in enumerate(parts):
    print(f"=== Part {i} ===")
    # Extract instrument-name, midi-channel, midi-program, midi-unpitched
    inst_name = re.search(r'<instrument-name[^>]*>([^<]+)</instrument-name>', p)
    midi_ch = re.search(r'<midi-channel>(\d+)</midi-channel>', p)
    midi_pgm = re.search(r'<midi-program>(\d+)</midi-program>', p)
    midi_unp = re.search(r'<midi-unpitched>(\d+)</midi-unpitched>', p)
    part_name = re.search(r'<part-name[^>]*>([^<]+)</part-name>', p)

    print(f"  part-name:        {part_name.group(1) if part_name else '(absent)'}")
    print(f"  instrument-name:  {inst_name.group(1) if inst_name else '(absent)'}")
    print(f"  midi-channel:     {midi_ch.group(1) if midi_ch else '(absent)'}")
    print(f"  midi-program:     {midi_pgm.group(1) if midi_pgm else '(absent)'}")
    print(f"  midi-unpitched:   {midi_unp.group(1) if midi_unp else '(absent)'}")
    print()
EOF
```

Capture output verbatim in feedback §1. The expected pattern: BassDrum (Part 0) should look one way; all 6 other parts should look another way. The DIFFERENCE between BassDrum and the others is the fix target.

Specifically look for:
- Does BassDrum lack a `<midi-program>` while the others have `<midi-program>1</midi-program>` (Acoustic Grand Piano default)?
- Does BassDrum have an `<unpitched>` element type or `<percussion>` clef directive that the others lack?
- Does music21 emit a default Piano instrument at the Score level that affects rendering of parts without explicit overriding metadata?

### Step 2: Inspect music21's per-class differences

```bash
cd ~/projects/forge && python << 'EOF'
from music21 import instrument

for cls_name in ['BassDrum', 'SnareDrum', 'HiHatCymbal', 'TomTom',
                 'CrashCymbals', 'RideCymbals']:
    cls = getattr(instrument, cls_name)
    inst = cls()
    print(f"=== {cls_name} ===")
    for attr in ['instrumentName', 'instrumentAbbreviation',
                 'midiChannel', 'midiProgram', 'percMapPitch',
                 'inGMPercMap']:
        val = getattr(inst, attr, '(no attr)')
        print(f"  {attr}: {val!r}")
    print()
EOF
```

Capture in feedback §2. Identify the attribute(s) that BassDrum has set differently from the others — that's likely the cause.

### Step 3: Diagnose and fix

Based on §1 + §2 findings, formulate the fix. Likely candidates:

**Candidate A**: Music21 emits `<midi-program>1</midi-program>` (Piano default) for instrument classes that don't override `midiProgram`. The factories need to explicitly set `inst.midiProgram = None` (or a specific GM percussion program number — though channel 10 makes the program irrelevant).

**Candidate B**: Music21's MusicXML serializer emits an explicit "this is a melodic instrument" marker for classes that don't have `inGMPercMap=True`. The factories may need to set `inst.inGMPercMap = True` explicitly (if BassDrum has this set by default).

**Candidate C**: The factories need to explicitly add a percussion-clef directive that gets serialized into the MusicXML `<clef>` element. Music21 may have a way to mark the Part as percussion that triggers the percussion-clef output.

**Candidate D**: Something entirely different that the investigation reveals.

Apply the fix to all 7 non-kick factory helpers (`closed_hihat`, `open_hihat`, `pedal_hihat`, `low_tom`, `mid_tom`, `high_tom`, `crash_cymbal`, `ride_cymbal`). Use the same fix for all of them; whatever the diagnosis, it should be uniform.

### Step 4: Naming cleanup ("Bangu" issue)

In each factory helper, explicitly set the displayed instrument name to something kit-conventional:

```python
def closed_hihat():
    inst = instrument.HiHatCymbal()
    inst.percMapPitch = 42
    inst.instrumentName = 'Closed Hi-Hat'
    inst.instrumentAbbreviation = 'CHH'
    # ... whatever else the fix from Step 3 requires
    return inst


def low_tom():
    inst = instrument.TomTom()
    inst.percMapPitch = 41
    inst.instrumentName = 'Low Tom'
    inst.instrumentAbbreviation = 'LT'
    # ...
    return inst


# BassDrum also gets an explicit name override to escape the "Bangu" default:
def kick():  # if a kick() factory exists; otherwise this is left to the
             # snippet to call instrument.BassDrum() with the override.
    inst = instrument.BassDrum()
    inst.instrumentName = 'Kick'
    inst.instrumentAbbreviation = 'K'
    return inst
```

If no `kick()` factory exists yet, ADD one for consistency with the other 8 factories. This is a small API addition (Phase A from the v0.2.34 prompt only built 8 helpers because hi-hat needed three variants; kick had only one shape so was left as direct `instrument.BassDrum()`. Adding `kick()` for naming consistency is reasonable).

### Step 5: Update tests

Add a per-helper serialization test in `tests/music/test_lib.py`:

```python
def test_closed_hihat_serializes_as_percussion_part():
    """The closed_hihat factory must produce a Part whose MusicXML
    output is recognized as percussion by external renderers (MuseScore).
    The post-fix shape: <midi-channel>10</midi-channel> + no Piano-default
    <midi-program> + percussion-instrument metadata."""
    from music21 import stream, note, musicxml
    inst = closed_hihat()
    part = stream.Part()
    part.append(inst)
    part.append(note.Note('C4', quarterLength=1.0))
    score = stream.Score()
    score.append(part)

    xml = musicxml.m21ToXml.GeneralObjectExporter(score).parse()
    text = xml.decode('utf-8') if isinstance(xml, bytes) else str(xml)

    # The exact assertion shape depends on the fix-step findings.
    # Likely shape:
    assert '<midi-channel>10</midi-channel>' in text
    assert 'Closed Hi-Hat' in text  # instrument-name override landed
    # Either:
    assert '<midi-program>' not in text  # if Candidate A is the fix
    # OR (and adjust per Step 3's findings):
    assert '<sign>percussion</sign>' in text  # if percussion clef is in the output

    # Either way, the post-fix MusicXML should NOT contain a Piano default.
    # The specific marker depends on the fix shape; refine after Step 3.
```

Repeat for each affected factory (low_tom, mid_tom, crash_cymbal, etc.). If they share a common predicate after fix, factor into a helper.

### Step 6: Bundle mirror + release

- Mirror `lib.py` and `llm_prompt.py` (if updated) to `assets/engine/forge/music/`.
- Engine-bundle drift preflight should pass at release time.
- Plugin manifest 0.2.34 → 0.2.35.
- Clean-vault smoke per cc-prompt-queue.md §141: extract zip, confirm bundled `lib.py` contains the updated factory helpers (grep for an attribute set in the fix that wasn't there before).
- `gh release create v0.2.35` with the zip.

Forge-music doesn't need a version bump if no snippet content changed (the snippets call the factories the same way; the factories' internals changed). If Step 4 added a `kick()` factory AND `murmuration.md` or `drums_shuffle.md` are updated to use it, bump forge-music 0.3.6 → 0.3.7.

## Tests

**Auto-verifiable by CC (run all; report):**

- §1 — Murmuration MusicXML inspection (verbatim per-Part output table).
- §2 — music21 per-class inspection (verbatim attribute table).
- §3 — diagnosis + fix landed (inline diff of `lib.py` changes).
- §4 — per-factory serialization tests (verbatim `pytest -q` output).
- Full engine suite `pytest -q` — count grows by the new tests; report `X/X`.
- Plugin suite `npm test` — count unchanged from v0.2.34's 161.
- Bundle-mirror diff clean.
- Engine-bundle drift preflight clean at release-zip time.
- Clean-vault smoke pre-tag.

**Deferred to user (Obsidian-context — load-bearing visual verification):**

1. `VAULT=~/forge-vaults/test1 bash ~/projects/forge-client-obsidian/scripts/install-latest.sh` → expect v0.2.35.
2. Delete `~/forge-vaults/test1/forge-music/` (recurring re-extract pain — still pending).
3. Cmd-Q + reopen Obsidian.
4. Forge-click `forge-music/percussion/murmuration.md` → click MusicXML download.
5. Open downloaded `.musicxml` in MuseScore.
6. **Verify:** all 7 staves render as single-line percussion staves (or whatever consistent percussion notation MuseScore picks); no "Piano, <drum>" prefix on any stave label; instrument names read sensibly ("Kick" / "Closed Hi-Hat" / "Snare Drum" / "Low Tom" / etc., not "Bangu Bass drum").
7. **Confirm audio unchanged:** download MIDI, open in GarageBand, confirm Murmuration still sounds GREAT (Step 4 should not have changed any audio behavior).

## Out of scope

- Changing Murmuration's musical content.
- Verovio in-Obsidian percussion-clef rendering (forge-core concern).
- The Verovio `<midi-player>` snare/hi-hat-as-piano playback issue (different code path; MuseScore's MusicXML rendering is the fix target here).
- Adding new percussion instruments beyond the 8 (9 with `kick()`) factories.
- Auto re-extract on `forge.toml` change (forge-core; still pending).
- Other items from the standing forge-core queue.

## Report when done

Standard cc-prompt-queue.md feedback structure, plus:

**§1 — Murmuration MusicXML inspection (verbatim).** Per-Part attribute table.

**§2 — music21 per-class inspection (verbatim).** Per-class attribute table comparing BassDrum to the other percussion classes.

**§3 — Diagnosis.** One-paragraph explanation of WHY BassDrum renders correctly while others render as Piano. Names the music21 attribute(s) responsible. References the table cells from §1 + §2 that show the difference.

**§4 — Fix landed.** Inline diff of `forge/music/lib.py` showing the factory helper updates. Commit hash. Push confirmation. Bundle mirror clean.

**§5 — Tests.** New test cases listed + verbatim run output (failing pre-fix, passing post-fix). Full-suite output.

**§6 — Release.** Zip path, size, SHA, GH Release URL, SHA round-trip, clean-vault smoke output.

**§Smoke split:** auto / deferred enumerated.

**§Follow-ups noted but not built:**

- If `kick()` factory was added, flag whether Murmuration / drums_shuffle should be migrated (separate small drain).
- Any music21 per-class differences uncovered that don't fit the BassDrum-vs-others split — could indicate Verovio rendering follow-ups too.
- Standing forge-core queue items unchanged.

**§Protocol comments for driver:** observations on the investigation-driven fix shape, music21 percussion-API gotchas, anything that should inform future percussion-touching prompts.

**§11 Constitutional alignment** per cowork-protocol's four-level disposition:

- Pure music-domain bug fix. Level 1 — silent approve. No constitution surface touched.

## Don'ts

- **Don't change Murmuration's musical content.** Audio is GREAT; preserve.
- **Don't ship a Verovio percussion-clef fix.** Different code path; forge-core concern.
- **Don't add new factory helpers beyond `kick()`** (if added for naming consistency).
- **Don't migrate `drums_shuffle.md` to use `kick()`** if added. Separate small cleanup, flag as follow-up.
- **Don't `gh release create` for forge-music.** Tag + push only on that repo.
- **Don't skip the clean-vault smoke before tagging.** Release-shipping rule.
- **Don't ship without confirming both MusicXML investigations (§1 + §2) produced the diagnosis (§3).** If §1+§2 don't reveal the cause, route to `questions/` — don't ship a speculative fix.
- **Don't run destructive git ops.**

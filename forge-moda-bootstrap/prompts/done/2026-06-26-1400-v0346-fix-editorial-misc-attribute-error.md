---
timestamp: 2026-06-26T14:00:00Z
session_id: drain-2026-06-26-1400
status: pending
priority: HIGH — driver spike blocked; v0.2.146 to_kit_notation broken at runtime
---

# v0.2.147 (renumber to current) — Fix `editorial.misc` AttributeError in to_kit_notation

## §0 — Bug report

Driver re-spike (2026-06-26) of v0.2.146's Unpitched migration:

```
runSnippet: Forge Compute non-2xx: 500
File "/bundle/engine/forge/music/lib.py", line 933, in to_kit_notation
    new_note.editorial.misc['forge_source_instrument'] = src_inst
File "/bundle/site-packages/music21/editorial.py", line 126, in __getattr__
    raise AttributeError(f'Editorial does not have an attribute {name}')
AttributeError: Editorial does not have an attribute misc
```

Root cause: `editorial.misc` is NOT a predefined attribute on music21's `Editorial` class in the version bundled with pyodide. Looking at `editorial.py` lines 108-128:

```python
# predefinedDicts = ('misc',)   ← COMMENTED OUT
predefinedLists = ('footnotes', 'comments')
predefinedNones = ('ficta', 'harmonicInterval', 'melodicInterval')

def __getattr__(self, name):
    if name in self:
        return self[name]
    elif name in self.predefinedLists:
        self[name] = []
        return self[name]
    elif name in self.predefinedNones:
        self[name] = None
        return self[name]
    else:
        raise AttributeError(f'Editorial does not have an attribute {name}')
```

So `editorial.misc` raises immediately because `misc` isn't in `predefinedLists` or `predefinedNones` and isn't yet a key on the dict. Direct assignment to `editorial.misc['key']` first reads `editorial.misc` (raises), then would set a key (never reaches).

## §0.1 — Why pytest didn't catch this

CC v0.2.146 §2.3 added `test_to_kit_notation_uses_unpitched_class` and updated existing tests. The tests likely pass because:
1. Engine pytest runs against music21 installed in `~/projects/forge/.venv` — possibly a different music21 version where `misc` IS predefined, OR
2. Tests construct synthetic Notes without exercising the editorial.misc set path (notes constructed without source instruments).

Driver runtime smoke caught it because the actual murmuration piece exercises the source-Instrument preservation path on real notes that DO have source instruments.

Textbook runtime-evidence-beats-source-audit case (v0.2.132 HARD RULE — third instance today). Engine pytest passes against its music21; pyodide's music21 sees the commented-out predefinedDicts and fails.

## §1 — Fix

### §1.1 — `to_kit_notation` editorial.misc initialization

In `forge/forge/music/lib.py` around line 933 (the offending site), wrap the misc set with initialization:

```python
# Before:
new_note.editorial.misc['forge_source_instrument'] = src_inst

# After:
if 'misc' not in new_note.editorial:
    new_note.editorial.misc = {}
new_note.editorial.misc['forge_source_instrument'] = src_inst
```

Editorial inherits from dict, so the `'misc' not in self` check uses dict membership — works regardless of whether music21 version predefines misc or not. The `= {}` setattr goes through `__setattr__` which writes to the dict (line 128 of editorial.py).

Alternative simpler approach (if any other site in lib.py also uses editorial.misc): write a small helper:

```python
def _set_editorial_misc(target, key, value):
    """Set target.editorial.misc[key] = value, initializing misc if needed.
    music21's Editorial class doesn't predefine misc as a dict in current
    bundled version (predefinedDicts is commented out)."""
    if 'misc' not in target.editorial:
        target.editorial.misc = {}
    target.editorial.misc[key] = value
```

Use whichever fits the code's existing style.

### §1.2 — Audit for other usages

```bash
grep -rn "editorial\.misc\|editorial\[.misc.\]" forge/
```

Each hit needs the same initialization guard. There may be NONE outside this one site, or there may be others; the audit confirms.

### §1.3 — Test updates

Existing `test_to_kit_notation_preserves_source_instrument` test (or whatever name CC chose) clearly passes. Either:
- The test sets up `note.editorial.misc = {}` before assertion (mask the bug).
- The test runs against a music21 where misc IS predefined.

Add a new test that REPRODUCES the runtime failure:

```python
def test_to_kit_notation_handles_uninitialized_editorial_misc():
    """v0.2.147 regression: ensure to_kit_notation works on notes whose
    editorial.misc attribute hasn't been pre-initialized (the runtime case
    that broke v0.2.146 in the pyodide-bundled music21)."""
    score = stream.Score()
    part = stream.Part()
    part.append(instrument.SnareDrum())
    # Default note: no editorial.misc pre-init
    n = note.Note('E2', quarterLength=1)
    part.insert(0, n)
    score.insert(0, part)
    
    # Should not raise AttributeError
    result = to_kit_notation(score)
    
    # And the source Instrument should be preserved
    out_note = result.parts[0].flatten().notes[0]
    assert 'misc' in out_note.editorial
    assert out_note.editorial.misc.get('forge_source_instrument') is not None
```

Also: if the existing test was passing only because it set up misc manually, REMOVE that setup so the test exercises the actual code path.

## §2 — Per-protocol HARD RULE compliance

- ✓ §78: investigation traced music21 Editorial source + identified `predefinedDicts` being commented out.
- ✓ §57–74: new failing-first regression test reproduces the runtime fault.
- ✓ §86–118: fix stays within `to_kit_notation`; optional helper extraction is internal.
- ✓ §76: driver-spike-confirmed; targeted fix.
- ✓ §347: release.sh bumps appropriately.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error: no new catches.
- ✓ v0.2.124 pure-core dispatch HARD RULE: pure-core unchanged.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: APPLIED (3rd instance today; reinforces the rule).
- ✓ v0.2.134 §5 inlined-version preflight: passes.
- ✓ v0.2.144 bundled-vault bump preflight: passes (no vault content changes).

## §3 — Tests + release

- 14 baseline engine pytests + 1 new regression test = 15 total.
- 786 plugin tests unchanged.
- Build clean.
- Tag + GH release.

## §4 — User-side smoke

After ship:
```
# 1. BRAT update.
# 2. Driver re-runs _spike2.md Forge-click.
# 3. Expected: NO AttributeError; murmuration computes through to_kit_notation cleanly.
# 4. Score renders. Evaluate Checkpoints A-D from spike 2.
```

If renders cleanly → Phase B (toolbar + dual XML production) is unblocked; can proceed as v0.2.148 follow-up.

If renders but checkpoints C/D still fail → engraving needs more work; queue separate prompt.

## §5 — Open follow-ups

1. **Phase B integration** (v0.2.146 §3 carry-forward): still queued. Driver's spike result determines whether Phase B ships speculatively or after further engraving fixes.
2. **Engine pytest environment audit**: this is the SECOND case (after v0.2.128 / v0.2.132) where pytest passed against its venv music21 but pyodide's bundled music21 saw different behavior. Worth confirming engine pytest's music21 version matches pyodide's, OR adding a CI step that exercises critical paths in pyodide directly. Out of scope here; flag.
3. **`editorial.misc` deprecation**: if music21's commented-out `predefinedDicts` line suggests this is a deprecated pattern, the right long-term fix may be to use a different storage mechanism for source-Instrument preservation. Defer; current fix works.

## §6 — Architectural framing

V1 cohort regression closure. Restores the v0.2.146 self-heal contract for source-Instrument preservation. Same shape as v0.2.132 fix (audit-vs-runtime gap closed).

The third runtime-evidence-beats-source-audit instance today is worth noting in retrospective — the rule pays its rent reliably.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

Single small focused drain. ~20-30 min CC time.

Driver's `_spike2.md` file at `~/projects/forge-music/_spike2.md` is the smoke validator after ship.

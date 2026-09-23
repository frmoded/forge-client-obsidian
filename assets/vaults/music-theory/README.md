# music-theory

A Forge vault for composing music with music21 in your Obsidian-based snippet workflow. (Renamed from `forge-music` in the Phase 5 two-vault split, 2026-08-06; sibling vault [music-core](https://github.com/frmoded/music-core) is the composition-primitive authoring surface.)

## What's inside

Two halves. The **theory** half is prose-and-practice: what a note, an interval, a scale, a chord, a rhythm, a melody, a texture, a piece of counterpoint or jazz or twentieth-century harmony actually is, each concept note explained so you build or hear it yourself rather than just read about it — a note that doesn't make you press Run at least once has skipped the point. The **composition** half is a library of action and data snippets — currently centered on **Slow Burn**, a fully-worked 12-bar blues in `slow_burn/`, plus a percussion section in `percussion/` (with percussion primitives imported cross-vault from `music-core/percussion_lab/`). Graded practice for the theory concepts and general widget demos both live together in `exercises/`. Each snippet is a Forge action that returns a `music21.stream.Score` (or a list of pitches, for the scale helpers); the plugin renders the result via Verovio in the Forge panel.

Concept navigation, if you're starting from theory:

- [[notes]] — the atom of music: how a note is named (notation) and what it physically is (physics), including consonance/dissonance and the math of beats.
- [[intervals]] — the distance between two pitches: numeric size plus quality.
- [[rhythm]] — how music organizes time: meter, note values, tuplets.
- [[scales]] — scales as ordered pitch sequences built from interval patterns; hear one, then build one yourself.
- [[melody]] — chord tones vs. decoration, motives, phrases.
- [[chord]] — chords built by stacking thirds: triads, seventh chords, inversions, voicings, chord symbols and Roman numerals, and how chords function together in progressions and cadences.
- [[voice_leading]] — how individual voices move from one chord to the next, and figured bass.
- [[form]] — phrases combining into sections, and the large-scale forms built from them.
- [[texture]] — how a chord's notes spread across time and register in actual accompaniment.
- [[chromatic_harmony]] — chords borrowed from outside the diatonic set, and modulation.
- [[counterpoint]] — independent melodic lines, from species exercises to the fugue.
- [[jazz]] — extended voicings, the ii–V–I progression, chord-scale relationships.
- [[modern]] — twentieth-century departures from tonal harmony: impressionism, set theory, serialism, minimalism.

Start wherever your question starts. Everything cross-links back to this page.

Layout:

```
music-theory/
├── README.md
├── LICENSE
├── NOTICE
├── forge.toml          # declares domains = ["music"]
├── notes/              # concept: what a note is (notation + physics)
├── intervals/          # concept: interval size and quality
├── rhythm/             # concept: meter, note values, tuplets
├── scales/             # concept: scales, interval patterns
├── melody/             # concept: non-chord tones, motives, phrases
├── chord/              # concept: chords (construction, notation, function)
├── voice_leading/       # concept: voice motion, figured bass
├── form/                # concept: phrase relationships, sectional forms
├── texture/             # concept: accompanimental textures
├── chromatic_harmony/   # concept: borrowed chords, modulation
├── counterpoint/        # concept: species counterpoint, invention, fugue
├── jazz/                # concept: jazz harmony and improvisation vocabulary
├── modern/              # concept: 20th-century post-tonal practice
├── exercises/          # graded theory practice + general widget demos (see [[exercises/Exercises]])
├── percussion/         # percussion notation + fully-worked percussion pieces
└── slow_burn/
    ├── twelve_bar_blues_progression.md  # I IV I I IV IV I I V IV I V (data)
    ├── chorus.md                        # 1 chorus = harmonic frame + AAB vocal
    ├── solo_chorus.md                   # instrumental chorus = form + solo
    └── slow_burn.md                     # the whole song: chorus × 3 + solo
```

Every snippet is reachable as both a qualified ID (`music-theory/slow_burn/slow_burn`) and as a bare sibling reference (`[[chorus]]` from inside `slow_burn/slow_burn.md`) per v0.2.26 caller-scoped resolution.

## How to use

The music-theory vault is **bundled** with the forge-client-obsidian plugin (as `forge-music` from v0.2.25 to v0.2.332; as `music-theory` from v0.2.333) — there's no separate install step. To activate it inside an existing Obsidian vault:

1. Edit your vault's `forge.toml` and set `domains = ["music"]` (or add `"music"` to an existing list).
2. Cmd-Q out of Obsidian and re-open it (a plain "Reload app without saving" may not refresh the bundle short-circuit).
3. The plugin extracts `music-theory/` into your vault root automatically (a pre-rename `forge-music/` dir, if present, is parked as `forge-music.bak.legacy/`).
4. Forge-click any Slow Burn snippet — e.g. `music-theory/slow_burn/slow_burn.md` — to compute and render it.

Top-level forge-clickable entry points:
- `slow_burn/slow_burn.md` → the whole 4-section piece.
- `slow_burn/chorus.md` → one vocal chorus.
- `slow_burn/solo_chorus.md` → the instrumental chorus.

## Authoring new snippets

Write new `.md` files in your vault root (vault-root files override bundled-library snippets via A4 shadow resolution), or in `<vault>/music-theory/slow_burn/` to extend the Slow Burn set directly. Follow the V2 note conventions:

- Frontmatter: `type: action` (or `data`).
- One `# Description` section (intent-level prose), one `# Recipe` section (`Let X = Call [[name]] with k=v.` chains; implicit-locking generates `# Python` on first Forge-click).
- Use `[[note_name]]` in Recipe to compose other notes — bare names resolve to siblings in your current subdir first, then walk the resolution order.

## Music-domain globals (pre-injected; do NOT import)

When a vault declares `domains = ["music"]`, snippets get these names in scope automatically:

**music21 modules**: `music21`, `stream`, `note`, `chord`, `meter`, `key`, `tempo`, `pitch`, `duration`, `instrument`, `harmony`, `roman`.

**Composition helpers** (from `forge.music.lib`):
- `bar(*items, time_signature=, number=)` → Measure (auto-pads trailing rest).
- `voices(*streams, instruments=)` → Score (parallel / overlay).
- `sequence(*streams)` → Score (linear; groups by instrument identity across sections).
- `repeat(stream, n)` → Score (n copies end-to-end).
- `minor_pentatonic(key_or_tonic, octave_range=(4,5), include_blue=False)` → list[Pitch].
- `major_pentatonic(key_or_tonic, octave_range=(4,5))` → list[Pitch].

**Base names** (always available, all domains): `random`, `math`, `numpy`.

For blues vocal/instrumental lines, prefer `minor_pentatonic` even when the source key is in major mode — the minor-pentatonic-over-major-progression pattern is the blues convention.

## Status

Active. v0.3.4 is the first version where every snippet is `lib.bar()` / `minor_pentatonic` / `major_pentatonic`-aware and the inert top-level scaffolds have been removed. Verified end-to-end via the plugin's Pyodide engine since plugin v0.2.27 (music21 bundling).

Bumps follow `v0.<feature>.<fix>` semantics in this vault. Releases are tagged on `origin/main`.

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.

## Part of the Forge ecosystem

- Main engine: https://github.com/frmoded/forge
- Plugin (the bundled distribution path): https://github.com/frmoded/forge-client-obsidian
- Sibling vaults: https://github.com/frmoded/music-core (composition-primitive authoring), https://github.com/frmoded/forge-moda

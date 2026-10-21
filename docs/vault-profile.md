# Vault profile — `profile` in a vault's `forge.toml`

*Added by drain 2026-10-21-1100 (score_first_experiment M0). Pure-core reader: `src/vault-profile-core.ts`.*

A vault can declare **one constant** in its `forge.toml` that tells the Forge plugin how to behave in that vault:

```toml
name = "music-playground"
version = "0.0.1"
description = "..."
domains = ["music"]
profile = "score_first"

[imports]
music-core = { local = "../music-core" }
```

## The rules

- **Absent means today's behaviour.** A vault without the key — the tutorial vault, `music-theory`, `music-core`, `forge-moda`, any lean-edition vault, any vault whose `forge.toml` is missing or unreadable — has no profile, and nothing in the plugin behaves differently for it. (Principle P3 of the score_first_experiment: contributions must not harm earlier projects. A test pins this for every vault the plugin ships.)
- **It is a constant of the vault, not a setting.** There is no command, menu, setting or modal that reads, writes or flips it. To change a vault's profile, edit its `forge.toml` and reopen the vault.
- **Placement matters.** It must be a TOP-LEVEL key: it has to appear **before** any `[table]` header (such as `[imports]`). In TOML every key after a table header belongs to that table, so a `profile` placed under `[imports]` is not the vault's profile and is ignored.
- **The value is exact.** Today the only known value is `"score_first"` (double or single quoted). Any other value, an unquoted value, or a commented-out line means "no profile".
- **A score-first vault gets no bundled-library extraction and no `Welcome.md`** (drain 2026-10-21-2200): the first-open extraction treats it like a library's own source repo (`extractionSkipFor` in `src/source-vault-core.ts`, the one question every extraction gate in `welcome.ts` asks). Its libraries arrive through `[imports]` (`music-core`), mounted into the engine at open; the vault on disk stays `bars/ phrases/ kits/ notebook/` plus whatever you make. A vault without the key extracts exactly as before.
- **Other readers ignore it.** The engine's manifest reader (`forge.core.manifest.read_manifest`) reads `name`, `version`, `description`, `dependencies` and `domains` only, so an extra key costs nothing there; neither the music-domain gate, the `[imports]` mount nor the bundled-library source-repo check looks at it (pinned in `src/score-first-p3.test.ts`).

## What `score_first` does (music edition; milestone M1)

- **New bar** — a command (palette) and a ribbon button, present **only** in a score-first vault. It makes `bars/bar_001.md`, `bar_002.md`, … (a rhythm data note with the same starter as *New Forge note → Rhythm (Beat Box)*: 4/4, 16 steps, kick on 1 and 3, snare on 2 and 4) and opens it in the Beat Box.
- **Score underneath** — in the Beat Box tab of a rhythm note, the engraved score of the **current** data sits right under the grid / circle and redraws (debounced) after every edit. Read-only; it never writes. In the lean edition, which has no score, one line says so instead.

## Inspecting the Score (music edition; milestone M3, single bar)

- **Click an engraved note** — it is pinned and the **Inspector** under the Score shows its lineage: the hit (channel, step, beat, velocity if authored), then the note it came from, with an **Open note** button. Esc or a click on empty space lets go; the arrow keys walk the notes in step order. (Clicking a note still also plays from it — the Score's existing click-to-play.)
- **Hover-link, both ways** — hovering an engraved note outlines its step in the Beat Box (grid or circle); hovering a grid step / ring cell lights the engraved note. Highlights are classes and outlines only: nothing moves.
- **How it works** — the engine's MusicXML gets a deterministic `<note id="a_<channel>_<step>">` on every hit before Verovio draws it (Verovio keeps the id), verified against the data: if the Score's hits are not exactly the data's, the map is refused and the Inspector says why. A ring that is not one note value is drawn as tied notes; the tail carries `…_t1` and the same provenance. The Kit view is mapped only when its fold is time-faithful (it is not for every bar; the multi-staff view always is).
- **Off elsewhere** — the widget's hover-link is inert unless the host's load message says `hoverLink: true`, which only the score-first Beat Box tab sends.

## Where the code is

| What | File |
|---|---|
| Reading the key (the one place) | `src/vault-profile-core.ts` — `readVaultProfile`, `isScoreFirstToml`, `isScoreFirstVault` |
| Decisions: bar names, the New bar action, what the tab shows | `src/score-first-core.ts` |
| The live Score controller (debounce, single-flight, messages) | `src/live-score-core.ts` |
| The Score area's DOM (keeps the old score until the new one arrives) | `src/live-score-dom.ts` |
| Provenance map (ids through Verovio, verified against the data) | `src/provenance-core.ts` |
| The generic inspector layer (hover, pin, keys, enlarged targets) / the Score's panel | `src/artifact-inspector-core.ts`, `src/score-inspector.ts` |
| Obsidian glue | `src/score-first.ts` (New bar), `src/rhythm-edit-view.ts` (the tab) |

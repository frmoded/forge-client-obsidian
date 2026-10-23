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
- **How it works** — the engine's MusicXML gets a deterministic `<note id="a_<channel>_<step>">` on every hit before Verovio draws it (Verovio keeps the id), verified against the data: if the Score's hits are not exactly the data's, the map is refused and the Inspector says why. A ring that is not one note value is drawn as tied notes; the tail carries `…_t1` and the same provenance. The Kit view is mapped the same way and only when it verifies against the data (since forge `ecdecaf` the engine's Kit fold is time-faithful: simultaneous hand hits are one chord, a note ends at its voice's next onset; before that, a bar with two overlapping hand channels such as `bar_004` ran long and was refused). The Kit view's tied tails get ids of their own and are in the map too.
- **Off elsewhere** — the widget's hover-link is inert unless the host's load message says `hoverLink: true`, which only the score-first Beat Box tab sends.

## Communication on the score (music edition; milestone M4)

- **The Forge output panel stops opening by itself** in a score-first vault: a message or a run does not open, reveal or expand it (so the screen stays with the score). Every message still reaches it — now if it exists, or the moment it is first opened — because it is the truth log. A person's own gesture opens it exactly as everywhere else: "Open Forge panel", "Forge log (N)", and a deliberate **Forge (hammer)** click (Run lives only in that panel). These gestures are never silent: a click that cannot open the panel says so in the console and in a Notice, and leaves `[forge-log]` lines that show how far it got.
- **On the Score, under the status line:** a message line (an error stays until the next successful draw; success, LLM and out-of-date lines last a few seconds) and a quiet **Forge log (N)** button (N = messages that arrived since the panel was last open).
- **Where the decision lives:** `src/score-first-messages-core.ts` (`routeMessage`: outside a score-first vault it answers "reveal" for everything; the shared delivery state), applied at the two choke points `forgeNotice` (`src/forge-notice.ts`) and `ForgePlugin.getOutputView` / `forgeOutput` (`src/main.ts`), shown by `src/score-messages-dom.ts`. The flag is published by `score-first.ts` from the profile answer; no other file reads the profile.

## Phrases (music edition; milestone M5)

- A **phrase** is a data note in `phrases/` holding only `{kind: "extend", source, bars, style, tempo_change_pct}` (never bars). Its Score is derived: the source bar (`bars/<source>.md`) goes through the engine's `extend_rhythm` (the bar stretched to `bars` bars, the tempo stepping once per bar by `tempo_change_pct` over the run) and `rhythm_bars_to_stream` (each bar keeps its own tempo mark).
- **Commands (score-first vaults only; absent everywhere else, both editions):** `New phrase from this bar` (offered while the active note is in `bars/`; makes the next `phrases/phrase_NNN.md` with bars 4, `repeat_with_fills`, 0 % and opens it) and `Open phrase as Score` (offered on a `phrases/phrase_NNN.md`; switches that tab). The phrase tab has three controls (Bars 1-64, Style, Tempo change -90..+100 %); a control writes the note's json block, a modify of the phrase or of its source bar redraws (the same debounced live Score as the Beat Box tab: one render in flight). A missing or invalid source is a refusal line on the Score, never a panel message.
- **Where the code is:** `src/phrase-core.ts` (parse, validate, clamp, names, the commands' decisions, the Score of a phrase), `src/phrase-dom.ts` (the control strip and the freshness rules, plain DOM), `src/phrase-view.ts` (the Obsidian tab), `src/phrase-engine.ts` + `_forge_rhythm_phrase_payload` in `src/pyodide-host.ts` (the engine call). Registered from `src/score-first.ts` after the profile answer is yes.

## Navigating a phrase (music edition; milestone M6)

- **Every bar of a phrase's Score answers "which note, which parameter, which parent":** each engraved bar is a measure group whose id the plugin put on the engine's MusicXML (the first part's measures; Verovio keeps them). Clicking a bar (or the arrow keys, Esc to let go) pins it and the inspector shows `bar 5 of 8 | made by phrase_001 (extend, slowing 20 %, style repeat_with_fills) | from bar_005 | tempo 89`; the tempo is read from the engine's own `<sound tempo>` for that bar, not recomputed. The phrase and the source bar are links (**Open note**); hovering an entry lights the bars it covers; hovering a bar with nothing pinned previews its stack.
- **The bracket** above the Score (`phrase_001 · 8 bars`) lights every bar the phrase made and opens the phrase note; the source name in the strip opens the bar.
- **It is the bar inspector, reused:** `score-inspector.ts` takes optional phrase options (lineage, order, hint, preview) that are absent for the Beat Box tab; the Beat Box tab's DOM and behaviour are pinned unchanged. The pure part is `src/phrase-lineage-core.ts`.
- **The way back from JSON (2100):** while a phrase note is shown as text in a score-first vault, its tab header carries **Open as Score** (the Beat Box's own label; `src/phrase-header-core.ts`, wired in `score-first.ts`); the rhythm note buttons are not shown on a phrase there. The phrase strip also says in plain words what the chosen style does (`PHRASE_STYLE_NOTES`; the fill rule is pinned against the real engine).
- **Lighting (2300):** a lit bar gets a translucent band inside it (inline-styled, behind its drawing, never hit-testable; stronger for a pin than a hover) and the other bars are dimmed while one is pinned, so it shows whatever the stylesheet or theme does; the CSS recolour stays as a second cue. Option `band` of the artifact inspector; the bar's Beat Box tab does not use it.
- **Not done:** opening a phrase from the file explorer still needs the two commands (the Beat Box's automatic default-view swap was not taken: its event order cannot be proven without the real Obsidian).

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

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

## Clicking a note does not play (music edition, score-first vaults; 2026-10-23)

- In a score-first vault a click on an engraved note only selects (the inspector pins its bar / lights the note); it no longer starts the whole score playing. Sound is the Score's own Play control. **Every other vault is unchanged:** a click on a note still jumps the player to it and starts it. The one answer is `scoreClickPlays()` in `src/score-click-policy.ts` (the published profile flag, asked at the click); every surface that engraves a Score hands it to `renderTaggedMusicXML(…, { clickToPlay })` (the Beat Box tab, the phrase and mix tabs, the read-only Score view, the embed, the Forge output panel), and the handler itself is `src/score-click-play-dom.ts`.

## Mixing two bars (music edition; milestone M7, Phase A)

- A **mix** is a phrase with `"kind": "mix"`: `{"kind":"mix","a":"bar_005","b":"bar_006","weight":0.5,"threshold":0.5,"ghost":false}`. Same folder, same `phrases/phrase_NNN.md` name, same `Open phrase as Score`, header **Open as Score** and tab restore as an extend. Hand-edited JSON that is wrong is refused naming the field (`weight` 3 is a refusal line on the Score, no crash).
- **What it does:** the engine's `mix_rhythm(a, b, weight, threshold, ghost)` (forge/music/lib.py; pure) makes ONE bar from the two. A step is a hit when `weight * a + (1 - weight) * b >= threshold` (a hit is 1, a rest 0; a step neither bar hits is never a hit). **Ties:** at weight 0.5 and threshold 0.5 a hit in only one bar IS placed, so the bar is the union; raise the threshold above 0.5 for the intersection. A placed hit's velocity is the weighted mean of the velocities of the bars that hit there (a plain hit counts as 90, rounded half up); `ghost` adds velocity-36 hits where the mix is at least half the threshold; tempo and swing are the weighted mean, rounded half up. The two bars must have the same time signature, steps and group size (the engine's `mix_rhythm: …` message is the Score's refusal line when they do not). The Score is that bar through `rhythm_bars_to_stream`.
- **Command:** `New mix from this bar` (score-first vaults only, offered only on a bar, absent in the tutorial and lean editions): `a` is the bar you are on, `b` the first OTHER bar in `bars/` by number (the same bar, with a Notice, when there is only one), weight 0.5. **The tab:** two bar dropdowns, a **Weight** slider (0..1, step 0.05, its number beside it), a **Threshold** slider, a **Ghost notes** checkbox and one plain-words sentence. Sliders write the note as they move; writes run one at a time and the next one carries the latest values, and the Score is drawn at once with at most one draw in flight (changes meanwhile collapse into one next draw): a drag is live, nothing queues.
- **Not in Phase A:** no audio while scrubbing, no morph strip, no 3-way mix (Phase B). (A mix had no inspector in Phase A; M8 below gives it one. It still has no bracket and no source link: those are the extend's.)
- **Where the code is:** `src/phrase-core.ts` (the `extend | mix` union, validate, clamp, sentence, `planNewMix`/`createNewMix`, the Score of a mix), `src/phrase-dom.ts` (`mountMixControls`, the strip swap when the note's kind changes, the coalescing write loop), `_forge_rhythm_phrase_payload` in `src/pyodide-host.ts` (the engine call), `New mix from this bar` in `src/score-first.ts`.

## Navigating through a mix (music edition; milestone M8)

- **Click the staff (the bar) or a notehead (a hit)** in a mix's Score; the Inspector under it answers where it came from. **The bar:** `made by phrase_00N (mix, 70 % bar_005 / 30 % bar_006, threshold 0.50)`, then `from bar_005 (70 %)` and `from bar_006 (30 %)`, each with an **Open note** link (a bar opens in the Beat Box, the phrase as a phrase tab), then a legend. **A hit** gets its own line first: `this hit: from bar_005 only, velocity 90`, `from both bars`, or for a ghost `ghost: only bar_005 has it (v 0.40, below threshold 0.50)`.
- **Derived, never read off the engraving:** each hit's parents come from the two bars' data with the engine's own rule (v = weight * pA + (1 - weight) * pB; placed at v >= threshold; a ghost at v >= threshold / 2), then **cross-checked against the bar the engine really returned** (the plugin's glue hands it back as `mixed_bar`): a hit the rule predicts and the engine did not return, or the reverse, makes the Inspector say it cannot map the Score (never a guess). The velocity shown is the engine's own. A real-engine test sweeps weights, thresholds and ghost on real and richer bars as a drift guard.
- **A cue that survives themes:** while something in the mix is pinned, every notehead is drawn by parent as an inline fill AND a small shape (blue ▲ only bar a, orange ■ only bar b, purple ● both; hollow and lighter for a ghost). Moving the **Weight** slider keeps the pin (the same hit if it still exists, else the bar) and the stack and colours follow. **Esc** lets go and restores the markup exactly. Arrow keys do nothing (one bar).
- **Where the code is:** `src/mix-lineage-core.ts` (classification, the engine cross-check, id annotation, the stack), `src/mix-hits-dom.ts` (the painter), `keepPin` / `decorate` / `enlargeIds` on `src/score-inspector.ts` and `src/artifact-inspector-core.ts` (all optional: the bar's and the extend's inspector are unchanged), wired in `src/phrase-dom.ts`; the engine glue in `src/pyodide-host.ts` also returns `mixed_bar`.

## Editing one bar of a phrase: fork on edit (music edition; milestone M9)

- **The data model:** an extend phrase may carry `overrides`: `{"kind":"extend", …, "overrides": {"3": "bars/bar_009"}}`: bar number (1 to `bars`) -> the bar note that stands in for that generated bar. Without it, everything is as before (the same Score, the same JSON text). A bad override is refused naming `overrides` (a key that is not a bar of this phrase, a value that is not `bars/bar_NNN`); a fork note that is missing, unusable, or on a different grid (time signature, steps, group size) is a refusal line naming the bar and the note. A mix has no overrides (one bar).
- **In the phrase's Inspector (a bar pinned):** **Edit this bar** (only on a bar that is not already a fork) writes that bar's generated data as the next free `bars/bar_NNN.md` (a rhythm data note the Beat Box opens; its `forked_from: "phrases/phrase_001 bar 3"` lineage line is in the FRONTMATTER, because the body must be exactly one json block, and the Beat Box's save rewrites only the json block), THEN writes the override into the phrase JSON, THEN opens the fork in the Beat Box. If the second write fails, nothing is deleted and the Notice names the leftover note. A forked bar's stack reads `bar 3 of 8`, `forked: edited in bar_009 (was made by phrase_001, repeat_with_fills)` (with an **Open note** link) and `tempo 97 (the fork's own)`; **Revert to generated** removes the override (the fork note stays; this milestone deletes nothing).
- **The Score:** the engine glue lays each fork's data over the generated bar of that number (a forked bar plays at its own `tempo_bpm`); the generated bars come back as `bars_data` (what Edit this bar writes). The phrase tab watches its fork notes (the same modify watcher as its source bar), so editing the fork in the Beat Box redraws the phrase. The staff is justified, so a bar with more notes makes its neighbours reflow a little; their notes and data are unchanged. Console evidence: `[forge-fork] …` lines.
- **Where the code is:** `src/phrase-fork-core.ts` (the fork note, the pure edits, the two actions), `overrides` in `src/phrase-core.ts`, the stack in `src/phrase-lineage-core.ts`, the action button in `src/score-inspector.ts`, wired in `src/phrase-dom.ts` and `src/phrase-view.ts`; `override_bars` / `bars_data` in the glue in `src/pyodide-host.ts`.

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

## A phrase note opens as its Score by default (2026-10-23-0630)

In a score-first vault, a `phrases/phrase_NNN.md` note that comes to show as text in a main-area or sidebar tab (explorer click, wikilink, quick switcher, `Open note`) is switched, in that same tab, to its phrase tab. The tab is
switched with `popstate` (kept out of the navigation history). Evidence line, printed once per outcome: `[forge-phrase] routed <path> -> score|json (reason)`.

- **Only phrase notes** (`isPhrasePath`): not bars, not `phrases/README.md`, not anything else. **Only score-first vaults**: the router is created inside the profile gate, so any other vault has no router at all (P3), and it asks the live
  profile answer at every event.
- **Open as JSON stays JSON.** The phrase tab marks its leaf (`chooseJson`) BEFORE it switches the tab to the note's text; the mark belongs to that leaf and that file and ends when the leaf shows another file. `Open as Score`
  (header button, command) clears it. The +150 / +600 ms header re-syncs and every workspace event find the mark and leave the tab alone.
- **A tab restored with the layout keeps its text.** The tabs that exist when the router is registered are a baseline (read from each leaf's saved view state, so a background tab that has not loaded yet counts); such a tab is
  routed only after its leaf shows another file.
- Pure rules in `src/phrase-default-view-core.ts` (`decidePhraseRoute`, `createPhraseRouter`); wiring in `score-first.ts`. The Beat Box has its own, older mechanism for bars (`rhythm-default-view-core.ts`); the two do not share state.

### One tab per phrase (2026-10-24-0900)

Obsidian's explorer, links and quick switcher open a note with `getLeaf(false).openFile(file)`: they navigate the current tab and never look for a tab that already shows the note (read from Obsidian 1.14.5's `app.js`;
a custom view such as the phrase tab is not accepted for `.md`, so the clicked tab first becomes markdown text). So the router, when a leaf has just opened a phrase as text and ANOTHER leaf already shows that phrase (its Score, or
its note as text, which includes the tab left on `Open as JSON`), focuses that tab and dismisses the clicked one: back to what it showed, or closed when it was a fresh tab (the two moves Obsidian itself makes in
`FileView.onDelete`). A tab that cannot give way (the only tab of its pane, nothing to go back to) shows the Score as before: a second tab, never a loop. Two different phrases still get two tabs. The explicit `Open phrase as Score`
command and the `Open as Score` header button are unchanged. Evidence line: `[forge-phrase] reused <path> (focused existing tab)`.

#### The clicked tab is put back, never lost (2026-10-25-0800)

The 0900 dismissal went wrong when the person clicked a phrase in the explorer while another tab showed the phrase they were reading: the clicked tab lost its view (or was closed). Cause, read from Obsidian 1.14.5's `app.js`:
`setViewState` records the replaced view in `leaf.history` only at its END, while `file-open` (our trigger) fires inside it and the leaf is `working`, so the back stack was still empty and "nothing to go back to" closed the
person's tab (Obsidian then logged a `RangeError` from `saveHistory`). Now the plugin records what every tab showed on every workspace event (`trackLeaves`), waits for the leaf to be idle (Obsidian ignores `setViewState` on a
busy leaf), puts the recorded view back with `setViewState(..., { active: false, popstate: true })`, checks it landed, and retries a few times. A tab is closed only when it was made by the gesture itself (never seen before) and has
siblings. A phrase that was showing as JSON text stays text. If the restore never lands the tab shows the Score (a second tab), never closed. Evidence line:
`[forge-phrase] reused <path> (focused existing tab; restored <other> in the clicked tab)`. The fork's `Open note` and the lineage links reuse an already-open bar tab (its Beat Box, Score view or text) or phrase tab the same way
(`[forge-phrase] reused <path> (focused existing tab)`). Obsidian's own explorer rule (it replaces the active tab) is not ours to change.

### Pinning a bar by clicking anywhere in it (2026-10-24-1100)

A click pinned a bar only when its target was a drawn part of that bar. The Score's SVG paints only its marks (staff lines, noteheads, stems, text); the space between staff lines, or a pixel beside a small notehead, belongs to
the `<svg>` root, so a click there had no bar above it and counted as "empty space", which UNPINS. Measured in real Chrome with real pointer events: every drawn part pinned, every empty point inside a bar did not (0 of 15 in an
extend tab, 0 of 3 in a mix tab). The phrase and mix inspectors now also select a bar by its BOX: a click whose target is under no mapped element but whose point is inside the box of a bar pins that bar (the smallest box wins; a
drawn part still pins its own bar first; a mapped note still pins itself). A click outside every bar, and Esc, still let go. Other surfaces name no such elements and are unchanged. Evidence line, one per click:
`[forge-pin] click <element kind> -> bar N|none (reason)`. Ghost notes are drawn whether or not anything is pinned (8 noteheads with Ghost on at weight 0.4, 4 with it off, pinned or not); pinning only colours them by parent.

## A morph: n bars along an ordered path of single-hit edits (2026-10-24-1200, M7c Phase A)

`phrases/phrase_NNN.md` can hold `{ "kind": "morph", "a": "bar_005", "b": "bar_006", "bars": 5, "order": "musical", "seed": 0 }` (with `"position": k` when `bars` is 1). It is a third phrase kind next to the extend and the mix; the mix
(the weighted vote) is untouched. The engine is `morph_rhythm(a, b, bars, order, seed, position)` and `morph_rhythm_info(a, b, order, seed)` in `forge/music/lib.py`: the cells that differ between the two bars are `d` single-hit
edits (a hit in `a` only = remove, in `b` only = add; a hit in both keeps `a`'s velocity); state `k` is `a` with the first `k` edits applied; bar `i` of `n` is state `round-half-up(i * d / (n - 1))`, so `bars = d + 1` is *atomic*
(each bar one hit from the last). Orders: `musical` (default: removals and additions each weakest metric position first, interleaved in proportion, strong beats last), `seeded` (a shuffle driven by `seed` through a pure integer hash,
the same in CPython and Pyodide), `by_channel`. Tempo and swing slide linearly, half up. The tab (`New morph from this bar`, same gate as `New mix from this bar`) has Bar a, Bar b, Bars with an **Atomic** button (Bars = d + 1,
at most 64), Order, Seed (only for `seeded`) and a Position slider (only while Bars is 1: `k of d changes`), and one sentence: `Morph from bar_005 to bar_006 in 5 bars: 4 single-hit changes (musical order).` The number of
changes `d` is the one rule mirrored in TypeScript (`morphEditCount`); a real-engine sweep pins it to the engine's own `d`. No Inspector yet (the next prompt). Evidence lines (Info): `[forge-morph] wrote …` and
`[forge-morph] engine asked … -> bars N, d D`.

## Navigation through a morph, fork on a morph bar, and the demo bars (2026-10-24-1230, M7c Phase B)

A morph's Score is inspectable the way an extend's and a mix's are. **Click a bar** (a drawn part, or anywhere in its box: Iteration 123) or arrow to it: `bar 3 of 5`, `made by phrase_004 (morph bar_005 -> bar_006, musical order)`,
`step 2 of 4 single-hit changes applied`, `from bar_005` and `from bar_006` (each an **Open** link), `tempo N`, then the change that made THIS bar from the previous one (`removed kick at step 3`; steps are numbered from 1 as in the
Beat Box; the first bar says `unchanged: this is bar_005`, the last ends `; this is bar_006`, a bar that repeats the previous state says `no change from the previous bar`), the legend, **Edit this bar**. **Click a notehead** to pin that hit:
`this hit: from both bars` / `from bar_005 only (removed in bar 4)` / `from bar_006 only (added in bar 3)` over its bar's stack; the pinned bar's noteheads are painted by where the hit came from (the mix's blue triangle, orange square,
purple circle, inline-styled).

How it is derived (never from the engraving, never from a second copy of the engine's rules): the glue returns the engine's own bars (`bars_data`) and the edits in the order it applied them (`morph_info`); bar `i` is state `k` when
bar a with its first `k` edits has exactly bar `i`'s hits (the edits touch distinct cells, so at most one `k` fits); a bar that fits no `k` is a refusal naming it. Every notehead of every generated bar gets an id with the bar in its scope
(`mo3_kick_2`), checked against that bar's data; the Kit view carries the bar ids only. **Edit this bar** on a morph bar forks it exactly as an extend's (M9): `bars/bar_NNN.md` with `forked_from: "phrases/phrase_00N bar 3"`, THEN the
phrase's `overrides`, THEN the Beat Box opens it; **Revert to generated** removes the override and nothing is deleted. A forked bar keeps its place on the path (the glue also returns `morph_generated`, the bars before the forks were laid
in), so its neighbours' sentences do not change; the fork's own hits are not mapped (the bar pins). The demo pair `bars/bar_007.md` (a straight rock groove) and `bars/bar_008.md` (an afro-cuban feel, son clave 3-2) differ in 16
cells and are made by `scripts/dev/make-demo-bars.ts` through `createNewBar` and the Beat Box's save path, never hand-authored. Evidence line: `[forge-morph] inspector mapped 5 bars and 30 hits` (or why it could not map).

## Turning a mix into a morph (2026-10-25-1000)

A mix is a weighted vote: a hit has only three possible scores (in both bars, only a, only b), so one threshold gives about two visible states. The morph (above) has the granular path. **Turn this mix into a morph** is the one gesture
from the first to the second: Cmd+P **Turn this mix into a morph**, or the **Morph this mix** button in the mix tab's control strip. It makes the next free `phrases/phrase_NNN.md` of `kind: "morph"` with the mix's `a` and `b`, `order: "musical"`,
`seed: 0` and `bars` = d + 1 (capped at 64; d = 0 gives the morph's default 5) and opens it as a Score. `d` is the ENGINE's count (`morph_rhythm_info`, through the plugin glue `_forge_morph_changes`), never a copy of its rule; the mix's weight, threshold and ghost
are not carried; the original mix note is only read, never written. The command is offered only while the active tab shows a mix phrase (its Score tab or its JSON text), in a score-first vault, and acts on the active VIEW's own note (the button on that tab's own note), never on a leaf lookup.
Every refusal is one Notice naming why (not on a mix, the mix or a bar cannot be read or is not usable, the engine is not ready or refuses the pair), a caught error is a `console.error` naming `turnMixIntoMorph`, and nothing is created for a turn that did not happen.
Evidence line: `[forge-morph] turned phrase_002 (mix) into phrase_00N (morph, bars B, d D)`. Code: `turnMixIntoMorph`, `planMorphFromMix`, `morphBarsFor` and `turnMixIntoMorphAvailable` in `phrase-core.ts` (pure, ports injected), the button in `mountMixControls` (`phrase-dom.ts`), the command and the host call in `score-first.ts` and `phrase-engine.ts`.

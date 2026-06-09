# INSTALL.md — disclose the `html-midi-player` SoundFont network fetch on first audio play

## Scope

Add an honest one-line note to `~/projects/forge-client-obsidian/INSTALL.md` clarifying that the closed-beta plugin is fully offline for the Pyodide-compute path, BUT audio playback in the music domain fetches a SoundFont from a Google Cloud bucket on first play. Update the bundled mirror inside the release zip. No code changes.

What this prompt does NOT do:
- Bundle a local SoundFont (that's the bigger v1.0-audit item (x).b — separate prompt when prioritized).
- Change `output-view.ts` audio playback wiring.
- Cut a new plugin release tag unless CC judges the doc update significant enough — discretion below.

## Why

v0.2.33 drums-spike feedback §10 item 4 surfaced this: `output-view.ts:365-385` mounts `html-midi-player` which fetches `storage.googleapis.com/magentadata/...` on first play. INSTALL.md currently says "everything bundled locally" — true for compute, NOT true for audio playback. Honesty about the closed-beta state lets students prepare (one network round-trip needed, then cached for offline subsequent plays).

This is v1.0-audit item (x), shape (a) — the cheap documentation fix. Shape (b) (bundle a SoundFont locally) is a separate larger drain deferred until v1.0 audit.

## Files to modify

- **`~/projects/forge-client-obsidian/INSTALL.md`** — add a "Network requirements" subsection (or extend an existing offline-claim section). Single paragraph, 2-3 sentences.

## Implementation notes

### Proposed text

Insert after whichever section in INSTALL.md currently makes the "everything bundled locally" / "offline / no Python install" claim. Suggested wording:

> **Network requirements**
>
> The Pyodide compute path is fully offline once the plugin is installed — all Python, the music21 library, and forge engine code run inside your browser. **One exception**: audio playback (the play button on rendered music scores) uses `html-midi-player`, which fetches a SoundFont file (~1-2 MB) from `storage.googleapis.com/magentadata/` the first time you press play. The file is browser-cached after the first fetch, so subsequent plays work offline. If you're behind a strict firewall or air-gapped, audio playback won't initialize; visual score rendering, all computation, and freezing all work without network.

Adjust phrasing to match INSTALL.md's existing voice — CC reads the current INSTALL.md before drafting the addition to keep tone consistent.

### Discretion: cut a release?

If INSTALL.md isn't shipped inside the release zip (just a repo doc), no release needed — commit + push is enough. If INSTALL.md IS bundled (it's referenced by the install script or appears in the zip), bump manifest.json `{CURRENT} → {NEXT_PATCH}` and cut a release so the bundled INSTALL is correct in the artifact students download. CC reads `scripts/build-release-zip.mjs` to determine which path applies.

If a release is cut, the bundled INSTALL.md needs to match the source. Run the engine-bundle drift preflight as usual.

## Tests

### Auto-verifiable by CC

- `grep -c "storage.googleapis" INSTALL.md` ≥ 1 post-edit.
- `grep -c "Network requirements" INSTALL.md` (or whatever subsection heading is chosen) = 1.
- `npm test` in `forge-client-obsidian` → unchanged `161/161` (no code changes).
- If release cut: clean-vault smoke confirms the new text appears in the zip's INSTALL.md.

### Deferred to user

- Skim the rendered INSTALL.md (on GitHub or in a markdown previewer); confirm phrasing reads cleanly + doesn't undercut the offline-ness story for the compute path.

## Out of scope

- Bundling a local SoundFont (item x.b).
- Changing `output-view.ts` to use a local SoundFont URL.
- Adding an Obsidian-side "audio playback is offline-ready" status indicator.
- Modifying the closed-beta install script or auto-install flow.

## Report when done

Standard §0-§2:
- §0: commit SHA, push, optional tag + release URL.
- §1: the edit (full new section quoted in §1.3).
- §2: judgment call on release-cut-or-not (note the reasoning in §2).

## Don'ts

- Don't write a wall-of-text "future SoundFont bundling roadmap" inside INSTALL.md — INSTALL is for current state, not future plans. Roadmap lives in v1-audit.md.
- Don't bury the disclosure inside a paragraph about something else — give it its own subsection or clearly-marked sentence.
- Don't claim a precise SoundFont size unless you actually verified the file size; "~1-2 MB" is honest based on the drums-spike feedback's mention of the URL but isn't independently confirmed. CC can either curl the URL once to measure, or hedge phrasing ("a small SoundFont file").
- Don't bundle a SoundFont in this drain (out of scope above).

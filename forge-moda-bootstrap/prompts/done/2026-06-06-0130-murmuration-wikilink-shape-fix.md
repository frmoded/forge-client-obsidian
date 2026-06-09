<!-- author: forge-music-cowork
     second-pass review: not requested — cosmetic single-file fix
     focus: rewrite Murmuration Dependencies block to use Obsidian-friendly bare wikilinks -->

# Murmuration — cosmetic wikilink-shape fix in Dependencies block

## Scope

Single file, single block change. Rewrite the auto-Dependencies block at the bottom of `forge-music/percussion/murmuration.md` so it uses standard Obsidian wikilink syntax (bare basenames) instead of filesystem-relative paths. After the fix, the wikilinks render as live links in Obsidian's editor — hoverable, clickable, styled.

**Currently** (line 57 of the committed murmuration.md):
```markdown
[[../percussion_lab/solitary]] [[../percussion_lab/companions]] [[../percussion_lab/gathering]] [[../percussion_lab/swarming]] [[../percussion_lab/peak]] [[../percussion_lab/dispersing]] [[../percussion_lab/threading]] [[../percussion_lab/resting]]
```

The `[[../percussion_lab/X]]` shape is filesystem-relative, NOT Obsidian wikilink syntax. Obsidian falls back to displaying the literal text without live-link styling or click-through.

**After**:
```markdown
[[solitary]] [[companions]] [[gathering]] [[swarming]] [[peak]] [[dispersing]] [[threading]] [[resting]]
```

Bare basenames. Obsidian resolves by basename across the vault and renders them as live wikilinks. Forge's resolver also handles them via A4 / A4.1 (caller-scoped + authoring-vault scan).

## What this prompt does NOT do

- DO NOT bump `forge-music/forge.toml`. The fix is COSMETIC — the Python facet is unchanged, behavior is identical, MIDI output is identical, MusicXML output is identical. Only the English-facet rendering changes. No version bump warranted.
- DO NOT modify the Python facet of murmuration.md.
- DO NOT modify the English facet's narrative paragraphs (the "starling flock at dusk" paragraph, the per-section list, the "Decomposed into 8 callable section snippets in [[percussion_lab]]" sentence — leave them alone, even though `[[percussion_lab]]` is also non-standard; that's a separate decision).
- DO NOT touch any percussion_lab/ snippet.
- DO NOT touch any other file in any repo.
- DO NOT bundle into the plugin, sync engine, bump plugin version, or cut a plugin release.
- DO NOT tag.

## Why

The Level-1 promote drain committed `[[../percussion_lab/X]]` as the Dependencies block shape — filesystem-relative, picked by CC during the preview drain. That shape doesn't render as live wikilinks in Obsidian. User testing surfaced this via the chip/wikilink brainstorm.

The fix aligns Murmuration with the Forge / Obsidian wikilink convention. Bare basenames are:
- Recognized by Obsidian's wikilink rendering (hoverable, clickable, styled).
- Aligned with the Forge resolver's A4 / A4.1 model.
- Aligned with what chip-click insertion will produce once the v0.2.48 chip-discovery bugs are fixed.

Cosmetic but load-bearing for the composer's reading experience — the Dependencies block is supposed to be a visible "what does this piece use" surface.

## Files to modify

- `/Users/odedfuhrmann/projects/forge-music/percussion/murmuration.md` — Dependencies block only.

## Implementation steps

1. `cd /Users/odedfuhrmann/projects/forge-music`.
2. `git status --short` — verify clean working tree on the percussion/murmuration.md file (it was last touched by the Level-1 promote at commit 489ce7d; should show no `M` for it).
3. Read `percussion/murmuration.md` to confirm the line shape. The Dependencies block should be at the bottom of the file, formatted as:
   ```markdown
   # Dependencies
   
   [[../percussion_lab/solitary]] [[../percussion_lab/companions]] [[../percussion_lab/gathering]] [[../percussion_lab/swarming]] [[../percussion_lab/peak]] [[../percussion_lab/dispersing]] [[../percussion_lab/threading]] [[../percussion_lab/resting]]
   ```
4. Edit the Dependencies block line to:
   ```markdown
   [[solitary]] [[companions]] [[gathering]] [[swarming]] [[peak]] [[dispersing]] [[threading]] [[resting]]
   ```
   The `# Dependencies` header stays. Only the wikilinks line is rewritten.
5. `git add percussion/murmuration.md`.
6. `git commit -m "[2026-06-06-0130-murmuration-wikilink-shape-fix] cosmetic: bare-basename wikilinks in Dependencies block"`. Body: brief — "Rewrites filesystem-relative `[[../percussion_lab/X]]` to bare `[[X]]` so Obsidian renders them as live wikilinks. No behavioral change."
7. `git push origin main`.
8. No tag, no version bump.

## Tests

No new tests. Cosmetic Markdown change.

Re-run the full forge test suite to confirm no regression: `cd /Users/odedfuhrmann/projects/forge && pytest -q`. Expected: 522 passed (unchanged from post-v0.3.9 baseline).

`tests/music/test_percussion_lab.py` should still pass — the wikilink shape isn't exercised by the engine; only the Python facet matters for compute behavior, and that's unchanged.

## Out of scope

- All listed in the "What this prompt does NOT do" section above.
- Specifically: the `[[percussion_lab]]` reference in the English narrative ("Decomposed into 8 callable section snippets in [[percussion_lab]]"). That's a wikilink to a DIRECTORY which Obsidian also can't resolve. Whether to rewrite it to a plain-text mention ("the `percussion_lab/` library") or leave it as the inert wikilink is a separate decision — flag for review but don't change in this drain.
- Re-tagging v0.3.9. The Level-1 commit already shipped with the broken wikilinks; that's accepted. The fix lands as an additional commit on main; no tag movement.
- Any percussion_lab/*.md snippets' English facets that may have their own wikilink shape issues. Out of scope here; if surfaced, file a separate prompt.

## Report when done

Write feedback to `/Users/odedfuhrmann/projects/forge-moda-bootstrap/prompts/feedback/2026-06-06-0130-murmuration-wikilink-shape-fix.md`:

0. **Cosmetic-fix confirmation checklist.**
   - ✓ Single file modified: `percussion/murmuration.md` Dependencies block.
   - ✓ Python facet unchanged: `git diff` shows zero changes outside the Dependencies block.
   - ✓ No version bump: `forge.toml` unchanged.
   - ✓ No tag.
   - ✓ No plugin work.
1. **Commit.** SHA + verified push.
2. **Diff of the Dependencies block.** Show the before/after — confirm only the line of wikilinks changed, nothing else.
3. **Tests.** Full forge suite pass count (expected 522).
4. **Working tree post-drain.** `git status` for forge-music + forge + forge-client-obsidian. Expected: forge-music has the pre-existing untracked items (unchanged from §4 of the Level-1 promote feedback); forge clean; forge-client-obsidian clean.
5. **Brief note** on the `[[percussion_lab]]` directory reference in the English narrative — observe whether it renders as a live link in Obsidian (it won't) and whether to file a separate fix.

## Don'ts

- Don't `git add .` — explicit path.
- Don't sign tags or bump versions.
- Don't refactor the dependencies-block header or surrounding markdown.
- Don't touch any other snippet, in any vault, in any way.
- Don't open this drain into a chip-plumbing investigation — those bugs (chip discovery skipping percussion_lab, chip insertion not templating defaults) are forge-core territory and not addressed here.

# Backup current blues into forge-music as a subdirectory

## Scope

Preserve the user's hand-developed blues content (currently at
`~/bin/t3/obsidian_sandbox/sandbox/blues/`) by copying it into the
forge-music vault as a subdirectory (`forge-music/blues/`). Update
the bundled forge-music copy inside the plugin so the subdir travels
with the bundle. When a user declares `domains = ["music"]` in their
vault's `forge.toml`, the blues subdir lands in their vault as part
of the extraction.

What this prompt does NOT do:
- Fix bugs in the blues snippets (bar arithmetic, mode forcing, dead
  code, instrument layouts — separate prompt later).
- Make `blues/` a sub-library by adding its own `forge.toml` (deferred
  decision; flag in feedback as a follow-up).
- Resolve the snippet-ID collision between top-level
  `forge-music/form.md` and `forge-music/blues/form.md` (deferred
  decision; flag in feedback as a follow-up).
- Engine-level work to index snippets that live in non-library
  subdirectories of a library vault (flag if discovered).
- Migrate blues snippets to v0.2.24 input-derivation conventions.

## Why

The blues content was hand-developed across an earlier conversational
session and represents real composition work the user does not want
to lose. It currently lives only at
`~/bin/t3/obsidian_sandbox/sandbox/blues/` — outside any backed-up
repo. Putting it under `~/projects/forge-music/blues/` preserves it
inside the bundled-distribution path (constitution A5.3), so future
plugin releases carry it forward and any user who enables the music
domain gets the content automatically as part of the bundled
extraction.

This is a "get things right slowly" preservation step. The
architectural follow-ups (collision handling, sub-library status,
engine subdir indexing) are explicitly deferred.

## Files to investigate then modify

**Investigate (read-only):**
- `~/bin/t3/obsidian_sandbox/sandbox/blues/` — source of truth for
  blues content. List files and report count + names.
- `~/projects/forge-client-obsidian/src/` — locate the code path that
  implements A5.3 bundled-vault extraction (when user vault declares
  `domains = ["music"]`, the plugin extracts the bundle into the
  user's vault root). Grep for "domains", "music", "assets/vaults",
  "forge-music" to find it. Determine: does this logic recursively
  copy the bundled vault (including subdirectories) into the user
  vault, or does it only copy top-level files?
- `~/projects/forge/forge/` — locate where the engine walks a library
  vault to register snippets for resolution. Grep for "forge-music",
  "library", "indexing", "register_vault". Determine: does it index
  snippets in subdirectories of a library vault, or only top-level
  `.md` files? Report the finding; do NOT fix engine-side resolution
  in this prompt unless trivial.

**Modify:**
- Create `~/projects/forge-music/blues/` and copy source contents in
  bit-for-bit.
- Create `~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/`
  mirroring the same content.
- If bundle-extraction logic does not walk subdirs and a fix is
  required (per Implementation Notes step 5), the relevant
  TypeScript file under `forge-client-obsidian/src/`.
- `~/projects/forge-music/forge.toml` — bump version 0.3.0 → 0.3.1.
- `~/projects/forge-client-obsidian/manifest.json` — bump patch
  version.

## Implementation notes

1. **Verify source exists.** Run `ls -la ~/bin/t3/obsidian_sandbox/sandbox/blues/`.
   If the directory does not exist or is empty, route this prompt to
   `failed/` with a clear message — do not proceed silently. The user
   confirmed the path; if it's gone, that's a real blocker.

2. **Report source contents.** Capture file count, names, and total
   byte size. Include in feedback.

3. **Investigate bundle extraction.** Find the production code path
   that handles the A5.3 extraction. Read it. Determine empirically
   (by reading the code, not by speculating) whether subdirectories
   inside the bundled vault end up in the user's vault. Report the
   finding in feedback under a clearly-marked "Bundle extraction
   investigation" section.

4. **Investigate engine subdir indexing.** Same approach for the
   engine-side. Report finding under "Engine subdir indexing
   investigation". Do NOT fix engine-side resolution here.

5. **If bundle extraction does not walk subdirs (BUG-FIX shape, TDD
   mandatory):**
   - Write a failing test FIRST that exercises the production
     extraction path against a fixture bundle containing a
     subdirectory, asserting the subdir lands in the destination.
     Add it under `forge-client-obsidian/src/<name>.test.ts`
     following the pure-core test convention (no `obsidian`
     imports).
   - Run `npm test`. Confirm the new test fails with output that
     names the missing subdir.
   - Implement the fix (likely: make the bundle-copy routine
     recursive). Use the pure-core extraction pattern — if the
     production code currently imports from `obsidian`, extract the
     testable portion into a `*-core.ts` helper first.
   - Re-run `npm test`. Confirm the new test passes.
   - Run the full suite. Confirm no regressions. Capture verbatim
     terminal output for feedback §1.1–§1.5.

6. **If bundle extraction DOES walk subdirs:** skip step 5 entirely.
   Note in feedback that no engine-side fix was needed.

7. **Copy source into vault and bundle.** Always done. Use `cp -r`
   from the source. Do not modify any file content — bit-for-bit
   preservation. Then mirror from the source vault to the bundled
   plugin assets. Run a `diff -r` between the source and each
   destination to confirm identical content.

8. **Do NOT add a `forge.toml` to `blues/`.** Plain content
   subdirectory only. The "promote to sub-library" decision is
   deferred to a follow-up prompt.

9. **Bump versions.**
   - `forge-music/forge.toml`: 0.3.0 → 0.3.1.
   - `forge-client-obsidian/manifest.json`: patch bump from current.
   - Report the chosen versions in feedback.

10. **Commit + push + tag the plugin release.** Default-on per
    `cc-prompt-queue.md`. Commit message starts with
    `[2026-06-01-2140-blues-backup-into-forge-music]`. Include both
    the forge-music vault version and the plugin manifest version in
    the message body. Tag the plugin release per the standard
    pattern; do NOT create a GitHub release artifact yet (clean-vault
    smoke before release tagging applies to gh release create, which
    is out of scope here unless the user has standing authorization
    for blues-bundle releases — assume they don't and stop at the
    tag).

11. **Run clean-vault smoke before the tag commits if a release tag
    is created.** Per `cc-prompt-queue.md` — fresh tmpdir, copy the
    bundle into it, simulate the extraction code path, list the
    resulting structure, confirm `forge-music/blues/` is populated
    with the expected file count.

## Tests

**Auto-verifiable by CC (run all of these; report results explicitly):**

- `npm test` in `~/projects/forge-client-obsidian/`. Report
  `X/X in Y ms`.
- `pytest -q` in `~/projects/forge/`. Report `X/X`.
- If step 5 ran: full TDD §1.1–§1.5 output per the cc-prompt-queue
  bug-fix structure (failing tests added pre-fix, verbatim pre-fix
  output, inline fix diff with commit hash, verbatim post-fix
  output, full-suite tail).
- `diff -r ~/bin/t3/obsidian_sandbox/sandbox/blues/
  ~/projects/forge-music/blues/` — must report no differences.
- `diff -r ~/projects/forge-music/blues/
  ~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/`
  — must report no differences.
- Sandbox-side simulated extraction: in a tmpdir, set up a fake
  user vault with `forge.toml` declaring `domains = ["music"]`.
  Run the production extraction code path (call the helper
  directly per pure-core convention). Assert
  `<tmpdir>/forge-music/blues/` exists with the expected file count
  and that the snippet contents match the source bit-for-bit.
- `ls -la ~/projects/forge-music/blues/` and
  `ls -la ~/projects/forge-client-obsidian/assets/vaults/forge-music/blues/`
  in the feedback so the user can eyeball the result.

**Deferred to user (Obsidian-context):**
- Install the newly-tagged plugin version into a clean test vault
  (the user will name the path in their smoke-test step).
- In that test vault, set `domains = ["music"]` in `forge.toml`.
- Reload the plugin / restart Obsidian.
- Verify that `<vault>/forge-music/blues/` directory exists with the
  expected snippets.
- Open one blues snippet (e.g. `vocal_phrase_a.md`) in the editor and
  confirm content displays correctly.
- DO NOT attempt to compute any blues snippet — there are known
  collisions (top-level `forge-music/form.md` vs
  `forge-music/blues/form.md`) and dependency-resolution questions
  that are explicitly deferred. Just confirm the files arrived.

## Out of scope

- Fixing existing bugs inside the blues snippet content (bar
  arithmetic shortfalls, mode-forcing in fallback paths, dead
  helpers, position-vs-instrument layout decisions). Separate
  prompt.
- Adding a `forge.toml` to `blues/` to make it a sub-library.
- Resolving the snippet-ID collision between top-level
  `forge-music/form.md` and `forge-music/blues/form.md`.
- Engine-side work to index snippets in non-library subdirs (only
  the bundle-extraction side is in scope for code changes).
- Migrating blues snippets to v0.2.24 input-derivation conventions
  (frontmatter `inputs:` reconciliation).
- Cutting a `gh release create` artifact. Tag + push is in scope;
  full GH release creation is deferred until the user authorizes
  it explicitly.
- Modifying the source content at `~/bin/t3/obsidian_sandbox/...`.
  This is preservation, not migration.

## Report when done

Standard `cc-prompt-queue.md` feedback structure (timestamp,
status, files modified, etc.) plus the following sections:

- **Source contents.** Path + file count + filenames + total byte
  size.
- **Bundle extraction investigation.** Code path examined; verdict
  (one line: "extraction walks subdirs" or "extraction is top-level
  only"); supporting evidence (file paths + line numbers).
- **Engine subdir indexing investigation.** Same structure. Code
  path examined; verdict; supporting evidence.
- **Bug-fix TDD section (only if step 5 ran).** §1.1 through §1.5
  per the cc-prompt-queue format. Verbatim terminal output, not
  prose summaries.
- **Diff results.** Output of the two `diff -r` invocations.
- **Sandbox-side extraction smoke.** Directory listing of the
  simulated extraction result + asserted file counts.
- **Versions shipped.** `forge-music` vault version + plugin
  manifest version + git tag name + commit SHA.
- **Smoke split.** Auto-verified-by-CC list and Deferred-to-user
  list, explicitly enumerated per cc-prompt-queue smoke-automation
  convention.
- **Follow-ups noted but not built.** Three explicit candidates for
  the user to queue as separate prompts:
  (a) Resolve snippet-ID collision between top-level `form.md` and
      `blues/form.md`.
  (b) Decide whether `blues/` should be promoted to a sub-library
      with its own `forge.toml`.
  (c) Engine-side resolution of snippets in non-library subdirs
      (only if the engine investigation in step 4 found this gap).

## Don'ts

- **Don't modify any source file's content during the copy.** Use
  `cp` or equivalent — preserve bytes exactly. The blues snippets
  have known issues but fixing them is explicitly out of scope.
- **Don't decide architectural follow-ups** (sub-library promotion,
  collision resolution, qualified-reference rewrites). Surface them
  as follow-ups; do not implement.
- **Don't add a `forge.toml` to `blues/`.** It stays a plain content
  subdirectory.
- **Don't `gh release create`.** Tag + push is fine. GH release
  creation requires explicit user authorization for this content
  bundle.
- **Don't run any destructive git op** (`push --force`,
  `reset --hard`, branch deletion). Standard commits + tags only.
- **Don't skip the sandbox-side simulated extraction smoke.** The
  user's wall-clock cost is the bottleneck. The simulated
  extraction is what catches "the files are on disk but the
  extraction doesn't see them" before the user tests in Obsidian.
- **Don't proceed past step 1 if the source doesn't exist.** Route
  to `failed/` instead.

# Welcome.md — canonical entry-point artifact extracted to vault root on first install

> **CC pre-drain reminder (HARD RULE per cc-prompt-queue.md):** before reading this prompt, re-read `~/projects/forge-moda-bootstrap/cc-prompt-queue.md` end-to-end. Recent amendments include 6a/6b paste-able-commands (2026-06-05), bundled-vault forge.toml bump rule (2026-06-05), and the sharpened pre-drain re-read mandate (2026-06-05). welcome.md and greet.md ship to vault root (NOT inside any bundled vault), so the forge.toml-bump rule does NOT apply — but verify by re-reading the rule.

## Scope

Per the 2026-06-05 examples brainstorm: ship a `welcome.md` action snippet that every fresh-install Forge vault gets at its ROOT (alongside `forge.toml`, NOT inside any library subdirectory). Forge-clicking welcome.md on first launch produces a visible artifact within 1-2 seconds. Goal: emotional hook + install verification + chip-palette awareness all in one tiny interaction.

This is the Mission's "low floor" property delivered as a concrete artifact. The user's first action after install becomes a Forge-click that produces an output. After that, they have authorial agency — they can edit welcome.md, re-click, see the change.

The welcome.md is **forge-core's authoring** (cross-cutting vault-root content; establishes the canonical-example pattern for future domains). It is NOT a tutorial chapter; it does not duplicate forge-tutorial's content. Tutorial chapters can reference welcome.md as "this is what just happened when you first opened Forge."

What this prompt does NOT do:
- Author tutorial chapters (forge-doc's lane).
- Author canonical domain examples (forge-moda's simulation.md exists; forge-music's `hello_blues.md` is forge-music's drumming-arc lane).
- Modify existing forge-moda or forge-music content.
- Add welcome flow modal / popups. welcome.md is a file; the welcome experience is "open it and Forge-click."
- Bundle welcome.md inside any existing domain vault. It lives at vault root, extracted by a new code path parallel to (but distinct from) `ensureBundledForgeModa`.

## Why

Per Mission V2a v7: every snippet must be CONCRETE, PARAMETRIC, COMPOSABLE, PERSONALLY MEANINGFUL. Welcome.md hits the first three on first interaction:
- **Concrete**: produces a visible string in the output panel.
- **Parametric**: ships with the user's name as an editable variable (default "world").
- **Composable**: calls `[[greet]]` (also shipped) to demonstrate the call-graph mechanic.
- Personally meaningful happens as soon as the user edits welcome.md to say something they care about.

Plus the environmental properties:
- **Low floor**: zero-config Forge-click produces output. No domain to enable, no token to paste (output panel shows the artifact even without transpile).
- **High ceiling**: edit welcome.md → tweak greet → ship to forge-tutorial chapter 1 → arbitrary depth.
- **Wide walls**: welcome doesn't lock the user into a domain; they're at vault root, equally close to moda, music, or their own work.

## Files likely to touch

NEW content (forge-core authoring):
- `~/projects/forge-client-obsidian/assets/welcome/welcome.md` — the bundled welcome snippet.
- `~/projects/forge-client-obsidian/assets/welcome/greet.md` — the callee snippet that welcome.md depends on.

NEW code (CC implementation):
- `~/projects/forge-client-obsidian/src/welcome.ts` — new `ensureWelcomeFiles(adapter)` helper called from `runFirstRunCheck`. Extracts welcome.md + greet.md to vault root if-and-only-if neither exists yet. Idempotent: subsequent loads see the files and skip. Does NOT overwrite user-edited files.
- `~/projects/forge-client-obsidian/src/welcome.test.ts` — extend existing test file with cases for the new helper.

MODIFY documentation:
- `~/projects/forge-client-obsidian/INSTALL.md` — add a brief "First Forge-click" section after the token-setup section. Mentions welcome.md as the entry point.
- `~/projects/forge-moda-bootstrap/closed-beta-onboarding.md` — same brief mention. Substitutes for the current §5 "First Forge-click" instruction which currently directs users to `forge-moda/setup.md`.

Standard bumps:
- `~/projects/forge-client-obsidian/manifest.json` — `{CURRENT} → {NEXT_PATCH}` placeholder.

(No forge-moda or forge-music forge.toml bumps — welcome lives outside both domains.)

## Content of `welcome.md` and `greet.md`

**`assets/welcome/welcome.md`**:

```markdown
---
type: action
inputs: []
description: Welcome to Forge. Forge-click this file to see your first artifact.
---

# English

Print "Welcome to Forge."
Then call greet with the name "world".

# Dependencies

[[greet]]
```

**`assets/welcome/greet.md`** (the dependency):

```markdown
---
type: action
inputs: [name]
description: Print a greeting. Called by welcome.md as the first example of snippet composition.
---

# English

Print "Hello " followed by name.
```

After Forge-click of welcome.md the user sees in ForgeOutput:
```
Welcome to Forge.
Hello world
```

Two lines. Trivially small. But:
- They saw an output (concrete).
- The file has `name = "world"` they can tweak (parametric — well, almost; `greet` takes the name as input, so they'd tweak welcome.md's call).
- They see welcome.md depended on greet.md (composable — Dependencies section + the call shape).
- They can rename "world" to their own name and re-click (personally meaningful immediately).

## Implementation notes

### welcome.ts wiring

```typescript
async function ensureWelcomeFiles(adapter: DataAdapter): Promise<void> {
  // Only extract on truly-fresh vaults — never overwrite existing user files.
  const welcomePath = 'welcome.md';
  const greetPath = 'greet.md';

  // Both files have to be absent — partial install is the user's call (they may
  // have deleted one deliberately; don't re-create just one).
  if (await adapter.exists(welcomePath) || await adapter.exists(greetPath)) {
    return;
  }

  const bundledWelcomePath = '.obsidian/plugins/forge-client-obsidian/assets/welcome/welcome.md';
  const bundledGreetPath = '.obsidian/plugins/forge-client-obsidian/assets/welcome/greet.md';

  try {
    if (!(await adapter.exists(bundledWelcomePath)) || !(await adapter.exists(bundledGreetPath))) {
      console.warn('Forge: bundled welcome files missing; skipping welcome extraction');
      return;
    }
    const welcomeBody = await adapter.read(bundledWelcomePath);
    const greetBody = await adapter.read(bundledGreetPath);
    await adapter.write(welcomePath, welcomeBody);
    await adapter.write(greetPath, greetBody);
    console.log('Forge: extracted welcome.md and greet.md to vault root');
  } catch (e) {
    console.warn('Forge: ensureWelcomeFiles failed', e);
  }
}
```

Called from `runFirstRunCheck` near the existing `ensureBundledForgeModa` call. Order: welcome BEFORE moda — welcome is the lower floor.

### Why "neither exists" check (not "either exists")

Two reasons:
1. A user who deleted welcome.md but kept greet.md (using greet for their own work) shouldn't have welcome forced back. Partial deletion is intentional state.
2. A user who deleted both is signaling "I'm past the welcome phase, don't restore." Don't restore.

The check is "extract only if BOTH are absent." Idempotent + respectful of user intent.

## Tests

### Auto-verifiable by CC — TDD discipline

`welcome.test.ts` extends existing structure with new cases:

1. `ensureWelcomeFiles` extracts both files when neither exists.
2. `ensureWelcomeFiles` skips when welcome.md already exists (preserves user edits).
3. `ensureWelcomeFiles` skips when only greet.md exists (respects partial deletion of welcome).
4. `ensureWelcomeFiles` warns + skips when bundled welcome.md missing from assets.
5. `ensureWelcomeFiles` warns + skips when bundled greet.md missing from assets.
6. Idempotency rider: call twice → no extra writes after the first.

Mock adapter records all `read`/`write`/`exists` calls.

Run before fix → all 6 fail (helper doesn't exist). Implement. Re-run → all 6 pass.

`npm test` → expect `X/X` with 6 new cases.

### Smoke (CC writes §3 per protocol)

Per 6a/6b. Paste-able commands plus UI verification.

CC validates the extraction path in their own sandbox via a node-side test script (`scripts/smoke-welcome-extraction.mjs`) that:
1. Sets up a fresh test vault in tmpdir.
2. Drops the bundled assets/welcome/*.md into the simulated plugin location.
3. Calls `ensureWelcomeFiles` directly (or via a node-test-runner wrapper).
4. Asserts welcome.md and greet.md exist at vault root with correct content.
5. Calls a second time — asserts no changes.

User-side smoke § 3 covers what CC can't reach:
- Install v0.X.X in a FRESH vault (or one without existing welcome.md).
- Open Obsidian; vault root file tree shows welcome.md and greet.md.
- Forge-click welcome.md.
- Output panel shows "Welcome to Forge.\nHello world".

Paste-able commands for the file-existence checks; UI prose for the Forge-click.

## Coordination with forge-doc

The user (driver) is updating `forge-doc-briefing.md` in parallel with this drain to document the welcome.md decision: forge-core owns welcome.md; forge-doc's tutorial Tier 1 chapter 1 references welcome.md as "this is what just happened" rather than duplicating it.

This drain doesn't need forge-doc's input; the welcome.md content is self-contained and the briefing update happens out-of-band.

## Out of scope

- A welcome modal or popup. The file IS the welcome experience.
- Per-cohort customization of welcome.md content (e.g., "Welcome, Tamar's cohort"). One canonical welcome for everyone.
- Auto-updating welcome.md when a new version ships. v0.5+ feature if useful.
- A second tier of welcome content for advanced users. The welcome is the same for everyone; advanced users move past it on day one.

## Don'ts

- **Don't overwrite existing user welcome.md or greet.md.** The "neither exists" check is hard-rule.
- **Don't put welcome.md inside forge-moda or forge-music.** It lives at vault root.
- **Don't ship a "welcome experience" UI — the file IS the welcome.** Modals add ceremony; the goal is zero-ceremony first interaction.
- **Don't use `facet_form: canonical` in welcome.md** until Stage 1+2 has shipped + you've confirmed E-- is the user-facing form. Free English for now; the eventual migration touches welcome.md as part of the broader migration.
- **Don't bump versions concretely** — `{CURRENT} → {NEXT_PATCH}` placeholder.

## Report when done

Standard §0–§3 per cc-prompt-queue.md:

- **§0** — manifest before/after, commit SHAs (forge-client-obsidian only, single repo), push, tag, release URL, SHA round-trip, line counts.
- **§1.1** — TDD test cases (6 above).
- **§1.2** — pre-fix verbatim test output (helper doesn't exist).
- **§1.3** — fix landed: cited line-number diffs in welcome.ts + welcome.test.ts + new asset files content.
- **§1.4** — post-fix verbatim test output + node-side smoke script output.
- **§1.5** — full `npm test`.
- **§2** — surprises during implementation. Specifically: any quirks of writing to vault root vs subdirectories via the adapter; any edge case in fresh-install detection.
- **§3** — user-side smoke per 6a/6b.

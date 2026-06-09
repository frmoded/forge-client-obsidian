# V1 — release-zip build script for MoDa-only distribution

## Scope

Single repo (`forge-client-obsidian`). One new build script that packages a versioned release zip students can download, unzip into their Obsidian vault, and enable. MoDa-only — no music21, no forge-music, no forge-core for now.

What this prompt delivers:

1. **`scripts/build-release-zip.mjs`** — new build artifact. Reads the plugin version from `manifest.json`. Verifies prerequisites (main.js exists, iframe bundle present in `assets/iframe/`, asset manifest fresh). Packages `main.js + manifest.json + styles.css + assets/` into a zip named `forge-client-obsidian-v<version>.zip`. Outputs to `dist/` directory. Prints final size + SHA-256 checksum.

2. **`package.json` script entry:** `"release-zip": "node scripts/build-release-zip.mjs"`.

3. **`.gitignore`:** add `dist/` so release zips don't pollute the repo.

4. **Brief `INSTALL.md`** at the repo root with the 3-step student install:
   - Step 1: Download `forge-client-obsidian-v<version>.zip` from the GitHub Releases page (link with placeholder URL).
   - Step 2: Find your Obsidian vault's plugin directory. (Open Obsidian → Settings → About → "Open vault folder" → navigate to `.obsidian/plugins/`. Create `.obsidian/plugins/` if missing.)
   - Step 3: Unzip the file into `.obsidian/plugins/`. You should end up with `.obsidian/plugins/forge-client-obsidian/main.js` and sibling files.
   - Step 4: In Obsidian → Settings → Community plugins → enable "Forge Client" (or whatever the plugin's display name is per manifest.json).
   - Brief troubleshooting block (plugin doesn't appear in settings → check the unzip landed in the right place; Pyodide load errors → check `assets/pyodide/` exists in the install).

Does NOT:

- Bundle music21, forge-music, or forge-core into the plugin. MoDa V1 only — Phase 3 is deferred.
- Auto-build the iframe (assume `npx vite build` in forge-moda-client/forge-moda-web has been run with output in `assets/iframe/`).
- Set up a GitHub Actions workflow. Manual release for V1 closed beta.
- Auto-publish to GitHub Releases. User uploads the zip manually to a release page.
- Add a settings UI for token paste (that's the α prompt's scope).
- Touch any other repo.
- Change the plugin's behavior — pure packaging.

## Why

V1 closed beta in ~2 weeks. Per the Option A/B decision: BRAT can't ship `assets/` directory, students can't run terminal commands. Option B (release zip + drop install) is the cheapest unblock. The build script makes the release artifact reproducible; the INSTALL.md makes student onboarding self-serve.

## Files to modify

### New: `forge-client-obsidian/scripts/build-release-zip.mjs`

Node.js script. Use Node's built-in `node:fs/promises` + a zip library — either `archiver` (npm, mature) or `zip-lib` (lighter). If you'd rather avoid adding a dep, shell out to `zip` via `child_process` (macOS/Linux ships it; document the OS requirement).

Outline:

```javascript
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

async function main() {
  // 1. Read version from manifest.json
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, "manifest.json"), "utf8"));
  const version = manifest.version;

  // 2. Preflight: verify required files exist
  const required = [
    "main.js",
    "manifest.json",
    "assets/iframe/index.html",
    "assets/pyodide/pyodide.asm.wasm",
    "assets/engine/forge/core/executor.py",
    "assets/vaults/forge-moda/forge.toml",
  ];
  for (const rel of required) {
    try { await fs.access(path.join(ROOT, rel)); }
    catch { throw new Error(`Missing required file: ${rel}. Run npm run build first.`); }
  }
  // styles.css is optional (some plugins don't have it).

  // 3. Create dist/ if missing
  await fs.mkdir(DIST, { recursive: true });

  // 4. Bundle into zip
  const zipName = `forge-client-obsidian-v${version}.zip`;
  const zipPath = path.join(DIST, zipName);
  // Use archiver or shell out to `zip -r`...

  // 5. Print final size + sha256
  const buf = await fs.readFile(zipPath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const sizeMB = (buf.length / 1024 / 1024).toFixed(2);
  console.log(`Release zip: ${zipPath}`);
  console.log(`Size: ${sizeMB} MB`);
  console.log(`SHA-256: ${sha}`);
}

main().catch(e => { console.error(e); process.exit(1); });
```

Choose the simplest path that works on macOS (the user's primary dev environment). If you use `archiver`, add as a dev dependency with `npm install --save-dev archiver`.

### Modify: `forge-client-obsidian/package.json`

Add to the `"scripts"` block:

```json
"release-zip": "node scripts/build-release-zip.mjs"
```

Run order for a release: `npm run build && npm run release-zip`. The build script can document this in a comment block.

### Modify: `forge-client-obsidian/.gitignore`

Add a line:

```
# Release zips for V1 distribution; produced by `npm run release-zip`.
dist/
```

### New: `forge-client-obsidian/INSTALL.md`

A student-facing install document at the repo root. Plain English, no developer assumptions. Brief — fits on a single screen.

Suggested content shape:

```markdown
# Installing the Forge Client Plugin

This plugin runs inside Obsidian. No terminal, git, npm, or Python needed on your machine.

## Three-step install

1. **Download** `forge-client-obsidian-v<latest>.zip` from the [GitHub Releases page](https://github.com/frmoded/forge-client-obsidian/releases). Save it somewhere convenient (e.g., your Downloads folder).

2. **Find your Obsidian vault's plugin directory.**
   - Open Obsidian.
   - Go to **Settings** → **About** → **Open vault folder**.
   - In the file browser that opens, navigate into `.obsidian/plugins/`. (If `.obsidian/plugins/` doesn't exist, create it.)
   - You may need to enable "Show hidden files" — `.obsidian` starts with a dot.

3. **Unzip the file into that directory.**
   - Unzip `forge-client-obsidian-v<latest>.zip`. You'll get a folder called `forge-client-obsidian`.
   - Move (or extract directly to) the folder so it lives at `.obsidian/plugins/forge-client-obsidian/`.
   - You should end up with files like `.obsidian/plugins/forge-client-obsidian/main.js` and `.obsidian/plugins/forge-client-obsidian/assets/`.

4. **Enable the plugin.**
   - In Obsidian, go to **Settings** → **Community plugins**.
   - If Community plugins are disabled, click "Turn on community plugins" first.
   - You should see "Forge Client" (or similar) in the installed plugins list. Toggle it on.
   - Reload Obsidian if prompted.

## Verifying it works

- Open the command palette (Cmd-P on Mac, Ctrl-P on Windows/Linux).
- Type "Forge" — you should see "Forge: Open MoDa simulation" and other Forge commands.
- Run "Forge: Open MoDa simulation" — a panel opens with a simulation canvas.
- Click "Run simulation" — wait a few seconds while Pyodide initializes (one-time), then watch the particles disperse.

## Troubleshooting

- **Plugin doesn't appear in Settings → Community plugins:** the unzip likely landed in the wrong place. Check that `<your-vault>/.obsidian/plugins/forge-client-obsidian/main.js` exists.
- **Simulation panel is blank / no canvas:** open the Developer console (Cmd-Opt-I on Mac, Ctrl-Shift-I on Windows). Look for errors mentioning `assets/pyodide/`. Most common cause: `assets/` didn't come along with the unzip.
- **"Forge: initializing Pyodide…" hangs:** check your network. The first run downloads nothing — everything's local. If hung past 30 seconds, paste the dev console output to <support contact>.
- **Updating to a new version:** repeat steps 1-3 (download, unzip, replace existing folder). Obsidian picks up the changes on next reload.
```

(Fill in `<your-vault>`, `<latest>`, and `<support contact>` placeholders per repo context.)

## Implementation notes

### Zip dependency choice

`archiver` is the most popular Node.js zip lib. Adds ~50KB to dev deps. Simplest API:

```javascript
import archiver from "archiver";
import { createWriteStream } from "node:fs";

const output = createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });
archive.pipe(output);

// Include everything that should ship in the release.
archive.file("main.js", { name: "forge-client-obsidian/main.js" });
archive.file("manifest.json", { name: "forge-client-obsidian/manifest.json" });
// styles.css if exists
archive.directory("assets/", "forge-client-obsidian/assets");

await archive.finalize();
```

Note the `{ name: "forge-client-obsidian/..." }` — files inside the zip live under a top-level `forge-client-obsidian/` directory. That way, when students unzip into `.obsidian/plugins/`, they get the right structure automatically.

Alternative: shell out to `zip -r forge-client-obsidian-v0.2.0.zip forge-client-obsidian/` after first creating a temp directory with the right shape. Simpler, but introduces a dep on the `zip` binary (macOS/Linux fine; Windows would need WSL or 7zip).

Pick `archiver` for portability.

### Preflight checks

The script must fail fast if prerequisites aren't met. Specifically:

- **iframe bundle present.** `assets/iframe/index.html` must exist. If missing, instruct: "Run `cd ../forge-moda-client/forge-moda-web && npx vite build` first."
- **Pyodide assets present.** `assets/pyodide/pyodide.asm.wasm` exists.
- **main.js exists.** If not, instruct: "Run `npm run build` first."

Fail with a clear error message, not a cryptic stack trace.

### Output zip naming + structure

- Filename: `forge-client-obsidian-v${version}.zip` where `version` comes from `manifest.json`.
- Internal structure: top-level `forge-client-obsidian/` directory, everything else nested under it.
- Why: students unzip into `<vault>/.obsidian/plugins/` → they get `<vault>/.obsidian/plugins/forge-client-obsidian/main.js` automatically. No subdirectory shuffling required.

### Reporting

Final console output should include:
- Path to the produced zip.
- File size (MB, 2 decimals).
- SHA-256 hash (for verification if uploaded to a public release page).

Optional: also print a one-line "Next steps" hint pointing at GitHub Releases.

## Tests

No new tests. The script is a build artifact, not runtime code. Plugin's 42/42 tests stay green (nothing's touched).

### Manual smoke (user runs)

After this lands:

```bash
cd ~/projects/forge-moda-client/forge-moda-web && npx vite build
cd ~/projects/forge-client-obsidian && npm run build && npm run release-zip
ls -lh dist/
```

**Expect:** a zip at `dist/forge-client-obsidian-v<current-version>.zip`, somewhere around 30-35 MB. Console output prints size + SHA-256.

Then verify the zip's contents:

```bash
unzip -l dist/forge-client-obsidian-v*.zip | head -20
```

**Expect:** a `forge-client-obsidian/` top-level directory with `main.js`, `manifest.json`, and `assets/` subdirectories present.

Optional clean-machine smoke (to be done before the seminar): on a fresh Obsidian vault (or another laptop), follow the INSTALL.md verbatim — download the zip, unzip into `.obsidian/plugins/`, enable, run simulation.

## Out of scope

- Music21 + forge-music + forge-core bundling. Phase 3, deferred.
- α transpile service.
- GitHub Actions release workflow.
- First-run welcome UX.
- Documentation screenshots (text-only INSTALL.md is enough for V1 closed beta; rich docs come later).
- Auto-update mechanism (Option B has no auto-update; manual re-download per version).
- Plugin settings UI changes.
- Anything in other repos.

## Report when done

Per protocol 8-section. Specifically:

1. **`build-release-zip.mjs` content** — outline of the script's flow.
2. **package.json diff** — the new `"release-zip"` script entry.
3. **.gitignore diff** — `dist/` added.
4. **INSTALL.md** — full content as it landed (or a summary if too long).
5. **Build smoke run output** — paste of running the script, with size + SHA.
6. **Zip contents listing** — first 20 lines of `unzip -l`.
7. **Commit SHA** — single forge-client-obsidian commit.
8. **Any deviation and why.**
9. **One observation** — anything noticed worth flagging.

## Commits + push

Single `forge-client-obsidian` commit on `main`. Suggested message:

```
V1 release zip: build script + INSTALL.md for Option B distribution

scripts/build-release-zip.mjs packages main.js + manifest.json +
styles.css + assets/ into a versioned zip in dist/. Students
download the zip from GitHub Releases, unzip into their vault's
.obsidian/plugins/, enable. No terminal, git, or npm required
post-install.

INSTALL.md documents the 3-step student install with
troubleshooting.

Music21 / forge-music / forge-core not bundled — MoDa V1 only.
Phase 3 expands later.
```

## Don'ts

- **Don't add music21 / forge-music / forge-core to the bundle.** Phase 3 territory.
- **Don't auto-publish to GitHub Releases.** Output zip stays local; user uploads to a tagged release manually.
- **Don't add a GitHub Actions workflow.** V1 closed beta = manual release.
- **Don't add the settings UI for the α auth token.** Separate prompt.
- **Don't build the iframe inside the script.** Document the prerequisite, fail fast if missing.
- **Don't pipe Pyodide assets through esbuild or otherwise process binary content.** Raw file copy into the zip.
- **Don't bump the plugin version.** Whatever's in manifest.json is what ships.
- **Don't write screenshots or extensive documentation** — INSTALL.md stays brief. Polish docs in a separate prompt.
- **Don't touch any other repo.**
- **Don't add `dist/` content to git.** Gitignore catches it; verify after the build smoke runs.
- **Don't optimize the zip's compression at the cost of script complexity.** zlib level 9 is fine.
- **Don't proceed past a blocker** — if `archiver` install fails, route to questions/ with the specific error.

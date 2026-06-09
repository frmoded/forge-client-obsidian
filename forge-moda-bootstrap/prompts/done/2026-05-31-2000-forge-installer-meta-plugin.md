# forge-installer — BRAT-installable bootstrap for forge-client-obsidian

## Why this prompt exists

`forge-client-obsidian` ships ~11MB of assets (Pyodide WASM, bundled
engine, iframe), which BRAT doesn't carry. The current student install
flow is "open vault folder → navigate hidden `.obsidian` directory →
drag-and-drop unzipped folder," which is too much friction for non-
developer seminar testers.

`forge-installer` is a tiny separate Obsidian plugin (no assets,
~few KB total) that **IS** BRAT-installable. On enable, it:

1. Reads the latest `forge-client-obsidian` release from the GitHub API.
2. Compares against the installed version (if any).
3. If missing or outdated, downloads the release zip, unzips into
   `.obsidian/plugins/forge-client-obsidian/`, and activates via
   `app.plugins.loadPlugin()` + `enablePlugin()`.
4. Reports success / failure via a Notice.
5. Optionally disables itself after first successful install (its
   job is done; settings toggle, default off so update commands
   keep working).

Student flow becomes:

1. Install Obsidian; enable Community Plugins.
2. Install BRAT (one URL paste).
3. Open BRAT settings → paste `frmoded/forge-installer` (one URL paste).
4. forge-installer auto-installs forge-client-obsidian.
5. Paste transpile token in Forge settings.
6. Done.

Six steps, all paste / click — no file-system navigation.

## 1. Repo setup

Create a new private repo at `github.com/frmoded/forge-installer`.
Standard Obsidian plugin layout (mirror forge-client-obsidian's
scaffold for consistency, but without `assets/`):

```
forge-installer/
├── .gitignore
├── README.md
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs       (or whatever bundler forge-client-obsidian uses)
├── src/
│   ├── main.ts              (plugin entry)
│   ├── installer.ts         (the download/unzip/activate logic)
│   └── github-release.ts    (latest-release lookup + asset URL)
├── styles.css               (empty placeholder)
└── versions.json            (standard Obsidian plugin file)
```

Manifest:

```json
{
  "id": "forge-installer",
  "name": "Forge Installer",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "One-paste install for the Forge Client plugin (BRAT-friendly bootstrap).",
  "author": "Oded Fuhrmann",
  "authorUrl": "https://github.com/frmoded",
  "isDesktopOnly": true
}
```

`isDesktopOnly: true` — the install path uses Node-style filesystem
writes through Obsidian's adapter, which is desktop-only anyway.

## 2. Install logic (src/installer.ts)

Skeleton:

```typescript
import { requestUrl, App, Notice } from 'obsidian';
import { unzipSync } from 'fflate';  // ~30KB; smaller than jszip

const PLUGIN_ID = 'forge-client-obsidian';
const REPO = 'frmoded/forge-client-obsidian';

interface Release {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

export async function checkAndInstall(app: App, options: {
  pinnedTag?: string;
  silent?: boolean;
}): Promise<{ status: 'installed' | 'updated' | 'up-to-date' | 'error'; detail: string }> {
  // 1. Discover latest release (or pinned)
  const release = await fetchRelease(options.pinnedTag);

  // 2. Compare against installed version
  const installedVersion = await readInstalledVersion(app);
  if (installedVersion && !versionGreater(release.tag_name, installedVersion)) {
    return { status: 'up-to-date', detail: `v${installedVersion} is current` };
  }

  // 3. Find the release zip asset
  const asset = release.assets.find(a => a.name.endsWith('.zip'));
  if (!asset) {
    return { status: 'error', detail: 'No zip asset on the latest release' };
  }

  // 4. Download
  if (!options.silent) new Notice(`Downloading Forge Client ${release.tag_name} ...`);
  const res = await requestUrl({ url: asset.browser_download_url, method: 'GET' });
  const zipBytes = new Uint8Array(res.arrayBuffer);

  // 5. Unzip + write
  const unzipped = unzipSync(zipBytes);
  await writePluginFiles(app, unzipped);

  // 6. Activate (reload-if-installed, enable-if-disabled)
  await activatePlugin(app);

  return {
    status: installedVersion ? 'updated' : 'installed',
    detail: `${installedVersion ?? 'fresh'} → ${release.tag_name}`,
  };
}
```

### 2.1 Latest-release lookup (src/github-release.ts)

```typescript
async function fetchRelease(pinnedTag?: string): Promise<Release> {
  const url = pinnedTag
    ? `https://api.github.com/repos/${REPO}/releases/tags/${pinnedTag}`
    : `https://api.github.com/repos/${REPO}/releases/latest`;
  const res = await requestUrl({ url, method: 'GET', throw: false });
  if (res.status !== 200) {
    throw new Error(`GitHub API ${res.status}: could not fetch release info`);
  }
  return res.json as Release;
}
```

Rate-limit handling: GH allows 60 unauthenticated requests/hour per
IP. Closed beta won't hit that. Document the limit in README; don't
add authentication.

### 2.2 Read installed version

```typescript
async function readInstalledVersion(app: App): Promise<string | null> {
  const manifestPath = `.obsidian/plugins/${PLUGIN_ID}/manifest.json`;
  if (!(await app.vault.adapter.exists(manifestPath))) return null;
  const raw = await app.vault.adapter.read(manifestPath);
  const m = JSON.parse(raw);
  return m.version ?? null;
}

function versionGreater(a: string, b: string): boolean {
  // Strip leading 'v' if present
  const norm = (s: string) => s.replace(/^v/, '').split('.').map(Number);
  const aP = norm(a), bP = norm(b);
  for (let i = 0; i < 3; i++) {
    if ((aP[i] ?? 0) > (bP[i] ?? 0)) return true;
    if ((aP[i] ?? 0) < (bP[i] ?? 0)) return false;
  }
  return false;
}
```

### 2.3 Write unzipped files

The release zip has a top-level `forge-client-obsidian/` dir (verified
during the install-latest.sh work). Strip it.

```typescript
async function writePluginFiles(
  app: App,
  unzipped: Record<string, Uint8Array>,
): Promise<void> {
  const pluginDir = `.obsidian/plugins/${PLUGIN_ID}`;

  // Preserve data.json if it exists
  let savedData: string | null = null;
  const dataPath = `${pluginDir}/data.json`;
  if (await app.vault.adapter.exists(dataPath)) {
    savedData = await app.vault.adapter.read(dataPath);
  }

  // Wipe existing plugin dir
  if (await app.vault.adapter.exists(pluginDir)) {
    await app.vault.adapter.rmdir(pluginDir, true);  // recursive
  }
  await app.vault.adapter.mkdir(pluginDir);

  // Write each file from the zip, stripping the top-level dir
  for (const [path, bytes] of Object.entries(unzipped)) {
    // Skip the top-level dir entry itself (path ends with '/')
    if (path.endsWith('/')) continue;
    // Strip 'forge-client-obsidian/' prefix
    const stripped = path.replace(/^forge-client-obsidian\//, '');
    const targetPath = `${pluginDir}/${stripped}`;
    // Ensure intermediate dirs exist
    const lastSlash = targetPath.lastIndexOf('/');
    if (lastSlash > 0) {
      const parent = targetPath.slice(0, lastSlash);
      if (!(await app.vault.adapter.exists(parent))) {
        await app.vault.adapter.mkdir(parent);
      }
    }
    // Binary write
    await app.vault.adapter.writeBinary(targetPath, bytes.buffer);
  }

  // Restore data.json
  if (savedData !== null) {
    await app.vault.adapter.write(dataPath, savedData);
  }
}
```

Watch out for: nested directories in the zip (`assets/pyodide/...`).
The recursive `mkdir` of parents above handles that.

### 2.4 Activate the plugin

```typescript
async function activatePlugin(app: App): Promise<void> {
  // app.plugins is the internal plugin manager. The public types
  // don't surface loadPlugin/enablePlugin, but they're stable
  // runtime APIs that BRAT, Obsidian Git, and many others rely on.
  const plugins = (app as any).plugins;

  // If the plugin is already loaded but stale, unload first.
  if (plugins.plugins?.[PLUGIN_ID]) {
    await plugins.disablePlugin(PLUGIN_ID);
  }

  // Re-read the manifest and load.
  await plugins.loadManifests();
  await plugins.enablePlugin(PLUGIN_ID);
}
```

Document the `(app as any).plugins` access in a code comment as a
known-stable internal API. If a future Obsidian version surfaces a
public equivalent, migrate.

## 3. Plugin entry (src/main.ts)

```typescript
import { Plugin, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { checkAndInstall } from './installer';

interface ForgeInstallerSettings {
  pinnedTag: string;            // empty = latest
  disableAfterFirstInstall: boolean;
}

const DEFAULT_SETTINGS: ForgeInstallerSettings = {
  pinnedTag: '',
  disableAfterFirstInstall: false,
};

export default class ForgeInstaller extends Plugin {
  settings!: ForgeInstallerSettings;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ForgeInstallerSettingTab(this.app, this));

    this.addCommand({
      id: 'forge-installer-check-now',
      name: 'Forge Installer: Check for updates now',
      callback: () => this.runInstall(),
    });

    // Auto-run on first enable, then once per startup. Don't loop.
    this.runInstall();
  }

  async runInstall() {
    try {
      const result = await checkAndInstall(this.app, {
        pinnedTag: this.settings.pinnedTag || undefined,
        silent: false,
      });
      if (result.status === 'up-to-date') {
        new Notice(`Forge Client is up to date (${result.detail})`);
      } else {
        new Notice(`Forge Client: ${result.status} (${result.detail})`);
        if (this.settings.disableAfterFirstInstall && result.status === 'installed') {
          // Self-disable. The user can re-enable to run an update later,
          // or use the command directly without disabling.
          await (this.app as any).plugins.disablePlugin(this.manifest.id);
        }
      }
    } catch (e) {
      console.error('Forge Installer failed:', e);
      new Notice(`Forge Installer failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ForgeInstallerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ForgeInstaller) { super(app, plugin); }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Forge Installer' });

    new Setting(containerEl)
      .setName('Pin to specific version')
      .setDesc('Leave empty for latest. Example: v0.2.12.')
      .addText(t => t.setValue(this.plugin.settings.pinnedTag).onChange(async v => {
        this.plugin.settings.pinnedTag = v.trim();
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .setName('Disable this installer after first install')
      .setDesc('Once Forge Client is installed, you can disable the installer. You can always re-enable to run an update later.')
      .addToggle(t => t.setValue(this.plugin.settings.disableAfterFirstInstall).onChange(async v => {
        this.plugin.settings.disableAfterFirstInstall = v;
        await this.plugin.saveSettings();
      }));

    new Setting(containerEl)
      .addButton(b => b.setButtonText('Check for updates now').setCta().onClick(() => this.plugin.runInstall()));
  }
}
```

## 4. Build + release pipeline

Mirror forge-client-obsidian's `package.json` scripts (`build`,
`release-zip`). For forge-installer, the release artifacts are
just `manifest.json` + `main.js` + `styles.css` — no zip needed.
BRAT pulls those three files directly.

GH release for v0.1.0 should include those three files as assets.
Standard scripted release (gh CLI or manual upload — match what
forge-client-obsidian uses).

## 5. Tests

Pure-core unit tests (matching the forge-client-obsidian convention
— no Obsidian shim):

- `versionGreater`: cases for `v0.2.12 > v0.2.11`, `0.2.12 > 0.2.11`
  (with and without `v`), `0.2.12 == 0.2.12 → false`,
  `1.0.0 > 0.99.99`, malformed input (graceful failure).
- Zip-path stripping: verify `forge-client-obsidian/main.js` →
  `main.js`, `forge-client-obsidian/assets/pyodide/x.wasm` →
  `assets/pyodide/x.wasm`, edge case of zip with no top-level dir
  (no-op strip).

Five to eight cases total. Suite target: all green.

## 6. README

forge-installer's README should cover:

- What the plugin is for (one paragraph).
- Install via BRAT instructions (one paste).
- Settings explained briefly.
- Auto-update behavior.
- Link to forge-client-obsidian (the real plugin).
- License (match forge-client-obsidian's).

Keep it short — the target audience reads this from BRAT's "Add
beta plugin" search results, not from the repo page.

## 7. Update closed-beta-onboarding.md

Revise `forge-moda-bootstrap/closed-beta-onboarding.md` §3 (Install
Forge) to use the BRAT + forge-installer flow:

1. Open Obsidian → Settings → Community plugins → Turn on.
2. Browse for **BRAT**, install, enable.
3. Cmd+P → "BRAT: Add a beta plugin to install" → paste
   `frmoded/forge-installer` → install.
4. forge-installer auto-installs Forge Client. Wait for the
   "Forge Client: installed" notice (~30 seconds for the asset
   download).
5. Reload Obsidian (Cmd+P → "Reload app without saving").
6. (Move to §4 token paste, unchanged.)

The old drag-and-drop flow can stay in INSTALL.md inside the
forge-client-obsidian repo as the "manual install" fallback for
power users / debugging. closed-beta-onboarding.md is the student-
facing path.

## 8. Manual smoke guidance for user

After CC finishes:

1. **Fresh vault.** Create a new empty Obsidian vault (e.g.
   `~/forge-vaults/smoke-installer`).
2. **Install BRAT.** Settings → Community plugins → Browse →
   search "BRAT" → install → enable.
3. **Paste forge-installer.** Cmd+P → "BRAT: Add a beta plugin to
   install" → paste `frmoded/forge-installer` → install.
4. **Watch the notice.** Expect "Downloading Forge Client v0.2.12
   ..." then "Forge Client: installed (fresh → v0.2.12)" within
   ~30s.
5. **Verify on disk.** Open Terminal:
   ```bash
   ls ~/forge-vaults/smoke-installer/.obsidian/plugins/forge-client-obsidian/
   ```
   Expect `main.js`, `manifest.json`, `assets/`, etc.
6. **Reload Obsidian.** Cmd+P → "Reload app without saving."
7. **Verify Forge Client is loaded.** Settings → Community plugins
   → "Forge Client" should show enabled at v0.2.12.
8. **Forge button works.** Open the bundled `forge-moda/setup.md`
   (or any forge-moda snippet) → click Forge → expect compute +
   render.
9. **Test update path.** Bump forge-client-obsidian to a higher
   tag (mock by pinning forge-installer's setting to an older tag,
   then unpinning) → re-enable forge-installer → expect update
   notice and new version on disk.

If steps 4-8 all pass: forge-installer ships and the closed-beta
install flow is true one-paste.

## 9. Deviations

Standard section. Specific things to call out:

- **fflate vs jszip.** If you pick jszip for ecosystem familiarity
  despite its larger size (~100KB vs 30KB), flag it. fflate is the
  recommended default.
- **`(app as any).plugins` casts.** Document each usage with a
  comment naming the API as known-stable-internal.
- **Disabled-by-default `disableAfterFirstInstall`.** Default is
  false so re-running updates is one toggle, not "re-enable then
  trigger." Flag if you flip it.

## 10. Out of scope

- Submission to Obsidian Community Plugins directory (separate
  process, weeks of review; this prompt is for closed beta).
- Windows-specific path handling beyond what Obsidian's vault
  adapter already abstracts.
- Automatic background update checks on a timer (would be polite
  for closed beta but adds surface area; reserve for v1.1).
- forge-client-obsidian repo changes — this prompt creates a new
  sibling repo and leaves forge-client-obsidian alone.

## 11. Feedback file format

Standard. Fresh-enumerated sections matching this prompt's headings.
Frontmatter timestamp + session_id + status. File at
`prompts/feedback/2026-05-31-2000-forge-installer-meta-plugin.md`.

Feedback should include the new repo's GH URL, the v0.1.0 release URL,
and a one-paragraph note on any Obsidian API gotchas hit during build.

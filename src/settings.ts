import { App, PluginSettingTab, Setting } from 'obsidian';
import { musicRibbonStatusText } from './music-ribbon-status.ts';
import { BUILD_STAMP } from './build-stamp.generated.ts';
import { formatBuildLine, vaultNameOf } from './build-stamp-core.ts';
import { listModel } from './list-model-selected.ts';
import type ForgePlugin from './main.ts';

export interface ForgeSettings {
  serverUrl: string;
  // v0.2.9: isPythonFacet removed — dead field, never read after
  // Phase 6.5 moved facet mode into snippet frontmatter
  // (edit_mode: english|python). Existing data.json copies of the
  // field are harmless: Object.assign in loadSettings drops unknowns
  // on first save.
  // V1 Phase 2: when true, the moda simulator iframe loads from the
  // Vite dev server (http://localhost:5173) for iterative iframe
  // development. Defaults to false (production: load the bundled
  // iframe from the plugin's installed assets/iframe/).
  useDevIframe: boolean;
  // V1 α (v0.2.4): hosted /generate endpoint. The plugin no longer
  // proxies to the local engine for transpilation — it POSTs to a
  // hosted service that holds the Anthropic key server-side. Single
  // shared secret per closed-beta cohort; per-user tokens are v1.1.
  transpileServiceUrl: string;
  transpileServiceToken: string;
  // Drain 2026-09-09-0930 (BYOK Phase 1). This pair does NOT replace
  // transpileServiceToken above — that token still authenticates the
  // CALLER to Forge's own hosted service (shared/free-tier identity).
  // This pair only changes WHICH Anthropic key the service uses once
  // it has already authenticated the caller, for the one /generate
  // request that carries it. Never sent when the toggle is off.
  useOwnAnthropicKey: boolean;
  ownAnthropicKey: string;
  // v0.2.7: persisted across sessions via Obsidian's loadData/saveData.
  // Defaults to false so a fresh install fires the welcome notice once;
  // flipped to true immediately after the notice is shown. Migrating
  // users from v0.2.6 also get the notice once because the field
  // doesn't exist in their data.json — Object.assign keeps the
  // DEFAULT_SETTINGS value during loadSettings.
  seenWelcome: boolean;
  // Drain 2026-08-22-2300 (Forge panel F1) — the Inputs strip's
  // per-note last-used values, keyed by snippet id, and whether the
  // strip is collapsed. Both persist across restarts: returning to a
  // note should return you to the values you last played it with.
  panelStripValues: Record<string, Record<string, string>>;
  /** Drain 2026-10-15-2100 §2 — the input signature each note's remembered values were stored under; a note whose signature is no
   *  longer that one (deleted and re-created, enum options changed) recalls nothing. */
  panelStripSignatures: Record<string, string>;
  panelStripCollapsed: boolean;
  /** Drain 2026-08-27-0700 (Gate V) — fraction of the Forge panel's
   *  height given to the input strip. NEVER trusted as stored: the read
   *  path runs it through clampStripFraction, because a 0 or 1 here
   *  hides a region AND the divider that would undo it. */
  panelStripFraction: number;
  /** Beat-as-data Phase 5c (drain 2026-10-07-0100): open rhythm data notes (type: data, content_type: json, valid rhythm body) in the
   *  Beat Box by default. Off = Phase 5b behaviour (the "Open as Beat Box" header button only). */
  openRhythmNotesInBeatBox: boolean;
  /** 2026-11-13-1214: the dialog above the prompt box: the last 50 entries per note (keyed by note path, never in the note), the dialog's height in px, and where it is docked ('bottom' | 'right'). Read through dialog-core's checks, never trusted as stored. */
  /** 2026-11-15-1217: show the strips that INPUT a value (Bars / Style / Tempo, the mix and morph strips, the arrangement's rows, the notebooks): off by default, read when a tab is (re)opened. */
  showLegacyControllers: boolean;
  /** 2026-11-15-1217: show the "Where did this bar come from?" inspector box under the Score: off by default, read when a tab is (re)opened. */
  showInspector: boolean;
  /** 2026-11-15-2101: show the chips row under the Score that says where the note came from (a phrase's sources, an arrangement's kits and phrases, a composition's sections): off by default, read when a tab is (re)opened. */
  showSourceChips: boolean;
  /** 2026-11-16-0902: a bar number (1, 2, 3 ...) above the top staff at the start of every bar of the Score: ON by default, read when a Score is engraved. */
  showBarNumbers: boolean;
  dialogHistory: Record<string, unknown>;
  /** 2026-11-21-1011: the creation time of the note each history above was written for (path -> ms): a history whose time is not the file's is another note's (a note re-created at the path). Absent until the first history is written. */
  dialogCtime?: Record<string, number>;
  dialogHeight: number;
  /** 2026-11-18 (0935): the left column's share of a two-column music tab (the draggable divider), per vault (this is the vault's own plugin data). No control in this page. Read through sanitizeRatio. */
  dialogRatio: number;
  /** 2026-11-20-1002: `Preview before applying` (default OFF): off = ONE Enter applies a sentence the grammar reads completely; on = the first Enter shows what would be written and the second applies (the old behaviour). Replaces the old auto-apply key (a stored one is ignored). */
  previewBeforeApplying: boolean;
  /** 2026-11-20-1004: `Keep unprocessed sentences for review` (default OFF): a sentence typed in a composer that neither the grammar nor the sentence service could turn into canonical lines is kept in a local file in this plugin's own folder, for the review tab. Nothing leaves the machine. */
  keepUnprocessedSentences: boolean;
}

export const DEFAULT_SETTINGS: ForgeSettings = {
  serverUrl: 'http://localhost:8000',
  useDevIframe: false,
  transpileServiceUrl: 'https://forge.thecodingarena.com',
  transpileServiceToken: '',
  useOwnAnthropicKey: false,
  ownAnthropicKey: '',
  seenWelcome: false,
  panelStripValues: {},
  panelStripSignatures: {},
  panelStripCollapsed: false,
  panelStripFraction: 0.33,
  openRhythmNotesInBeatBox: true,
  showLegacyControllers: false,
  showInspector: false,
  showSourceChips: false,
  showBarNumbers: true,
  dialogHistory: {},
  dialogHeight: 112,
  dialogRatio: 0.4,
  previewBeforeApplying: false,
  keepUnprocessedSentences: false,
};

export class ForgeSettingTab extends PluginSettingTab {
  plugin: ForgePlugin;

  constructor(app: App, plugin: ForgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // --- Build identifier (drain 2026-10-09-2200): the version string is not one; three builds can all say v0.6.1.
    new Setting(containerEl)
      .setName('Build')
      .setDesc(`${formatBuildLine(BUILD_STAMP, vaultNameOf(this.app))} — the git commit this plugin was built from (+dirty = uncommitted changes), and when. Quote this when reporting a bug.`);

    // --- Transpile service (hosted /generate) ---------------------
    // First section — the token field is the one thing students must
    // configure post-install before /generate works.
    new Setting(containerEl).setName('Transpile service').setHeading();

    new Setting(containerEl)
      .setName('Transpile service URL')
      .setDesc(
        'Hosted /generate endpoint. Default is the seminar service. '
        + 'Change only if pointing at a different α instance '
        + '(e.g. http://localhost:8001 for local α dev).'
      )
      .addText(text =>
        text
          .setPlaceholder('https://forge.thecodingarena.com')
          .setValue(this.plugin.settings.transpileServiceUrl)
          .onChange(async (value) => {
            this.plugin.settings.transpileServiceUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Transpile service token')
      .setDesc(
        'Paste the auth token you received by email. Required for '
        + 'English → Python transpilation. Stored locally in this '
        + "vault's plugin data; never shared except as the "
        + 'Authorization header on /generate requests.'
      )
      .addText(text => {
        text
          .setPlaceholder('paste token here')
          .setValue(this.plugin.settings.transpileServiceToken)
          .onChange(async (value) => {
            this.plugin.settings.transpileServiceToken = value.trim();
            await this.plugin.saveSettings();
          });
        // Mask the input. The underlying element is a standard
        // HTMLInputElement; type='password' works directly.
        text.inputEl.type = 'password';
        text.inputEl.autocomplete = 'off';
        text.inputEl.spellcheck = false;
      });

    // Drain 2026-09-09-0930 (BYOK Phase 1). Does NOT replace the
    // token above — see ForgeSettings' own comment on this pair.
    new Setting(containerEl)
      .setName('Use my own Anthropic API key')
      .setDesc(
        'Off by default (uses the shared/free-tier key). When on, '
        + 'your key is sent with this one request only — never stored '
        + 'server-side, never persisted anywhere but this vault.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.useOwnAnthropicKey)
          .onChange(async (value) => {
            this.plugin.settings.useOwnAnthropicKey = value;
            await this.plugin.saveSettings();
            // Redraw so the key field below appears/disappears with
            // the toggle — same pattern as any other structural
            // settings-tab change in Obsidian.
            this.display();
          })
      );

    if (this.plugin.settings.useOwnAnthropicKey) {
      new Setting(containerEl)
        .setName('Your Anthropic API key')
        .setDesc(
          'Paste your own key from console.anthropic.com. Used for '
          + "this request only; never persisted server-side or "
          + 'shared beyond that.'
        )
        .addText(text => {
          text
            .setPlaceholder('paste your key here')
            .setValue(this.plugin.settings.ownAnthropicKey)
            .onChange(async (value) => {
              this.plugin.settings.ownAnthropicKey = value.trim();
              await this.plugin.saveSettings();
            });
          text.inputEl.type = 'password';
          text.inputEl.autocomplete = 'off';
          text.inputEl.spellcheck = false;
        });
    }

    // --- Notes ----------------------------------------------------
    new Setting(containerEl).setName('Notes').setHeading();

    new Setting(containerEl)
      .setName('Open rhythm data notes in Beat Box by default')
      .setDesc(
        'A rhythm data note (type: data, content_type: json, with a valid rhythm pattern) opens as the Beat Box grid instead of JSON text. '
        + '"Open as JSON" in the tab header switches that tab back and it stays JSON until you navigate away. '
        + 'Off: rhythm notes open as text and you use "Open as Beat Box" in the header.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.openRhythmNotesInBeatBox)
          .onChange(async (value) => {
            this.plugin.settings.openRhythmNotesInBeatBox = value;
            await this.plugin.saveSettings();
          })
      );

    // --- 2026-11-15-1217: the music tabs ---------------------------
    new Setting(containerEl).setName('Music tabs').setHeading();

    new Setting(containerEl)
      .setName('Show legacy controllers (editing strips)')
      .setDesc(
        'The prompt box and the dialog do the inputting now. On: the strips that input a value come back under the Score of a phrase, arrangement and composition tab '
        + '(Bars, Style, Tempo; the mix, morph and transform strips; the arrangement rows; the notebooks). Takes effect when a tab is reopened.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.showLegacyControllers)
          .onChange(async (value) => {
            this.plugin.settings.showLegacyControllers = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Preview before applying')
      .setDesc(
        'Off (default): one Enter applies a sentence the grammar reads completely (a sentence the sentence service translated is still shown first). '
        + 'On: the first Enter shows what would be written and a second Enter applies it. Takes effect at the next Enter.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.previewBeforeApplying)
          .onChange(async (value) => {
            this.plugin.settings.previewBeforeApplying = value;
            await this.plugin.saveSettings();
          })
      );

    if (listModel.present) new Setting(containerEl)          // 2026-11-20-1004: music edition only (the composer's list model)
      .setName('Keep unprocessed sentences for review')
      .setDesc(
        'Off (default): nothing is kept. On: a sentence you type into a composer that the grammar cannot read and the sentence service cannot turn into canonical sentences is kept in failed-prompts.jsonl, in this plugin\'s own folder, '
        + 'for the command "Review unprocessed sentences". What is kept: the sentence as typed, the note\'s own canonical lines (at most 50), the bar count, the grammar\'s message and the service\'s result, a random id for this vault and the build. '
        + 'Never a file name, a note body, a token or your name. Nothing leaves this machine.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.keepUnprocessedSentences)
          .onChange(async (value) => {
            this.plugin.settings.keepUnprocessedSentences = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show the bar inspector')
      .setDesc(
        'The "Where did this bar come from?" box under the Score. Off by default (clicking a bar still pins and highlights it). Takes effect when a tab is reopened.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.showInspector)
          .onChange(async (value) => {
            this.plugin.settings.showInspector = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show source chips')
      .setDesc(
        'The row of chips under the Score that says where the note came from (the notes behind what is drawn). Off by default (clicking a bar still shows it). Takes effect when a tab is reopened.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.showSourceChips)
          .onChange(async (value) => {
            this.plugin.settings.showSourceChips = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show bar numbers')
      .setDesc(
        'A small number (1, 2, 3 ...) above the top staff at the start of every bar of a Score: the bar\'s position in what is drawn. On by default. Takes effect the next time a Score is drawn.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.showBarNumbers)
          .onChange(async (value) => {
            this.plugin.settings.showBarNumbers = value;
            await this.plugin.saveSettings();
          })
      );

    // 2026-11-16-1102: are the four music buttons in the left ribbon? Read live from Obsidian's ribbon when this page is drawn.
    new Setting(containerEl)
      .setName('Music ribbon buttons')
      .setDesc(musicRibbonStatusText());

    // --- Local engine (dev, secondary endpoints) ------------------
    new Setting(containerEl).setName('Local engine (dev)').setHeading();

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc(
        'URL of the local engine. Used by /canonicalize and '
        + '/sync_dependencies (non-/generate endpoints). V1 plugin '
        + "uses Pyodide for compute and the transpile service above "
        + 'for /generate — this field only matters if you run the '
        + 'local engine for those secondary endpoints.'
      )
      .addText(text =>
        text
          .setPlaceholder('http://localhost:8000')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Use dev iframe (localhost:5173)')
      .setDesc(
        'When enabled, the moda simulator loads from the Vite dev '
        + 'server at http://localhost:5173 for iframe iteration. '
        + 'Default (off) loads the iframe bundled with the plugin.'
      )
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.useDevIframe)
          .onChange(async (value) => {
            this.plugin.settings.useDevIframe = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

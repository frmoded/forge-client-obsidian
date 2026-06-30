// "Forge: Re-extract bundled library vault" command — Modal subclass.
//
// The user picks one of the bundled libraries (forge-moda, forge-music,
// forge-tutorial), reads a destructive-action warning, and confirms or
// cancels. The pure-core dispatch lives in
// re-extract-bundled-vault-core.ts; the file-system actions live in
// main.ts as a private method (so trashForensicShadow stays
// encapsulated). This file just renders the picker + warning + buttons.

import { App, DataAdapter, Modal } from 'obsidian';
import { parseForgeTomlVersion } from './bundled-vault-version-core.ts';

/** One entry the user can pick from. The version strings are read
 *  fresh from disk + bundle each time the modal opens so cohort sees
 *  the current state. */
export interface BundledVaultOption {
  /** Vault subdir name (also the bundled-asset subdir name). Used by
   *  the caller's re-extract method to locate both sides. */
  vaultName: string;
  /** Version from the bundled forge.toml (plugin assets). null when
   *  the bundled forge.toml is missing or unparseable. */
  bundledVersion: string | null;
  /** Version from the extracted forge.toml (user's vault). null when
   *  not extracted yet (first install with the library never picked
   *  up by runFirstRunCheck — rare). */
  extractedVersion: string | null;
}

/** Hardcoded list of bundled vaults the plugin ships. Mirrors the
 *  three runFirstRunCheck call sites. A registry-driven version is
 *  out of scope until third-party library install ships (§6). */
export const BUNDLED_VAULT_NAMES = [
  'forge-moda',
  'forge-music',
  'forge-tutorial',
] as const;

export type BundledVaultName = typeof BUNDLED_VAULT_NAMES[number];

/** Read the bundled + extracted forge.toml versions for each library
 *  the plugin bundles. Caller uses the result to build the modal's
 *  radio-button labels. */
export async function loadBundledVaultOptions(
  adapter: DataAdapter,
): Promise<BundledVaultOption[]> {
  const options: BundledVaultOption[] = [];
  for (const vaultName of BUNDLED_VAULT_NAMES) {
    const bundledTomlPath =
      `.obsidian/plugins/forge-client-obsidian/assets/vaults/${vaultName}/forge.toml`;
    const extractedTomlPath = `${vaultName}/forge.toml`;

    let bundledVersion: string | null = null;
    try {
      if (await adapter.exists(bundledTomlPath)) {
        bundledVersion = parseForgeTomlVersion(await adapter.read(bundledTomlPath));
      }
    } catch (e) {
      console.error(`loadBundledVaultOptions: read ${bundledTomlPath} failed`, e);
    }

    let extractedVersion: string | null = null;
    try {
      if (await adapter.exists(extractedTomlPath)) {
        extractedVersion = parseForgeTomlVersion(await adapter.read(extractedTomlPath));
      }
    } catch (e) {
      console.error(`loadBundledVaultOptions: read ${extractedTomlPath} failed`, e);
    }

    options.push({ vaultName, bundledVersion, extractedVersion });
  }
  return options;
}

export interface ReExtractModalOptions {
  options: BundledVaultOption[];
  onConfirm: (vaultName: string) => Promise<void>;
}

/** Modal that lets the user pick one bundled vault to re-extract.
 *  Resolves nothing — onConfirm fires the re-extract flow with the
 *  picked vault name. Cancel / Esc / click-outside closes silently. */
export class ReExtractBundledVaultModal extends Modal {
  private opts: ReExtractModalOptions;
  private selected: string | null = null;

  constructor(app: App, opts: ReExtractModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('Re-extract bundled library vault');
    contentEl.empty();

    // Destructive-action warning. Red-bordered notice up front so
    // cohort can't miss what's about to happen.
    const warning = contentEl.createDiv({ cls: 'forge-re-extract-warning' });
    warning.createEl('strong', { text: 'Destructive action. ' });
    warning.appendText(
      'This will overwrite your local edits to the selected library ' +
      'notes. Modified files will be moved to the system trash ' +
      '(recoverable) before re-extract. User-authored notes inside ' +
      'the library folder are preserved.',
    );

    contentEl.createEl('p', {
      text: 'Pick a bundled library to restore from bundled-canonical:',
    });

    // Radio picker. Default-select the first option so the Confirm
    // button has something to act on without forcing an explicit click.
    const pickerDiv = contentEl.createDiv({ cls: 'forge-re-extract-picker' });
    const groupName = 'forge-re-extract-vault';
    this.opts.options.forEach((opt, idx) => {
      const row = pickerDiv.createDiv({ cls: 'forge-re-extract-row' });
      const input = row.createEl('input', {
        attr: { type: 'radio', name: groupName, value: opt.vaultName, id: `frx-${opt.vaultName}` },
      }) as HTMLInputElement;
      if (idx === 0) {
        input.checked = true;
        this.selected = opt.vaultName;
      }
      input.addEventListener('change', () => {
        if (input.checked) this.selected = opt.vaultName;
      });
      const label = row.createEl('label', { attr: { for: `frx-${opt.vaultName}` } });
      label.appendText(`${opt.vaultName} — `);
      label.appendText(`bundled ${formatVersion(opt.bundledVersion)}, `);
      label.appendText(`extracted ${formatVersion(opt.extractedVersion)}`);
    });

    const btnRow = contentEl.createDiv({ cls: 'forge-re-extract-buttons' });
    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    const confirmBtn = btnRow.createEl('button', {
      text: 'Re-extract (trash local edits)',
      cls: 'mod-warning',
    });
    confirmBtn.addEventListener('click', async () => {
      if (!this.selected) return;
      const picked = this.selected;
      this.close();
      // Fire-and-forget. The caller's onConfirm reports progress via
      // forgeOutput / forgeNotice; the modal closes immediately so the
      // user gets feedback in the status bar rather than a frozen modal.
      try {
        await this.opts.onConfirm(picked);
      } catch (e) {
        console.error('ReExtractBundledVaultModal: onConfirm threw', e);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

function formatVersion(v: string | null): string {
  return v ?? '—';
}

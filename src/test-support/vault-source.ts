// Drain 2026-10-20-1100 §6 — where a test reads a VAULT file (a widget, a data note) from, and what it does when the two places disagree.
//
// Two places hold the same vault: the SIBLING checkout (`../<vault>`, what the developer is working on) and the committed BUNDLE (`assets/vaults/<vault>`, what the
// plugin ships, refreshed by `node scripts/sync-bundled-vault.mjs <vault>`). Tests used to read the sibling first and the bundle second without saying which, so a
// stale sibling (or a stale bundle) quietly decided the result — the Iteration 83 → 86 incident: a test of a removed button passed for two deploys because the
// sibling still held the old widget. The rule here: both present and different is a FAILURE that names both paths and the fix; it is never resolved by picking one.
//
// Explicit choices stay possible and visible: `override` (a file named by an env var, e.g. RHYTHM_BOX_WIDGET_FILE — a clean worktree of the vault) wins and is not
// compared; FORGE_ALLOW_VAULT_DISAGREEMENT=1 (or `allowDisagreement`) reads the sibling knowingly, for authoring work in the vault before it is synced.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface VaultFileResolution { path: string; source: 'override' | 'sibling' | 'bundle' }
export interface ResolveOptions {
  /** The client checkout; default process.cwd() (npm test runs there). The sibling is `<cwd>/../<vault>`, the bundle `<cwd>/assets/vaults/<vault>`. */
  cwd?: string;
  /** An explicit file to use instead (already chosen by the caller from an env var). Used as is, never compared. If it does not exist the result is null. */
  override?: string;
  /** Read the sibling although the bundle differs (also: FORGE_ALLOW_VAULT_DISAGREEMENT=1). */
  allowDisagreement?: boolean;
}

export class VaultDisagreementError extends Error {
  constructor(message: string) { super(message); this.name = 'VaultDisagreementError'; }
}

const md5 = (buf: Buffer) => crypto.createHash('md5').update(buf).digest('hex');

export function disagreementMessage(vault: string, rel: string, sibling: { path: string; md5: string }, bundle: { path: string; md5: string }): string {
  return [
    `The sibling vault and the committed bundle DISAGREE for ${vault}/${rel}:`,
    `  sibling: ${sibling.path}   (md5 ${sibling.md5})`,
    `  bundle:  ${bundle.path}   (md5 ${bundle.md5})`,
    'A test that reads either one is testing something the plugin will not ship (the sibling is what you are working on; the bundle is what ships), and which of them it',
    'read used to decide the result without saying so. Bring them together:',
    `    FORGE_EDITION=music node scripts/sync-bundled-vault.mjs ${vault}      # the bundle takes the sibling's committed state`,
    `  or check the sibling out at the commit the bundle was synced from. Working on the vault itself and knowingly testing against the sibling? set`,
    '  FORGE_ALLOW_VAULT_DISAGREEMENT=1 (or, for the Rhythm Box widget, RHYTHM_BOX_WIDGET_FILE=<file>).',
  ].join('\n');
}

/** The file a test should read, or null when there is none (the caller skips with its own reason). Throws VaultDisagreementError when both exist and differ. */
export function resolveVaultFile(vault: string, rel: string, opts: ResolveOptions = {}): VaultFileResolution | null {
  const cwd = opts.cwd ?? process.cwd();
  if (opts.override !== undefined) return fs.existsSync(opts.override) ? { path: path.resolve(opts.override), source: 'override' } : null;
  const sibling = path.resolve(cwd, '..', vault, rel);
  const bundle = path.resolve(cwd, 'assets', 'vaults', vault, rel);
  const haveSibling = fs.existsSync(sibling), haveBundle = fs.existsSync(bundle);
  if (haveSibling && haveBundle) {
    const s = fs.readFileSync(sibling), b = fs.readFileSync(bundle);
    if (!s.equals(b) && !(opts.allowDisagreement || process.env.FORGE_ALLOW_VAULT_DISAGREEMENT === '1')) {
      throw new VaultDisagreementError(disagreementMessage(vault, rel, { path: sibling, md5: md5(s) }, { path: bundle, md5: md5(b) }));
    }
    return { path: sibling, source: 'sibling' };
  }
  if (haveSibling) return { path: sibling, source: 'sibling' };
  if (haveBundle) return { path: bundle, source: 'bundle' };
  return null;
}

/** The text of the file, or null when neither place has it. Same rules as resolveVaultFile. */
export function readVaultFile(vault: string, rel: string, opts: ResolveOptions = {}): string | null {
  const r = resolveVaultFile(vault, rel, opts);
  return r === null ? null : fs.readFileSync(r.path, 'utf8');
}

/** The names (not paths) of the files of one vault directory: the sibling's listing when the sibling has the directory, else the bundle's; sorted. */
export function listVaultDir(vault: string, relDir: string, opts: Pick<ResolveOptions, 'cwd'> = {}): string[] {
  const cwd = opts.cwd ?? process.cwd();
  for (const base of [path.resolve(cwd, '..', vault), path.resolve(cwd, 'assets', 'vaults', vault)]) {
    const dir = path.join(base, relDir);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isFile()).sort();
  }
  return [];
}

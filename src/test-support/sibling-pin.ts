// 2026-11-04-1171-1: a test NEVER compares with a sibling repo's moving HEAD. A fixture that is "a byte copy of the playground vault's bar" is a copy of that file AT A COMMIT; this reads it from there (`git show <sha>:<path>`,
// `git archive <sha>`), never from the working tree and never from whatever HEAD is today, so a later commit in the sibling (the plugin's own "notes snapshot", a wizard edit, a refreshed description) can never red the matrix. When the sibling is
// not checked out, or does not have the pinned commit (a shallow clone, another machine), the test is SKIPPED with a one-line reason (a counted skip, never a silent pass). Bumping a pin is a deliberate act: refresh the fixture from the new commit
// and say so in the FEEDBACK.
//
// Drift DETECTION between a bundle and its source vault is a different thing and stays: the matrix's bundle-lag step and the engine-bundle drift check compare with the sibling's HEAD ON PURPOSE (the red there says "run the sync").
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The commit each sibling's fixtures were taken from. */
export const SIBLING_PINS = {
  'music-playground': 'a2a2b0fa397265baeaff99066ca9a86773fcc0ad',   // 2026-11-04 "notes snapshot for Restore to last commit": bars/bar_005.md and bar_006.md in their plugin-refreshed form
  'music-core': '80d816a2eafe19128b56ace7551e5fbb3bbc5970',
  'forge-tutorial': '872fe1396aed3dac0df61aace870815f3751eab4',
} as const;
export type SiblingName = keyof typeof SIBLING_PINS;

const HERE = path.dirname(new URL(import.meta.url).pathname);
/** Where the sibling repo is checked out: next to this client (the matrix puts a clean copy there too). */
export function siblingDir(name: string): string { return path.resolve(HERE, '../../..', name); }

const git = (dir: string, args: string[], opts: { buffer?: boolean } = {}): string | Buffer =>
  execFileSync('git', ['-C', dir, ...args], { encoding: opts.buffer ? 'buffer' : 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });

/** null when `dir` is a git checkout that has `sha`; else the one-line reason the test is skipped. */
export function pinSkipReason(dir: string, sha: string, label = path.basename(dir)): string | null {
  if (!fs.existsSync(dir)) return `${label} is not checked out here (the pinned commit ${sha.slice(0, 7)} cannot be read)`;
  try { git(dir, ['cat-file', '-e', `${sha}^{commit}`]); } catch { return `${label} does not have its pinned commit ${sha.slice(0, 7)} (shallow clone, or another machine): not comparing with a moving HEAD`; }
  return null;
}

/** The text of `rel` at the pinned commit, or `{ skip }`. A file that is not in the commit is a FAILURE (thrown): the pin names a commit that has it. */
export function pinnedSiblingFile(name: SiblingName, rel: string, opts: { dir?: string; sha?: string } = {}): { text: string } | { skip: string } {
  const dir = opts.dir ?? siblingDir(name);
  const sha = opts.sha ?? SIBLING_PINS[name];
  const skip = pinSkipReason(dir, sha, name);
  if (skip !== null) return { skip };
  return { text: git(dir, ['show', `${sha}:${rel}`]) as string };
}

/** The whole tree of the pinned commit extracted to a fresh temp directory (git archive), or `{ skip }`. The caller removes it (or leaves it to the OS). */
export function exportPinnedSibling(name: SiblingName, opts: { dir?: string; sha?: string } = {}): { dir: string } | { skip: string } {
  const dir = opts.dir ?? siblingDir(name);
  const sha = opts.sha ?? SIBLING_PINS[name];
  const skip = pinSkipReason(dir, sha, name);
  if (skip !== null) return { skip };
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `pinned-${name}-`));
  const tar = git(dir, ['archive', '--format=tar', sha], { buffer: true }) as Buffer;
  execFileSync('tar', ['-x', '-C', out], { input: tar });
  return { dir: out };
}

// Is a sibling checkout (read by a test through ../) in a state the test can compare against? A test that compares a pinned fixture with a file in a sibling repo is only meaningful when
// that file is the COMMITTED one: the plugin refreshes the playground vault's bars (new descriptions, untracked files) on the driver's machine, so the same test is red there and green in
// the matrix's clean worktree. This says WHY a directory is not clean (untracked or modified files under it) or null when it is, when it is not a git repo, or when git cannot tell.
import { execFileSync } from 'node:child_process';

export function dirtySiblingReason(dir: string, label = dir): string | null {
  let out: string;
  try {
    out = execFileSync('git', ['-C', dir, 'status', '--porcelain', '--untracked-files=all', '--', '.'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;                                           // not a git checkout, or no git: no judgment, the test stays strict
  }
  const lines = out.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;
  const names = lines.map((l) => l.slice(3)).slice(0, 3).join(', ');
  return `${label} has ${lines.length} untracked or modified file(s) (${names}${lines.length > 3 ? ', ...' : ''}): the live checkout is not the committed state this fixture pins`;
}

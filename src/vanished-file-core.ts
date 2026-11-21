// 2026-11-20-1005 (F7) - a note deleted from outside Obsidian while it is open is not an error. Pure: what counts as a vanished file, and a reporter that says it ONCE per note, as an info line (never red).
/** Node's ENOENT (the code or the words), Obsidian's "File not found": the file is gone. Anything else (a permission error, a full disk) is a real failure and stays loud. */
export function isVanishedFileError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  const message = typeof e === 'string' ? e : typeof (e as { message?: unknown } | null | undefined)?.message === 'string' ? (e as { message: string }).message : '';
  return code === 'ENOENT' || /ENOENT|no such file or directory|file not found/i.test(message);
}

export interface VanishedReporter {
  /** Say that `path` is gone (once); `label` names what was skipped. true = the line was said, false = it was said before. */
  report(path: string, label: string): boolean;
  /** The note is back (or its record is stale): the next time it vanishes it is said again. */
  forget(path: string): void;
}
export function createVanishedReporter(info: (line: string) => void): VanishedReporter {
  const said = new Set<string>();
  return {
    report(path, label) { if (said.has(path)) return false; said.add(path); info(`[forge] ${path} is gone (deleted outside Obsidian); skipped ${label}`); return true; },
    forget(path) { said.delete(path); },
  };
}

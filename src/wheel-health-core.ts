// Pure-core runtime-health vocabulary for the vendored wheels.
// obsidian-import-free so `node --test` can exercise it.
//
// Drain 2026-08-21-2310. A length-preserving corruption of a cached
// wheel was caught by extraction (BadZipFile) and degraded correctly,
// but every claim about it was wrong or invisible: the mount stage
// said "sha256-verified at onload" (nothing was hashed there), the
// failure never left the console, and the engine still reported
// `ready` while music21 was unimportable. One defect — dishonest
// health reporting — so the strings and the readiness decision live
// here, together, where tests can pin them.

export interface WheelExtractFailure {
  wheel: string;
  error: string;
}

/** What the mount stage may honestly claim. The onload hydration
 *  check is byte-length presence (drain 1200's accepted trade: no
 *  re-hashing 37 MB every launch). A full sha256 is computed exactly
 *  once — at hydration fetch time, before the bytes are written. */
export function wheelMountClaim(
  input: { wheelCount: number; pluginVersion: string },
): string {
  return (
    `Forge wheel-mount: manifest has ${input.wheelCount} wheels; ` +
    `pluginVersion=${input.pluginVersion}; mounting from the local cache. ` +
    `Cached wheels were checked for presence (byte length) at onload — ` +
    `sha256 is verified when a wheel is fetched, not re-checked here.`
  );
}

/** Parse the Python extract stage's failure lines
 *  ("<wheel>: <ErrorType>: <detail>") into structured failures.
 *  Anything unparseable is kept whole rather than dropped — a
 *  failure we cannot parse is still a failure the user must see. */
export function parseWheelExtractFailures(
  lines: readonly string[] | undefined | null,
): WheelExtractFailure[] {
  const out: WheelExtractFailure[] = [];
  for (const raw of lines ?? []) {
    const line = String(raw).trim();
    if (line === '') continue;
    const idx = line.indexOf(': ');
    if (idx <= 0) {
      out.push({ wheel: line, error: 'unknown error' });
      continue;
    }
    out.push({ wheel: line.slice(0, idx), error: line.slice(idx + 2) });
  }
  return out;
}

/** Where a cached wheel lives, so a corrupt one can be deleted and
 *  re-fetched-with-verification on the next launch. */
export function corruptWheelCachePath(pluginId: string, wheel: string): string {
  return `.obsidian/plugins/${pluginId}/assets/wheels/${wheel}`;
}

export interface RuntimeHealth {
  /** 'degraded' whenever a wheel failed to extract or import. Never
   *  'ready' in that case: the invariant this drain exists for is
   *  that a damaged install cannot look identical to a healthy one. */
  status: 'ready' | 'degraded';
  /** Capabilities known to be unavailable (import probe failures). */
  missing: string[];
  /** One line, safe for a log or a panel header. */
  summary: string;
}

export function deriveRuntimeHealth(
  input: {
    extractFailures: readonly WheelExtractFailure[];
    importFailures: readonly string[];
  },
): RuntimeHealth {
  const extract = input.extractFailures ?? [];
  const missing = [...(input.importFailures ?? [])];
  if (extract.length === 0 && missing.length === 0) {
    return { status: 'ready', missing: [], summary: 'engine ready' };
  }
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`unavailable: ${missing.join(', ')}`);
  }
  if (extract.length > 0) {
    parts.push(`damaged wheel(s): ${extract.map((f) => f.wheel).join(', ')}`);
  }
  return {
    status: 'degraded',
    missing,
    summary: `engine ready but DEGRADED — ${parts.join('; ')}`,
  };
}

export interface WheelPanelEntry {
  title: string;
  lines: string[];
}

/** The load-bearing surface. Console is redundancy; this is what the
 *  user actually sees. Names the wheel, quotes the real error, and —
 *  when the corrupt cache entry was deleted — states the recovery in
 *  the user's terms. */
export function wheelExtractPanelEntry(
  failures: readonly WheelExtractFailure[],
  outcome: { deleted: readonly string[] },
): WheelPanelEntry {
  const deleted = new Set(outcome?.deleted ?? []);
  const lines: string[] = [];
  for (const f of failures) {
    lines.push(`${f.wheel} — ${f.error}`);
  }
  lines.push(
    'A cached Python package in your Forge install is damaged, so the ' +
    'features it provides are unavailable this session.',
  );
  if (deleted.size > 0) {
    lines.push(
      `Removed the damaged copy of ${[...deleted].join(', ')} — Forge will ` +
      're-download and verify it next launch. Restart Obsidian to recover.',
    );
  } else {
    lines.push(
      'Could not remove the damaged copy automatically. Delete it from ' +
      '.obsidian/plugins/forge-client-obsidian/assets/wheels/ and restart ' +
      'Obsidian; Forge will re-download and verify it.',
    );
  }
  return {
    title: '⚠  Damaged Python package — some features unavailable',
    lines,
  };
}

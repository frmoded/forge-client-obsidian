// Drain 2026-10-09-2200 (rider d) — how the build stamp (short git SHA + build time, from the gitignored src/build-stamp.generated.ts that
// scripts/inline-plugin-version.mjs writes on every build) is shown. Pure so the formatting is tested.

export interface BuildStamp {
  readonly sha: string;
  readonly dirty: boolean;
  readonly builtAt: string;
}

/** "904d575c7+dirty · built 2026-10-09 20:53 UTC" (or "unknown build" when the SHA could not be read). */
export function formatBuildStamp(stamp: BuildStamp): string {
  const when = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(stamp.builtAt);
  const time = when ? ` · built ${when[1]} ${when[2]} UTC` : '';
  if (stamp.sha === 'unknown') return `unknown build${time}`;
  return `${stamp.sha}${stamp.dirty ? '+dirty' : ''}${time}`;
}

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

export interface StatusBarTooltipInput {
  version: string;
  /** `formatBuildStamp(BUILD_STAMP)`. */
  build: string;
  pluginId: string;
  minAppVersion: string;
}

/** The status-bar item's hover text, on ONE line (separators, not newlines), so it reads the same however the tooltip wraps. */
export function statusBarTooltip(i: StatusBarTooltipInput): string {
  return `Forge Client v${i.version} · Build: ${i.build} · Plugin ID: ${i.pluginId} · Min app version: ${i.minAppVersion}`;
}

/** Obsidian draws its own tooltip from `aria-label`, positioned by `data-tooltip-position`; a bare `title` on a status-bar item never
 *  showed there (drain 2026-10-11-0900 §6). Any native `title` is cleared so two tooltips cannot stack. */
export function setStatusBarTooltip(
  el: { setAttribute(name: string, value: string): void; removeAttribute?(name: string): void; title?: string },
  text: string,
): void {
  el.setAttribute('aria-label', text);
  el.setAttribute('data-tooltip-position', 'top');
  el.removeAttribute?.('title');
  if ('title' in el) el.title = undefined;
}

/** 2026-10-31-1115: the commit alone, for the onload banner: "904d575c7" or "904d575c7+dirty" ("unknown" when it could not be read). */
export function formatBuildSha(stamp: Pick<BuildStamp, 'sha' | 'dirty'>): string {
  return stamp.sha === 'unknown' ? 'unknown build' : `${stamp.sha}${stamp.dirty ? '+dirty' : ''}`;
}

/** 2026-11-17-0901 A: the console banner. Every vault keeps its OWN copy of the plugin, so the banner names the vault whose copy is running: the commit alone cannot say
 *  "this is the old copy in the other vault". No vault name (or a blank one) leaves the line as it was. */
export function formatLoadBanner(i: { version: string; edition: string; stamp: Pick<BuildStamp, 'sha' | 'dirty'>; vaultName?: string }): string {
  const vault = i.vaultName?.trim();
  return `FORGE CLIENT v${i.version} LOADED (edition: ${i.edition}, ${formatBuildSha(i.stamp)}${vault ? `, vault: ${vault}` : ''})`;
}

/** 2026-11-17-0901 A: the Settings "Build" line: the commit (+dirty), when, and whose copy this is. */
export function formatBuildLine(stamp: BuildStamp, vaultName?: string): string {
  const vault = vaultName?.trim();
  return `${formatBuildStamp(stamp)}${vault ? ` · this vault (${vault}) has its own copy of the plugin` : ''}`;
}

/** 2026-11-17-0901 A: the open vault's name, or undefined. Never throws: the host's vault is a stub in tests and may not have a name yet, and a banner must not be able to stop onload. */
export function vaultNameOf(app: { vault?: { getName?: () => unknown } } | undefined): string | undefined {
  try {
    const name = app?.vault?.getName?.();
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}

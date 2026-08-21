// BRAT Phase 1, part (c) core — drain 2026-08-19-0900.
//
// A BRAT install lands main.js + manifest.json + styles.css and no
// `assets/`. The inlined TEXT layer is restored by restore-inlined-
// assets.ts (already works); this module owns the BINARY layer: decide
// what is missing, fetch it from THIS version's own release assets,
// verify every byte against the baked manifest, and only then let it
// count as present.
//
// Pure-core per the layering convention: no `obsidian` import, so the
// state machine is headless-testable. The caller injects fetch, digest,
// and filesystem as narrow structural interfaces.
//
// §8 of the drain, encoded here rather than left to the caller:
//   - never a third-party CDN: the URL is built from the running
//     plugin version and this repo only;
//   - never "latest": `version` is required and goes into the path;
//   - never run an artifact that failed verification: a mismatch
//     deletes the bytes and reports failure, and `writeVerified` is
//     the ONLY way bytes reach disk.

import {
  HYDRATABLE_ASSETS,
  HYDRATABLE_TOTAL_BYTES,
  type HydratableAsset,
} from './asset-manifest.generated.ts';

export const RELEASE_BASE = 'https://github.com/frmoded/forge-client-obsidian/releases/download';

/** Narrow shapes the Obsidian runtime happens to satisfy. */
export interface HydrationFs {
  exists(path: string): Promise<boolean>;
  /** Byte length of an existing file, for the cheap presence check. */
  size(path: string): Promise<number>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
}
export interface HydrationNet {
  /** Resolves the artifact's bytes, or throws / returns a non-2xx status. */
  get(url: string): Promise<{ status: number; bytes: Uint8Array }>;
}
/** sha256 → lowercase hex. Injected because Obsidian gives us
 *  `crypto.subtle` (async) while tests use node's sync `crypto`. */
export type Digest = (bytes: Uint8Array) => Promise<string>;

export type ArtifactState =
  | 'absent'
  | 'downloading'
  /** Present with the expected byte length. NOT hash-checked — drain
   *  2026-08-21-2310 renamed this from 'verified-cached', which
   *  claimed an integrity check that planHydration never performs. */
  | 'present-cached'
  /** Fetched and sha256-verified in this session, before writing. */
  | 'verified-fetched'
  | 'failed';

export interface ArtifactPlan {
  name: string;
  asset: HydratableAsset;
  /** Where it lands, relative to the plugin dir. */
  destPath: string;
  url: string;
  state: ArtifactState;
}

export interface HydrationPlan {
  version: string;
  artifacts: ArtifactPlan[];
  /** Only the ones that still need fetching. */
  pending: ArtifactPlan[];
  /** Bytes still to download — what the progress UX totals. */
  pendingBytes: number;
  totalBytes: number;
  /** True when nothing needs the network: offline launches are fine. */
  complete: boolean;
}

export function assetUrl(version: string, name: string): string {
  if (!version) {
    // Never "latest" (§8): an unpinned URL could serve a runtime that
    // does not match the plugin that asked for it.
    throw new Error('brat-hydration: refusing to build an unpinned asset URL');
  }
  return `${RELEASE_BASE}/v${version}/${name}`;
}

/** What is missing, and what it will cost to fetch.
 *
 *  Presence is judged by byte length, not just existence: a half-written
 *  artifact from a killed launch is exactly the "half-hydrated state"
 *  the drain forbids, and its length will not match. Full verification
 *  of already-present files is deliberately NOT done here — re-hashing
 *  37 MB on every launch would cost seconds for a case `writeVerified`
 *  already prevents. */
export async function planHydration(
  version: string,
  fs: HydrationFs,
  pluginDir: string,
  manifest: Record<string, HydratableAsset> = HYDRATABLE_ASSETS,
): Promise<HydrationPlan> {
  const artifacts: ArtifactPlan[] = [];
  for (const name of Object.keys(manifest).sort()) {
    const asset = manifest[name];
    const destPath = `${pluginDir}/assets/${asset.relpath}`;
    let state: ArtifactState = 'absent';
    if (await fs.exists(destPath) && (await fs.size(destPath)) === asset.bytes) {
      state = 'present-cached';
    }
    artifacts.push({ name, asset, destPath, url: assetUrl(version, name), state });
  }
  const pending = artifacts.filter((a) => a.state !== 'present-cached');
  return {
    version,
    artifacts,
    pending,
    pendingBytes: pending.reduce((s, a) => s + a.asset.bytes, 0),
    totalBytes: Object.values(manifest).reduce((s, a) => s + a.bytes, 0),
    complete: pending.length === 0,
  };
}

export interface FetchOutcome {
  name: string;
  ok: boolean;
  /** Populated on failure, for the Notice and the console. */
  reason?: 'http' | 'hash' | 'network';
  detail?: string;
}

/** Fetch one artifact, verify it, and only then write it.
 *
 *  Verification precedes the write, so a mismatched artifact never
 *  exists on disk even briefly — this is the "write-to-temp + rename"
 *  guarantee the drain asks for, obtained by not writing at all until
 *  the bytes are known good. If a stale file is somehow present it is
 *  removed on failure so the next launch retries cleanly rather than
 *  inheriting a bad cache. */
export async function fetchVerified(
  plan: ArtifactPlan,
  net: HydrationNet,
  fsx: HydrationFs,
  digest: Digest,
): Promise<FetchOutcome> {
  let bytes: Uint8Array;
  try {
    const resp = await net.get(plan.url);
    if (resp.status < 200 || resp.status >= 300) {
      return { name: plan.name, ok: false, reason: 'http', detail: `HTTP ${resp.status}` };
    }
    bytes = resp.bytes;
  } catch (e) {
    return { name: plan.name, ok: false, reason: 'network', detail: String(e) };
  }

  const actual = await digest(bytes);
  if (actual !== plan.asset.sha256) {
    // Never run unverified code (§8). Nothing was written; clear any
    // pre-existing file so the retry starts from absent.
    if (await fsx.exists(plan.destPath)) await fsx.remove(plan.destPath);
    return {
      name: plan.name,
      ok: false,
      reason: 'hash',
      detail: `expected ${plan.asset.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
    };
  }

  await fsx.write(plan.destPath, bytes);
  plan.state = 'verified-fetched';
  return { name: plan.name, ok: true };
}

export interface HydrationProgress {
  /** 1-based index of the artifact just finished. */
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  name: string;
}

export interface HydrationResult {
  ok: boolean;
  fetched: string[];
  failures: FetchOutcome[];
  bytesFetched: number;
}

/** Run a plan to completion.
 *
 *  Stops at the first failure rather than grinding through 19 more
 *  fetches that cannot produce a working runtime — the user gets one
 *  clear error and a clean retry next launch, which is what "no
 *  half-hydrated state" means in practice. Artifacts already fetched
 *  stay cached and are skipped on retry. */
export async function hydrate(
  plan: HydrationPlan,
  net: HydrationNet,
  fsx: HydrationFs,
  digest: Digest,
  onProgress?: (p: HydrationProgress) => void,
): Promise<HydrationResult> {
  const fetched: string[] = [];
  const failures: FetchOutcome[] = [];
  let bytesDone = 0;
  const total = plan.pending.length;

  for (const artifact of plan.pending) {
    artifact.state = 'downloading';
    const outcome = await fetchVerified(artifact, net, fsx, digest);
    if (!outcome.ok) {
      artifact.state = 'failed';
      failures.push(outcome);
      break;
    }
    fetched.push(artifact.name);
    bytesDone += artifact.asset.bytes;
    onProgress?.({
      done: fetched.length,
      total,
      bytesDone,
      bytesTotal: plan.pendingBytes,
      name: artifact.name,
    });
  }

  return { ok: failures.length === 0, fetched, failures, bytesFetched: bytesDone };
}

/** "Downloading Forge runtime (~37MB, one time)…" — the copy the drain
 *  requires. Rounded to whole MB because a byte-exact figure reads as
 *  noise in a Notice. */
export function hydrationNotice(pendingBytes: number): string {
  const mb = Math.round(pendingBytes / 1048576);
  return `Downloading Forge runtime (~${mb}MB, one time)…`;
}

export function progressNotice(p: HydrationProgress): string {
  const mb = (p.bytesDone / 1048576).toFixed(1);
  const totalMb = (p.bytesTotal / 1048576).toFixed(1);
  return `Forge runtime: ${p.done}/${p.total} (${mb}/${totalMb} MB)`;
}

/** What the user sees when the network is not there on first run. */
export function offlineNotice(version: string): string {
  return (
    `Forge needs a one-time ~${Math.round(HYDRATABLE_TOTAL_BYTES / 1048576)}MB ` +
    `runtime download and could not reach GitHub. Reopen Obsidian while ` +
    `online and it will finish automatically. (Release v${version}.)`
  );
}

// BRAT Phase 1b — drain 2026-08-20-1200. The Obsidian-coupled half of
// runtime hydration; all decision logic lives in brat-hydration-core.ts
// so it stays headless-testable. This file is only adapters + the
// onload orchestration, per the layering convention.
//
// Phase 1 (drain 2026-08-19-0900) shipped the core and nothing called
// it. This is what makes a BRAT install — manifest.json + main.js +
// styles.css and no `assets/` — reach a working runtime after one
// online launch.

import { Notice, requestUrl } from 'obsidian';
import type { App } from 'obsidian';

import {
  hydrate,
  hydrationNotice,
  offlineNotice,
  planHydration,
  progressNotice,
  type Digest,
  type HydrationFs,
  type HydrationNet,
  type HydrationResult,
} from './brat-hydration-core.ts';

/** `crypto.subtle` is present in Obsidian's renderer. Lowercase hex to
 *  match the manifest generator's `crypto.createHash(...).digest('hex')`. */
export const subtleDigest: Digest = async (bytes) => {
  const view = new Uint8Array(bytes);
  // Copy into a plain ArrayBuffer — a Uint8Array view over a larger
  // buffer would hash the whole backing store, not the artifact.
  const buf = view.byteLength === view.buffer.byteLength
    ? view.buffer
    : view.slice().buffer;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/** Obsidian's `requestUrl` rather than browser `fetch`: a fetch from
 *  `app://obsidian.md` to github.com is blocked by CORS. Same reason
 *  the v0.2.174 wheel fallback used it (`pyodide-host.ts`). */
export function obsidianNet(): HydrationNet {
  return {
    async get(url) {
      const resp = await requestUrl({ url, method: 'GET', throw: false });
      return { status: resp.status, bytes: new Uint8Array(resp.arrayBuffer) };
    },
  };
}

export function obsidianFs(app: App): HydrationFs {
  const adapter = app.vault.adapter;
  return {
    async exists(path) {
      return adapter.exists(path);
    },
    async size(path) {
      try {
        const st = await adapter.stat(path);
        return st?.size ?? -1;
      } catch {
        return -1;
      }
    },
    async write(path, bytes) {
      const dir = path.slice(0, path.lastIndexOf('/'));
      try {
        await adapter.mkdir(dir);
      } catch {
        // Already exists — Obsidian throws rather than no-op'ing.
      }
      // `bytes.buffer` may be a view into a larger allocation; slice so
      // we never write neighbouring bytes into the artifact.
      await adapter.writeBinary(path, bytes.slice().buffer as ArrayBuffer);
    },
    async remove(path) {
      try {
        await adapter.remove(path);
      } catch {
        // Nothing to remove is the state we wanted anyway.
      }
    },
  };
}

export interface HydrationOutcome {
  /** True when the binary runtime is fully present and verified. */
  ready: boolean;
  /** True when nothing had to be downloaded (the zip-install path). */
  wasAlreadyComplete: boolean;
  result?: HydrationResult;
}

/** Plan, download, verify. Returns whether the runtime may be booted.
 *
 *  Never throws: a hydration failure must degrade to "Pyodide stays
 *  asleep and the user is told why", not to a broken onload. */
export async function hydrateRuntime(
  app: App,
  pluginId: string,
  version: string,
  log: (msg: string) => void = console.log,
): Promise<HydrationOutcome> {
  const fs = obsidianFs(app);
  const net = obsidianNet();
  const pluginDir = `.obsidian/plugins/${pluginId}`;

  let plan;
  try {
    plan = await planHydration(version, fs, pluginDir);
  } catch (e) {
    console.error('Forge hydration: planning failed', e);
    return { ready: false, wasAlreadyComplete: false };
  }

  if (plan.complete) {
    // The zip-install path: every artifact is already on disk. Silent
    // by design — an existing install must not learn it is being
    // audited on every launch.
    return { ready: true, wasAlreadyComplete: true };
  }

  log(`Forge hydration: ${plan.pending.length} artifact(s), `
    + `${(plan.pendingBytes / 1048576).toFixed(1)} MB from release v${version}`);

  const notice = new Notice(hydrationNotice(plan.pendingBytes), 0);
  let result: HydrationResult;
  try {
    result = await hydrate(plan, net, fs, subtleDigest, (p) => {
      notice.setMessage(progressNotice(p));
    });
  } finally {
    notice.hide();
  }

  if (result.ok) {
    new Notice('Forge runtime ready.', 4000);
    log(`Forge hydration: complete — ${result.fetched.length} artifact(s), `
      + `${(result.bytesFetched / 1048576).toFixed(1)} MB verified`);
    return { ready: true, wasAlreadyComplete: false, result };
  }

  // Report the FIRST failure: the run stops there, so later artifacts
  // were never attempted and naming them would be noise.
  const failure = result.failures[0];
  if (failure?.reason === 'network') {
    new Notice(offlineNotice(version), 15000);
  } else {
    new Notice(
      `Forge runtime download failed on ${failure?.name} `
      + `(${failure?.detail}). It will retry next launch.`,
      15000,
    );
  }
  console.error(
    `Forge hydration: FAILED on ${failure?.name} — ${failure?.reason}: ${failure?.detail}. `
    + `${result.fetched.length} artifact(s) verified and cached; the retry `
    + `next launch will fetch only what is still missing.`,
  );
  return { ready: false, wasAlreadyComplete: false, result };
}

// Test support (drain 2026-10-22-1610): run the REAL `ForgePlugin.prototype.onload` from the real bundle against a catch-all stand-in for the plugin base class, so a test can use the wiring
// onload really makes (the open-log handler, the commands) instead of a re-implementation of it. Everything onload touches that this stand-in does not model answers with a callable no-op
// proxy; `then` is undefined so awaiting one never hangs. It needs a DOM (`document`), so call `installDom` first. Console noise of onload (hydration, banners) is muted while it runs.
import type { RealPlugin } from './bundle-real-plugin.ts';

function catchAll(name: string): any {
  const f: any = function () { return catchAll(`${name}()`); };
  return new Proxy(f, {
    get: (_t, k: any) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => name : k === 'length' ? 0 : catchAll(`${name}.${String(k)}`)),
    apply: () => catchAll(`${name}()`),
    construct: () => catchAll(`new ${name}`),
  });
}

export interface LoadedPlugin {
  /** The plugin object the real code sees (a proxy over `target`). */
  self: any;
  /** Own state: set `target.app` etc. here. */
  target: any;
  /** Every `addCommand({ id, name, callback })` onload made, by id. */
  commands: Map<string, { callback?: () => unknown; name?: string }>;
}

export async function loadRealOnload(real: RealPlugin, app: any): Promise<LoadedPlugin> {
  const target: any = Object.create(real.ForgePlugin.prototype);
  const commands = new Map<string, { callback?: () => unknown; name?: string }>();
  target.addCommand = (c: any) => { commands.set(c.id, c); return c; };
  target.loadData = async () => ({});
  target.app = app;
  const self: any = new Proxy(target, {
    get: (t, k: any, r) => { if (k in t) return Reflect.get(t, k, r); if (k === 'then') return undefined; return catchAll(String(k)); },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const saved = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  console.log = console.error = console.warn = console.info = console.debug = () => {};
  try { await real.ForgePlugin.prototype.onload.call(self); } finally { Object.assign(console, saved); }
  return { self, target, commands };
}

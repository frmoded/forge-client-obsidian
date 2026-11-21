// 2026-11-21-1012 item 3 (CCQA N3) - Verovio logs the same engraving warning for every system of every render (a narrow Score pane: 300+ lines in five minutes with DevTools docked). This keeps the FIRST line of a kind as Verovio wrote it, counts the
// repeats (the numbers in a line do not make a new kind), and says them as ONE line with the count when the window ends. Every other console line passes unchanged; the engraving is not touched. Music edition only (only verovio.ts installs it).

/** The four warnings the flood is made of. */
export const ENGRAVING_WARNING = /Justification is highly compressed|System full width|Non-justifiable width|Drawing justifiable width/i;

export interface CollapserPorts { print(line: string): void; now(): number; setTimer(fn: () => void, ms: number): unknown; clearTimer(h: unknown): void; windowMs?: number }
export interface Collapser {
  /** true = this line is a repeat inside the window: do not show it (it is counted). false = show it as it is. */
  handle(text: string): boolean;
}
const kindOf = (text: string): string => text.replace(/-?\d+(?:\.\d+)?/g, 'N').replace(/\s+/g, ' ').trim();

export function createWarningCollapser(ports: CollapserPorts): Collapser {
  const windowMs = ports.windowMs ?? 10_000;
  const kinds = new Map<string, { count: number; first: number; timer: unknown }>();
  return {
    handle(text) {
      const kind = kindOf(text); const st = kinds.get(kind);
      if (st === undefined) {
        const entry = { count: 0, first: ports.now(), timer: undefined as unknown };
        entry.timer = ports.setTimer(() => { kinds.delete(kind); if (entry.count > 0) ports.print(`[forge-verovio] ${entry.count} more of: ${kind} (in the last ${Math.round((ports.now() - entry.first) / 1000)} s)`); }, windowMs);
        kinds.set(kind, entry); return false;
      }
      st.count++; return true;
    },
  };
}

/** Wrap the console methods Verovio's Emscripten runtime may use: a matching line goes through the collapser, the rest straight to the original. One installation per console (a second call returns a no-op); the returned function puts the console back. */
const INSTALLED = '__forgeEngravingWarningFilter';
export function installEngravingWarningFilter(target: Record<string, any>, ports: Omit<CollapserPorts, 'print'>): () => void {
  if (target[INSTALLED]) return () => {};
  const methods = ['log', 'info', 'warn', 'error'] as const; const originals = new Map<string, (...a: unknown[]) => void>();
  for (const m of methods) if (typeof target[m] === 'function') originals.set(m, target[m]);
  const out = originals.get('warn') ?? originals.get('log') ?? (() => {});
  const collapser = createWarningCollapser({ ...ports, print: (line) => out.call(target, line) });
  for (const [m, orig] of originals) target[m] = (...a: unknown[]) => { const text = a.map(String).join(' '); if (ENGRAVING_WARNING.test(text) && collapser.handle(text)) return; orig.apply(target, a); };
  target[INSTALLED] = true;
  return () => { for (const [m, orig] of originals) target[m] = orig; delete target[INSTALLED]; };
}

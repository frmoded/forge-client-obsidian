# Unify stdout sink — pipe to Forge Output, retire iframe console panel

## Scope

Two coupled changes shipping together. Single coherent change: "the stdout from any compute lands in one place — Forge Output — and the iframe stops being a competing console surface."

1. **forge-client-obsidian (plugin).** Forge Output renders the `{stdout}` field below the rendered result for any `/compute` response that carries one. Two channels in one sink: rendered return value (A6) on top, stdout text log below (only when non-empty).
2. **forge-moda-client (iframe).** Remove the simulator's console panel entirely (the React component, the CSS, the `appendStdout` call sites, the `consoleLines` state). The iframe's role narrows to live state-visualizer only.

Does NOT:
- Forward iframe-side stdout to the plugin's Forge Output via postMessage. The featured-button compute goes through the iframe → engine path and its stdout is dropped on the floor in this prompt. If that becomes a felt cost, a follow-up wires the postMessage forwarding. For now, print-debugging is reserved for the Forge-click path.
- Touch the engine, the constitution, the wire shape, or `/moda/*` endpoints. `/moda/compute` keeps returning `{stdout}` in its response; the iframe just ignores it.
- Add a new renderer for `moda_sim_state` in Forge Output. Raw JSON stays the fallback for Forge-clicking `simulation.md` directly. Stdout renders independently as text.
- Bump forge-moda version or publish anything.

## Why

- The iframe console (shipped in `2026-05-21-1833`) and the plugin's Forge Output panel are two stdout sinks. Redundant and inconsistent: same `print()` lands in different surfaces depending on invocation path.
- The agreed model (this session): Forge Output is the unified sink for **any** compute's output — rendered return + stdout text. Simulator iframe is for live state visualization, not for text.
- The `print("foo")` mystery in earlier smoke tests stemmed in part from this fragmentation: students lost the print and didn't know where to look.

## Files to modify

### Plugin — `forge-client-obsidian`

- The Forge Output panel rendering code. Locate it (likely in `src/output-view.ts` or wherever `/compute` responses are handled). Find where the `result` field is rendered per A6.
- After the result rendering, append a stdout block (only when `stdout` is non-empty). Plain monospace text. Reuse existing CSS surfaces where reasonable (`var(--text-normal)` etc.). Don't invent new styling primitives.
- If Forge Output renders incrementally per `/compute` call (which is likely), each call's stdout sits with its result — not appended into a global log.

### Iframe — `forge-moda-client`

- `Simulator.tsx`:
  - Remove `consoleLines` state and `appendStdout` calls.
  - Remove the JSX block that renders the console panel.
  - Remove the auto-scroll `useEffect` keyed on `consoleLines.length`.
  - `handleRunFeatured` keeps consuming `res.stdout` from the response shape but does nothing with it (or simply omits the field destructure entirely).
- `Simulator.module.css`:
  - Remove `.console`, `.consoleHeader`, `.consoleBody` rules (added by `2026-05-21-1833`, brightened by `2026-05-22-0100`).
- `Simulator.test.tsx`: if any existing test asserts on console-panel presence (the brighten-console feedback didn't mention one, but check), remove or update.

## Implementation notes

- The plugin-side stdout renderer is **monospace text** in a small block below the rendered result. Resist building a fancy log component — Forge Output's job is "show the result"; the stdout is a secondary band.
- If `result` is empty (e.g. snippet returned None) but `stdout` is non-empty, still render the stdout block. A snippet whose only output is `print()` should still show up.
- If both are empty, render whatever the current "empty result" affordance is. Don't add a new "nothing to show" state.
- The iframe's `/moda/compute` and `/moda/click` responses keep their `{stdout}` field — the engine API doesn't change. The iframe just doesn't consume it.

## Tests

- Plugin: existing tests still pass. Add one test for the new stdout-below-result rendering — render a fake `/compute` response with `{stdout: "hello\n"}` and assert the stdout text appears in the output panel.
- Iframe: vitest 3/3 stays green (or reduces to 2/2 if any existing test referenced the console panel).
- Manual verification deferred to user:
  1. Forge-click any moda snippet with a `print()` somewhere in its Python (e.g., shadow `bluh/on_mouse_click.md` with a print, then Forge-click). Confirm the print text appears in Forge Output below the rendered result.
  2. Open the moda simulator iframe. Confirm the console panel is gone. Canvas/header/zoom group all still render correctly with the freed vertical space.
  3. Featured-button click. Final-tick state renders in canvas. Any prints from the run don't appear anywhere (expected — iframe-side stdout drop is by design in this prompt).

## Out of scope

- postMessage forwarding from iframe to plugin for featured-button stdout. Future prompt if it matters.
- C7/A7 constitutional tightening. Next prompt.
- `publish-vault.sh` auto-bump fix. Separate concern.
- New `moda_sim_state` renderer for Forge Output (the visual one). Raw JSON stays.
- Changing what `/moda/compute` returns. Engine API frozen.
- Mass-driven physics. Tamar conversation.
- Touching forge-moda content or registry.

## Report when done

- **Plugin diff** — file + key lines that render stdout below the result.
- **Iframe diff** — files + removed blocks (`.console*` CSS, console JSX, state, effects).
- **Test results** — plugin pass count, vitest pass count.
- **Commit SHAs** — one for plugin, one for iframe.
- **Any deviation and why.**
- **One observation** — anything that suggests a follow-up.

## Commits + push

Two commits, two repos:
- `forge-client-obsidian`: "Forge Output: render stdout below result"
- `forge-moda-client`: "Simulator: drop console panel; stdout flows to Forge Output via plugin"

Push both to `main`.

## Don'ts

- **Don't add postMessage forwarding.** Out of scope.
- **Don't touch the engine.** Server keeps returning `{stdout}` unchanged.
- **Don't bump forge-moda.** No content change.
- **Don't add a new renderer** for moda_sim_state in Forge Output. Raw JSON stays.
- **Don't bundle the C7/A7 work or the publish-vault.sh fix.** Separate prompts.
- **Don't fix the pre-existing `npm run build` tsc error.** Same workaround as before — `npx vite build` if a build is needed.
- **Don't change `/moda/*` endpoint shapes.** Engine API frozen.
- **Don't add a "stdout log toggle"** or any UI for hiding/showing stdout. Always render when non-empty; omit when empty.

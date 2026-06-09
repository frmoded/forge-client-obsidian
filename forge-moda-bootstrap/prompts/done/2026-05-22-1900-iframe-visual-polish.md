# Iframe visual polish — distinguish water from ink, match button height

## Scope

Two small visual tweaks in `forge-moda-client` only. One repo, two
small diffs, single coherent change.

1. **Particle differentiation.** In the canvas render loop in
   `Simulator.tsx`, widen the visual gap between water and ink so
   the three ink dispersions are obviously distinguishable from the
   500-particle water population. Both currently render as ~2.5px
   circles with `#3a6fb3` (water) and `#15171a` (ink); on the cream
   background at that size, the color difference reads as "two
   shades of dark dot" rather than "blue water + dark ink." Move
   water to a lighter, less saturated blue and grow ink to a
   slightly larger radius so it pops as a discrete drop.

2. **Featured-button height.** In `Simulator.module.css`, make the
   "Run simulation" button match the height of the zoom +/- buttons
   (`.iconBtn` is `height: 30px`). The current `.featuredBtn` is
   padding-driven (~26-28px tall) and looks subtly off next to the
   zoom group in the header.

Does NOT:

- Touch the engine, the constitution, the wire shape, the moda
  router, or any snippet.
- Touch the plugin (`forge-client-obsidian`).
- Change particle physics (mass, collision response). The Tamar
  conversation about mass-driven physical differentiation is
  separate; this prompt is purely visual.
- Refactor the render loop. Two-pass-per-type stays.
- Change the simulator background, the canvas dimensions, or any
  other surface beyond the particle fill and the featured button.
- Publish anything. No forge-moda version bump.

## Why

Smoke-test feedback on the simulation-button (`1500`) prompt's
result: water and ink were too close in color at the current
radius. Three ink clicks land in the canned `sample_clicks`
scenario, but a viewer couldn't see them as distinct dispersions
against the water population. Visual differentiation is the
cheapest fix; size adds to color contrast without committing to
the physical-mass discussion still pending with Tamar.

For the button: the featured button sits between the title and the
zoom group in the header (margin-left: auto pushes it right). A
height mismatch with the adjacent zoom buttons is a cosmetic itch
worth scratching now since both edits ship together.

## Files to modify

### `forge-moda-client/forge-moda-web/src/components/Simulator.tsx`

Locate the redraw `useEffect` (around line 220, the comment block
"Redraw on every simState update"). Two changes inside it:

- **Water color** — change from `#3a6fb3` (a fully-saturated mid blue)
  to something lighter and more water-ish. Suggested: `#9cc3e5`
  (pale blue) — light enough that the cream canvas reads through
  it slightly and the 500 water particles look like a faint
  texture rather than a dark crowd.
- **Ink size** — change radius from `2.5` to `4.0` in the ink loop
  only (water stays at `2.5`). Color stays `#15171a`.

The two-pass structure (one `fillStyle` per type) stays the same;
only the two constants change. Update the surrounding comment to
reflect the new shape (e.g. "water is rendered pale blue, ink is
rendered larger and near-black so the three clicks visibly pop as
distinct drops").

Don't introduce new dependencies, don't refactor the loop, don't
reshape the Particle type.

### `forge-moda-client/forge-moda-web/src/components/Simulator.module.css`

Locate the `.featuredBtn` block (around line 464). Add explicit
`height: 30px` to match `.iconBtn`'s height. Adjust `padding` if
needed so the label still reads centered — `padding: 0 12px` (drop
the `4px` vertical) is a likely fit; verify by inspecting the
rendered button next to the zoom group.

Don't touch other classes (`.iconBtn`, `.zoomGroup`, `.tBtn`,
etc.). Don't change `.featuredBtn`'s color, background, border-
radius, font-size, font-weight, or transitions.

## Implementation notes

- The water-color suggestion (`#9cc3e5`) is one credible value, not
  load-bearing. If you have a better pale-blue that reads well on
  the cream background and clearly contrasts with the dark ink,
  use it. Document the chosen value in the report so the user can
  eyeball it.
- The ink-radius suggestion (`4.0`) is similarly tentative. Range
  `3.5–5.0` is reasonable. Larger than ~5.0 makes a 50-particle
  click look like a single blob; smaller than ~3.5 doesn't visibly
  differentiate from water. Pick within that range.
- For the button height: if `height: 30px` + `padding: 0 12px`
  produces vertical-alignment quirks (e.g. baseline misalignment
  vs `.iconBtn`'s icon-centered children), use `line-height: 30px`
  instead and keep the original padding. The goal is visual height
  match, not pixel-perfect box-model identity.
- No build pipeline changes. The forge-moda-web `npm run build`
  has a pre-existing tsc error in `vite.config.ts` (flagged in
  prior feedback); if you need to run a build, use `npx vite build`
  as a workaround. The iframe is served by the Vite dev server at
  `localhost:5173` in normal operation — changes ship via HMR on
  the user's next reload of the iframe.

## Tests

- `npm test` in `forge-moda-web` — the existing vitest cases
  (Simulator mount, featured-button-hidden-before-discovery,
  featured-button-shown-after-discovery) should still pass. They
  don't snapshot canvas pixels or button heights, so the visual
  edits won't ripple into assertions.
- No new tests required. Visual polish is empirically verified by
  the user's manual smoke (see below).

### Manual GUI verification (deferred to user)

1. Reload the iframe in Obsidian (hard refresh if HMR didn't pick
   up). Open the moda simulator in Bluh (or any consumer vault).
2. Click "Run simulation" — confirm three ink dispersions visibly
   stand out from the water population. They should look like
   discrete dark drops, not pile-up of dark dots that blend.
3. Look at the "Run simulation" button next to the zoom +/-
   buttons in the header. Height should match.

## Out of scope

- Particle physics changes. Mass-as-numeric, mass-affects-bounce,
  etc. — separate conversation with Tamar.
- Forge Output renderer for `moda_sim_state`. Not building one
  this round; raw JSON stays the Forge Output behavior for direct
  Forge-click on `simulation.md`.
- Refactoring the canvas render loop, switching to WebGL, adding
  trails / particle history, or any animation polish.
- Adding a tooltip / aria-description for the featured button
  beyond what already exists.
- Changing `simulation.md` or `sample_clicks.md` content.
- Bumping forge-moda or publishing anything.
- Touching the plugin (`forge-client-obsidian`).
- Fixing the pre-existing `npm run build` tsc error.

## Report when done

- **`Simulator.tsx` diff** — before/after for the two changed
  constants (water color, ink radius). Note the chosen values.
- **`Simulator.module.css` diff** — before/after for `.featuredBtn`
  (the new `height` line and any padding adjustment).
- **vitest output** — pass count, confirm no regressions.
- **Commit SHA** — single `forge-moda-client` commit, pushed to
  `main`.
- **Any deviation and why.**
- **One observation** — anything noticed during the touch that
  might be worth a follow-up (e.g., "the canvas background is
  hardcoded `#f0eee8` — worth a theme-variable lift" or "the two-
  pass render is fine for 650 particles but might bottleneck at
  5000+").

## Commit + push

Single forge-moda-client commit. Suggested message:

```
Simulator: distinguish water and ink visually; match featured button height

Water particles render in a paler blue and ink particles render at
a slightly larger radius so three clicks land as distinct
dispersions against the water population. Featured "Run simulation"
button height now matches the zoom +/- buttons in the header.

Pure visual polish — no physics, no wire-shape changes.
```

Push to `forge-moda-client/main`.

## Don'ts

- **Don't change particle physics.** No edits to `move.md`,
  `interact.md`, `bounce_off_*`, or anywhere mass might become a
  physics input.
- **Don't change the canvas background.** Cream stays cream.
- **Don't touch the plugin.** This is iframe-only.
- **Don't bump forge-moda or publish anything.** No registry
  interaction.
- **Don't add new dependencies.** No animation libraries, no
  color libraries.
- **Don't refactor the render loop.** Two-pass stays.
- **Don't snapshot canvas pixels in tests.** Visual is
  user-verified.
- **Don't fix the build pipeline.** Pre-existing tsc error stays
  pre-existing.

// Run-input widget framework — pure core. Drain 2026-08-05-1500.
//
// `input_enums:` (drain 2026-07-31-1120) let a note say "this input has
// four valid values" and got a dropdown for free. This is the same idea
// one step further: `input_widgets:` says "this input is a set of
// pitches" and gets an interactive keyboard.
//
//   inputs: [chord_tones]
//   input_widgets:
//     chord_tones: piano
//
// SCOPE OF THIS MODULE
// --------------------
// Everything the Run modal needs to turn frontmatter + DOM into
// kwargs, in one place:
//
//   1. `parseInputWidgets`     — frontmatter -> name/type map
//   2. `resolveInputRendering` — which of text/enum/widget an input gets
//   3. the widget registry     — register / render / collect
//   4. `coerceRunInputValues`  — the raw-string -> kwargs step
//
// (4) lived inline in `ForgeRunModal.submit` until this drain. It moved
// here so a test can exercise the ACTUAL coercion the modal runs — the
// widget's whole contract is "the string I emit becomes a list on the
// other side", and a test that re-implemented the coercion would be
// exactly the drift trap the protocol's fixture rule warns about.
//
// NO OBSIDIAN IMPORTS. The unknown-widget-type path therefore RETURNS
// the message it wants shown instead of calling `Notice` itself; the
// modal surfaces it. Silence there would violate the Diagnostics rule,
// and the pure-core convention forbids importing `Notice` to do it, so
// the message has to travel as data.

import type { InputEnums } from './input-enums-core.ts';

/** Widget types the framework knows the NAME of. Only the ones actually
 *  registered will render; the rest fall back with a Notice, which is
 *  how `guitar_fretboard` and `chord_builder` behave until their own
 *  drains register them. */
export type WidgetType = 'piano' | 'guitar_fretboard' | 'chord_builder';

/** Normalized `input_widgets` frontmatter: input name -> widget type.
 *
 *  Deliberately `string`, not `WidgetType`. Frontmatter is
 *  cohort-authored; a typo (`pianno`) is a value we must carry as far
 *  as the render step so the fallback Notice can name it. Narrowing at
 *  parse time would turn a nameable mistake into a silent drop. */
export type InputWidgets = Record<string, string>;

/**
 * Read `input_widgets` out of a note's frontmatter, defensively.
 *
 * Mirrors `parseInputEnums` shape-for-shape, because the failure modes
 * are the same ones and cohort notes will hit them the same way:
 *
 * - key absent / null            -> `{}`
 * - not an object (string, list) -> `{}`
 * - value not a scalar           -> that entry dropped
 * - non-string scalar            -> coerced via String()
 * - empty / whitespace-only      -> dropped, so the input falls back to
 *   a text box rather than rendering a widget with no type
 */
export function parseInputWidgets(frontmatter: unknown): InputWidgets {
  if (!frontmatter || typeof frontmatter !== 'object') return {};
  const raw = (frontmatter as Record<string, unknown>)['input_widgets'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: InputWidgets = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;  // nested map / list: not a type
    const s = String(value).trim();
    if (s.length === 0) continue;
    out[name] = s;
  }
  return out;
}

/** What the Run modal should render for one input. */
export type InputRendering =
  | { kind: 'widget'; widget: string; conflict: boolean }
  | { kind: 'enum'; allowed: string[] }
  | { kind: 'text' };

/**
 * Decide how one input renders.
 *
 * WIDGET WINS ON CONFLICT. The prompt's §Part 1 and its named test both
 * say so, and it is the right way round: a widget is the richer
 * interaction, and an author who declared both was describing the same
 * value twice, not asking for a dropdown. `conflict: true` rides along
 * so the caller can warn — the note has a contradiction in it and the
 * author should know, even though we resolved it.
 *
 * (§Part 4 of the same prompt lists enum-first. That contradicts §Part 1
 * and the test name; two of three sources say widget, so widget it is.
 * Flagged in the drain FEEDBACK.)
 */
export function resolveInputRendering(
  name: string,
  enums: InputEnums,
  widgets: InputWidgets,
): InputRendering {
  const widget = widgets[name];
  const allowed = enums[name];
  if (widget) {
    return { kind: 'widget', widget, conflict: Boolean(allowed && allowed.length > 0) };
  }
  if (allowed && allowed.length > 0) return { kind: 'enum', allowed };
  return { kind: 'text' };
}

// ------------------------------------------------------------ registry

/** A widget implementation. `TSelection` is whatever the widget calls
 *  its state — for the piano it is `string[]` of pitch names. */
export interface WidgetRenderer<TSelection = unknown> {
  type: WidgetType;
  /** Build the widget's DOM inside `container`. */
  render(container: HTMLElement, initialSelection: TSelection): void;
  /** Read the current selection back out of the rendered DOM. */
  getSelection(container: HTMLElement): TSelection;
  /** Selection -> the string that becomes the Recipe's input value. */
  serialize(selection: TSelection): string;
  /** The inverse, for re-opening the modal on a cached value. Must
   *  return an empty selection for anything it cannot read — a stale
   *  cache should open the widget blank, never throw. */
  deserialize(raw: string | undefined): TSelection;
}

const registry = new Map<string, WidgetRenderer<unknown>>();

/** Register a widget. Re-registering the same type overwrites, so
 *  plugin reload is idempotent. */
export function registerWidget<T>(renderer: WidgetRenderer<T>): void {
  registry.set(renderer.type, renderer as WidgetRenderer<unknown>);
}

export function getWidget(type: string): WidgetRenderer<unknown> | undefined {
  return registry.get(type);
}

export function registeredWidgetTypes(): string[] {
  return [...registry.keys()];
}

/** Test support: drop every registration. Not used in production. */
export function resetWidgetRegistry(): void {
  registry.clear();
}

/** Marker for the fallback text input, so `collectWidgetInput` can read
 *  it back through the same call it uses for real widgets. */
const FALLBACK_TYPE = '__text__';

const ATTR_INPUT = 'data-forge-widget-input';
const ATTR_TYPE = 'data-forge-widget-type';

/** What `renderWidget` did, so the caller can surface it. */
export type WidgetRenderOutcome =
  | { rendered: 'widget'; type: string }
  | { rendered: 'fallback-text'; type: string; message: string };

/**
 * Render `type` into `container`, stamping the attributes
 * `collectWidgetInput` reads back.
 *
 * An unregistered type is NOT an exception and NOT a silent no-op: it
 * renders a plain text box (so the cohort can still run the note by
 * typing a value) and returns the message the caller must show.
 */
export function renderWidget(
  type: string,
  inputName: string,
  container: HTMLElement,
  cachedRaw: string | undefined,
): WidgetRenderOutcome {
  container.setAttribute(ATTR_INPUT, inputName);

  const renderer = registry.get(type);
  if (!renderer) {
    container.setAttribute(ATTR_TYPE, FALLBACK_TYPE);
    const doc = container.ownerDocument;
    const input = doc.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('placeholder', inputName);
    input.className = 'forge-widget-fallback-input';
    if (cachedRaw !== undefined) input.value = cachedRaw;
    container.appendChild(input);
    return {
      rendered: 'fallback-text',
      type,
      message: `Widget type '${type}' not available; falling back to text input`,
    };
  }

  container.setAttribute(ATTR_TYPE, type);
  renderer.render(container, renderer.deserialize(cachedRaw));
  return { rendered: 'widget', type };
}

/**
 * Read one input's value back out of the DOM as the string the Recipe
 * will receive.
 *
 * `container` may be the widget's own element or any ancestor of it —
 * the modal holds per-input containers, but a caller with only the
 * modal root should not have to thread them.
 */
export function collectWidgetInput(
  inputName: string,
  container: HTMLElement,
): string {
  const selector = `[${ATTR_INPUT}="${inputName}"]`;
  const el = container.matches?.(selector)
    ? container
    : container.querySelector<HTMLElement>(selector);
  if (!el) return '';

  const type = el.getAttribute(ATTR_TYPE);
  if (type === FALLBACK_TYPE) {
    const input = el.querySelector<HTMLInputElement>('input');
    return input?.value ?? '';
  }
  const renderer = type ? registry.get(type) : undefined;
  if (!renderer) return '';
  return renderer.serialize(renderer.getSelection(el));
}

// ------------------------------------------------------------ coercion

/**
 * The raw-strings -> kwargs step the Run modal submits with.
 *
 * Extracted verbatim from `ForgeRunModal.submit` in this drain. The
 * JSON-first rule predates widgets and is why the piano serializes to a
 * JSON list: `["C4","E4"]` arrives at the Recipe as an actual list with
 * nothing else in the chain having to change. A bare `C4` still arrives
 * as the string `"C4"`, because JSON.parse rejects it and we fall back.
 */
export function coerceRunInputValues(
  values: Record<string, string>,
): Record<string, unknown> {
  const kwargs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    try { kwargs[k] = JSON.parse(v); } catch { kwargs[k] = v; }
  }
  return kwargs;
}

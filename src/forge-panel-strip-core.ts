// src/forge-panel-strip-core.ts
//
// Drain 2026-08-22-2300 — the Forge panel's Inputs strip (plan F1).
//
// Two things live here, both pure (NO OBSIDIAN IMPORTS, pure-core
// convention):
//
// (1) `buildInputFieldModels` — the per-input decision loop, lifted out
//     of `ForgeRunModal.onOpen` so the dialog and the strip share it.
//     The pieces it calls (resolveInputRendering, initialEnumValue,
//     initialDerivedEnumValue, initialInputValue, enumOptions) were
//     already shared cores; the LOOP over them was not, and the loop is
//     where every future input feature lands. Two copies of it would
//     drift within one drain of each other, which is the fork §8 of the
//     prompt forbids. The modal now renders from these models, so the
//     strip inherits its behaviour instead of imitating it.
//
// (2) The strip's state machine. The strip is PERMANENT — when the
//     active note is not an action note it greys the last one rather
//     than emptying, because a surface that disappears is a log with a
//     hole under it, not an instrument.

import { initialEnumValue, type InputEnums } from './input-enums-core.ts';
import {
  enumOptions,
  initialDerivedEnumValue,
  type DerivedEnums,
  type EnumOption,
} from './derived-enums-core.ts';
import {
  initialInputValue,
  resolveSubmittedInputs,
  type InputDefaults,
} from './run-input-defaults-core.ts';
import {
  coerceRunInputValues,
  resolveInputRendering,
  type InputWidgets,
} from './input-widget-core.ts';

// ------------------------------------------------------ field models

/** One rendered control. `value` is the string the control starts on —
 *  the same string the dialog would have submitted. */
export type InputFieldModel =
  | { name: string; kind: 'text'; value: string; placeholder: string }
  | {
      name: string;
      kind: 'enum';
      value: string;
      options: EnumOption[];
      /** A leading empty entry. True exactly when the input is required
       *  and nothing has been chosen yet — without it the dropdown would
       *  silently satisfy an input that has no declared default. */
      blankOption: boolean;
      source: 'frontmatter' | 'derived';
      conflict: boolean;
    }
  | {
      name: string;
      kind: 'widget';
      widget: string;
      /** Last run's value, for widgets that can restore a selection. */
      seed: string | undefined;
      conflict: boolean;
    };

export interface InputFieldSources {
  /** Declared input names, in declaration order. */
  inputs: string[];
  /** Last-used values for THIS note. */
  cached?: Record<string, string>;
  enums?: InputEnums;
  widgets?: InputWidgets;
  defaults?: InputDefaults;
  derivedEnums?: DerivedEnums;
}

/**
 * Decide, per input, which control appears and what value it starts on.
 *
 * Extracted from `ForgeRunModal.onOpen`; the precedence rules are that
 * loop's, unchanged — widget over enum, frontmatter enum over derived,
 * last run over declared default over nothing.
 */
export function buildInputFieldModels(sources: InputFieldSources): InputFieldModel[] {
  const {
    inputs,
    cached = {},
    enums = {},
    widgets = {},
    defaults = {},
    derivedEnums = {},
  } = sources;

  return inputs.map((name): InputFieldModel => {
    const rendering = resolveInputRendering(name, enums, widgets, derivedEnums);

    if (rendering.kind === 'widget') {
      return {
        name,
        kind: 'widget',
        widget: rendering.widget,
        seed: cached[name],
        conflict: rendering.conflict,
      };
    }

    if (rendering.kind === 'enum') {
      if (rendering.source === 'derived') {
        const options = enumOptions(rendering.allowed);
        const value = initialDerivedEnumValue(cached[name], options, defaults[name]);
        return {
          name,
          kind: 'enum',
          value,
          options,
          blankOption: value === '',
          source: 'derived',
          conflict: rendering.conflict,
        };
      }
      return {
        name,
        kind: 'enum',
        value: initialEnumValue(cached[name], rendering.allowed),
        options: rendering.allowed.map(v => ({ value: v, label: v })),
        blankOption: false,
        source: 'frontmatter',
        conflict: rendering.conflict,
      };
    }

    return {
      name,
      kind: 'text',
      value: initialInputValue(name, cached, defaults),
      placeholder: defaults[name] ?? name,
    };
  });
}

// -------------------------------------------------------- the strip

/** An action note the strip can render. */
export interface StripNote {
  snippetId: string;
  fields: InputFieldModel[];
}

export type StripMode =
  /** The active note is an action note. */
  | 'active'
  /** The active note is not one; the last action note stays, greyed. */
  | 'stale'
  /** Nothing has been active yet this session. */
  | 'empty';

export interface StripState {
  mode: StripMode;
  snippetId: string | null;
  fields: InputFieldModel[];
  header: string;
  /** One line under the header when the strip is not live. */
  hint: string | null;
  /** Controls + Run are inert unless the note is actually active. */
  disabled: boolean;
  /** The note this state is showing, to carry into the next derive as
   *  the "last" slot. Null only in the empty state. */
  note: StripNote | null;
}

const EMPTY_HEADER = '▶ Forge';

export function stripHeaderText(snippetId: string, inputCount: number): string {
  const count = inputCount === 0
    ? 'no inputs'
    : `${inputCount} input${inputCount === 1 ? '' : 's'}`;
  return `▶ ${snippetId} — ${count}`;
}

/**
 * What the strip shows right now.
 *
 * `active` is the note the user is looking at (null when it is not an
 * action note); `last` is the most recent action note the strip showed.
 * The strip never returns an empty rendering while `last` exists —
 * permanence is the product.
 */
export function deriveStripState(
  active: StripNote | null,
  last: StripNote | null,
): StripState {
  if (active) {
    return {
      mode: 'active',
      snippetId: active.snippetId,
      fields: active.fields,
      header: stripHeaderText(active.snippetId, active.fields.length),
      hint: null,
      disabled: false,
      note: active,
    };
  }

  if (last) {
    return {
      mode: 'stale',
      snippetId: last.snippetId,
      fields: last.fields,
      header: stripHeaderText(last.snippetId, last.fields.length),
      hint: `The open note is not an action note — showing ${last.snippetId}. `
        + 'Open an action note to play it.',
      disabled: true,
      note: last,
    };
  }

  return {
    mode: 'empty',
    snippetId: null,
    fields: [],
    header: EMPTY_HEADER,
    hint: 'Open an action note to see its inputs here.',
    disabled: true,
    note: null,
  };
}

// ----------------------------------------------------- value memory

/** snippet id -> that note's last-used raw field values. */
export type PanelValueMemory = Record<string, Record<string, string>>;

/** Returns a NEW memory. It lands in plugin data via saveData, and
 *  mutating in place is how a held reference persists the wrong note's
 *  values after the fact. */
export function rememberPanelValues(
  memory: PanelValueMemory,
  snippetId: string,
  values: Record<string, string>,
): PanelValueMemory {
  return { ...memory, [snippetId]: { ...values } };
}

export function recallPanelValues(
  memory: PanelValueMemory,
  snippetId: string,
): Record<string, string> {
  return { ...(memory[snippetId] ?? {}) };
}

/** "Reset to defaults" — drop what this note remembers, so the next
 *  build falls back through declared defaults exactly as a first-ever
 *  open would. */
export function forgetPanelValues(
  memory: PanelValueMemory,
  snippetId: string,
): PanelValueMemory {
  const out = { ...memory };
  delete out[snippetId];
  return out;
}

// ------------------------------------------------------- run wiring

export interface StripSubmission {
  /** Null when no action note has ever been shown. */
  snippetId: string | null;
  /** True while the strip is greyed (the open note is not this one). */
  disabled: boolean;
  /** The controls' current raw string values. */
  values: Record<string, string>;
  defaults: InputDefaults;
}

/** Flat rather than a discriminated union on purpose: this repo builds
 *  with `strict: false`, so narrowing a boolean discriminant does not
 *  work at the call site. `raw` is {} and `missingRequired` is [] on the
 *  branches where they do not apply. */
export interface StripRunOutcome {
  ran: boolean;
  raw: Record<string, string>;
  missingRequired: string[];
}

/**
 * The strip's Run, minus the DOM.
 *
 * Same three rules the dialog's submit has: a blank field whose input
 * declares a default is dropped so Python binds the default; a blank
 * field with no default is a missing required input and must NOT
 * dispatch a wrong answer; everything else is JSON-coerced on the way
 * out. The two extra rules are the strip's own — a greyed strip and a
 * strip with no note never run.
 */
export function submitStrip(
  submission: StripSubmission,
  run: (snippetId: string, kwargs: Record<string, unknown>, raw: Record<string, string>) => void,
  notify: (message: string) => void,
): StripRunOutcome {
  const { snippetId, disabled, values, defaults } = submission;
  if (!snippetId || disabled) return { ran: false, raw: {}, missingRequired: [] };

  const { values: resolved, missingRequired } = resolveSubmittedInputs(values, defaults);
  if (missingRequired.length > 0) {
    notify(
      `Forge: ${missingRequired.join(', ')} ${missingRequired.length === 1 ? 'has' : 'have'}`
      + ' no declared default — enter a value.',
    );
    return { ran: false, raw: {}, missingRequired };
  }

  const raw = { ...values };
  run(snippetId, coerceRunInputValues(resolved), raw);
  return { ran: true, raw, missingRequired: [] };
}

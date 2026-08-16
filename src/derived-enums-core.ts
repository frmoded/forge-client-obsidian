// src/derived-enums-core.ts
//
// Drain 2026-08-16-1700 — dropdown options derived from an input's own
// enum-literal type.
//
// `Input mood: 'happy' | 'sad' | 'grumpy' = "happy".` transpiles to an
// annotation of `Literal['happy','sad','grumpy']`. The type already IS
// the option list, so a note should not need parallel `input_enums:`
// frontmatter to get a dropdown — especially since no wizard tool can
// write that frontmatter, which made the dropdown unreachable for any
// enum note authored over MCP.
//
// NO OBSIDIAN IMPORTS (pure-core convention).

/** Input name -> its allowed literal values, from the resolved signature. */
export type DerivedEnums = Record<string, string[]>;

/** One dropdown entry. `value` is what gets submitted, `label` what the
 *  user reads. */
export interface EnumOption {
  value: string;
  label: string;
}

/**
 * Turn allowed literals into dropdown entries.
 *
 * The submitted value is JSON text, matching the convention drain 1900
 * established for defaults: `coerceRunInputValues` JSON-parses on the way
 * out, so `"happy"` arrives as the string `happy` — exactly what typing
 * it by hand produced.
 *
 * Storing the bare literal instead would be subtly wrong for an enum like
 * `'5' | '6'`: JSON.parse('5') is the NUMBER 5, so the engine would bind
 * an int where the author declared a string. The label still shows the
 * bare text, so nothing about the reading experience changes.
 */
export function enumOptions(allowed: string[]): EnumOption[] {
  return allowed.map(v => ({ value: JSON.stringify(v), label: v }));
}

/**
 * Which option a dropdown starts on.
 *
 * Precedence mirrors drain 1900's text-field rule: last run's choice,
 * then the declared default, then nothing.
 *
 * "Nothing" is deliberate and is the §8 requirement. An enum input
 * declared WITHOUT a default is a required input, and pre-selecting the
 * first option would silently satisfy it — the dialog would submit
 * `happy` for a value the author never gave a default for, and the
 * missing-required Notice from 1900 would never fire. Starting blank
 * keeps that path reachable; the modal renders a leading empty entry so
 * there is something to show.
 *
 * A cached value that is no longer among the options (the author edited
 * the enum since) is ignored rather than submitted.
 */
export function initialDerivedEnumValue(
  cached: string | undefined,
  options: EnumOption[],
  declaredDefault: string | undefined,
): string {
  const valid = new Set(options.map(o => o.value));
  if (cached !== undefined && cached !== '' && valid.has(cached)) return cached;
  if (declaredDefault !== undefined && valid.has(declaredDefault)) return declaredDefault;
  return '';
}

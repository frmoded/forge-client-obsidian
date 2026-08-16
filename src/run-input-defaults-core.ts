// Drain 2026-08-15-1900 — declared `Input` defaults in the Run dialog.
//
// The dialog used to know an input's NAME and nothing else. A field
// left blank submitted a literal empty string, so `Input word: str =
// "hooray"` produced `"!"` and `Input n: int = 5` crashed on `"" <= 1`
// — even though the Python the engine actually runs
// (`def compute(context, word: str = 'hooray')`) carries the default
// perfectly well. See src/run-input-defaults.test.ts for the
// investigation this shape follows from.
//
// Two halves, both needed:
//   (a) pre-fill, so the user SEES what they are about to get, and
//   (b) omit-on-blank, so a blank submission is right regardless of
//       whether the pre-fill happened, was cleared, or never ran
//       because the defaults lookup failed.
//
// (b) is gated on "this input HAS a declared default". Omitting a
// blank REQUIRED input would swap a wrong answer for
// `compute() missing 1 required positional argument` — so those are
// reported back to the caller instead, and the dialog stays open.
//
// NO OBSIDIAN IMPORTS (pure-core convention).

/** Input name → the declared default, rendered as the JSON text a user
 *  would type into the field. `{word: '"hooray"'}`, `{n: '5'}`,
 *  `{flag: 'true'}`. JSON is deliberate: it is the exact format
 *  `coerceRunInputValues` parses on the way back out, so a pre-filled
 *  value that the user never touches round-trips to the same Python
 *  object the engine would have bound itself. An input with no
 *  declared default is simply absent. */
export type InputDefaults = Record<string, string>;

/**
 * The value a text field starts life with.
 *
 * Precedence: last run's value → declared default → empty. An EMPTY
 * cached value falls through to the default rather than winning:
 * otherwise clearing the box once would leave it blank on every
 * subsequent open, and the whole point of (a) is that the user can see
 * what a blank submission is going to give them.
 */
export function initialInputValue(
  name: string,
  cached: Record<string, string>,
  defaults: InputDefaults,
): string {
  const remembered = cached[name];
  if (remembered !== undefined && remembered !== '') return remembered;
  return defaults[name] ?? '';
}

export interface SubmittedInputs {
  /** What to hand to `coerceRunInputValues`. Blank fields whose input
   *  declares a default are ABSENT, so Python binds the default. */
  values: Record<string, string>;
  /** Blank fields whose input declares no default. Non-empty means the
   *  caller must not dispatch. */
  missingRequired: string[];
}

/**
 * Turn the dialog's collected field values into what should actually be
 * sent, resolving blanks against the declared defaults.
 *
 * "Blank" is exactly the empty string. A whitespace-only value is a
 * real value — `" "` is a legitimate separator, and second-guessing it
 * would be its own silent-wrong-answer bug.
 */
export function resolveSubmittedInputs(
  values: Record<string, string>,
  defaults: InputDefaults,
): SubmittedInputs {
  const out: Record<string, string> = {};
  const missingRequired: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    if (value === '') {
      if (name in defaults) continue;  // Python's own default applies.
      missingRequired.push(name);
      out[name] = value;
      continue;
    }
    out[name] = value;
  }
  return { values: out, missingRequired };
}

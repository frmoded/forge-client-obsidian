// Pure-core reconciliation: compare current frontmatter `inputs:`
// against the canonical inputs list inferred from the Python
// signature, write the canonical list back if they differ. The
// caller (main.ts:writeGeneratedCode) wires the adapter to obsidian
// APIs; the pure-core decision-and-no-op-detection logic lives here
// so node --test can exercise it without an obsidian shim.
//
// Per cc-prompt-queue.md §82-108 ("Test-infrastructure conventions"),
// this is the 9th pure-core extraction in the v0.2.x arc. Naming
// follows the `<concept>-...ts` style — not `-core.ts` because this
// IS the whole reconciliation, not the kernel of a larger feature.

/** Adapter the caller wires to obsidian APIs:
 *  - `getInferredInputs`: routes to `host.getInputNames(snippetId)`
 *    (the v0.2.20 helper that parses the Python signature). May
 *    throw if the Pyodide host isn't wired; reconcileInputs catches.
 *  - `readCurrentInputs`: reads `metadataCache.getFileCache(file)
 *    ?.frontmatter?.inputs` and normalizes to `string[]`.
 *  - `writeInputs`: writes via `app.fileManager.processFrontMatter`. */
export interface InputsReconcileAdapter {
  getInferredInputs(snippetId: string): Promise<string[]>;
  readCurrentInputs(): string[];
  writeInputs(next: string[]): Promise<void>;
}

/** Result of a single reconciliation pass. `status` distinguishes
 *  the three outcomes: `'wrote'` (frontmatter updated to inferred),
 *  `'no-op'` (current already matches inferred — no write fired),
 *  `'skipped'` (getInferredInputs failed; reconciliation degraded
 *  silently — frontmatter stays whatever it was). */
export interface ReconcileResult {
  status: 'wrote' | 'no-op' | 'skipped';
  inputs: string[];
}

/** Compare current frontmatter `inputs:` against inferred. Write
 *  back if they differ; no-op otherwise. Best-effort: an inference
 *  failure (e.g. Pyodide host not wired yet) returns `'skipped'`
 *  rather than propagating.
 *
 *  Order-sensitive comparison: the `_forge_get_input_names` helper
 *  returns declared-first-then-sig-extras-appended. The reconciliation
 *  preserves that order; reordering would churn the file on every
 *  /generate when the user authored a different order than inference
 *  produces. */
export async function reconcileInputs(
  snippetId: string,
  adapter: InputsReconcileAdapter,
): Promise<ReconcileResult> {
  let inferred: string[];
  try {
    inferred = await adapter.getInferredInputs(snippetId);
  } catch {
    return { status: 'skipped', inputs: [] };
  }

  const current = adapter.readCurrentInputs();
  if (
    current.length === inferred.length
    && current.every((v, i) => v === inferred[i])
  ) {
    return { status: 'no-op', inputs: current };
  }

  await adapter.writeInputs(inferred);
  return { status: 'wrote', inputs: inferred };
}

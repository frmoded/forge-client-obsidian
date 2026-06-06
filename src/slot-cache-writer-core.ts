// v0.2.70 Phase 2 §1.3 — pure-core helper for plugin-side slot-cache
// write-back. When the engine surfaces a SlotCacheMissError, the
// plugin batches the missing slots into one /resolve-slot call,
// receives the {python_expr, cache_key} responses, and writes them
// into the snippet's # Slots heading via vault.process. This helper
// owns the body-merge logic so it can be tested in isolation under
// node --test.
//
// The merge semantics:
//   - If the body has no # Slots heading, INSERT one before
//     # Dependencies (if present) or at end of body.
//   - If the body has a # Slots heading already, MERGE the new
//     entries into the existing YAML dict (overwriting on same key,
//     preserving other entries).
//   - Always re-serialize in stable asciibetical-by-key order via
//     Phase 1's serialize-style shape (mirrors the engine helper).
//   - Empty `updates` is a no-op — body returned unchanged.
//
// Pure-core extraction #29. No `obsidian` import.

/** Public interface — merge new slot cache entries into a snippet
 *  body. Returns the updated body string. The body shape mirrors
 *  what `vault.process` receives (raw snippet markdown).
 *
 *  Pure: no I/O. Deterministic given the same inputs.
 */
export function mergeSlotCacheUpdates(
  body: string,
  updates: Record<string, string>,
): string {
  if (Object.keys(updates).length === 0) return body;

  // Phase 1: parse existing # Slots heading (if any) and merge updates
  // overlaying.
  const existing = parseSlotsSection(body);
  const merged: Record<string, string> = { ...existing, ...updates };
  const serializedHeading = serializeSlotsSection(merged);

  // Phase 2: remove the old # Slots section from the body (if any),
  // then re-insert the merged version at the right place.
  const bodyWithoutSlots = removeSlotsSection(body);
  return insertSlotsHeading(bodyWithoutSlots, serializedHeading);
}

// --- Body manipulation helpers (private; exported for testing) ----

/** Parse the # Slots YAML heading. Tolerant: returns {} when missing,
 *  empty, or unparseable. Mirrors forge.core.slot_cache.parse_slots_section
 *  but in TypeScript with minimal YAML handling (key: value lines
 *  inside the fenced YAML block). */
export function parseSlotsSection(body: string): Record<string, string> {
  const lines = body.split('\n');
  let inSection = false;
  let inFence = false;
  const yamlLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inSection) {
      if (/^#\s+slots\s*$/i.test(trimmed)) {
        inSection = true;
      }
      continue;
    }
    // Next top-level heading ends the section.
    if (/^#\s+\S/.test(line)) break;
    if (/^\s*```ya?ml\s*$/i.test(line)) {
      inFence = true;
      continue;
    }
    if (/^\s*```\s*$/.test(line)) {
      if (inFence) break;
      continue;
    }
    if (inFence) yamlLines.push(line);
    else if (trimmed) yamlLines.push(line);
  }
  const text = yamlLines.join('\n').trim();
  if (!text) return {};
  // Minimal YAML: expect either a `slots:` wrapper followed by
  // `"key": "value"` lines, or just bare `"key": "value"` lines.
  const out: Record<string, string> = {};
  for (const rawLine of yamlLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^slots\s*:\s*$/i.test(line)) continue;
    // Match: "key": "value" (with optional leading whitespace, both
    // quoted). Reject lines that don't match this exact shape.
    const m = line.match(/^"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"\s*$/);
    if (!m) continue;
    // Unescape backslash + quote (mirrors the Python serializer).
    const key = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const value = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    out[key] = value;
  }
  return out;
}

/** Render a slots dict as a # Slots heading body. Stable
 *  asciibetical-by-key ordering for diff-friendliness. Empty dict →
 *  empty string. Mirrors forge.core.slot_cache.serialize_slots_section. */
export function serializeSlotsSection(slots: Record<string, string>): string {
  const keys = Object.keys(slots);
  if (keys.length === 0) return '';
  keys.sort();
  const lines: string[] = ['# Slots', '', '```yaml', 'slots:'];
  for (const key of keys) {
    const value = slots[key];
    const escapedKey = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    lines.push(`  "${escapedKey}": "${escapedValue}"`);
  }
  lines.push('```');
  return lines.join('\n') + '\n';
}

/** Remove the # Slots section from the body (if present). Preserves
 *  trailing whitespace cleanly so subsequent inserts don't pile up
 *  blank lines. */
export function removeSlotsSection(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let inSection = false;
  let inFence = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inSection) {
      if (/^#\s+slots\s*$/i.test(trimmed)) {
        inSection = true;
        // Trim trailing blank line BEFORE the # Slots heading too,
        // so we don't accumulate gap.
        while (out.length > 0 && out[out.length - 1].trim() === '') {
          out.pop();
        }
        continue;
      }
      out.push(line);
      continue;
    }
    // In # Slots section.
    if (/^#\s+\S/.test(line)) {
      // Next heading — emit this line normally, leave section state.
      inSection = false;
      inFence = false;
      out.push(line);
      continue;
    }
    if (/^\s*```ya?ml\s*$/i.test(line)) {
      inFence = true;
      continue;
    }
    if (/^\s*```\s*$/.test(line) && inFence) {
      inFence = false;
      continue;
    }
    // Drop everything inside the # Slots section.
  }
  return out.join('\n');
}

/** Insert a serialized # Slots heading body into the snippet body.
 *  Placement: just before # Dependencies if present; otherwise at
 *  end-of-body (after a trailing blank line if the body doesn't
 *  already end with one). */
export function insertSlotsHeading(
  body: string, serializedHeading: string,
): string {
  if (!serializedHeading) return body;
  const lines = body.split('\n');
  // Find # Dependencies heading index.
  let depsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+dependencies\s*$/i.test(lines[i].trim())) {
      depsIdx = i;
      break;
    }
  }
  if (depsIdx >= 0) {
    // Insert before # Dependencies, with a blank line separator
    // on each side.
    const before = lines.slice(0, depsIdx);
    // Trim any trailing blank lines from `before` so we don't pile up.
    while (before.length > 0 && before[before.length - 1].trim() === '') {
      before.pop();
    }
    const after = lines.slice(depsIdx);
    return (
      before.join('\n')
      + '\n\n'
      + serializedHeading
      + '\n'
      + after.join('\n')
    );
  }
  // No # Dependencies — append at the end, separated by a blank line.
  let trimmed = body;
  while (trimmed.endsWith('\n')) trimmed = trimmed.slice(0, -1);
  return trimmed + '\n\n' + serializedHeading;
}

// 2026-11-23-1028 - `--claude-config` of scripts/refresh-token-copies.mjs: the two forge-mcp token copies that live in ~/.claude.json (the wizard's Claude session spawns its own stdio forge-mcp with its OWN FORGE_MCP_BEARER, and reaches the
// launchd one over HTTP with its OWN Authorization header). The pure part; every effect is a dependency handed in (the tests run it on a temp HOME with FAKE secrets, or on in-memory files).
//
// The rules (the file holds OTHER servers' credentials and the account's data; the script is the driver's tool):
//   - it reads the file to find two fields and compares them with the source token; nothing else of it is shown, kept or copied; every line says a name, a count, or the first 8 hex of a SHA-256, never a value;
//   - the fix replaces the TEXT of exactly those two JSON strings (every other byte stays: no re-serialising), the `Bearer ` prefix kept; a mode-600 backup is written first; the write is atomic (a temp file in the same folder, renamed);
//   - it REFUSES, writing nothing, if the file changed between the read and the write (mtime or size: Claude Code sessions write this file often), if it does not parse, or if a field is missing (or the HTTP one has no `Bearer `);
//   - after the write it reads the file again and deep-compares everything outside the two fields; if anything else moved, the OLD text is put back and the run stops.
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const SERVER = 'forge-mcp';
export const BEARER_ENV_KEY = 'FORGE_MCP_BEARER';
export const PROJECT_DIR = 'forge-wizard-work/forge-mcp';   // the wizard's project, under HOME
const PREFIX = 'Bearer ';

/** The first 8 hex of a SHA-256 (the only thing of a secret that is ever shown). */
export const sha8 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);

const getPath = (obj, keys) => { let cur = obj; for (const k of keys) { if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined; cur = cur[k]; } return cur; };
const parse = (text) => { try { const v = JSON.parse(text); return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };

/** The two fields, found by their key names: { name, path, found, value (the secret, without any prefix), prefix, bearer }. The project key is built from HOME. */
export function claudeEntries(settings, home) {
  const defs = [
    { name: `project ${PROJECT_DIR}: env.${BEARER_ENV_KEY}`, path: ['projects', `${home}/${PROJECT_DIR}`, 'mcpServers', SERVER, 'env', BEARER_ENV_KEY], prefix: '' },
    { name: `user mcpServers.${SERVER}: headers.Authorization`, path: ['mcpServers', SERVER, 'headers', 'Authorization'], prefix: PREFIX },
  ];
  return defs.map((d) => {
    const raw = getPath(settings, d.path);
    if (typeof raw !== 'string') return { ...d, found: false, value: '', bearer: false };
    const bearer = d.prefix === '' || raw.startsWith(d.prefix);
    return { ...d, found: true, value: d.prefix !== '' && bearer ? raw.slice(d.prefix.length) : raw, bearer };
  });
}

// ---- the text of a JSON file: the span of one string value, found by its key path (no re-serialising of anything) ----------------------------------------------------------------------------
const WS = ' \t\r\n';
const skipWs = (t, i) => { while (i < t.length && WS.includes(t[i])) i++; return i; };
const endOfString = (t, i) => { i++; while (i < t.length) { if (t[i] === '\\') i += 2; else if (t[i] === '"') return i + 1; else i++; } return -1; };
function endOfValue(t, i) {
  i = skipWs(t, i); const c = t[i];
  if (c === '"') return endOfString(t, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (; i < t.length; i++) {
      const ch = t[i];
      if (ch === '"') { const e = endOfString(t, i); if (e < 0) return -1; i = e - 1; }
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i + 1; }
    }
    return -1;
  }
  let j = i; while (j < t.length && !(',}] \t\r\n').includes(t[j])) j++; return j;
}
/** { start, end } of the JSON string at the key path (the quotes included), or null (no such key, or the value is not a string, or the text is not what a JSON object looks like). */
export function stringSpan(text, keys) {
  let i = skipWs(text, 0);
  for (const key of keys) {
    if (text[i] !== '{') return null;
    i++; let found = -1;
    for (;;) {
      i = skipWs(text, i);
      if (text[i] !== '"') return null;
      const ke = endOfString(text, i); if (ke < 0) return null;
      let k; try { k = JSON.parse(text.slice(i, ke)); } catch { return null; }
      i = skipWs(text, ke); if (text[i] !== ':') return null;
      i = skipWs(text, i + 1);
      if (k === key) { found = i; break; }
      const ve = endOfValue(text, i); if (ve < 0) return null;
      i = skipWs(text, ve); if (text[i] === ',') i++; else return null;     // a `}` here means the key is not in this object
    }
    i = found;
  }
  if (text[i] !== '"') return null;
  const e = endOfString(text, i); return e < 0 ? null : { start: i, end: e };
}
/** The same text with the given string fields replaced and NOTHING else changed. `fields`: [{ path, value }]. */
export function replaceFields(text, fields) {
  const spans = [];
  for (const f of fields) { const s = stringSpan(text, f.path); if (s === null) return { ok: false }; spans.push({ ...s, value: f.value }); }
  spans.sort((a, b) => b.start - a.start);
  let out = text; for (const s of spans) out = out.slice(0, s.start) + JSON.stringify(s.value) + out.slice(s.end);
  return { ok: true, text: out };
}
/** Is everything outside the entries' fields the same in both parsed files (deep compare)? */
export function sameOutside(before, after, entries) {
  const strip = (obj) => { const c = JSON.parse(JSON.stringify(obj)); for (const e of entries) { const parent = getPath(c, e.path.slice(0, -1)); if (parent && typeof parent === 'object') parent[e.path[e.path.length - 1]] = null; } return c; };
  return isDeepStrictEqual(strip(before), strip(after));
}

// ---- the steps ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * Read, check, say: for each field `match` or `DIFFERENT` (first 8 hex of both SHA-256), or `not there, skipped`. In a real run it also REFUSES what must not be written (a missing field, a Bearer-less header, bad JSON).
 * `cfg`: { name, path, home }. Returns { skipped } | { stop } | { file, settings, entries, dirty }.
 */
export function claudePlan(deps, cfg, token, ctx) {
  const { say, secrets, dryRun } = ctx;
  const file = deps.readClaude(cfg.path);
  if (file === null) { say(`${cfg.name}: not there, skipped`); return { skipped: true }; }
  const settings = parse(file.text);
  if (settings === null) return { stop: `${cfg.name} is not valid JSON: it is left alone. Nothing was changed.` };
  const entries = claudeEntries(settings, cfg.home);
  for (const e of entries) if (e.found) secrets.push(e.value);
  const want = sha8(token);
  for (const e of entries) {
    if (!e.found) { say(`${cfg.name} ${e.name}: not there, skipped`); continue; }
    const have = sha8(e.value);
    say(e.value === token && e.bearer ? `${cfg.name} ${e.name}: match (${have})` : `${cfg.name} ${e.name}: DIFFERENT (entry ${have}, source ${want})`);
  }
  if (!dryRun) {
    const missing = entries.filter((e) => !e.found);
    if (missing.length) return { stop: `${cfg.name}: ${missing.map((e) => e.name).join(' and ')} is missing, so nothing is rewritten (use --dry-run to see what is there). Nothing was changed.` };
    const bare = entries.filter((e) => !e.bearer);
    if (bare.length) return { stop: `${cfg.name}: ${bare.map((e) => e.name).join(' and ')} does not start with Bearer, so it is not rewritten. Nothing was changed.` };
  }
  const dirty = entries.filter((e) => e.found && !(e.value === token && e.bearer));
  return { file, settings, entries, dirty };
}

/** Write the two fields (a backup first, a changed-file refusal, an atomic write, the deep compare afterwards). Returns { stop } | { changed, fields }. */
export function claudeApply(deps, cfg, plan, token, ctx) {
  const { say } = ctx;
  if (plan.dirty.length === 0) { say(`${cfg.name}: both fields already hold it`); return { changed: false, fields: 0 }; }
  const d = (deps.now ? deps.now() : new Date());
  const stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const backupPath = `${cfg.path}.forge-backup-${stamp}`; const backupName = `${cfg.name}.forge-backup-${stamp}`;
  try { deps.writeBackup(backupPath, plan.file.text); }
  catch { return { stop: `the backup ${backupName} could not be written, so ${cfg.name} was not touched. Nothing was changed.` }; }
  const st = deps.statClaude(cfg.path);
  if (!st || st.mtimeMs !== plan.file.mtimeMs || st.size !== plan.file.size) return { stop: `${cfg.name} changed while the script ran (Claude Code sessions write this file often): nothing was written, try again.` };
  const next = replaceFields(plan.file.text, plan.dirty.map((e) => ({ path: e.path, value: e.prefix + token })));
  if (!next.ok) return { stop: `${cfg.name}: a field could not be located in the text, so nothing was written.` };
  try { deps.writeFileAtomic(cfg.path, next.text); }
  catch { return { stop: `${cfg.name} could not be written (permission or a protected location?): that is a human choice. The old file is untouched; its backup is ${backupName}.` }; }
  // the check afterwards: read it back, every key outside the two fields must be the same, and the two fields must now hold the token
  const back = deps.readClaude(cfg.path); const parsed = back === null ? null : parse(back.text);
  const nowEntries = parsed === null ? null : claudeEntries(parsed, cfg.home);
  const ok = parsed !== null && sameOutside(plan.settings, parsed, plan.entries) && plan.dirty.every((e) => nowEntries.find((n) => n.name === e.name)?.value === token);
  if (!ok) {
    let restored = true; try { deps.writeFileAtomic(cfg.path, plan.file.text); } catch { restored = false; }
    return { stop: restored ? `${cfg.name}: after the write another key was found changed (the check failed), so the old file was put back. Nothing was changed; the backup is ${backupName}.` : `${cfg.name}: after the write another key was found changed and the old file could NOT be put back: restore it from ${backupName} by hand.` };
  }
  say(`changed: ${cfg.name} (${plan.dirty.length} field${plan.dirty.length === 1 ? '' : 's'})`);
  say(`backup of the old file (mode 600, holds secrets, never print it): ${backupName}`);
  return { changed: true, fields: plan.dirty.length };
}

/** The status-code check of what the file holds NOW, field by field. Returns 0 (all accepted) or 2. */
export async function claudeRecheck(deps, cfg, ctx) {
  const { say, secrets, url, accepted } = ctx;
  const back = deps.readClaude(cfg.path); const parsed = back === null ? null : parse(back.text);
  if (parsed === null) { say(`${cfg.name}: could not be read back`); return 2; }
  let worst = 0;
  for (const e of claudeEntries(parsed, cfg.home)) {
    if (!e.found) continue;
    secrets.push(e.value);
    const s = await deps.check(url, e.value);
    say(`${cfg.name} ${e.name}: the service answers ${s === null ? 'nothing' : s}${s === accepted ? ' (accepted)' : ''}`);
    if (s !== accepted) worst = 2;
  }
  return worst;
}

export const NEXT_STEPS = 'next: end the wizard session and start a new one (its stdio forge-mcp child is started with the session, the HTTP entry is read when it connects), then ask the wizard to run forge_run_recipe on any recipe.';

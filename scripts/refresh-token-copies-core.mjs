// 2026-11-17-2000 (token refresh) - put the CURRENT transpile service token into the stale copies of it, without ever printing it. The pure part of `scripts/refresh-token-copies.mjs`; every effect (files, the network check,
// the launchd restart) is a dependency handed in, so the tests run it on a temp directory with FAKE tokens and a local stand-in service.
//
// What it does, in order (docs/transpile-token-rotation.md in the forge-transpile repo, steps 3 and 4):
//   1. reads the current token from the SOURCE plugin data file by key (`transpileServiceToken`); it is held in one variable, never printed, logged, returned in a line or written anywhere but the copies below;
//   2. verifies it with the status-code check of step 3 (POST /generate, empty body {}: 422 = the token is accepted, 401 = rejected; no model call) and REFUSES to copy a token the service does not accept;
//   3. writes it at the same key into every target plugin data file that already has the key (the vaults' plugin folders), keeping every other key, the file's indentation and its mode; a file already holding it is not rewritten;
//   4. writes it into the forge-mcp launchd file's `FORGE_MCP_BEARER` (the same secret: forge-mcp forwards it to the transpile service), keeping the mode, then restarts the agent (`launchctl kickstart -k`);
//   5. re-runs the status check against what each copy holds NOW.
// Everything it says is a file name, a length or a status code. Every line goes through `scrub` (any token it ever held is replaced) before it is shown. A step that needs a human choice stops the run and says which.

export const TOKEN_KEY = 'transpileServiceToken';
export const BEARER_ENV = 'FORGE_MCP_BEARER';
export const ACCEPTED = 422;   // the service checks the token BEFORE the body: an empty body is invalid on purpose, a right token reaches that check
export const REJECTED = 401;

/** Replace every secret (8 or more characters; shorter ones would also eat ordinary words) in a line. */
export function scrub(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (typeof s === 'string' && s.length >= 8) out = out.split(s).join('<redacted>');
  return out;
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xmlUnescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The token a parsed settings object holds, or why there is none (a reason, never a value). */
export function tokenOf(settings) {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return { ok: false, why: 'the data file is not an object of settings' };
  if (!Object.prototype.hasOwnProperty.call(settings, TOKEN_KEY)) return { ok: false, why: `it has no ${TOKEN_KEY} key` };
  const v = settings[TOKEN_KEY];
  if (typeof v !== 'string' || v.trim() === '') return { ok: false, why: `its ${TOKEN_KEY} is empty` };
  return { ok: true, token: v };
}

/** A data file's text parsed, or null (never the parser's message: it quotes the text). */
export function parseSettings(text) { try { const v = JSON.parse(text); return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } }

/** The same JSON text with ONE key changed: every other key, the key order, the indentation and a trailing newline are kept (Obsidian writes two spaces, no trailing newline). */
export function setTokenInJson(text, token) {
  const settings = parseSettings(text);
  if (settings === null || !Object.prototype.hasOwnProperty.call(settings, TOKEN_KEY)) return { ok: false };
  if (settings[TOKEN_KEY] === token) return { ok: true, changed: false, text };
  const m = /^([ \t]+)"/m.exec(text); const indent = m ? m[1] : '  ';
  settings[TOKEN_KEY] = token;
  return { ok: true, changed: true, text: JSON.stringify(settings, null, indent) + (text.endsWith('\n') ? '\n' : '') };
}

const BEARER_RE = new RegExp(`(<key>${BEARER_ENV}</key>\\s*)(?:<string>([\\s\\S]*?)</string>|<string\\s*/>)`);
/** The bearer a launchd file holds: found or not, and its value (XML-unescaped). */
export function plistBearer(text) { const m = BEARER_RE.exec(text); return m ? { found: true, value: xmlUnescape(m[2] ?? '') } : { found: false }; }
/** The same file with ONLY the bearer's string replaced (everything else byte for byte). */
export function setPlistBearer(text, token) {
  const cur = plistBearer(text); if (!cur.found) return { ok: false };
  if (cur.value === token) return { ok: true, changed: false, text };
  return { ok: true, changed: true, text: text.replace(BEARER_RE, (_m, head) => `${head}<string>${xmlEscape(token)}</string>`) };
}

/**
 * The whole run. `deps`: readFile(path) -> text | null (null = no such file), writeFileAtomic(path, text) (keeps the file's mode), check(url, token) -> status code | null (null = no answer), restart() -> { ok },
 * say(line). `opts`: sourceFile, targetFiles (data files, display name -> path), plistFile, url, dryRun, restart (bool). Returns { code, changed: [names], statuses: { name: code } }.
 * Exit codes: 0 done and every copy answers 422; 1 stopped before or while changing (nothing wrong was written); 2 changed, but a copy still does not answer 422.
 */
export async function refresh(deps, opts) {
  const secrets = []; const lines = [];
  const say = (line) => { const s = scrub(line, secrets); lines.push(s); deps.say(s); };
  const stop = (why, extra = {}) => { say(`STOP: ${why}`); return { code: 1, changed: [], statuses: {}, lines, ...extra }; };

  // 1. the source token (held in `token` only)
  const srcText = deps.readFile(opts.sourceFile.path);
  if (srcText === null) return stop(`no source data file at ${opts.sourceFile.name}. Nothing was changed.`);
  const src = tokenOf(parseSettings(srcText)); if (!src.ok) return stop(`the source (${opts.sourceFile.name}): ${src.why}. Nothing was changed.`);
  const token = src.token; secrets.push(token);
  say(`source: ${opts.sourceFile.name} holds a token of length ${token.length}`);

  // 2. verify it first
  const first = await deps.check(opts.url, token);
  say(`the service's answer to the source's token: ${first === null ? 'no answer' : first} (${ACCEPTED} = accepted, ${REJECTED} = rejected)`);
  if (first === REJECTED) return stop('the service REJECTS the source token (401): it is not copied anywhere. Nothing was changed.');
  if (first !== ACCEPTED) return stop(`the service did not give the expected ${ACCEPTED} (${first === null ? 'no answer' : first}): the token is not copied until it is verified. Nothing was changed.`);

  // 3. the plugin data files that already have the key
  const changed = []; const holders = []; const plan = [];
  for (const t of opts.targetFiles) {
    const text = deps.readFile(t.path);
    if (text === null) { say(`${t.name}: not there, skipped`); continue; }
    const settings = parseSettings(text);
    if (settings === null) { say(`${t.name}: is not a JSON object of settings, left alone`); continue; }
    if (!Object.prototype.hasOwnProperty.call(settings, TOKEN_KEY)) { say(`${t.name}: has no ${TOKEN_KEY} key, left alone`); continue; }
    if (typeof settings[TOKEN_KEY] === 'string') secrets.push(settings[TOKEN_KEY]);
    const next = setTokenInJson(text, token);
    holders.push(t);
    if (!next.ok) { say(`${t.name}: could not be rewritten, left alone`); continue; }
    if (!next.changed) { say(`${t.name}: already holds it`); continue; }
    plan.push({ t, text: next.text });
  }
  // the launchd file
  let plistPlan = null; let plistHolder = null;
  if (opts.plistFile) {
    const text = deps.readFile(opts.plistFile.path);
    if (text === null) say(`${opts.plistFile.name}: not there, forge-mcp skipped`);
    else {
      const cur = plistBearer(text);
      if (!cur.found) return stop(`${opts.plistFile.name} has no ${BEARER_ENV} entry: where forge-mcp reads its token is a human choice (an env file, a keychain item, a different launchd label?). The data files were not changed either.`);
      if (cur.value) secrets.push(cur.value);
      plistHolder = opts.plistFile;
      const next = setPlistBearer(text, token);
      if (next.changed) plistPlan = { t: opts.plistFile, text: next.text }; else say(`${opts.plistFile.name}: ${BEARER_ENV} already holds it`);
    }
  }

  if (opts.dryRun) {
    for (const p of [...plan, ...(plistPlan ? [plistPlan] : [])]) say(`would change: ${p.t.name}`);
    say('dry run: nothing written, nothing restarted');
    return { code: 0, changed: [], statuses: {}, lines };
  }

  for (const p of plan) {
    try { deps.writeFileAtomic(p.t.path, p.text); changed.push(p.t.name); say(`changed: ${p.t.name}`); }
    catch { return stop(`${p.t.name} could not be written (permission or a protected location?): that is a human choice. Changed so far: ${changed.length ? changed.join(', ') : 'nothing'}.`, { changed }); }
  }
  if (plistPlan) {
    try { deps.writeFileAtomic(plistPlan.t.path, plistPlan.text); changed.push(plistPlan.t.name); say(`changed: ${plistPlan.t.name} (${BEARER_ENV})`); }
    catch { return stop(`${plistPlan.t.name} could not be written (permission or a protected location?): that is a human choice. Changed so far: ${changed.length ? changed.join(', ') : 'nothing'}.`, { changed }); }
    if (opts.restart !== false) { const r = await deps.restart(); say(r.ok ? 'forge-mcp restarted (launchctl kickstart -k)' : 'forge-mcp could not be restarted: run  launchctl kickstart -k gui/$(id -u)/com.forge.mcp  yourself'); if (!r.ok) { /* the re-check below says whether it matters */ } }
    else say('forge-mcp NOT restarted (--no-restart)');
  }

  // 5. what each copy holds NOW answers what?
  const statuses = {}; let worst = 0;
  for (const h of [...holders, ...(plistHolder ? [plistHolder] : [])]) {
    const text = deps.readFile(h.path);
    const now = text === null ? { ok: false } : h === plistHolder ? (() => { const b = plistBearer(text); return b.found && b.value ? { ok: true, token: b.value } : { ok: false }; })() : tokenOf(parseSettings(text));
    if (!now.ok) { statuses[h.name] = null; say(`${h.name}: could not be read back`); worst = 2; continue; }
    secrets.push(now.token);
    const s = await deps.check(opts.url, now.token); statuses[h.name] = s;
    say(`${h.name}: the service answers ${s === null ? 'nothing' : s}${s === ACCEPTED ? ' (accepted)' : ''}`);
    if (s !== ACCEPTED) worst = 2;
  }
  say(worst === 0 ? `done: ${changed.length} file(s) changed, every copy is accepted` : 'done, but a copy is NOT accepted: see the lines above');
  return { code: worst, changed, statuses, lines };
}

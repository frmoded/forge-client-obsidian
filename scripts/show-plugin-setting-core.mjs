// 2026-11-16-1201 - read a NAMED, non-secret setting of the plugin's data file without ever putting a secret on the screen. The plugin's `data.json` holds the transpile service token (and may hold an own API key): nobody cats it, nothing prints it. This is the
// pure part of `scripts/show-plugin-setting.mjs`: which key names are secret (refused), which values look like a secret (not shown), what a key and a list of keys are shown as. Never throws; never returns a value it refused.
export const SECRET_KEY = /token|secret|key|passw|credential|auth|bearer|cookie|session|signature|private/i;

/** A string that looks like a generated secret even under an innocent name: 24 or more characters of letters, digits and - _ + / =, with both a letter and a digit (a URL, a path or a sentence has other characters). */
export function looksLikeSecret(value) {
  return typeof value === 'string' && value.length >= 24 && /^[A-Za-z0-9_\-+/=]+$/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value);
}

/** The words for one key of the settings object: a scalar value, "(secret key: set|empty)", "(looks like a secret: not shown)", or "(object, N keys)" / "(list, N items)" (a nested object is never opened: it may hold anything). */
export function shownAs(key, value) {
  if (SECRET_KEY.test(String(key))) {
    const set = value !== undefined && value !== null && value !== '' && value !== false && !(Array.isArray(value) && value.length === 0) && !(typeof value === 'object' && value !== null && Object.keys(value).length === 0);
    return { kind: 'secret-key', text: `(secret key: ${set ? 'set' : 'empty'})` };
  }
  if (Array.isArray(value)) return { kind: 'container', text: `(list, ${value.length} items)` };
  if (value !== null && typeof value === 'object') return { kind: 'container', text: `(object, ${Object.keys(value).length} keys)` };
  if (looksLikeSecret(value)) return { kind: 'looks-secret', text: '(looks like a secret: not shown)' };
  if (typeof value === 'string') return { kind: 'value', text: JSON.stringify(value) };
  return { kind: 'value', text: String(value) };
}

/** `show-plugin-setting <key>`: the value of one named key, or a refusal. A secret-looking NAME is refused before the value is even looked at. */
export function showSetting(settings, key) {
  if (SECRET_KEY.test(String(key))) return { ok: false, code: 2, message: `refused: "${key}" looks like a secret (its name has token, secret, key, password, credential, auth, bearer, cookie, session or private in it). Use --list to see whether it is set.` };
  if (settings === null || typeof settings !== 'object' || !Object.prototype.hasOwnProperty.call(settings, key)) return { ok: false, code: 1, message: `no such key: "${key}" (try --list for the key names)` };
  const s = shownAs(key, settings[key]);
  if (s.kind === 'looks-secret') return { ok: false, code: 2, message: `refused: the value of "${key}" looks like a secret, so it is not shown.` };
  return { ok: true, code: 0, message: `${key}=${s.text}` };
}

/** `--list`: one line per top-level key, in the file's order. */
export function listSettings(settings) {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return { ok: false, code: 1, message: 'the data file is not an object of settings' };
  return { ok: true, code: 0, message: Object.keys(settings).map((k) => `${k}: ${shownAs(k, settings[k]).text}`).join('\n') };
}

export const USAGE = `usage: node scripts/show-plugin-setting.mjs <key> [--vault <dir> | --file <data.json>]
       node scripts/show-plugin-setting.mjs --list [--vault <dir> | --file <data.json>]
  Shows ONE named setting of the plugin's data file, or (--list) every key with its value, "(secret key: set|empty)", "(object, N keys)".
  A key that looks like a secret (token, secret, key, password, credential, auth, bearer, cookie, session, private) is refused, and so is a value that looks like one.
  --vault <dir>   a vault (default ~/projects/music-playground): reads <dir>/.obsidian/plugins/forge-actions/data.json
  Exit 0 shown, 1 usage or not found, 2 refused.`;

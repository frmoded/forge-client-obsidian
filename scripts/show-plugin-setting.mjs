#!/usr/bin/env node
// 2026-11-16-1201 - show ONE named, non-secret setting of the plugin's data file (or the list of keys), and refuse anything that looks like a secret. See show-plugin-setting-core.mjs for the rules and docs/transpile-token-rotation.md in the forge-transpile
// repo for why: the data file holds the transpile service token, and nobody cats it. This file only reads the file and prints what the core allows: it never prints the file, an error that quotes it, or a nested object.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { USAGE, listSettings, showSetting } from './show-plugin-setting-core.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, v === undefined || v.startsWith('--') ? 1 : 2); return v === undefined || v.startsWith('--') ? '' : v; };
const list = args.includes('--list'); if (list) args.splice(args.indexOf('--list'), 1);
const file = flag('--file'); const vault = flag('--vault');
const expand = (p) => p.replace(/^~(?=$|\/)/, os.homedir());
const rest = args.filter((a) => !a.startsWith('--'));
if (args.some((a) => a.startsWith('--')) || file === '' || vault === '' || (list ? rest.length !== 0 : rest.length !== 1)) { console.error(USAGE); process.exit(1); }
const dataFile = file !== null ? expand(file) : path.join(expand(vault ?? '~/projects/music-playground'), '.obsidian/plugins/forge-actions/data.json');
let settings;
try { settings = JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
catch (e) { const said = e && e.code === 'ENOENT' ? `no data file at ${dataFile}` : `the data file at ${dataFile} could not be read as JSON`; console.error(said); process.exit(1); }      // never the parser's message: it quotes the text
const r = list ? listSettings(settings) : showSetting(settings, rest[0]);
(r.ok ? console.log : console.error)(r.message);
process.exit(r.code);

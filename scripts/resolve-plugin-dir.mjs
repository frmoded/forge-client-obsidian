// Prints the plugin folder install-local.sh copies into: $PLUGIN_DIR if set, else <VAULT>/.obsidian/plugins/<id from manifest.json>. Exit 1 (naming the path tried AND the id) when it does not exist.
import fs from 'node:fs';
import path from 'node:path';

const id = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'manifest.json'), 'utf8')).id;
const vault = process.env.VAULT ?? '';
const dir = process.env.PLUGIN_DIR || path.join(vault, '.obsidian', 'plugins', id);
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error(`install-local: ${dir} does not exist. The plugin id is "${id}" (manifest.json), so it looks for <vault>/.obsidian/plugins/${id}; is the plugin installed in that vault? A vault that keeps it under another folder name: PLUGIN_DIR=<that folder>.`);
  process.exit(1);
}
console.log(dir);

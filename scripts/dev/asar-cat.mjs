// Extract ONE file from an Electron .asar archive (no dependency): node asar-cat.mjs <archive.asar> <path/inside> <out>
// Used to take Obsidian's OWN app.css out of the installed app, so a browser proof lays the plugin out under the real stylesheet.
import fs from 'node:fs';
const [archive, inner, out] = process.argv.slice(2);
const fd = fs.openSync(archive, 'r');
const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
const headerSize = head.readUInt32LE(4);
const jsonSize = head.readUInt32LE(12);
const json = Buffer.alloc(jsonSize); fs.readSync(fd, json, 0, jsonSize, 16);
let node = JSON.parse(json.toString('utf8'));
for (const part of inner.split('/')) { node = node.files?.[part]; if (!node) { console.error(`asar-cat: ${inner} not found in ${archive}`); process.exit(2); } }
const buf = Buffer.alloc(node.size);
fs.readSync(fd, buf, 0, node.size, 8 + headerSize + Number(node.offset));
fs.writeFileSync(out, buf);
console.log(`asar-cat: ${inner} (${node.size} bytes) -> ${out}`);

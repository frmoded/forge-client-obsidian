#!/usr/bin/env node
// Prints the engine-bundle digest of a directory (see engine-recording.mjs). scripts/record-engine-transpile.py calls it on the engine it records
// from, so the recording carries the digest the gate later compares with the BUNDLED engine.
//   node --experimental-strip-types scripts/engine-bundle-digest.mjs <path to a forge/ package directory>
import { engineBundleDigest } from "./engine-recording.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: engine-bundle-digest.mjs <forge package dir>"); process.exit(2); }
console.log(engineBundleDigest(dir));

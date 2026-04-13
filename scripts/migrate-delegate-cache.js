#!/usr/bin/env node
/**
 * One-off migration: delegate-cache.json v1 → v2
 *
 * Changes:
 *   - Delegate keys: address→a, votingPower→vp, lastChangeBlock→b
 *   - Removes lastChangeTxHash (written but never read)
 *   - Bumps version to 2
 *
 * Usage: node scripts/migrate-delegate-cache.js [path]
 *   Default path: data/delegate-cache.json
 */

const fs = require("fs");
const path = require("path");

const filePath = process.argv[2] || path.join(__dirname, "..", "data", "delegate-cache.json");

if (!fs.existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const beforeBytes = fs.statSync(filePath).size;
const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

if (!Array.isArray(raw.delegates) || raw.delegates.length === 0) {
  console.error("No delegates found in cache");
  process.exit(1);
}

const first = raw.delegates[0];
if ("a" in first && "vp" in first && "b" in first) {
  console.log("Cache is already in v2 compact format. Nothing to do.");
  process.exit(0);
}

if (!("address" in first)) {
  console.error("Unrecognized delegate format");
  process.exit(1);
}

const migrated = {
  ...raw,
  version: 1,
  delegates: raw.delegates.map((d) => ({
    a: d.address,
    vp: d.votingPower,
    b: d.lastChangeBlock,
  })),
};

const json = JSON.stringify(migrated, null, 2);
fs.writeFileSync(filePath, json);

const afterBytes = fs.statSync(filePath).size;
const saved = beforeBytes - afterBytes;
const pct = ((saved / beforeBytes) * 100).toFixed(1);

console.log("Migrated %d delegates from v1 → v2", raw.delegates.length);
console.log("Before: %s bytes (%s MB)", beforeBytes.toLocaleString(), (beforeBytes / 1e6).toFixed(2));
console.log("After:  %s bytes (%s MB)", afterBytes.toLocaleString(), (afterBytes / 1e6).toFixed(2));
console.log("Saved:  %s bytes (%s%%)", saved.toLocaleString(), pct);

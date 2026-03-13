#!/usr/bin/env node
/**
 * Generates src/abis-json.ts from the human-readable ABIs in src/abis.ts.
 *
 * Usage: yarn build && node scripts/generate-json-abis.js
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const abis = require("../dist/abis");

function cleanAbiItem(item) {
  const clean = { type: item.type };
  if (item.name) clean.name = item.name;
  if (item.inputs && item.inputs.length > 0)
    clean.inputs = item.inputs.map((i) => {
      const o = { name: i.name || "", type: i.type };
      if (i.indexed) o.indexed = true;
      if (i.components) o.components = i.components;
      return o;
    });
  else if (item.type === "function" || item.type === "event") clean.inputs = [];
  if (item.outputs && item.outputs.length > 0)
    clean.outputs = item.outputs.map((o) => {
      const r = { name: o.name || "", type: o.type };
      if (o.components) r.components = o.components;
      return r;
    });
  else if (item.type === "function") clean.outputs = [];
  if (item.stateMutability) clean.stateMutability = item.stateMutability;
  return clean;
}

function isReadOnly(item) {
  return item.type === "function" && (item.stateMutability === "view" || item.stateMutability === "pure");
}

function isWrite(item) {
  return item.type === "function" && item.stateMutability !== "view" && item.stateMutability !== "pure";
}

function isEvent(item) {
  return item.type === "event";
}

function emitAbi(lines, name, items) {
  lines.push("export const " + name + " = " + JSON.stringify(items, null, 2) + " as const;");
  lines.push("");
}

// Full ABIs to generate
const fullAbis = [
  ["GOVERNOR_ABI", "governorAbi"],
  ["GOVERNOR_WITH_VETTER_ABI", "governorWithVetterAbi"],
  ["TIMELOCK_ABI", "timelockAbi"],
  ["SECURITY_COUNCIL_MANAGER_ABI", "securityCouncilManagerAbi"],
  ["INBOX_ABI", "inboxAbi"],
  ["NOMINEE_ELECTION_GOVERNOR_ABI", "nomineeElectionGovernorAbi"],
  ["MEMBER_ELECTION_GOVERNOR_ABI", "memberElectionGovernorAbi"],
  ["ERC20_VOTES_ABI", "erc20VotesAbi"],
];

// ABIs that also get read/write splits (large ABIs that break viem inference)
const splitAbis = [
  ["GOVERNOR_ABI", "governor"],
  ["NOMINEE_ELECTION_GOVERNOR_ABI", "nomineeElectionGovernor"],
  ["MEMBER_ELECTION_GOVERNOR_ABI", "memberElectionGovernor"],
  ["TIMELOCK_ABI", "timelock"],
];

const lines = [
  "/**",
  " * JSON ABI exports for wagmi/viem consumers.",
  " *",
  " * These are the same contracts as the human-readable ABIs in abis.ts,",
  " * but in JSON format with `as const` for full wagmi type inference.",
  " *",
  " * Full ABIs are exported as `governorAbi`, `timelockAbi`, etc.",
  " * Curated read/write subsets are exported as `governorReadAbi`,",
  " * `governorWriteAbi` for large ABIs where the full version may",
  " * exceed viem's type inference limits.",
  " *",
  " * Generated from human-readable ABIs - do not edit manually.",
  " * Regenerate with: yarn build && node scripts/generate-json-abis.js",
  " */",
  "",
];

// Emit full ABIs
for (const [srcName, destName] of fullAbis) {
  const abi = abis[srcName];
  if (!abi) continue;
  const iface = new ethers.utils.Interface(abi);
  const parsed = JSON.parse(iface.format(ethers.utils.FormatTypes.json));
  const cleaned = parsed.map(cleanAbiItem);
  emitAbi(lines, destName, cleaned);
}

// Emit read/write splits
lines.push("// ============================================================================");
lines.push("// Curated read/write subsets for large ABIs");
lines.push("// Use these when the full ABI exceeds viem's type inference limits.");
lines.push("// ============================================================================");
lines.push("");

for (const [srcName, baseName] of splitAbis) {
  const abi = abis[srcName];
  if (!abi) continue;
  const iface = new ethers.utils.Interface(abi);
  const parsed = JSON.parse(iface.format(ethers.utils.FormatTypes.json));
  const cleaned = parsed.map(cleanAbiItem);

  const reads = cleaned.filter(isReadOnly);
  const writes = cleaned.filter(isWrite);

  emitAbi(lines, baseName + "ReadAbi", reads);
  emitAbi(lines, baseName + "WriteAbi", writes);
}

const outPath = path.join(__dirname, "..", "src", "abis-json.ts");
fs.writeFileSync(outPath, lines.join("\n"));
console.log("Generated %s (%d lines)", outPath, lines.join("\n").split("\n").length);

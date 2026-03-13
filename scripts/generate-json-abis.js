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

const names = [
  ["GOVERNOR_ABI", "governorAbi"],
  ["GOVERNOR_WITH_VETTER_ABI", "governorWithVetterAbi"],
  ["TIMELOCK_ABI", "timelockAbi"],
  ["SECURITY_COUNCIL_MANAGER_ABI", "securityCouncilManagerAbi"],
  ["INBOX_ABI", "inboxAbi"],
  ["NOMINEE_ELECTION_GOVERNOR_ABI", "nomineeElectionGovernorAbi"],
  ["MEMBER_ELECTION_GOVERNOR_ABI", "memberElectionGovernorAbi"],
  ["ERC20_VOTES_ABI", "erc20VotesAbi"],
];

const lines = [
  "/**",
  " * JSON ABI exports for wagmi/viem consumers.",
  " *",
  " * These are the same contracts as the human-readable ABIs in abis.ts,",
  " * but in JSON format with `as const` for full wagmi type inference.",
  " *",
  " * Generated from human-readable ABIs - do not edit manually.",
  " * Regenerate with: yarn build && node scripts/generate-json-abis.js",
  " */",
  "",
];

for (const [srcName, destName] of names) {
  const abi = abis[srcName];
  if (!abi) continue;
  const iface = new ethers.utils.Interface(abi);
  const parsed = JSON.parse(iface.format(ethers.utils.FormatTypes.json));
  const cleaned = parsed.map(cleanAbiItem);
  lines.push("export const " + destName + " = " + JSON.stringify(cleaned, null, 2) + " as const;");
  lines.push("");
}

const outPath = path.join(__dirname, "..", "src", "abis-json.ts");
fs.writeFileSync(outPath, lines.join("\n"));
console.log("Generated %s (%d lines)", outPath, lines.join("\n").split("\n").length);

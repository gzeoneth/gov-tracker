/**
 * Stage data formatting utilities for StageView
 */

import type { TrackedStage, Chain } from "../../../types/index.js";
import { CHAIN_IDS } from "../../../constants.js";

export const CHAIN_TO_CHAIN_ID: Record<Chain, number> = {
  ethereum: CHAIN_IDS.ETHEREUM,
  arb1: CHAIN_IDS.ARB_ONE,
  nova: CHAIN_IDS.NOVA,
  unknown: CHAIN_IDS.ETHEREUM,
};

export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[complex object]";
  }
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.length <= 3) return safeStringify(value);
    return `[${value.length} items]`;
  }
  if (typeof value === "object") return safeStringify(value);
  return String(value);
}

const PRIORITY_FIELDS = [
  "proposalId",
  "operationId",
  "proposer",
  "description",
  "proposalState",
  "forVotes",
  "againstVotes",
  "abstainVotes",
  "quorum",
  "quorumReached",
  "timelockAddress",
  "eta",
  "state",
  "messageCount",
  "ticketCount",
  "redeemedCount",
];

const SKIP_FIELDS = [
  "targets",
  "values",
  "calldatas",
  "signatures",
  "callScheduledData",
  "_rawBytesArray",
];

export interface StageDataItem {
  label: string;
  value: string;
}

export function formatStageData(stage: TrackedStage): StageDataItem[] {
  const items: StageDataItem[] = [];
  const data = stage.data as Record<string, unknown> | undefined;

  if (!data) return items;

  for (const field of PRIORITY_FIELDS) {
    if (field in data && data[field] !== undefined) {
      let value = formatValue(data[field]);
      if (field === "description" && value.length > 100) {
        value = value.slice(0, 100) + "...";
      }
      items.push({ label: field, value });
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (PRIORITY_FIELDS.includes(key)) continue;
    if (SKIP_FIELDS.includes(key)) continue;
    if (value === undefined || value === null) continue;

    let formattedValue = formatValue(value);
    if (formattedValue.length > 80) {
      formattedValue = formattedValue.slice(0, 80) + "...";
    }
    items.push({ label: key, value: formattedValue });
  }

  return items;
}

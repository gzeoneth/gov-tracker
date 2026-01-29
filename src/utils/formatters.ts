/**
 * Pure formatting utilities for display and logging
 *
 * These functions have no React/Ink dependencies and can be used
 * by both the SDK and TUI.
 */

import type {
  TrackedStage,
  TrackingInput,
  DecodedCalldata,
  DecodedParameter,
  CohortType,
} from "../types/index.js";

// ============================================================================
// Election Utilities
// ============================================================================

const COHORT_NAMES: Record<CohortType, string> = { 0: "First", 1: "Second" };

export function getCohortName(cohort: CohortType): string {
  return COHORT_NAMES[cohort];
}

// ============================================================================
// Text Utilities
// ============================================================================

/**
 * Wrap text to fit within a given width, breaking at character boundaries
 */
export function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width));
  }
  return lines;
}

/**
 * Truncate text with ellipsis if it exceeds maxLen
 */
export function truncate(str: string, maxLen: number): string {
  if (maxLen <= 1) return str.length > 0 ? "..." : "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "...";
}

// ============================================================================
// Value Formatting
// ============================================================================

/**
 * Safely stringify a value, returning a fallback for complex objects
 */
export function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[complex object]";
  }
}

/**
 * Format an unknown value for display
 */
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

/**
 * Format a Unix timestamp to locale string
 */
export function formatDate(timestamp: number | null): string {
  if (timestamp === null) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

// ============================================================================
// Stage Formatting
// ============================================================================

/**
 * Priority fields shown first in stage data
 */
const STAGE_PRIORITY_FIELDS = [
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

/**
 * Fields to skip in stage data display
 */
const STAGE_SKIP_FIELDS = [
  "targets",
  "values",
  "calldatas",
  "signatures",
  "callScheduledData",
  "_rawBytesArray",
];

/**
 * A formatted stage data item
 */
export interface StageDataItem {
  label: string;
  value: string;
}

/**
 * Format stage data for display, prioritizing important fields
 */
export function formatStageData(stage: TrackedStage): StageDataItem[] {
  const items: StageDataItem[] = [];
  const data = stage.data as Record<string, unknown> | undefined;

  if (!data) return items;

  for (const field of STAGE_PRIORITY_FIELDS) {
    if (field in data && data[field] !== undefined) {
      let value = formatValue(data[field]);
      if (field === "description" && value.length > 100) {
        value = value.slice(0, 100) + "...";
      }
      items.push({ label: field, value });
    }
  }

  for (const [key, value] of Object.entries(data)) {
    if (STAGE_PRIORITY_FIELDS.includes(key)) continue;
    if (STAGE_SKIP_FIELDS.includes(key)) continue;
    if (value === undefined || value === null) continue;

    let formattedValue = formatValue(value);
    if (formattedValue.length > 80) {
      formattedValue = formattedValue.slice(0, 80) + "...";
    }
    items.push({ label: key, value: formattedValue });
  }

  return items;
}

// ============================================================================
// Tracking Input Helpers
// ============================================================================

/**
 * Extract transaction hash from tracking input
 */
export function getTxHash(input: TrackingInput): string {
  switch (input.type) {
    case "governor":
      return input.creationTxHash;
    case "timelock":
      return input.scheduledTxHash;
    case "discovery":
    case "election":
      return "";
  }
}

/**
 * Get display-friendly proposal or operation ID from tracking input
 */
export function getProposalIdDisplay(input: TrackingInput): string {
  switch (input.type) {
    case "governor":
      return input.proposalId;
    case "timelock":
      return input.operationId;
    case "discovery":
      return input.id;
    case "election":
      return `election-${input.electionIndex}`;
  }
}

// ============================================================================
// Calldata Formatting
// ============================================================================

/**
 * A formatted line for calldata display
 */
export interface FormattedLine {
  text: string;
  indent: number;
  foldable: boolean;
  foldKey?: string;
  foldedLineCount?: number;
  isFoldedContent?: boolean;
}

const CALLDATA_FOLD_THRESHOLD = 100;

function formatCalldataParameter(
  param: DecodedParameter,
  indent: number,
  keyPrefix: string
): FormattedLine[] {
  const lines: FormattedLine[] = [];
  const foldKey = `${keyPrefix}-${param.name}`;

  let value = param.displayValue;
  if (param.addressLabel) {
    value = `${param.displayValue} [${param.addressLabel}]`;
  }

  const isFoldable = value.length > CALLDATA_FOLD_THRESHOLD;
  const wrappedLines = isFoldable ? wrapText(value, 80) : [value];

  lines.push({
    text: `${param.name} (${param.type}): ${wrappedLines[0]}`,
    indent,
    foldable: isFoldable,
    foldKey: isFoldable ? foldKey : undefined,
    foldedLineCount: isFoldable ? wrappedLines.length - 1 : undefined,
  });

  if (isFoldable && wrappedLines.length > 1) {
    for (let i = 1; i < wrappedLines.length; i++) {
      lines.push({
        text: wrappedLines[i],
        indent: indent + 1,
        foldable: false,
        isFoldedContent: true,
        foldKey,
      });
    }
  }

  if (param.nested) {
    lines.push({ text: "|- [NESTED]", indent: indent + 1, foldable: false });
    lines.push(...formatDecodedCalldata(param.nested, indent + 2, `${foldKey}-nested`));
  }

  if (param.nestedArray && param.nestedArray.length > 0) {
    param.nestedArray.forEach((nested, i) => {
      lines.push({ text: `[${i}]:`, indent: indent + 1, foldable: false });
      lines.push(...formatDecodedCalldata(nested, indent + 2, `${foldKey}-arr-${i}`));
    });
  }

  return lines;
}

/**
 * Format decoded calldata into displayable lines
 */
export function formatDecodedCalldata(
  decoded: DecodedCalldata,
  indent = 0,
  keyPrefix = "root"
): FormattedLine[] {
  const lines: FormattedLine[] = [];

  let header: string;
  if (decoded.isRetryable) {
    header = `Retryable Ticket -> ${decoded.targetChain}`;
  } else if (decoded.signature) {
    header = decoded.signature;
  } else {
    header = `Unknown function (${decoded.selector})`;
  }
  lines.push({ text: header, indent, foldable: false });

  if (decoded.parameters) {
    decoded.parameters.forEach((param, i) => {
      lines.push(...formatCalldataParameter(param, indent + 1, `${keyPrefix}-p${i}`));
    });
  }

  return lines;
}

/**
 * Filter lines based on expanded fold keys
 */
export function filterVisibleLines(
  allLines: FormattedLine[],
  expandedKeys: Set<string>
): FormattedLine[] {
  return allLines.filter((line) => {
    if (!line.isFoldedContent) return true;
    return line.foldKey && expandedKeys.has(line.foldKey);
  });
}

/**
 * Get all foldable keys from lines
 */
export function getAllFoldableKeys(lines: FormattedLine[]): string[] {
  return lines.flatMap((l) => (l.foldable && l.foldKey ? [l.foldKey] : []));
}

/**
 * Toggle a fold key in the expanded set
 */
export function toggleFoldKey(expandedKeys: Set<string>, foldKey: string): Set<string> {
  const next = new Set(expandedKeys);
  if (next.has(foldKey)) {
    next.delete(foldKey);
  } else {
    next.add(foldKey);
  }
  return next;
}

// ============================================================================
// Duration Formatting
// ============================================================================

/**
 * Format duration in seconds to human-readable string
 *
 * Displays the two most significant time units (e.g., "2d 3h" or "5m 30s").
 * Returns "now" for zero or negative values.
 *
 * @example
 * formatDuration(90061) // => "1d 1h"
 * formatDuration(3661)  // => "1h 1m"
 * formatDuration(65)    // => "1m 5s"
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "now";

  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 && parts.length < 2) parts.push(`${hours}h`);
  if (minutes > 0 && parts.length < 2) parts.push(`${minutes}m`);
  if (secs > 0 && parts.length < 2) parts.push(`${secs}s`);

  return parts.join(" ") || "0s";
}

/**
 * Helper functions for ProposalDetail component
 */

import type { TrackingInput } from "../../../types/index.js";

/**
 * Format a Unix timestamp to locale string
 */
export function formatDate(timestamp: number | null): string {
  if (timestamp === null) return "Unknown";
  return new Date(timestamp).toLocaleString();
}

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

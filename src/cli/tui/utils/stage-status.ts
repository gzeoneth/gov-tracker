/**
 * Shared stage status utilities for TUI components
 */

import type { TrackedStage, StageStatus } from "../../../types/index.js";

export const STAGE_TYPES = [
  "PROPOSAL_CREATED",
  "VOTING_ACTIVE",
  "PROPOSAL_QUEUED",
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
] as const;

const STATUS_ICONS: Record<StageStatus, string> = {
  COMPLETED: "●",
  READY: "◉",
  PENDING: "◐",
  FAILED: "✗",
  SKIPPED: "○",
  NOT_STARTED: "○",
  CANCELED: "✗",
};

const STATUS_COLORS: Record<StageStatus, string> = {
  COMPLETED: "green",
  READY: "cyan",
  PENDING: "yellow",
  FAILED: "red",
  SKIPPED: "gray",
  NOT_STARTED: "gray",
  CANCELED: "red",
};

export function getStatusIcon(stage: TrackedStage | undefined): string {
  if (!stage) return "○";
  return STATUS_ICONS[stage.status] ?? "○";
}

export function getStatusColor(stage: TrackedStage | undefined): string {
  if (!stage) return "gray";
  return STATUS_COLORS[stage.status] ?? "gray";
}

export const ELECTION_PHASE_COLORS: Record<string, string> = {
  COMPLETED: "green",
  MEMBER_ELECTION: "yellow",
  NOMINEE_SELECTION: "yellow",
  VETTING_PERIOD: "cyan",
  PENDING_EXECUTION: "magenta",
  NOT_STARTED: "gray",
};

export const ELECTION_PHASE_ICONS: Record<string, string> = {
  COMPLETED: "✓",
  MEMBER_ELECTION: "●",
  NOMINEE_SELECTION: "●",
  VETTING_PERIOD: "◐",
  PENDING_EXECUTION: "→",
  NOT_STARTED: "○",
};

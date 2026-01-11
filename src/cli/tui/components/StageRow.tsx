/**
 * Single stage row component for proposal detail view
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { TrackedStage } from "../../../types/index.js";
import { formatStageTitle } from "../../../utils/stage-metadata.js";
import { StatusBadge } from "./StatusBadge.js";

interface StageRowProps {
  stage: TrackedStage;
  index: number;
  isSelected: boolean;
}

interface TimingInfo {
  text: string;
  color: string;
  isCountdown: boolean;
}

function formatTiming(stage: TrackedStage): TimingInfo | null {
  if (stage.timing?.eta) {
    const now = Date.now();
    const etaMs = stage.timing.eta * 1000;
    const diff = etaMs - now;

    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 48) {
        const days = Math.floor(hours / 24);
        return { text: `${days}d ${hours % 24}h`, color: "gray", isCountdown: true };
      }
      if (hours > 24) {
        return { text: `${hours}h ${mins}m`, color: "yellow", isCountdown: true };
      }
      if (hours > 1) {
        return { text: `${hours}h ${mins}m`, color: "yellow", isCountdown: true };
      }
      return { text: `${mins}m`, color: "green", isCountdown: true };
    }

    return {
      text: new Date(etaMs).toLocaleDateString(),
      color: "gray",
      isCountdown: false
    };
  }

  if (stage.transactions.length > 0) {
    const tx = stage.transactions[0];
    if (tx.timestamp) {
      const date = new Date(tx.timestamp * 1000);
      const now = Date.now();
      const elapsed = now - tx.timestamp * 1000;

      if (elapsed < 60 * 60 * 1000) {
        const mins = Math.floor(elapsed / (1000 * 60));
        return { text: `${mins}m ago`, color: "gray", isCountdown: false };
      }
      if (elapsed < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(elapsed / (1000 * 60 * 60));
        return { text: `${hours}h ago`, color: "gray", isCountdown: false };
      }
      return { text: date.toLocaleDateString(), color: "gray", isCountdown: false };
    }
  }

  return null;
}

function getStageExtra(stage: TrackedStage): string | null {
  if (stage.type === "VOTING_ACTIVE" && stage.data) {
    const data = stage.data as {
      proposalState?: string;
      forVotes?: string;
      againstVotes?: string;
      quorumReached?: boolean;
    };
    if (data.proposalState) {
      return data.proposalState;
    }
  }

  if (stage.type === "RETRYABLE_EXECUTED" && stage.data) {
    const data = stage.data as { ticketCount?: number; redeemedCount?: number };
    if (data.ticketCount !== undefined) {
      const redeemed = data.redeemedCount ?? 0;
      return `${redeemed}/${data.ticketCount} tickets`;
    }
  }

  if (
    (stage.type === "L2_TIMELOCK" || stage.type === "L1_TIMELOCK") &&
    stage.data
  ) {
    const data = stage.data as { state?: string };
    if (data.state) return data.state;
  }

  if (stage.type === "L2_TO_L1_MESSAGE" && stage.data) {
    const data = stage.data as { messageCount?: number; status?: string };
    if (data.messageCount) {
      const status = data.status ?? "pending";
      return `${data.messageCount} msg${data.messageCount > 1 ? "s" : ""} (${status})`;
    }
  }

  return null;
}

export function StageRow({ stage, index, isSelected }: StageRowProps): React.ReactElement {
  const title = formatStageTitle(stage.type);
  const timing = formatTiming(stage);
  const extra = getStageExtra(stage);

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined}>
        {isSelected ? ">" : " "} {index + 1}.{" "}
      </Text>
      <Text color={isSelected ? "cyan" : undefined}>{title.padEnd(18)}</Text>
      <StatusBadge status={stage.status} padded />
      <Text color="gray">{stage.chain.padEnd(10)}</Text>
      {timing ? (
        <Text color={timing.color as "gray" | "yellow" | "green"}>
          {timing.isCountdown && "⏱ "}
          {timing.text.padEnd(timing.isCountdown ? 10 : 12)}
        </Text>
      ) : (
        <Text color="gray">{" ".repeat(12)}</Text>
      )}
      {extra && <Text color="gray">[{extra}]</Text>}
    </Box>
  );
}

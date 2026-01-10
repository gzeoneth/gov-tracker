/**
 * Single stage row component for proposal detail view
 */

import { React, Box, Text } from "../ink-wrapper";
import type { TrackedStage } from "../../../types";
import { formatStageTitle } from "../../../utils/stage-metadata";
import { StatusBadge } from "./StatusBadge";

interface StageRowProps {
  stage: TrackedStage;
  index: number;
  isSelected: boolean;
}

function formatTiming(stage: TrackedStage): string | null {
  if (stage.timing?.eta) {
    const date = new Date(stage.timing.eta * 1000);
    const now = Date.now();
    const diff = stage.timing.eta * 1000 - now;

    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `~${days}d ${hours % 24}h`;
      }
      return `~${hours}h ${mins}m`;
    }

    return date.toLocaleDateString();
  }

  if (stage.transactions.length > 0) {
    const tx = stage.transactions[0];
    if (tx.timestamp) {
      return new Date(tx.timestamp * 1000).toLocaleDateString();
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
      <Box width={20}>
        <Text color={isSelected ? "cyan" : undefined}>{title}</Text>
      </Box>
      <Box width={14}>
        <StatusBadge status={stage.status} />
      </Box>
      <Box width={10}>
        <Text color="gray">{stage.chain}</Text>
      </Box>
      {timing && (
        <Box width={12}>
          <Text color="gray">{timing}</Text>
        </Box>
      )}
      {extra && (
        <Box>
          <Text color="gray"> [{extra}]</Text>
        </Box>
      )}
    </Box>
  );
}

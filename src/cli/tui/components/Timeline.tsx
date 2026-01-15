/**
 * Timeline visualization component for proposal stages
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { TrackedStage } from "../../../types/index.js";

interface TimelineProps {
  stages: TrackedStage[];
  currentIndex: number;
  compact?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  PROPOSAL_CREATED: "Created",
  VOTING_ACTIVE: "Voting",
  PROPOSAL_QUEUED: "Queued",
  L2_TIMELOCK: "L2 Lock",
  L2_TO_L1_MESSAGE: "Bridge",
  L1_TIMELOCK: "L1 Lock",
  RETRYABLE_EXECUTED: "Execute",
};

function getStageIcon(stage: TrackedStage): string {
  switch (stage.status) {
    case "COMPLETED":
      return "●";
    case "READY":
      return "◉";
    case "PENDING":
      return "◐";
    case "FAILED":
      return "✗";
    case "SKIPPED":
      return "○";
    default:
      return "·";
  }
}

function getStageColor(stage: TrackedStage): string {
  switch (stage.status) {
    case "COMPLETED":
      return "green";
    case "READY":
      return "cyan";
    case "PENDING":
      return "yellow";
    case "FAILED":
      return "red";
    case "SKIPPED":
      return "gray";
    default:
      return "gray";
  }
}

export function Timeline({ stages, currentIndex, compact = false }: TimelineProps): React.ReactElement {
  const totalStages = 7;
  const stageTypes = [
    "PROPOSAL_CREATED",
    "VOTING_ACTIVE",
    "PROPOSAL_QUEUED",
    "L2_TIMELOCK",
    "L2_TO_L1_MESSAGE",
    "L1_TIMELOCK",
    "RETRYABLE_EXECUTED",
  ];

  if (compact) {
    return (
      <Box>
        {stageTypes.map((type, i) => {
          const stage = stages.find(s => s.type === type);
          const icon = stage ? getStageIcon(stage) : "·";
          const color = stage ? getStageColor(stage) : "gray";
          const isSelected = i === currentIndex;
          return (
            <Text key={type}>
              <Text color={isSelected ? "cyan" : color} bold={isSelected}>{icon}</Text>
              {i < totalStages - 1 && <Text color="gray">─</Text>}
            </Text>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {stageTypes.map((type, i) => {
        const stage = stages.find(s => s.type === type);
        const icon = stage ? getStageIcon(stage) : "·";
        const color = stage ? getStageColor(stage) : "gray";
        const label = STAGE_LABELS[type] || type;
        const isSelected = i === currentIndex;
        const isLast = i === totalStages - 1;

        return (
          <Box key={type} flexDirection="column">
            <Box>
              <Text color={isSelected ? "cyan" : color} bold={isSelected}>
                {isSelected ? ">" : " "} {icon} {label}
              </Text>
              {stage?.executable && <Text color="green" bold> [READY]</Text>}
            </Box>
            {!isLast && (
              <Box marginLeft={2}>
                <Text color="gray">│</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

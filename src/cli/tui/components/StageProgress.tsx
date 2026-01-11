/**
 * Stage progress indicator with number key hints
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { TrackedStage } from "../../../types/index.js";

interface StageProgressProps {
  stages: TrackedStage[];
  currentIndex: number;
  totalStages?: number;
}

const STAGE_TYPES = [
  "PROPOSAL_CREATED",
  "VOTING_ACTIVE",
  "PROPOSAL_QUEUED",
  "L2_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "L1_TIMELOCK",
  "RETRYABLE_EXECUTED",
];

function getStatusIcon(stage: TrackedStage | undefined): string {
  if (!stage) return "○";
  switch (stage.status) {
    case "COMPLETED": return "●";
    case "READY": return "◉";
    case "PENDING": return "◐";
    case "FAILED": return "✗";
    case "SKIPPED": return "○";
    default: return "○";
  }
}

function getStatusColor(stage: TrackedStage | undefined): string {
  if (!stage) return "gray";
  switch (stage.status) {
    case "COMPLETED": return "green";
    case "READY": return "cyan";
    case "PENDING": return "yellow";
    case "FAILED": return "red";
    default: return "gray";
  }
}

export function StageProgress({
  stages,
  currentIndex,
  totalStages = 7,
}: StageProgressProps): React.ReactElement {
  const completedCount = stages.filter(s => s.status === "COMPLETED").length;
  const readyCount = stages.filter(s => s.status === "READY").length;
  const pendingCount = stages.filter(s => s.status === "PENDING").length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="gray">Progress: </Text>
        {STAGE_TYPES.map((type, i) => {
          const stage = stages.find(s => s.type === type);
          const icon = getStatusIcon(stage);
          const color = getStatusColor(stage);
          const isSelected = i === currentIndex;
          const keyNum = i + 1;

          return (
            <Box key={type}>
              <Text color={isSelected ? "cyan" : color} bold={isSelected}>
                {isSelected ? "[" : " "}
                <Text color={isSelected ? "white" : "gray"}>{keyNum}</Text>
                {icon}
                {isSelected ? "]" : " "}
              </Text>
              {i < totalStages - 1 && <Text color="gray">─</Text>}
            </Box>
          );
        })}
        <Text color="gray"> </Text>
        <Text color="green">{completedCount}</Text>
        <Text color="gray">/</Text>
        {readyCount > 0 && (
          <>
            <Text color="cyan">{readyCount}</Text>
            <Text color="gray">/</Text>
          </>
        )}
        {pendingCount > 0 && (
          <>
            <Text color="yellow">{pendingCount}</Text>
            <Text color="gray">/</Text>
          </>
        )}
        <Text color="gray">{totalStages}</Text>
      </Box>
    </Box>
  );
}

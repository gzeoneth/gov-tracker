/**
 * Stage progress indicator with number key hints
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { TrackedStage } from "../../../types/index.js";
import { STAGE_TYPES, getStatusIcon, getStatusColor } from "../utils/index.js";

interface StageProgressProps {
  stages: TrackedStage[];
  currentIndex: number;
  totalStages?: number;
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
          const stage = stages.find((s) => s.type === type);
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

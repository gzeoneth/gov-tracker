/**
 * Skeleton loading component for perceived performance
 */

import { React, Box, Text, useState, useEffect } from "../ink-wrapper.js";

interface SkeletonProps {
  width?: number;
  height?: number;
  animated?: boolean;
}

const SKELETON_CHARS = ["░", "▒", "▓", "▒"];

export function Skeleton({ width = 20, height = 1, animated = true }: SkeletonProps): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animated) return undefined;

    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SKELETON_CHARS.length);
    }, 200);

    return () => clearInterval(interval);
  }, [animated]);

  const char = animated ? SKELETON_CHARS[frame] : "░";
  const line = char.repeat(width);

  if (height === 1) {
    return <Text color="gray">{line}</Text>;
  }

  return (
    <Box flexDirection="column">
      {Array.from({ length: height }).map((_, i) => (
        <Text key={i} color="gray">{line}</Text>
      ))}
    </Box>
  );
}

interface SkeletonRowProps {
  columns: number[];
  animated?: boolean;
}

export function SkeletonRow({ columns, animated = true }: SkeletonRowProps): React.ReactElement {
  return (
    <Box>
      {columns.map((width, i) => (
        <Box key={i} marginRight={1}>
          <Skeleton width={width} animated={animated} />
        </Box>
      ))}
    </Box>
  );
}

interface SkeletonListProps {
  rows?: number;
  columns?: number[];
  animated?: boolean;
}

export function SkeletonList({
  rows = 5,
  columns = [3, 40, 10, 8],
  animated = true
}: SkeletonListProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} animated={animated} />
      ))}
    </Box>
  );
}

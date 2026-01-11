/**
 * Scroll indicator component for views with scrollable content
 */

import { React, Box, Text } from "../ink-wrapper.js";

interface ScrollIndicatorProps {
  scrollOffset: number;
  visibleRows: number;
  totalItems: number;
  unit?: string;
}

export function ScrollIndicatorTop({
  scrollOffset,
  unit = "items",
}: Pick<ScrollIndicatorProps, "scrollOffset" | "unit">): React.ReactElement | null {
  if (scrollOffset <= 0) return null;

  return (
    <Box>
      <Text color="gray">↑ </Text>
      <Text color="yellow">{scrollOffset}</Text>
      <Text color="gray"> {unit} above</Text>
    </Box>
  );
}

export function ScrollIndicatorBottom({
  scrollOffset,
  visibleRows,
  totalItems,
  unit = "items",
}: ScrollIndicatorProps): React.ReactElement | null {
  const remaining = totalItems - scrollOffset - visibleRows;
  if (remaining <= 0) return null;

  return (
    <Box>
      <Text color="gray">↓ </Text>
      <Text color="yellow">{remaining}</Text>
      <Text color="gray"> {unit} below</Text>
    </Box>
  );
}

interface ScrollBarProps {
  scrollOffset: number;
  visibleRows: number;
  totalItems: number;
  height?: number;
}

export function ScrollBar({
  scrollOffset,
  visibleRows,
  totalItems,
  height = 5,
}: ScrollBarProps): React.ReactElement | null {
  if (totalItems <= visibleRows) return null;

  const scrollRatio = scrollOffset / Math.max(1, totalItems - visibleRows);
  const thumbPosition = Math.round(scrollRatio * (height - 1));

  const chars = Array.from({ length: height }, (_, i) =>
    i === thumbPosition ? "█" : "░"
  );

  return (
    <Box flexDirection="column">
      {chars.map((char, i) => (
        <Text key={i} color={i === thumbPosition ? "cyan" : "gray"}>
          {char}
        </Text>
      ))}
    </Box>
  );
}

interface ScrollPositionProps {
  scrollOffset: number;
  visibleRows: number;
  totalItems: number;
}

export function ScrollPosition({
  scrollOffset,
  visibleRows,
  totalItems,
}: ScrollPositionProps): React.ReactElement | null {
  if (totalItems <= visibleRows) return null;

  const current = Math.min(scrollOffset + visibleRows, totalItems);
  const percentage = Math.round((current / totalItems) * 100);

  return (
    <Box>
      <Text color="gray">[</Text>
      <Text color="cyan">{scrollOffset + 1}</Text>
      <Text color="gray">-</Text>
      <Text color="cyan">{current}</Text>
      <Text color="gray">/</Text>
      <Text>{totalItems}</Text>
      <Text color="gray">] </Text>
      <Text color={percentage === 100 ? "green" : "yellow"}>{percentage}%</Text>
    </Box>
  );
}

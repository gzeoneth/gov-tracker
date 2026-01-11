/**
 * Status bar component for displaying contextual information
 */

import { React, Box, Text } from "../ink-wrapper.js";

interface StatusBarProps {
  left?: string;
  center?: string;
  right?: string;
  color?: string;
}

export function StatusBar({ left, center, right, color = "gray" }: StatusBarProps): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor={color} paddingX={1} justifyContent="space-between">
      <Text color={color}>{left ?? ""}</Text>
      {center && <Text color={color}>{center}</Text>}
      <Text color={color}>{right ?? ""}</Text>
    </Box>
  );
}

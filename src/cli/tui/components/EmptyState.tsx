/**
 * Empty state component for when no data is available
 */

import { React, Box, Text } from "../ink-wrapper.js";

interface EmptyStateProps {
  title: string;
  message?: string;
  hint?: string;
}

export function EmptyState({ title, message, hint }: EmptyStateProps): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="center" marginY={2}>
      <Text color="gray">
        {"    "}____{"\n"}
        {"   "}/ __ \\{"\n"}
        {"  "}| |  | |{"\n"}
        {"  "}| |  | |{"\n"}
        {"  "}| |__| |{"\n"}
        {"   "}\\____/{"\n"}
      </Text>
      <Text bold color="yellow">{title}</Text>
      {message && <Text color="gray">{message}</Text>}
      {hint && (
        <Box marginTop={1}>
          <Text color="cyan">{hint}</Text>
        </Box>
      )}
    </Box>
  );
}

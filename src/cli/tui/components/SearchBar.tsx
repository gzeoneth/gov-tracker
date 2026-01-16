/**
 * Search bar component with visual feedback
 */

import { React, Box, Text } from "../ink-wrapper.js";

interface SearchBarProps {
  query: string;
  isActive: boolean;
  resultCount?: number;
  placeholder?: string;
}

export function SearchBar({
  query,
  isActive,
  resultCount,
  placeholder = "Type to search...",
}: SearchBarProps): React.ReactElement | null {
  if (!isActive && !query) {
    return null;
  }

  if (isActive) {
    return (
      <Box marginBottom={1}>
        <Text color="cyan" bold>/ </Text>
        <Text>{query}</Text>
        <Text color="cyan" inverse> </Text>
        {!query && <Text color="gray"> {placeholder}</Text>}
        <Text color="gray"> (Enter to confirm, Esc to cancel)</Text>
      </Box>
    );
  }

  return (
    <Box marginBottom={1}>
      <Text color="gray">Filter: </Text>
      <Text color="yellow">"{query}"</Text>
      {resultCount !== undefined && (
        <Text color="gray"> ({resultCount} result{resultCount !== 1 ? "s" : ""})</Text>
      )}
      <Text color="gray"> (/ to search, Esc to clear)</Text>
    </Box>
  );
}

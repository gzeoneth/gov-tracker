/**
 * Error display component with retry option
 */

import { React, Box, Text } from "../ink-wrapper.js";

interface ErrorDisplayProps {
  error: string;
  title?: string;
  onRetry?: () => void;
  retryKey?: string;
}

function categorizeError(error: string): { type: string; color: string } {
  const lowerError = error.toLowerCase();

  // Network errors: connection issues, DNS failures, timeouts
  if (
    lowerError.includes("network") ||
    lowerError.includes("timeout") ||
    lowerError.includes("etimedout") ||
    lowerError.includes("econnrefused") ||
    lowerError.includes("econnreset") ||
    lowerError.includes("enotfound") ||
    lowerError.includes("ehostunreach") ||
    lowerError.includes("enetunreach")
  ) {
    return { type: "Network", color: "yellow" };
  }
  if (lowerError.includes("rpc") || lowerError.includes("provider")) {
    return { type: "RPC", color: "yellow" };
  }
  if (lowerError.includes("permission") || lowerError.includes("unauthorized") || lowerError.includes("forbidden")) {
    return { type: "Permission", color: "red" };
  }
  if (lowerError.includes("not found") || lowerError.includes("404")) {
    return { type: "Not Found", color: "gray" };
  }
  if (lowerError.includes("rate limit") || lowerError.includes("throttl")) {
    return { type: "Rate Limit", color: "yellow" };
  }

  return { type: "Error", color: "red" };
}

export function ErrorDisplay({
  error,
  title,
  onRetry,
  retryKey = "r",
}: ErrorDisplayProps): React.ReactElement {
  const { type, color } = categorizeError(error);
  const displayTitle = title ?? type;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} paddingY={0}>
      <Box>
        <Text color={color} bold>{displayTitle}: </Text>
        <Text color="white">{error}</Text>
      </Box>
      {onRetry && (
        <Box marginTop={1}>
          <Text color="gray">Press </Text>
          <Text color="cyan">{retryKey}</Text>
          <Text color="gray"> to retry</Text>
        </Box>
      )}
    </Box>
  );
}

interface ErrorBannerProps {
  error: string;
  compact?: boolean;
}

export function ErrorBanner({ error, compact = false }: ErrorBannerProps): React.ReactElement {
  const { type, color } = categorizeError(error);

  if (compact) {
    return (
      <Box>
        <Text color={color}>[{type}] </Text>
        <Text color="gray">{error.length > 50 ? error.slice(0, 50) + "..." : error}</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color={color} bold>{type}: </Text>
      <Text>{error}</Text>
    </Box>
  );
}

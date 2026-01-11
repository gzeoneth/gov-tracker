/**
 * Animated tracking progress indicator
 */

import { React, Box, Text, useState, useEffect } from "../ink-wrapper.js";

interface TrackingProgressProps {
  message: string;
  stage?: string;
  elapsed?: number;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PROGRESS_BAR_WIDTH = 20;

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function TrackingProgress({
  message,
  stage,
  elapsed,
}: TrackingProgressProps): React.ReactElement {
  const [frameIndex, setFrameIndex] = useState(0);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
      setDots((prev) => (prev + 1) % 4);
    }, 100);

    return () => clearInterval(timer);
  }, []);

  const dotString = ".".repeat(dots);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box>
        <Text color="yellow">{SPINNER_FRAMES[frameIndex]} </Text>
        <Text color="white" bold>Tracking</Text>
        <Text color="gray">{dotString.padEnd(3)}</Text>
        {elapsed !== undefined && (
          <Text color="gray"> ({formatElapsed(elapsed)})</Text>
        )}
      </Box>
      {stage && (
        <Box marginLeft={2}>
          <Text color="cyan">Stage: </Text>
          <Text>{stage}</Text>
        </Box>
      )}
      <Box marginLeft={2}>
        <Text color="gray">{message}</Text>
      </Box>
    </Box>
  );
}

interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
  showPercentage?: boolean;
  label?: string;
}

export function ProgressBar({
  current,
  total,
  width = PROGRESS_BAR_WIDTH,
  showPercentage = true,
  label,
}: ProgressBarProps): React.ReactElement {
  const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;

  const filledBar = "█".repeat(filled);
  const emptyBar = "░".repeat(empty);

  return (
    <Box>
      {label && <Text color="gray">{label}: </Text>}
      <Text color="green">{filledBar}</Text>
      <Text color="gray">{emptyBar}</Text>
      {showPercentage && <Text color="gray"> {percentage}%</Text>}
      <Text color="gray"> ({current}/{total})</Text>
    </Box>
  );
}

interface PulsingTextProps {
  text: string;
  color?: string;
}

export function PulsingText({ text, color = "yellow" }: PulsingTextProps): React.ReactElement {
  const [intensity, setIntensity] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIntensity((prev) => (prev + 1) % 3);
    }, 500);

    return () => clearInterval(timer);
  }, []);

  const colors = [color, "white", color];

  return <Text color={colors[intensity]} bold={intensity === 1}>{text}</Text>;
}

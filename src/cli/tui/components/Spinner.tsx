/**
 * Animated spinner component for loading states
 */

import { React, Text, useState, useEffect } from "../ink-wrapper.js";

interface SpinnerProps {
  text?: string;
  color?: string;
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL = 80;

export function Spinner({ text, color = "yellow" }: SpinnerProps): React.ReactElement {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, FRAME_INTERVAL);

    return () => clearInterval(timer);
  }, []);

  return (
    <Text>
      <Text color={color}>{SPINNER_FRAMES[frameIndex]}</Text>
      {text ? <Text color="gray"> {text}</Text> : null}
    </Text>
  );
}

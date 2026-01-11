/**
 * Text component that can be copied to clipboard
 */

import { React, Box, Text, useState, useEffect } from "../ink-wrapper.js";
import { copyToClipboard } from "../utils/index.js";

interface CopyableTextProps {
  value: string;
  label?: string;
  color?: string;
  showHint?: boolean;
  onCopy?: (success: boolean) => void;
}

export function CopyableText({
  value,
  label,
  color = "blue",
  showHint = false,
}: CopyableTextProps): React.ReactElement {
  return (
    <Box>
      {label && <Text color="gray">{label}: </Text>}
      <Text color={color as "blue" | "white" | "gray" | "cyan" | "yellow" | "green" | "red"}>{value}</Text>
      {showHint && <Text color="gray"> (y to copy)</Text>}
    </Box>
  );
}

interface CopyFeedbackProps {
  message: string;
  type: "success" | "error";
}

export function CopyFeedback({ message, type }: CopyFeedbackProps): React.ReactElement {
  return (
    <Box>
      <Text color={type === "success" ? "green" : "red"}>
        {type === "success" ? "✓" : "✗"} {message}
      </Text>
    </Box>
  );
}

export function useCopyState(): {
  feedback: string | null;
  feedbackType: "success" | "error";
  copy: (text: string, label?: string) => void;
} {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [feedback]);

  const copy = (text: string, label = "Text") => {
    const success = copyToClipboard(text);
    if (success) {
      setFeedback(`${label} copied to clipboard`);
      setFeedbackType("success");
    } else {
      setFeedback("Failed to copy - clipboard not available");
      setFeedbackType("error");
    }
  };

  return { feedback, feedbackType, copy };
}

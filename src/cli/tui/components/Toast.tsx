/**
 * Toast notification component
 */

import { React, Box, Text, useEffect, useState } from "../ink-wrapper.js";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss?: () => void;
}

const TOAST_CONFIG: Record<ToastType, { icon: string; color: string; borderColor: string }> = {
  success: { icon: "✓", color: "green", borderColor: "green" },
  error: { icon: "✗", color: "red", borderColor: "red" },
  info: { icon: "ℹ", color: "cyan", borderColor: "cyan" },
  warning: { icon: "⚠", color: "yellow", borderColor: "yellow" },
};

export function Toast({
  message,
  type = "info",
  duration = 3000,
  onDismiss,
}: ToastProps): React.ReactElement | null {
  const [visible, setVisible] = useState(true);
  const config = TOAST_CONFIG[type] ?? TOAST_CONFIG.info;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, duration);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [duration, onDismiss]);

  if (!visible) return null;

  return (
    <Box
      borderStyle="round"
      borderColor={config.borderColor}
      paddingX={1}
      marginY={1}
    >
      <Text color={config.color} bold>{config.icon} </Text>
      <Text>{message}</Text>
    </Box>
  );
}

/**
 * Status badge component for displaying stage/proposal status
 */

import { React, Text } from "../ink-wrapper.js";
import type { StageStatus } from "../../../types/index.js";

interface StatusBadgeProps {
  status: StageStatus | "active" | "complete" | "failed";
  compact?: boolean;
  padded?: boolean;
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  NOT_STARTED: { icon: "·", color: "gray", label: "Not Started" },
  PENDING: { icon: "◐", color: "yellow", label: "Pending" },
  READY: { icon: "▶", color: "green", label: "Ready" },
  COMPLETED: { icon: "✓", color: "green", label: "Complete" },
  FAILED: { icon: "✗", color: "red", label: "Failed" },
  SKIPPED: { icon: "○", color: "gray", label: "Skipped" },
  active: { icon: "●", color: "yellow", label: "Active" },
  complete: { icon: "✓", color: "green", label: "Complete" },
  failed: { icon: "✗", color: "red", label: "Failed" },
};

export function StatusBadge({ status, compact = false, padded = false }: StatusBadgeProps): React.ReactElement {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.NOT_STARTED;

  if (compact) {
    return <Text color={config.color}>{config.icon}</Text>;
  }

  const text = `${config.icon} ${config.label}`;
  return (
    <Text color={config.color}>
      {padded ? text.padEnd(14) : text}
    </Text>
  );
}

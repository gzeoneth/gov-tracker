/**
 * Reusable collapsible section component
 */

import { React, Box, Text } from "../ink-wrapper.js";

interface CollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle?: () => void;
  badge?: string;
  badgeColor?: string;
  children?: React.ReactNode;
}

export function CollapsibleSection({
  title,
  isExpanded,
  badge,
  badgeColor = "gray",
  children,
}: CollapsibleSectionProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">{isExpanded ? "▼" : "▶"} {title}</Text>
        {badge && (
          <Text color={badgeColor as "gray" | "green" | "yellow" | "red" | "cyan"}> ({badge})</Text>
        )}
      </Box>
      {isExpanded && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          {children}
        </Box>
      )}
    </Box>
  );
}

interface SectionItemProps {
  label: string;
  value: string | React.ReactNode;
  color?: string;
}

export function SectionItem({ label, value, color = "white" }: SectionItemProps): React.ReactElement {
  return (
    <Box>
      <Text color="gray">{label}: </Text>
      {typeof value === "string" ? (
        <Text color={color as "white" | "gray" | "blue" | "green" | "yellow" | "red" | "cyan"}>{value}</Text>
      ) : (
        value
      )}
    </Box>
  );
}

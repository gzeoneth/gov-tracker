/**
 * Single proposal row in the list view
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import { StatusBadge } from "./StatusBadge.js";

interface ProposalRowProps {
  item: ProposalListItem;
  isSelected: boolean;
  maxWidth?: number;
}

function getTypeLabel(item: ProposalListItem): string {
  if (item.type === "election") return "EL";
  if (item.type === "timelock") return "TL";
  if (item.proposalType === "CONSTITUTIONAL") return "CO";
  if (item.proposalType === "NON_CONSTITUTIONAL") return "TR";
  return "PR";
}

function getTypeColor(item: ProposalListItem): string {
  if (item.type === "election") return "magenta";
  if (item.type === "timelock") return "blue";
  if (item.proposalType === "CONSTITUTIONAL") return "cyan";
  return "green";
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function formatAge(timestamp: number | null): string {
  if (timestamp === null) return "--";

  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "future";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years}y ago`;
}

export function ProposalRow({ item, isSelected, maxWidth = 80 }: ProposalRowProps): React.ReactElement {
  const typeLabel = getTypeLabel(item);
  const typeColor = getTypeColor(item);
  const age = formatAge(item.createdAt);

  // Calculate available width for title: total - cursor(2) - type(3) - age(9) - status(3) - progress(4) - exec(2) - spaces(5)
  const titleWidth = Math.max(20, maxWidth - 28);
  const displayTitle = truncate(item.title, titleWidth);

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {isSelected ? ">" : " "}
      </Text>
      <Text color={typeColor}>{typeLabel}</Text>
      <Text> </Text>
      <Text color={isSelected ? "cyan" : undefined}>{displayTitle}</Text>
      <Text color="gray"> </Text>
      <Text color="gray">{age.padStart(8)}</Text>
      <Text> </Text>
      <StatusBadge status={item.status} compact />
      <Text color="gray">{item.stageProgress}</Text>
      {item.hasExecutable && <Text color="green">▶</Text>}
    </Box>
  );
}

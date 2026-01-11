/**
 * Single proposal row in the list view
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import { StatusBadge } from "./StatusBadge.js";

interface ProposalRowProps {
  item: ProposalListItem;
  isSelected: boolean;
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

export function ProposalRow({ item, isSelected }: ProposalRowProps): React.ReactElement {
  const typeLabel = getTypeLabel(item);
  const typeColor = getTypeColor(item);
  const age = formatAge(item.createdAt);

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {isSelected ? ">" : " "}
      </Text>
      <Text color={typeColor}>{typeLabel}</Text>
      <Text> </Text>
      <Text color={isSelected ? "cyan" : undefined}>{item.title}</Text>
      <Text color="gray"> </Text>
      <Text color="gray">{age.padStart(8)}</Text>
      <Text> </Text>
      <StatusBadge status={item.status} compact />
      <Text color="gray">{item.stageProgress}</Text>
      {item.hasExecutable && <Text color="green">▶</Text>}
    </Box>
  );
}

/**
 * Single proposal row in the list view
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import { StatusBadge } from "./StatusBadge.js";
import { getTerminalSize, truncate } from "../utils/index.js";

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

function parseProgress(stageProgress: string): { current: number; total: number } | null {
  const match = stageProgress.match(/(\d+)\/(\d+)/);
  if (!match) return null;
  return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
}

function renderProgressBar(progress: { current: number; total: number }): string {
  const filled = progress.current;
  const empty = progress.total - progress.current;
  return "█".repeat(filled) + "░".repeat(empty);
}

export function ProposalRow({ item, isSelected }: ProposalRowProps): React.ReactElement {
  const typeLabel = getTypeLabel(item);
  const typeColor = getTypeColor(item);
  const age = formatAge(item.createdAt);
  const progress = parseProgress(item.stageProgress);
  const progressBar = progress ? renderProgressBar(progress) : null;
  const progressWidth = progressBar ? progressBar.length : item.stageProgress.length;

  const { width } = getTerminalSize();
  const fixedWidth = 1 + 2 + 1 + 1 + 8 + 1 + 1 + 1 + progressWidth + (item.hasExecutable ? 2 : 0);
  const maxTitleWidth = Math.max(10, width - fixedWidth);
  const title = truncate(item.title, maxTitleWidth);

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {isSelected ? ">" : " "}
      </Text>
      <Text color={typeColor}>[{typeLabel}]</Text>
      <Text> </Text>
      <Text color={isSelected ? "cyan" : undefined}>{title}</Text>
      <Text color="gray"> </Text>
      <Text color="gray">{age.padStart(8)}</Text>
      <Text> </Text>
      <StatusBadge status={item.status} compact />
      {progressBar ? (
        <Text color={item.status === "complete" ? "green" : "yellow"}> {progressBar}</Text>
      ) : (
        <Text color="gray"> {item.stageProgress}</Text>
      )}
      {item.hasExecutable && <Text color="green"> ▶</Text>}
    </Box>
  );
}

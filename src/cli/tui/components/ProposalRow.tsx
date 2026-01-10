/**
 * Single proposal row in the list view
 */

import { React, Box, Text } from "../ink-wrapper";
import type { ProposalListItem } from "../types";
import { StatusBadge } from "./StatusBadge";

interface ProposalRowProps {
  item: ProposalListItem;
  isSelected: boolean;
}

function getTypeLabel(item: ProposalListItem): string {
  if (item.type === "election") return "ELEC";
  if (item.type === "timelock") return "TLO";
  if (item.proposalType === "CONSTITUTIONAL") return "CONST";
  if (item.proposalType === "NON_CONSTITUTIONAL") return "TREAS";
  return "PROP";
}

function getTypeColor(item: ProposalListItem): string {
  if (item.type === "election") return "magenta";
  if (item.type === "timelock") return "blue";
  if (item.proposalType === "CONSTITUTIONAL") return "cyan";
  return "green";
}

export function ProposalRow({ item, isSelected }: ProposalRowProps): React.ReactElement {
  const typeLabel = getTypeLabel(item);
  const typeColor = getTypeColor(item);

  return (
    <Box>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
        {isSelected ? ">" : " "}{" "}
      </Text>
      <Box width={6}>
        <Text color={typeColor}>[{typeLabel}]</Text>
      </Box>
      <Box width={50} marginRight={1}>
        <Text color={isSelected ? "cyan" : undefined}>{item.title}</Text>
      </Box>
      <Box width={10}>
        <StatusBadge status={item.status} compact />
        <Text color="gray"> {item.stageProgress}</Text>
      </Box>
      {item.hasExecutable && (
        <Box marginLeft={1}>
          <Text color="green">▶</Text>
        </Box>
      )}
    </Box>
  );
}

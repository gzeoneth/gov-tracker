/**
 * Enhanced voting statistics visualization
 */

import { React, Box, Text } from "../ink-wrapper.js";
import type { VotingActiveData } from "../../../types/stages.js";
import { getProposalStateColor } from "../utils/index.js";

interface VotingStatsProps {
  data: VotingActiveData;
  compact?: boolean;
}

const BAR_WIDTH = 30;

function formatVoteCount(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return value;
}

function calculatePercentage(value: string, total: number): number {
  const num = parseFloat(value) || 0;
  return total > 0 ? (num / total) * 100 : 0;
}

export function VotingStats({ data, compact = false }: VotingStatsProps): React.ReactElement {
  const forVotes = parseFloat(data.forVotes) || 0;
  const againstVotes = parseFloat(data.againstVotes) || 0;
  const abstainVotes = parseFloat(data.abstainVotes) || 0;
  const total = forVotes + againstVotes + abstainVotes;

  const forPct = calculatePercentage(data.forVotes, total);
  const againstPct = calculatePercentage(data.againstVotes, total);
  const abstainPct = calculatePercentage(data.abstainVotes, total);

  const forBarWidth = Math.min(BAR_WIDTH, Math.max(0, Math.round((forPct / 100) * BAR_WIDTH)));
  const againstBarWidth = Math.min(BAR_WIDTH, Math.max(0, Math.round((againstPct / 100) * BAR_WIDTH)));

  if (compact) {
    return (
      <Box>
        <Text color="green">✓{formatVoteCount(data.forVotes)}</Text>
        <Text color="gray"> / </Text>
        <Text color="red">✗{formatVoteCount(data.againstVotes)}</Text>
        {data.quorumReached && <Text color="cyan"> [Q]</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">Voting Results</Text>

      <Box marginTop={1}>
        <Text color="green">For     </Text>
        <Text color="green">{"█".repeat(forBarWidth)}</Text>
        <Text color="gray">{"░".repeat(BAR_WIDTH - forBarWidth)}</Text>
        <Text color="green"> {forPct.toFixed(1)}%</Text>
        <Text color="gray"> ({formatVoteCount(data.forVotes)})</Text>
      </Box>

      <Box>
        <Text color="red">Against </Text>
        <Text color="red">{"█".repeat(againstBarWidth)}</Text>
        <Text color="gray">{"░".repeat(BAR_WIDTH - againstBarWidth)}</Text>
        <Text color="red"> {againstPct.toFixed(1)}%</Text>
        <Text color="gray"> ({formatVoteCount(data.againstVotes)})</Text>
      </Box>

      <Box>
        <Text color="gray">Abstain </Text>
        <Text color="gray">{abstainPct.toFixed(1)}% ({formatVoteCount(data.abstainVotes)})</Text>
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false}>
        <Text color="cyan">Quorum: {formatVoteCount(data.quorum)} </Text>
        {data.quorumReached ? (
          <Text color="green" bold>✓ REACHED</Text>
        ) : (
          <Text color="yellow">○ Not yet reached</Text>
        )}
      </Box>

      {data.proposalState && (
        <Box marginTop={1}>
          <Text color="gray">State: </Text>
          <Text bold color={getProposalStateColor(data.proposalState)}>
            {data.proposalState}
          </Text>
        </Box>
      )}
    </Box>
  );
}

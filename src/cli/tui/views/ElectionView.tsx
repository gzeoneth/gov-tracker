/**
 * Security Council Election Status View
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import { useState, useEffect } from "react";
import type { UseNavigationResult } from "../hooks/index.js";
import type { ProviderBundle } from "../../lib/cli.js";
import { ViewLayout } from "../components/ViewLayout.js";
import type { ElectionStatus, ElectionProposalStatus } from "../../../types/index.js";
import { checkElectionStatus, trackElectionProposal } from "../../../election.js";

interface ElectionViewProps {
  navigation: UseNavigationResult;
  providers?: ProviderBundle;
}

interface ElectionData {
  status: ElectionStatus | null;
  proposals: ElectionProposalStatus[];
  loading: boolean;
  error: string | null;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function PhaseIcon({ phase }: { phase: string }): React.ReactElement {
  switch (phase) {
    case "COMPLETED":
      return <Text color="green">✓</Text>;
    case "MEMBER_ELECTION":
    case "NOMINEE_SELECTION":
      return <Text color="yellow">●</Text>;
    case "VETTING_PERIOD":
      return <Text color="cyan">◐</Text>;
    case "PENDING_EXECUTION":
      return <Text color="magenta">→</Text>;
    default:
      return <Text color="gray">○</Text>;
  }
}

export function ElectionView({ navigation, providers }: ElectionViewProps): React.ReactElement {
  const [data, setData] = useState<ElectionData>({
    status: null,
    proposals: [],
    loading: true,
    error: null,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!providers) {
      setData({
        status: null,
        proposals: [],
        loading: false,
        error: "RPC providers required. Use --l2-rpc and --l1-rpc options.",
      });
      return;
    }

    let cancelled = false;

    const loadElectionData = async () => {
      try {
        setData((prev) => ({ ...prev, loading: true, error: null }));

        const status = await checkElectionStatus(providers.l2Provider, providers.l1Provider);
        if (cancelled) return;

        const proposals: ElectionProposalStatus[] = [];
        const startIndex = Math.max(0, status.electionCount - 3);

        for (let i = status.electionCount; i >= startIndex; i--) {
          if (cancelled) return;
          try {
            const proposal = await trackElectionProposal(i, providers.l2Provider, providers.l1Provider);
            proposals.push(proposal);
          } catch {
            // Skip elections that can't be tracked
          }
        }

        if (!cancelled) {
          setData({
            status,
            proposals,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setData({
            status: null,
            proposals: [],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };

    loadElectionData();

    return () => {
      cancelled = true;
    };
  }, [providers]);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if ((key.downArrow || input === "j") && data.proposals.length > 0) {
      setSelectedIndex((prev) => Math.min(data.proposals.length - 1, prev + 1));
    }
  });

  const { status, proposals } = data;

  return (
    <ViewLayout
      view="election"
      hasProviders={!!providers}
      isTracking={data.loading}
      loading={data.loading}
      loadingText="Loading election status..."
      skeletonType="detail"
      error={data.error}
    >
      {status && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Security Council Election Status</Text>
          <Box marginLeft={1} flexDirection="column">
            <Box><Text color="gray">Election Count: </Text><Text>{status.electionCount}</Text></Box>
            <Box>
              <Text color="gray">Current Cohort: </Text>
              <Text color={status.cohort === 0 ? "cyan" : "magenta"}>{status.cohort === 0 ? "FIRST" : "SECOND"}</Text>
            </Box>
            <Box>
              <Text color="gray">Can Create Election: </Text>
              <Text color={status.canCreateElection ? "green" : "gray"}>{status.canCreateElection ? "Yes" : "No"}</Text>
            </Box>
            {!status.canCreateElection && (
              <Box>
                <Text color="gray">Next Election: </Text>
                <Text>{formatTimestamp(status.nextElectionTimestamp)}</Text>
                <Text color="gray"> ({status.timeUntilElection})</Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      <Box flexDirection="column">
        <Text bold>Recent Elections</Text>
        {proposals.length === 0 ? (
          <Text color="gray" marginLeft={1}>No elections found</Text>
        ) : (
          proposals.map((election, i) => (
            <ElectionItem
              key={election.electionIndex}
              election={election}
              isSelected={i === selectedIndex}
            />
          ))
        )}
      </Box>
    </ViewLayout>
  );
}

interface ElectionItemProps {
  election: ElectionProposalStatus;
  isSelected: boolean;
}

function getPhaseColor(phase: string): string {
  if (phase === "COMPLETED") return "green";
  if (phase === "NOT_STARTED") return "gray";
  return "yellow";
}

function ElectionItem({ election, isSelected }: ElectionItemProps): React.ReactElement {
  return (
    <Box marginLeft={1} flexDirection="column">
      <Box>
        <Text color={isSelected ? "cyan" : undefined}>{isSelected ? "> " : "  "}</Text>
        <PhaseIcon phase={election.phase} />
        <Text> </Text>
        <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>Election #{election.electionIndex}</Text>
        <Text color="gray"> - </Text>
        <Text color={getPhaseColor(election.phase)}>{election.phase.replace(/_/g, " ")}</Text>
      </Box>
      {isSelected && (
        <Box marginLeft={4} flexDirection="column">
          <Box><Text color="gray">Cohort: </Text><Text>{election.cohort === 0 ? "FIRST" : "SECOND"}</Text></Box>
          {election.nomineeProposalId && (
            <Box><Text color="gray">Nominee State: </Text><Text>{election.nomineeProposalState}</Text></Box>
          )}
          {election.memberProposalId && (
            <Box><Text color="gray">Member State: </Text><Text>{election.memberProposalState}</Text></Box>
          )}
          <Box>
            <Text color="gray">Compliant Nominees: </Text>
            <Text color={election.compliantNomineeCount >= election.targetNomineeCount ? "green" : "yellow"}>
              {election.compliantNomineeCount}/{election.targetNomineeCount}
            </Text>
          </Box>
          {election.isInVettingPeriod && (
            <Box><Text color="cyan">In vetting period until block {election.vettingDeadline}</Text></Box>
          )}
          {election.canProceedToMemberPhase && (
            <Box><Text color="green">Ready to trigger member election!</Text></Box>
          )}
        </Box>
      )}
    </Box>
  );
}

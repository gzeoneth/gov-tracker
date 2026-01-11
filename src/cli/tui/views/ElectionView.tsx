/**
 * Security Council Election Status View
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import { useState, useEffect } from "react";
import type { UseNavigationResult } from "../hooks/index.js";
import type { ProviderBundle } from "../../lib/cli.js";
import { ViewLayout } from "../components/ViewLayout.js";
import type { ElectionStatus, ElectionProposalStatus } from "../../../types/index.js";
import { useElectionData } from "../hooks/useElectionData.js";

interface ElectionViewProps {
  navigation: UseNavigationResult;
  providers?: ProviderBundle;
}

const PHASE_DISPLAY: Record<string, { icon: string; iconColor: string; labelColor: string }> = {
  COMPLETED: { icon: "✓", iconColor: "green", labelColor: "green" },
  MEMBER_ELECTION: { icon: "●", iconColor: "yellow", labelColor: "yellow" },
  NOMINEE_SELECTION: { icon: "●", iconColor: "yellow", labelColor: "yellow" },
  VETTING_PERIOD: { icon: "◐", iconColor: "cyan", labelColor: "yellow" },
  PENDING_EXECUTION: { icon: "→", iconColor: "magenta", labelColor: "yellow" },
  NOT_STARTED: { icon: "○", iconColor: "gray", labelColor: "gray" },
};

const DEFAULT_PHASE_DISPLAY = { icon: "○", iconColor: "gray", labelColor: "yellow" };

function getPhaseDisplay(phase: string): { icon: string; iconColor: string; labelColor: string } {
  return PHASE_DISPLAY[phase] ?? DEFAULT_PHASE_DISPLAY;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function ElectionView({ navigation, providers }: ElectionViewProps): React.ReactElement {
  const data = useElectionData(providers);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [data.proposals.length]);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
      return;
    }
    if (input === "?") {
      navigation.goToHelp();
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (input === "g") {
      setSelectedIndex(0);
      return;
    }
    if (data.proposals.length === 0) return;

    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(data.proposals.length - 1, prev + 1));
    } else if (input === "G") {
      setSelectedIndex(data.proposals.length - 1);
    }
  });

  const { status, proposals, warning } = data;

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
      {warning && (
        <Box marginBottom={1}>
          <Text color="yellow">[Warning] {warning}</Text>
        </Box>
      )}
      {status && <ElectionStatusSection status={status} />}
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

interface ElectionStatusSectionProps {
  status: ElectionStatus;
}

function ElectionStatusSection({ status }: ElectionStatusSectionProps): React.ReactElement {
  return (
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
  );
}

interface ElectionItemProps {
  election: ElectionProposalStatus;
  isSelected: boolean;
}

function ElectionItem({ election, isSelected }: ElectionItemProps): React.ReactElement {
  const phaseDisplay = getPhaseDisplay(election.phase);

  return (
    <Box marginLeft={1} flexDirection="column">
      <Box>
        <Text color={isSelected ? "cyan" : undefined}>{isSelected ? "> " : "  "}</Text>
        <Text color={phaseDisplay.iconColor}>{phaseDisplay.icon}</Text>
        <Text> </Text>
        <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>Election #{election.electionIndex}</Text>
        <Text color="gray"> - </Text>
        <Text color={phaseDisplay.labelColor}>{election.phase.replace(/_/g, " ")}</Text>
      </Box>
      {isSelected && <ElectionItemDetails election={election} />}
    </Box>
  );
}

interface ElectionItemDetailsProps {
  election: ElectionProposalStatus;
}

function ElectionItemDetails({ election }: ElectionItemDetailsProps): React.ReactElement {
  const nomineeCountColor = election.compliantNomineeCount >= election.targetNomineeCount ? "green" : "yellow";

  return (
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
        <Text color={nomineeCountColor}>{election.compliantNomineeCount}/{election.targetNomineeCount}</Text>
      </Box>
      {election.isInVettingPeriod && (
        <Box><Text color="cyan">In vetting period until block {election.vettingDeadline}</Text></Box>
      )}
      {election.canProceedToMemberPhase && (
        <Box><Text color="green">Ready to trigger member election!</Text></Box>
      )}
    </Box>
  );
}

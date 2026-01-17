/**
 * Security Council Election Status View (cache-only)
 */

import { React, Box, Text, useInput, KeyInput, useState, useEffect, useMemo } from "../ink-wrapper.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import {
  getVisibleRows,
  getNavigationAction,
  applyNavigation,
} from "../utils/index.js";
import type { ElectionStatus, ElectionProposalStatus } from "../../../types/index.js";
import { useElectionData } from "../hooks/useElectionData.js";
import { getTxUrl, CHAIN_IDS } from "../../../constants.js";
import { formatDate, ELECTION_PHASE_COLORS, ELECTION_PHASE_ICONS } from "../utils/index.js";

interface ElectionViewProps {
  navigation: UseNavigationResult;
  cachePath?: string;
}

interface DisplayLine {
  text: string;
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
}



function buildStatusLines(status: ElectionStatus): DisplayLine[] {
  const lines: DisplayLine[] = [];
  const cohortName = status.cohort === 0 ? "FIRST" : "SECOND";

  lines.push({ text: "Security Council Election Status", bold: true });
  lines.push({ text: `  Election Count: ${status.electionCount}` });
  lines.push({ text: `  Current Cohort: ${cohortName}`, color: status.cohort === 0 ? "cyan" : "magenta" });
  lines.push({ text: `  Can Create: ${status.canCreateElection ? "Yes" : "No"}`, color: status.canCreateElection ? "green" : "gray" });

  if (!status.canCreateElection && status.nextElectionTimestamp > 0) {
    lines.push({ text: `  Next Election: ${formatDate(status.nextElectionTimestamp * 1000)} (${status.timeUntilElection})` });
  }

  lines.push({ text: "" });
  return lines;
}

function buildListLines(proposals: ElectionProposalStatus[], selectedIndex: number): DisplayLine[] {
  const lines: DisplayLine[] = [];

  for (let i = 0; i < proposals.length; i++) {
    const election = proposals[i];
    const isSelected = i === selectedIndex;
    const icon = ELECTION_PHASE_ICONS[election.phase] ?? "○";
    const phaseColor = ELECTION_PHASE_COLORS[election.phase] ?? "gray";
    const prefix = isSelected ? "> " : "  ";
    const phaseName = election.phase.replace(/_/g, " ");
    const cohortName = election.cohort === 0 ? "First" : "Second";

    lines.push({
      text: `${prefix}${icon} Election #${election.electionIndex} (${cohortName} Cohort) - ${phaseName}`,
      color: isSelected ? "cyan" : phaseColor,
      bold: isSelected,
    });

    if (isSelected) {
      if (election.creationTxHash) {
        lines.push({ text: `      Created: ${election.creationTxHash.slice(0, 18)}...`, color: "gray" });
      }

      const nomineeColor = election.compliantNomineeCount >= election.targetNomineeCount ? "green" : "yellow";
      lines.push({
        text: `      Compliant Nominees: ${election.compliantNomineeCount}/${election.targetNomineeCount}`,
        color: nomineeColor,
      });

      if (election.isInVettingPeriod) {
        lines.push({ text: `      In vetting period until block ${election.vettingDeadline}`, color: "cyan" });
      }
      if (election.canProceedToMemberPhase) {
        lines.push({ text: "      Ready to trigger member election!", color: "green" });
      }
      if (election.canExecuteMember) {
        lines.push({ text: "      Ready to execute member election!", color: "green" });
      }
    }
  }

  return lines;
}

function buildDetailLines(election: ElectionProposalStatus): DisplayLine[] {
  const lines: DisplayLine[] = [];
  const icon = ELECTION_PHASE_ICONS[election.phase] ?? "○";
  const phaseColor = ELECTION_PHASE_COLORS[election.phase] ?? "gray";
  const phaseName = election.phase.replace(/_/g, " ");
  const cohortName = election.cohort === 0 ? "FIRST" : "SECOND";

  lines.push({ text: `${icon} Election #${election.electionIndex} - ${phaseName}`, color: phaseColor, bold: true });
  lines.push({ text: "" });
  lines.push({ text: `  Cohort: ${cohortName}` });
  lines.push({ text: `  Compliant Nominees: ${election.compliantNomineeCount}/${election.targetNomineeCount}` });

  if (election.creationTxHash) {
    lines.push({ text: "" });
    lines.push({ text: `  Created: ${election.creationTxHash}`, dimColor: true });
    lines.push({ text: `    ${getTxUrl(CHAIN_IDS.ARB_ONE, election.creationTxHash)}`, color: "blue" });
  }
  if (election.nomineeExecuteTxHash) {
    lines.push({ text: `  Nominee Executed: ${election.nomineeExecuteTxHash}`, dimColor: true });
    lines.push({ text: `    ${getTxUrl(CHAIN_IDS.ARB_ONE, election.nomineeExecuteTxHash)}`, color: "blue" });
  }
  if (election.memberExecuteTxHash) {
    lines.push({ text: `  Member Executed: ${election.memberExecuteTxHash}`, dimColor: true });
    lines.push({ text: `    ${getTxUrl(CHAIN_IDS.ARB_ONE, election.memberExecuteTxHash)}`, color: "blue" });
  }
  if (election.timelockOperationId) {
    lines.push({ text: `  Timelock Op: ${election.timelockOperationId}`, dimColor: true });
  }

  if (election.nomineeProposalId) {
    lines.push({ text: "" });
    lines.push({ text: "  Nominee Phase", color: "cyan", bold: true });
    lines.push({ text: `    Proposal State: ${election.nomineeProposalState}` });
  }

  if (election.memberProposalId) {
    lines.push({ text: "" });
    lines.push({ text: "  Member Phase", color: "magenta", bold: true });
    lines.push({ text: `    Proposal State: ${election.memberProposalState}` });
  }

  if (election.stages && election.stages.length > 0) {
    lines.push({ text: "" });
    lines.push({ text: "  Stage Progress", color: "blue", bold: true });
    for (const stage of election.stages) {
      const stageIcon = stage.status === "COMPLETED" ? "✓" : stage.status === "READY" ? "●" : "○";
      const color = stage.status === "COMPLETED" ? "green" : stage.status === "READY" ? "yellow" : "gray";
      const stageName = stage.type.replace(/_/g, " ");
      lines.push({ text: `    ${stageIcon} ${stageName}: ${stage.status}`, color });
    }
  }

  lines.push({ text: "" });
  lines.push({ text: "  (Run 'gov-tracker run --track-elections' for live data)", color: "gray" });

  return lines;
}

const RESERVED_LINES = 8;

export function ElectionView({ navigation, cachePath }: ElectionViewProps): React.ReactElement {
  const { state } = navigation;
  const electionData = useElectionData({ cachePath });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setSelectedIndex(0);
    setShowDetails(false);
    navigation.goToTop();
  }, [electionData.proposals.length, navigation]);

  const selectedElection = electionData.proposals[selectedIndex];

  const lines = useMemo(() => {
    const result: DisplayLine[] = [];

    if (electionData.status) {
      result.push(...buildStatusLines(electionData.status));
    }

    const headerText = showDetails ? "Election Details • Press b to go back" : "Recent Elections • Press Enter for details";
    result.push({ text: headerText, bold: true });
    result.push({ text: "" });

    if (electionData.proposals.length === 0) {
      result.push({ text: "  No elections in cache.", color: "gray" });
      result.push({ text: "  Run 'gov-tracker run --track-elections' to populate.", color: "gray" });
    } else if (showDetails && selectedElection) {
      result.push(...buildDetailLines(selectedElection));
    } else {
      result.push(...buildListLines(electionData.proposals, selectedIndex));
    }

    return result;
  }, [electionData.status, electionData.proposals, selectedIndex, showDetails, selectedElection]);

  const visibleCount = getVisibleRows(RESERVED_LINES);
  const visibleLines = lines.slice(state.scrollOffset, state.scrollOffset + visibleCount);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      if (showDetails) {
        setShowDetails(false);
        navigation.goToTop();
      } else {
        navigation.back();
      }
      return;
    }

    if (input === "?") {
      navigation.goToHelp();
      return;
    }

    const action = getNavigationAction(input, key);

    if (showDetails) {
      const maxOffset = Math.max(0, lines.length - visibleCount);
      if (action) navigation.setScrollOffset(applyNavigation(state.scrollOffset, action, maxOffset));
      return;
    }

    if (electionData.proposals.length === 0) return;

    const maxIndex = electionData.proposals.length - 1;
    if (action) {
      setSelectedIndex((prev) => applyNavigation(prev, action, maxIndex));
      return;
    }

    if ((key.return || input === "l") && selectedElection) {
      setShowDetails(true);
      navigation.goToTop();
    }
  });

  return (
    <ViewLayout view="election" loading={electionData.loading} loadingText="Loading elections..." error={electionData.error}>
      {electionData.warning && (
        <Box marginBottom={1}>
          <Text color="yellow">[Warning] {electionData.warning}</Text>
        </Box>
      )}

      {lines.length > visibleCount && (
        <Box marginBottom={1}>
          <ScrollPosition scrollOffset={state.scrollOffset} visibleRows={visibleCount} totalItems={lines.length} />
        </Box>
      )}

      <ScrollIndicatorTop scrollOffset={state.scrollOffset} unit="lines" />

      {visibleLines.map((line, i) => (
        <Text key={i} color={line.color} bold={line.bold} dimColor={line.dimColor}>
          {line.text}
        </Text>
      ))}

      <ScrollIndicatorBottom scrollOffset={state.scrollOffset} visibleRows={visibleCount} totalItems={lines.length} unit="lines" />
    </ViewLayout>
  );
}

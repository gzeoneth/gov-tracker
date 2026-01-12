/**
 * Security Council Election Status View
 */

import { React, Box, Text, useInput, KeyInput, useState, useEffect, useMemo } from "../ink-wrapper.js";
import type { UseNavigationResult } from "../hooks/index.js";
import type { ProviderBundle } from "../../lib/cli.js";
import { ViewLayout } from "../components/ViewLayout.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import { getVisibleRows } from "../utils/index.js";
import type {
  ElectionStatus,
  ElectionProposalStatus,
  NomineeElectionDetails,
  MemberElectionDetails,
} from "../../../types/index.js";
import { useElectionData } from "../hooks/useElectionData.js";
import { useElectionDetails } from "../hooks/useElectionDetails.js";

interface ElectionViewProps {
  navigation: UseNavigationResult;
  providers?: ProviderBundle;
}

interface DisplayLine {
  text: string;
  color?: string;
  bold?: boolean;
  dimColor?: boolean;
}

const PHASE_COLORS: Record<string, string> = {
  COMPLETED: "green",
  MEMBER_ELECTION: "yellow",
  NOMINEE_SELECTION: "yellow",
  VETTING_PERIOD: "cyan",
  PENDING_EXECUTION: "magenta",
  NOT_STARTED: "gray",
};

const PHASE_ICONS: Record<string, string> = {
  COMPLETED: "✓",
  MEMBER_ELECTION: "●",
  NOMINEE_SELECTION: "●",
  VETTING_PERIOD: "◐",
  PENDING_EXECUTION: "→",
  NOT_STARTED: "○",
};

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

function formatVotes(votes: { toString(): string }): string {
  const str = votes.toString();
  const WEI_DECIMALS = 18;
  if (str.length <= WEI_DECIMALS) return str;
  const intPart = str.slice(0, str.length - WEI_DECIMALS);
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function buildStatusLines(status: ElectionStatus): DisplayLine[] {
  const lines: DisplayLine[] = [];
  const cohortName = status.cohort === 0 ? "FIRST" : "SECOND";

  lines.push({ text: "Security Council Election Status", bold: true });
  lines.push({ text: `  Election Count: ${status.electionCount}` });
  lines.push({ text: `  Current Cohort: ${cohortName}`, color: status.cohort === 0 ? "cyan" : "magenta" });
  lines.push({ text: `  Can Create: ${status.canCreateElection ? "Yes" : "No"}`, color: status.canCreateElection ? "green" : "gray" });

  if (!status.canCreateElection) {
    lines.push({ text: `  Next Election: ${formatTimestamp(status.nextElectionTimestamp)} (${status.timeUntilElection})` });
  }

  lines.push({ text: "" });
  return lines;
}

function buildListLines(
  proposals: ElectionProposalStatus[],
  selectedIndex: number
): DisplayLine[] {
  const lines: DisplayLine[] = [];

  for (let i = 0; i < proposals.length; i++) {
    const election = proposals[i];
    const isSelected = i === selectedIndex;
    const icon = PHASE_ICONS[election.phase] ?? "○";
    const phaseColor = PHASE_COLORS[election.phase] ?? "gray";
    const prefix = isSelected ? "> " : "  ";
    const phaseName = election.phase.replace(/_/g, " ");

    lines.push({
      text: `${prefix}${icon} Election #${election.electionIndex} - ${phaseName}`,
      color: isSelected ? "cyan" : phaseColor,
      bold: isSelected,
    });

    if (isSelected) {
      const cohortName = election.cohort === 0 ? "FIRST" : "SECOND";
      lines.push({ text: `      Cohort: ${cohortName}`, color: "gray" });

      if (election.nomineeProposalId) {
        lines.push({ text: `      Nominee State: ${election.nomineeProposalState}`, color: "gray" });
      }
      if (election.memberProposalId) {
        lines.push({ text: `      Member State: ${election.memberProposalState}`, color: "gray" });
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

function buildDetailLines(
  election: ElectionProposalStatus,
  nomineeDetails: NomineeElectionDetails | null,
  memberDetails: MemberElectionDetails | null
): DisplayLine[] {
  const lines: DisplayLine[] = [];
  const icon = PHASE_ICONS[election.phase] ?? "○";
  const phaseColor = PHASE_COLORS[election.phase] ?? "gray";
  const phaseName = election.phase.replace(/_/g, " ");
  const cohortName = election.cohort === 0 ? "FIRST" : "SECOND";

  lines.push({ text: `${icon} Election #${election.electionIndex} - ${phaseName}`, color: phaseColor, bold: true });
  lines.push({ text: "" });
  lines.push({ text: `  Cohort: ${cohortName}` });

  if (election.nomineeProposalId) {
    lines.push({ text: `  Nominee Proposal ID: ${election.nomineeProposalId}`, dimColor: true });
  }
  if (election.memberProposalId) {
    lines.push({ text: `  Member Proposal ID: ${election.memberProposalId}`, dimColor: true });
  }

  if (nomineeDetails) {
    lines.push({ text: "" });
    lines.push({ text: "  ── Nominee Phase ──", color: "cyan", bold: true });
    lines.push({ text: `     Quorum: ${formatVotes(nomineeDetails.quorumThreshold)} votes` });
    lines.push({ text: `     Target: ${nomineeDetails.targetNomineeCount} nominees needed` });

    if (nomineeDetails.contenders.length > 0) {
      lines.push({ text: "" });
      lines.push({ text: `     Contenders (${nomineeDetails.contenders.length})`, color: "yellow" });
      for (const contender of nomineeDetails.contenders.slice(0, 10)) {
        lines.push({ text: `       ${contender.address}  (block ${contender.registeredAtBlock})`, color: "gray" });
      }
      if (nomineeDetails.contenders.length > 10) {
        lines.push({ text: `       ... and ${nomineeDetails.contenders.length - 10} more`, color: "gray" });
      }
    }

    if (nomineeDetails.compliantNominees.length > 0) {
      lines.push({ text: "" });
      lines.push({ text: `     Qualified Nominees (${nomineeDetails.compliantNominees.length})`, color: "green" });
      for (const nominee of nomineeDetails.compliantNominees.slice(0, 10)) {
        lines.push({ text: `       ${nominee.address}  ${formatVotes(nominee.votesReceived)} votes`, color: "gray" });
      }
      if (nomineeDetails.compliantNominees.length > 10) {
        lines.push({ text: `       ... and ${nomineeDetails.compliantNominees.length - 10} more`, color: "gray" });
      }
    }

    if (nomineeDetails.excludedNominees.length > 0) {
      lines.push({ text: "" });
      lines.push({ text: `     Excluded (${nomineeDetails.excludedNominees.length})`, color: "red" });
      for (const nominee of nomineeDetails.excludedNominees.slice(0, 5)) {
        lines.push({ text: `       ${nominee.address}  (excluded)`, color: "gray" });
      }
      if (nomineeDetails.excludedNominees.length > 5) {
        lines.push({ text: `       ... and ${nomineeDetails.excludedNominees.length - 5} more`, color: "gray" });
      }
    }
  }

  if (memberDetails) {
    lines.push({ text: "" });
    lines.push({ text: "  ── Member Phase ──", color: "magenta", bold: true });
    lines.push({ text: `     Full Weight Deadline: block ${memberDetails.fullWeightDeadline}` });
    lines.push({ text: `     Proposal Deadline: block ${memberDetails.proposalDeadline}` });

    if (memberDetails.nominees.length > 0) {
      lines.push({ text: "" });
      lines.push({ text: `     Candidates by Weight (${memberDetails.nominees.length})`, color: "yellow" });
      for (const nominee of memberDetails.nominees.slice(0, 12)) {
        const rank = `#${nominee.rank.toString().padStart(2)}`;
        const winner = nominee.isWinner ? " [WINNER]" : "";
        const color = nominee.isWinner ? "green" : "gray";
        lines.push({ text: `       ${rank} ${nominee.address}  ${formatVotes(nominee.weightReceived)}${winner}`, color });
      }
      if (memberDetails.nominees.length > 12) {
        lines.push({ text: `       ... and ${memberDetails.nominees.length - 12} more`, color: "gray" });
      }
    }

    if (memberDetails.winners.length > 0) {
      lines.push({ text: "" });
      lines.push({ text: `     Elected Members (${memberDetails.winners.length})`, color: "green" });
      for (const winner of memberDetails.winners) {
        lines.push({ text: `       ✓ ${winner}`, color: "green" });
      }
    }
  }

  return lines;
}

const RESERVED_LINES = 8;
const PAGE_SIZE = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type NavigationAction = "up" | "down" | "pageUp" | "pageDown" | "top" | "bottom" | null;

function getNavigationAction(input: string, key: KeyInput): NavigationAction {
  if (key.upArrow || input === "k") return "up";
  if (key.downArrow || input === "j") return "down";
  if (key.pageUp || (key.ctrl && input === "u")) return "pageUp";
  if (key.pageDown || (key.ctrl && input === "d")) return "pageDown";
  if (input === "g") return "top";
  if (input === "G") return "bottom";
  return null;
}

function applyNavigation(current: number, action: NavigationAction, max: number): number {
  switch (action) {
    case "up": return clamp(current - 1, 0, max);
    case "down": return clamp(current + 1, 0, max);
    case "pageUp": return clamp(current - PAGE_SIZE, 0, max);
    case "pageDown": return clamp(current + PAGE_SIZE, 0, max);
    case "top": return 0;
    case "bottom": return max;
    default: return current;
  }
}

export function ElectionView({ navigation, providers }: ElectionViewProps): React.ReactElement {
  const data = useElectionData(providers);
  const { details, loadDetails, clearDetails } = useElectionDetails(providers);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
    setShowDetails(false);
    setScrollOffset(0);
    clearDetails();
  }, [data.proposals.length, clearDetails]);

  const selectedElection = data.proposals[selectedIndex];

  const lines = useMemo(() => {
    const result: DisplayLine[] = [];
    const selected = data.proposals[selectedIndex];

    if (data.status) {
      result.push(...buildStatusLines(data.status));
    }

    const headerText = showDetails ? "Recent Elections • Press b to go back" : "Recent Elections • Press Enter for details";
    result.push({ text: headerText, bold: true });
    result.push({ text: "" });

    if (data.proposals.length === 0) {
      result.push({ text: "  No elections found", color: "gray" });
    } else if (showDetails && selected) {
      if (details.loading) {
        result.push({ text: "  Loading election details...", color: "cyan" });
      } else if (details.error) {
        result.push({ text: `  Error: ${details.error}`, color: "red" });
      } else {
        result.push(...buildDetailLines(selected, details.nomineeDetails, details.memberDetails));
      }
    } else {
      result.push(...buildListLines(data.proposals, selectedIndex));
    }

    return result;
  }, [data.status, data.proposals, selectedIndex, showDetails, details]);

  const visibleCount = getVisibleRows(RESERVED_LINES);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + visibleCount);
  const hasMore = scrollOffset + visibleCount < lines.length;
  const hasLess = scrollOffset > 0;

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      if (showDetails) {
        setShowDetails(false);
        setScrollOffset(0);
        clearDetails();
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
      if (action) {
        setScrollOffset((prev) => applyNavigation(prev, action, maxOffset));
      }
      return;
    }

    if (data.proposals.length === 0) return;

    const maxIndex = data.proposals.length - 1;
    if (action) {
      setSelectedIndex((prev) => applyNavigation(prev, action, maxIndex));
      return;
    }

    if ((key.return || input === "l") && selectedElection && providers) {
      setShowDetails(true);
      setScrollOffset(0);
      loadDetails(selectedElection.electionIndex);
    }
  });

  return (
    <ViewLayout
      view="election"
      hasProviders={!!providers}
      isTracking={data.loading || details.loading}
      loading={data.loading}
      loadingText="Loading election status..."
      skeletonType="detail"
      error={data.error}
    >
      {data.warning && (
        <Box marginBottom={1}>
          <Text color="yellow">[Warning] {data.warning}</Text>
        </Box>
      )}

      {lines.length > visibleCount && (
        <Box marginBottom={1}>
          <ScrollPosition
            scrollOffset={scrollOffset}
            visibleRows={visibleCount}
            totalItems={lines.length}
          />
        </Box>
      )}

      {hasLess && <ScrollIndicatorTop scrollOffset={scrollOffset} unit="lines" />}

      {visibleLines.map((line, i) => (
        <Text
          key={i}
          color={line.color}
          bold={line.bold}
          dimColor={line.dimColor}
        >
          {line.text}
        </Text>
      ))}

      {hasMore && (
        <ScrollIndicatorBottom
          scrollOffset={scrollOffset}
          visibleRows={visibleCount}
          totalItems={lines.length}
          unit="lines"
        />
      )}
    </ViewLayout>
  );
}

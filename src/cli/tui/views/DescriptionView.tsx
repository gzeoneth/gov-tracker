/**
 * Full proposal description view with markdown rendering
 */

import { React, Box, Text, useMemo } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { useScrollableInput } from "../hooks/useScrollableInput.js";
import { ViewLayout } from "../components/ViewLayout.js";
import { ScrollIndicatorTop, ScrollIndicatorBottom, ScrollPosition } from "../components/ScrollIndicator.js";
import { getVisibleRows, parseMarkdown, getStages, buildBreadcrumb } from "../utils/index.js";
import type { MarkdownLine } from "../utils/index.js";

interface DescriptionViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

function getDescription(proposal: ProposalListItem): string {
  const stages = getStages(proposal);
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");
  if (createdStage?.type === "PROPOSAL_CREATED") {
    return createdStage.data.description ?? "No description available";
  }
  return "No description available";
}

const RESERVED_LINES = 8;

function FormattedLine({ line }: { line: MarkdownLine }): React.ReactElement {
  const indent = " ".repeat(line.indent);
  switch (line.type) {
    case "h1":
      return <Text bold color="cyan">{indent}═ {line.text}</Text>;
    case "h2":
      return <Text bold color="yellow">{indent}▶ {line.text}</Text>;
    case "h3":
      return <Text bold>{indent}• {line.text}</Text>;
    case "bullet":
      return <Text>{indent}• {line.text}</Text>;
    case "separator":
      return <Text color="gray">{line.text}</Text>;
    default:
      return <Text>{indent}{line.text}</Text>;
  }
}

export function DescriptionView({ proposal, navigation }: DescriptionViewProps): React.ReactElement {
  const { state } = navigation;
  const description = getDescription(proposal);
  const terminalWidth = process.stdout.columns || 80;
  const lines = useMemo(() => parseMarkdown(description, terminalWidth - 4), [description, terminalWidth]);
  const visibleCount = getVisibleRows(RESERVED_LINES);
  const visibleLines = lines.slice(state.scrollOffset, state.scrollOffset + visibleCount);

  useScrollableInput({
    navigation,
    itemCount: lines.length,
    extraHandlers: (input) => {
      if (input === "?") {
        navigation.goToHelp();
        return true;
      }
      return false;
    },
  });

  return (
    <ViewLayout view="description" title="Proposal Description" breadcrumb={buildBreadcrumb(proposal, "Description")}>
      {lines.length > visibleCount && (
        <Box marginBottom={1}>
          <ScrollPosition scrollOffset={state.scrollOffset} visibleRows={visibleCount} totalItems={lines.length} />
        </Box>
      )}
      <ScrollIndicatorTop scrollOffset={state.scrollOffset} unit="lines" />
      {visibleLines.map((line, i) => (
        <FormattedLine key={i} line={line} />
      ))}
      <ScrollIndicatorBottom scrollOffset={state.scrollOffset} visibleRows={visibleCount} totalItems={lines.length} unit="lines" />
    </ViewLayout>
  );
}

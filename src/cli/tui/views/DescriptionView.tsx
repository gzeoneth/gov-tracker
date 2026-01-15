/**
 * Full proposal description view with markdown rendering
 */

import { React, Box, Text, useInput, KeyInput, useMemo } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import { getVisibleRows, parseMarkdown } from "../utils/index.js";
import type { MarkdownLine } from "../utils/index.js";

interface DescriptionViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

function getDescription(proposal: ProposalListItem): string {
  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const createdStage = stages.find((s) => s.type === "PROPOSAL_CREATED");

  if (createdStage?.data) {
    const data = createdStage.data as { description?: string };
    if (data.description) {
      return data.description;
    }
  }

  return "No description available";
}

const RESERVED_LINES = 8;

function FormattedLineComponent({ line }: { line: MarkdownLine }): React.ReactElement {
  const indent = " ".repeat(line.indent);

  switch (line.type) {
    case "h1":
      return (
        <Text bold color="cyan">
          {indent}═ {line.text}
        </Text>
      );
    case "h2":
      return (
        <Text bold color="yellow">
          {indent}▶ {line.text}
        </Text>
      );
    case "h3":
      return (
        <Text bold>
          {indent}• {line.text}
        </Text>
      );
    case "bullet":
      return (
        <Text>
          {indent}• {line.text}
        </Text>
      );
    case "separator":
      return <Text color="gray">{line.text}</Text>;
    default:
      return <Text>{indent}{line.text}</Text>;
  }
}

export function DescriptionView({
  proposal,
  navigation,
}: DescriptionViewProps): React.ReactElement {
  const { state } = navigation;
  const description = getDescription(proposal);
  const terminalWidth = process.stdout.columns || 80;
  const lines = useMemo(
    () => parseMarkdown(description, terminalWidth - 4),
    [description, terminalWidth]
  );
  const visibleCount = getVisibleRows(RESERVED_LINES);
  const visibleLines = lines.slice(state.scrollOffset, state.scrollOffset + visibleCount);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow || input === "k") {
      navigation.moveUp();
    } else if (key.downArrow || input === "j") {
      navigation.moveDown(lines.length);
    } else if (key.pageUp || (key.ctrl && input === "u")) {
      navigation.pageUp(lines.length);
    } else if (key.pageDown || (key.ctrl && input === "d")) {
      navigation.pageDown(lines.length);
    } else if (input === "g") {
      navigation.goToTop();
    } else if (input === "G") {
      navigation.goToBottom(lines.length);
    } else if (input === "?") {
      navigation.goToHelp();
    }
  });

  const shortTitle = proposal.title.length > 30
    ? proposal.title.substring(0, 30) + "..."
    : proposal.title;

  const breadcrumb = ["Proposals", shortTitle, "Description"];

  return (
    <ViewLayout view="description" title="Proposal Description" breadcrumb={breadcrumb}>
      {lines.length > visibleCount && (
        <Box marginBottom={1}>
          <ScrollPosition
            scrollOffset={state.scrollOffset}
            visibleRows={visibleCount}
            totalItems={lines.length}
          />
        </Box>
      )}
      <ScrollIndicatorTop scrollOffset={state.scrollOffset} unit="lines" />
      {visibleLines.map((line, i) => (
        <FormattedLineComponent key={i} line={line} />
      ))}
      <ScrollIndicatorBottom
        scrollOffset={state.scrollOffset}
        visibleRows={visibleCount}
        totalItems={lines.length}
        unit="lines"
      />
    </ViewLayout>
  );
}

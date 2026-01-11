/**
 * Full proposal description view with markdown rendering
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import { getVisibleRows } from "../utils/index.js";

interface DescriptionViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

interface FormattedLine {
  text: string;
  type: "normal" | "h1" | "h2" | "h3" | "bullet" | "link" | "code" | "separator";
  indent: number;
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

function parseMarkdown(text: string, width: number): FormattedLine[] {
  const result: FormattedLine[] = [];
  const lines = text.split("\n");
  // Guard against very narrow terminals
  const safeWidth = Math.max(20, width);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Empty line
    if (trimmed.length === 0) {
      result.push({ text: "", type: "normal", indent: 0 });
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      result.push({ text: "─".repeat(Math.min(safeWidth - 4, 60)), type: "separator", indent: 0 });
      continue;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      result.push({ text: trimmed.slice(4), type: "h3", indent: 0 });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      result.push({ text: trimmed.slice(3), type: "h2", indent: 0 });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      result.push({ text: trimmed.slice(2), type: "h1", indent: 0 });
      continue;
    }

    // Bullet points
    if (/^[-*+] /.test(trimmed)) {
      const bulletText = trimmed.slice(2);
      wrapTextToLines(bulletText, safeWidth - 6, "bullet", 2, result);
      continue;
    }

    // Numbered lists
    if (/^\d+\. /.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\. /);
      if (match) {
        const numText = trimmed.slice(match[0].length);
        const textWidth = safeWidth - 6;
        result.push({ text: `${match[1]}. ${numText.slice(0, textWidth)}`, type: "bullet", indent: 0 });
        if (numText.length > textWidth) {
          wrapTextToLines(numText.slice(textWidth), textWidth, "normal", 3, result);
        }
        continue;
      }
    }

    // Code blocks (just show as-is with code styling)
    if (trimmed.startsWith("```")) {
      continue; // Skip code fence markers
    }

    // Links - simplify [text](url) to just text
    const processedLine = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Normal paragraph
    wrapTextToLines(processedLine, safeWidth - 4, "normal", 0, result);
  }

  return result;
}

function wrapTextToLines(
  text: string,
  width: number,
  type: FormattedLine["type"],
  indent: number,
  result: FormattedLine[]
): void {
  const safeWidth = Math.max(10, width);
  const words = text.split(/\s+/);
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= safeWidth) {
      currentLine += " " + word;
    } else {
      result.push({ text: currentLine, type, indent });
      currentLine = word;
      // Continuation lines of bullets get extra indent
      if (type === "bullet" && indent === 2) {
        indent = 4;
      }
    }
  }

  if (currentLine.length > 0) {
    result.push({ text: currentLine, type, indent });
  }
}

const RESERVED_LINES = 8;

function FormattedLineComponent({ line }: { line: FormattedLine }): React.ReactElement {
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
  const lines = parseMarkdown(description, terminalWidth - 4);
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

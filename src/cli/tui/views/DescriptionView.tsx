/**
 * Full proposal description view with markdown rendering
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper";
import type { ProposalListItem } from "../types";
import type { UseNavigationResult } from "../hooks";
import { Header } from "../components/Header";
import { KeyHelp } from "../components/KeyHelp";

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

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Empty line
    if (trimmed.length === 0) {
      result.push({ text: "", type: "normal", indent: 0 });
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      result.push({ text: "─".repeat(Math.min(width - 4, 60)), type: "separator", indent: 0 });
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
      wrapTextToLines(bulletText, width - 6, "bullet", 2, result);
      continue;
    }

    // Numbered lists
    if (/^\d+\. /.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\. /);
      if (match) {
        const numText = trimmed.slice(match[0].length);
        result.push({ text: `${match[1]}. ${numText.slice(0, width - 6)}`, type: "bullet", indent: 0 });
        if (numText.length > width - 6) {
          wrapTextToLines(numText.slice(width - 6), width - 6, "normal", 3, result);
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
    wrapTextToLines(processedLine, width - 4, "normal", 0, result);
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
  const words = text.split(/\s+/);
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= width) {
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

const VISIBLE_LINES = 20;

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

  const visibleLines = lines.slice(state.scrollOffset, state.scrollOffset + VISIBLE_LINES);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow) {
      navigation.moveUp();
    } else if (key.downArrow) {
      navigation.moveDown(lines.length);
    } else if (key.pageUp) {
      navigation.pageUp(lines.length);
    } else if (key.pageDown) {
      navigation.pageDown(lines.length);
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <Header
        view="description"
        filter={state.filter}
        stats={null}
        hasProviders={false}
        isTracking={false}
        title="Proposal Description"
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {state.scrollOffset > 0 && (
          <Text color="gray">↑ {state.scrollOffset} lines above</Text>
        )}
        {visibleLines.map((line, i) => (
          <FormattedLineComponent key={i} line={line} />
        ))}
        {state.scrollOffset + VISIBLE_LINES < lines.length && (
          <Text color="gray">
            ↓ {lines.length - state.scrollOffset - VISIBLE_LINES} lines below
          </Text>
        )}
      </Box>

      <KeyHelp view="description" hasProviders={false} />
    </Box>
  );
}

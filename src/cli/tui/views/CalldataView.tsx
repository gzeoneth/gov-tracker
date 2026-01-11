/**
 * Decoded calldata view with foldable long values (no truncation)
 */

import { React, useState, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { useStageCalldata } from "../hooks/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import type { DecodedCalldata, DecodedParameter } from "../../../types/calldata.js";

interface CalldataViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

interface FormattedLine {
  text: string;
  indent: number;
  foldable: boolean;
  foldKey?: string;
  foldedLineCount?: number;
  isFoldedContent?: boolean;
}

const FOLD_THRESHOLD = 100;

function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    lines.push(text.slice(i, i + width));
  }
  return lines;
}

function formatParameter(
  param: DecodedParameter,
  indent: number,
  keyPrefix: string
): FormattedLine[] {
  const lines: FormattedLine[] = [];
  const foldKey = `${keyPrefix}-${param.name}`;

  let value = param.displayValue;
  if (param.addressLabel) {
    value = `${param.displayValue} [${param.addressLabel}]`;
  }

  const isFoldable = value.length > FOLD_THRESHOLD;
  const wrappedLines = isFoldable ? wrapText(value, 80) : [value];

  lines.push({
    text: `${param.name} (${param.type}): ${wrappedLines[0]}`,
    indent,
    foldable: isFoldable,
    foldKey: isFoldable ? foldKey : undefined,
    foldedLineCount: isFoldable ? wrappedLines.length - 1 : undefined,
  });

  if (isFoldable && wrappedLines.length > 1) {
    for (let i = 1; i < wrappedLines.length; i++) {
      lines.push({
        text: wrappedLines[i],
        indent: indent + 1,
        foldable: false,
        isFoldedContent: true,
        foldKey,
      });
    }
  }

  if (param.nested) {
    lines.push({ text: "└─ [NESTED]", indent: indent + 1, foldable: false });
    lines.push(...formatDecodedCalldata(param.nested, indent + 2, `${foldKey}-nested`));
  }

  if (param.nestedArray && param.nestedArray.length > 0) {
    param.nestedArray.forEach((nested, i) => {
      lines.push({ text: `[${i}]:`, indent: indent + 1, foldable: false });
      lines.push(...formatDecodedCalldata(nested, indent + 2, `${foldKey}-arr-${i}`));
    });
  }

  return lines;
}

function formatDecodedCalldata(decoded: DecodedCalldata, indent = 0, keyPrefix = "root"): FormattedLine[] {
  const lines: FormattedLine[] = [];

  let header: string;
  if (decoded.isRetryable) {
    header = `Retryable Ticket → ${decoded.targetChain}`;
  } else if (decoded.signature) {
    header = decoded.signature;
  } else {
    header = `Unknown function (${decoded.selector})`;
  }
  lines.push({ text: header, indent, foldable: false });

  if (decoded.parameters) {
    decoded.parameters.forEach((param, i) => {
      lines.push(...formatParameter(param, indent + 1, `${keyPrefix}-p${i}`));
    });
  }

  return lines;
}

function getVisibleLines(terminalHeight: number): number {
  return Math.max(5, terminalHeight - 14);
}

export function CalldataView({
  proposal,
  navigation,
}: CalldataViewProps): React.ReactElement {
  const { state } = navigation;
  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const { actions, loading, error } = useStageCalldata(stages[0]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const currentAction = actions[state.calldataActionIndex];
  const allLines = currentAction ? formatDecodedCalldata(currentAction.decoded) : [];

  const displayLines = allLines.filter((line) => {
    if (!line.isFoldedContent) return true;
    return line.foldKey && expandedKeys.has(line.foldKey);
  });

  const terminalHeight = process.stdout.rows || 24;
  const visibleCount = getVisibleLines(terminalHeight);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow) {
      navigation.moveUp();
    } else if (key.downArrow) {
      navigation.moveDown(displayLines.length);
    } else if (key.pageUp) {
      navigation.pageUp(displayLines.length);
    } else if (key.pageDown) {
      navigation.pageDown(displayLines.length);
    } else if (key.leftArrow) {
      navigation.prevAction();
    } else if (key.rightArrow) {
      navigation.nextAction(actions.length);
    } else if (key.return) {
      const currentLine = displayLines[state.scrollOffset];
      if (currentLine?.foldable && currentLine.foldKey) {
        setExpandedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(currentLine.foldKey!)) {
            next.delete(currentLine.foldKey!);
          } else {
            next.add(currentLine.foldKey!);
          }
          return next;
        });
      }
    }
  });

  const visibleLines = displayLines.slice(state.scrollOffset, state.scrollOffset + visibleCount);

  if (actions.length === 0) {
    return (
      <ViewLayout view="calldata" loading={loading} loadingText="Loading calldata..." error={error}>
        <Text color="gray">No calldata to display</Text>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout view="calldata" loading={loading} loadingText="Loading calldata..." error={error}>
      <Box marginBottom={1}>
        <Text color="cyan">Action {state.calldataActionIndex + 1}/{actions.length}</Text>
        {actions.length > 1 && <Text color="gray"> (← → navigate)</Text>}
        <Text color="gray"> (Enter to expand/collapse)</Text>
      </Box>

      {currentAction && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="gray">Target: </Text>
            <Text>{currentAction.target}</Text>
          </Box>
          <Box>
            <Text color="gray">Value: </Text>
            <Text>{currentAction.value}</Text>
          </Box>
        </Box>
      )}

      <Box flexDirection="column">
        {state.scrollOffset > 0 && <Text color="gray">↑ {state.scrollOffset} lines above</Text>}
        {visibleLines.map((line, i) => {
          const prefix = "  ".repeat(line.indent);
          const isExpanded = line.foldKey && expandedKeys.has(line.foldKey);
          const foldIndicator = line.foldable
            ? isExpanded
              ? "[-] "
              : `[+${line.foldedLineCount}] `
            : "";
          return (
            <Text key={i}>
              {prefix}
              {line.foldable && <Text color="yellow">{foldIndicator}</Text>}
              {line.text}
            </Text>
          );
        })}
        {state.scrollOffset + visibleCount < displayLines.length && (
          <Text color="gray">↓ {displayLines.length - state.scrollOffset - visibleCount} lines below</Text>
        )}
      </Box>
    </ViewLayout>
  );
}

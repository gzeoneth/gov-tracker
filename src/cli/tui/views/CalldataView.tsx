/**
 * Decoded calldata view with foldable long values (no truncation)
 */

import { React, useState, useMemo, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { useStageCalldata } from "../hooks/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import { wrapText, getVisibleRows } from "../utils/index.js";
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

const RESERVED_LINES = 14;

export function CalldataView({
  proposal,
  navigation,
}: CalldataViewProps): React.ReactElement {
  const { state } = navigation;
  const stages = useMemo(
    () => proposal.checkpoint.cachedData.completedStages ?? [],
    [proposal.checkpoint.cachedData.completedStages]
  );
  const { actions, loading, error } = useStageCalldata(stages[0], stages);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const safeActionIndex = Math.min(state.calldataActionIndex, Math.max(0, actions.length - 1));
  const currentAction = actions.length > 0 ? actions[safeActionIndex] : undefined;
  const allLines = currentAction ? formatDecodedCalldata(currentAction.decoded) : [];

  const displayLines = allLines.filter((line) => {
    if (!line.isFoldedContent) return true;
    return line.foldKey && expandedKeys.has(line.foldKey);
  });

  const visibleCount = getVisibleRows(RESERVED_LINES);

  const allFoldableKeys = allLines.filter((l) => l.foldable && l.foldKey).map((l) => l.foldKey!);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow || input === "k") {
      navigation.moveUp();
    } else if (key.downArrow || input === "j") {
      navigation.moveDown(displayLines.length);
    } else if (key.pageUp || (key.ctrl && input === "u")) {
      navigation.pageUp(displayLines.length);
    } else if (key.pageDown || (key.ctrl && input === "d")) {
      navigation.pageDown(displayLines.length);
    } else if (key.leftArrow) {
      navigation.prevAction();
    } else if (key.rightArrow) {
      navigation.nextAction(actions.length);
    } else if (input === "e") {
      setExpandedKeys(new Set(allFoldableKeys));
      navigation.goToTop();
    } else if (input === "c") {
      setExpandedKeys(new Set());
      navigation.goToTop();
    } else if (input === "g") {
      navigation.goToTop();
    } else if (input === "G") {
      navigation.goToBottom(displayLines.length);
    } else if (key.return) {
      const safeIdx = Math.max(0, Math.min(state.scrollOffset, displayLines.length - 1));
      const currentLine = displayLines[safeIdx];
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

  // Clamp scrollOffset to valid range in case displayLines shrunk after fold collapse
  const safeOffset = Math.max(0, Math.min(state.scrollOffset, displayLines.length - 1));
  const visibleLines = displayLines.slice(safeOffset, safeOffset + visibleCount);

  const shortTitle = proposal.title.length > 30
    ? proposal.title.substring(0, 30) + "..."
    : proposal.title;

  const breadcrumb = ["Proposals", shortTitle, "Calldata"];

  const keyHelpContext = {
    calldataActionCount: actions.length,
    currentActionIndex: safeActionIndex,
  };

  if (actions.length === 0) {
    return (
      <ViewLayout view="calldata" loading={loading} loadingText="Decoding calldata..." skeletonType="text" error={error} breadcrumb={breadcrumb}>
        <Text color="gray">No calldata to display</Text>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout view="calldata" loading={loading} loadingText="Decoding calldata..." skeletonType="text" error={error} breadcrumb={breadcrumb} keyHelpContext={keyHelpContext}>
      <Box marginBottom={1}>
        <Text color="cyan">Action {safeActionIndex + 1}/{actions.length}</Text>
        {actions.length > 1 && <Text color="gray"> (← → navigate)</Text>}
        <Text color="gray"> (Enter toggle, e=expand all, c=collapse all)</Text>
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
        {displayLines.length > visibleCount && (
          <Box marginBottom={1}>
            <ScrollPosition
              scrollOffset={safeOffset}
              visibleRows={visibleCount}
              totalItems={displayLines.length}
            />
          </Box>
        )}
        <ScrollIndicatorTop scrollOffset={safeOffset} unit="lines" />
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
        <ScrollIndicatorBottom
          scrollOffset={safeOffset}
          visibleRows={visibleCount}
          totalItems={displayLines.length}
          unit="lines"
        />
      </Box>
    </ViewLayout>
  );
}

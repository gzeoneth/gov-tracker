/**
 * Decoded calldata view with foldable long values (no truncation)
 */

import { React, useState, useMemo, Box, Text } from "../ink-wrapper.js";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { useStageCalldata, useScrollableInput } from "../hooks/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import {
  ScrollIndicatorTop,
  ScrollIndicatorBottom,
  ScrollPosition,
} from "../components/ScrollIndicator.js";
import {
  getVisibleRows,
  formatDecodedCalldata,
  filterVisibleLines,
  getAllFoldableKeys,
  toggleFoldKey,
  getStages,
  buildBreadcrumb,
} from "../utils/index.js";

interface CalldataViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

const RESERVED_LINES = 14;

export function CalldataView({
  proposal,
  navigation,
}: CalldataViewProps): React.ReactElement {
  const { state } = navigation;
  const stages = useMemo(() => getStages(proposal), [proposal]);
  const { actions, loading, error } = useStageCalldata(stages[0], stages);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const safeActionIndex = Math.min(state.calldataActionIndex, Math.max(0, actions.length - 1));
  const currentAction = actions.length > 0 ? actions[safeActionIndex] : undefined;
  const allLines = currentAction ? formatDecodedCalldata(currentAction.decoded) : [];
  const displayLines = filterVisibleLines(allLines, expandedKeys);
  const visibleCount = getVisibleRows(RESERVED_LINES);
  const allFoldableKeys = getAllFoldableKeys(allLines);

  function handleToggleFold(): void {
    const safeIdx = Math.max(0, Math.min(state.scrollOffset, displayLines.length - 1));
    const currentLine = displayLines[safeIdx];
    const key = currentLine?.foldable ? currentLine.foldKey : undefined;
    if (key) {
      setExpandedKeys((prev) => toggleFoldKey(prev, key));
    }
  }

  useScrollableInput({
    navigation,
    itemCount: displayLines.length,
    extraHandlers: (input, key) => {
      if (input === "?") {
        navigation.goToHelp();
        return true;
      }
      if (key.leftArrow) {
        navigation.prevAction();
        return true;
      }
      if (key.rightArrow) {
        navigation.nextAction(actions.length);
        return true;
      }
      if (input === "e") {
        setExpandedKeys(new Set(allFoldableKeys));
        navigation.goToTop();
        return true;
      }
      if (input === "c") {
        setExpandedKeys(new Set());
        navigation.goToTop();
        return true;
      }
      if (key.return) {
        handleToggleFold();
        return true;
      }
      return false;
    },
  });

  const safeOffset = Math.max(0, Math.min(state.scrollOffset, displayLines.length - 1));
  const visibleLines = displayLines.slice(safeOffset, safeOffset + visibleCount);

  const breadcrumb = buildBreadcrumb(proposal, "Calldata");

  const keyHelpContext = {
    calldataActionCount: actions.length,
    currentActionIndex: safeActionIndex,
  };

  if (actions.length === 0) {
    return (
      <ViewLayout view="calldata" loading={loading} loadingText="Decoding calldata..."  error={error} breadcrumb={breadcrumb}>
        <Text color="gray">No calldata to display</Text>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout view="calldata" loading={loading} loadingText="Decoding calldata..."  error={error} breadcrumb={breadcrumb} keyHelpContext={keyHelpContext}>
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
              : `[+${line.foldedLineCount ?? 0}] `
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

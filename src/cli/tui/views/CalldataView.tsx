/**
 * Decoded calldata view
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper";
import type { ProposalListItem } from "../types";
import type { UseNavigationResult } from "../hooks";
import { useStageCalldata } from "../hooks";
import { Header } from "../components/Header";
import { KeyHelp } from "../components/KeyHelp";
import type { DecodedCalldata, DecodedParameter } from "../../../types/calldata";

interface CalldataViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

function formatParameter(param: DecodedParameter, indent: number): string[] {
  const prefix = "  ".repeat(indent);
  const lines: string[] = [];

  let line = `${prefix}${param.name} (${param.type}): `;
  if (param.addressLabel) {
    line += `${param.displayValue} [${param.addressLabel}]`;
  } else {
    line += param.displayValue;
  }
  lines.push(line);

  if (param.nested) {
    lines.push(`${prefix}  └─ [NESTED]`);
    lines.push(...formatDecodedCalldata(param.nested, indent + 2));
  }

  if (param.nestedArray && param.nestedArray.length > 0) {
    param.nestedArray.forEach((nested, i) => {
      lines.push(`${prefix}  [${i}]:`);
      lines.push(...formatDecodedCalldata(nested, indent + 2));
    });
  }

  return lines;
}

function formatDecodedCalldata(decoded: DecodedCalldata, indent = 0): string[] {
  const prefix = "  ".repeat(indent);
  const lines: string[] = [];

  if (decoded.isRetryable) {
    lines.push(`${prefix}Retryable Ticket → ${decoded.targetChain}`);
  } else if (decoded.signature) {
    lines.push(`${prefix}${decoded.signature}`);
  } else {
    lines.push(`${prefix}Unknown function (${decoded.selector})`);
  }

  if (decoded.parameters) {
    for (const param of decoded.parameters) {
      lines.push(...formatParameter(param, indent + 1));
    }
  }

  return lines;
}

const VISIBLE_LINES = 20;

export function CalldataView({
  proposal,
  navigation,
}: CalldataViewProps): React.ReactElement {
  const { state } = navigation;
  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const { actions, loading, error } = useStageCalldata(stages[0]);

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
    } else if (key.leftArrow) {
      navigation.prevAction();
    } else if (key.rightArrow) {
      navigation.nextAction(actions.length);
    }
  });

  const currentAction = actions[state.calldataActionIndex];

  const getDisplayLines = (): string[] => {
    if (!currentAction) return [];
    return formatDecodedCalldata(currentAction.decoded);
  };

  const lines = getDisplayLines();
  const visibleLines = lines.slice(state.scrollOffset, state.scrollOffset + VISIBLE_LINES);

  return (
    <Box flexDirection="column" height="100%">
      <Header
        view="calldata"
        filter={state.filter}
        stats={null}
        hasProviders={false}
        isTracking={false}
      />

      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {loading && <Text color="yellow">Loading calldata...</Text>}

        {error && <Text color="red">Error: {error}</Text>}

        {!loading && !error && actions.length === 0 && (
          <Text color="gray">No calldata to display</Text>
        )}

        {!loading && !error && actions.length > 0 && (
          <>
            {/* Action navigation */}
            <Box marginBottom={1}>
              <Text color="cyan">
                Action {state.calldataActionIndex + 1}/{actions.length}
              </Text>
              {actions.length > 1 && (
                <Text color="gray"> (use ← → to navigate)</Text>
              )}
            </Box>

            {/* Target and value */}
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

            {/* Decoded calldata */}
            <Box flexDirection="column">
              {state.scrollOffset > 0 && (
                <Text color="gray">↑ {state.scrollOffset} lines above</Text>
              )}
              {visibleLines.map((line, i) => (
                <Text key={i}>{line}</Text>
              ))}
              {state.scrollOffset + VISIBLE_LINES < lines.length && (
                <Text color="gray">
                  ↓ {lines.length - state.scrollOffset - VISIBLE_LINES} lines below
                </Text>
              )}
            </Box>
          </>
        )}
      </Box>

      <KeyHelp view="calldata" hasProviders={false} />
    </Box>
  );
}

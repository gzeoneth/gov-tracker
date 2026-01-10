/**
 * Simulation data view for displaying simulation data for Tenderly/Foundry
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import { useState, useMemo } from "react";
import type { ProposalListItem } from "../types.js";
import type { UseNavigationResult } from "../hooks/index.js";
import { useStageCalldata } from "../hooks/index.js";
import { ViewLayout } from "../components/ViewLayout.js";
import { extractAllSimulationsFromDecoded } from "../../../simulation/index.js";
import type { ExtractedSimulation } from "../../../types/simulation.js";
import type { Chain } from "../../../types/index.js";

interface SimulationViewProps {
  proposal: ProposalListItem;
  navigation: UseNavigationResult;
}

export function SimulationView({
  proposal,
  navigation,
}: SimulationViewProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const stages = proposal.checkpoint.cachedData.completedStages ?? [];
  const { actions, loading, error } = useStageCalldata(stages[0]);

  const simulations = useMemo((): ExtractedSimulation[] => {
    if (actions.length === 0) return [];
    const chainContext: Chain = "arb1";
    const allSimulations: ExtractedSimulation[] = [];
    for (const action of actions) {
      const sims = extractAllSimulationsFromDecoded(action.decoded, chainContext);
      allSimulations.push(...sims);
    }
    return allSimulations;
  }, [actions]);

  useInput((input: string, key: KeyInput) => {
    if (input === "b" || key.escape) {
      navigation.back();
    } else if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(simulations.length - 1, prev + 1));
    }
  });

  const currentSim = simulations[selectedIndex];

  if (simulations.length === 0) {
    return (
      <ViewLayout view="simulation" title="Simulation Data" loading={loading} loadingText="Loading simulation data..." error={error}>
        <Text color="gray">No simulatable calls found in this proposal</Text>
      </ViewLayout>
    );
  }

  return (
    <ViewLayout view="simulation" title="Simulation Data" loading={loading} loadingText="Loading simulation data..." error={error}>
      <Box marginBottom={1}>
        <Text color="cyan">Simulation {selectedIndex + 1}/{simulations.length}</Text>
        {simulations.length > 1 && <Text color="gray"> (use ↑↓ to navigate)</Text>}
      </Box>

      {currentSim && (
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text bold color="cyan">{currentSim.label}</Text>
          </Box>

          <Box><Text color="gray">Type: </Text><Text>{currentSim.simulation.type.toUpperCase()}</Text></Box>
          <Box><Text color="gray">Network ID: </Text><Text>{currentSim.simulation.networkId}</Text></Box>
          <Box><Text color="gray">From: </Text><Text color="blue">{currentSim.simulation.from}</Text></Box>
          <Box><Text color="gray">To: </Text><Text color="blue">{currentSim.simulation.to}</Text></Box>
          <Box><Text color="gray">Value: </Text><Text>{currentSim.simulation.value}</Text></Box>

          {currentSim.simulation.type === "timelock" && (
            <Box><Text color="gray">Operation ID: </Text><Text color="yellow">{currentSim.simulation.operationId}</Text></Box>
          )}
          {currentSim.batchIndex !== undefined && (
            <Box><Text color="gray">Batch Index: </Text><Text>{currentSim.batchIndex}</Text></Box>
          )}

          <Box flexDirection="column" marginTop={1}>
            <Text bold>Input Data:</Text>
            <Box marginLeft={1}>
              <Text color="gray">{currentSim.simulation.input.slice(0, 66)}{currentSim.simulation.input.length > 66 && "..."}</Text>
            </Box>
            <Box marginLeft={1}>
              <Text color="gray">({currentSim.simulation.input.length} chars)</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color="gray">Use this data with Tenderly or Foundry fork simulation</Text>
          </Box>
        </Box>
      )}
    </ViewLayout>
  );
}

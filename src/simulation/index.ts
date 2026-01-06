/**
 * Simulation Data Module
 *
 * Exports for simulation data preparation that clients can use
 * to call Tenderly API themselves.
 */

// Address aliasing
export {
  ADDRESS_ALIAS_OFFSET,
  L1_TIMELOCK_ADDRESS,
  calculateAddressAlias,
  getL1TimelockAlias,
} from "./address-alias";

// Simulation data preparation
export {
  NETWORK_IDS,
  TIMELOCK_SELECTORS,
  chainContextToSimType,
  getNetworkId,
  prepareRetryableSimulation,
  prepareTimelockSimulation,
  prepareCallSimulation,
  extractAllSimulationsFromDecoded,
} from "./simulation-data";

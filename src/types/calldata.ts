/**
 * Calldata Decoding Types
 *
 * Types for recursive calldata decoding, retryable ticket parsing,
 * and chain-aware address labeling.
 */

/**
 * Chain context for address resolution and explorer links
 */
import { Chain, L2Chain } from "./core";

/**
 * Source of function signature decoding
 */
export type DecodingSource = "local" | "api" | "failed";

/**
 * Base type for decoded calldata with shared properties
 */
interface DecodedCalldataBase {
  /** Decoded parameters (null if decoding failed) */
  parameters: DecodedParameter[] | null;

  /** Raw calldata hex string */
  raw: string;

  /** Source of decoding (local ABI, API lookup, or failed) */
  decodingSource: DecodingSource;

  /** Target contract address (if known during decoding) */
  decodingTarget?: string;
}

/**
 * Regular calldata with function selector and signature
 */
interface RegularCalldata extends DecodedCalldataBase {
  /** 4-byte function selector (0x prefix) */
  selector: string;

  /** Full function signature (null if unknown) */
  signature: string | null;

  /** This is regular calldata, not a retryable ticket */
  isRetryable?: false;

  /** Target L2 chain - not applicable for regular calldata */
  targetChain?: undefined;
}

/**
 * Retryable ticket decoded structure
 */
interface RetryableCalldata extends DecodedCalldataBase {
  /** No selector for retryable tickets */
  selector: "";

  /** No signature for retryable tickets */
  signature: null;

  /** This is a retryable ticket */
  isRetryable: true;

  /** Target L2 chain for retryable tickets ("arb1", "nova", or "unknown") */
  targetChain: L2Chain | "unknown";
}

/**
 * Decoded calldata result
 *
 * This is a discriminated union:
 * - Regular calldata: has selector, signature, and isRetryable is false/undefined
 * - Retryable ticket: has no selector, no signature, and isRetryable is true
 */
export type DecodedCalldata = RegularCalldata | RetryableCalldata;

/**
 * Type guard for retryable ticket calldata
 */
export function isRetryable(decoded: DecodedCalldata): decoded is RetryableCalldata {
  return decoded.isRetryable === true;
}

/**
 * Decoded parameter with optional nested calldata
 */
export interface DecodedParameter {
  /** Parameter name from ABI (default: "arg0", "arg1", ...) */
  name: string;

  /** Solidity type (e.g., "address", "uint256", "bytes") */
  type: string;

  /**
   * Human-readable display string (may be truncated).
   * Use for UI display only. For programmatic access, use `rawValue`.
   * @example "0xE6841D92B0C34...ECf5103aC7f49" (truncated address)
   */
  displayValue: string;

  /**
   * Original decoded value in its native type.
   * Use for API calls, simulations, and any programmatic access.
   * @example "0xE6841D92B0C345149534E833...ECf5103aC7f49" (full address)
   */
  rawValue: unknown;

  /** Whether this parameter contains nested calldata */
  isNested: boolean;

  /** Nested decoded calldata for bytes parameters */
  nested?: DecodedCalldata;

  /** Decoded elements for bytes[] arrays */
  nestedArray?: DecodedCalldata[];

  /** Known address label (e.g., "Core Governor", "L1 Timelock") */
  addressLabel?: string;

  /** Raw bytes array for bytes[] parameters (used internally for nested decoding) */
  _rawBytesArray?: string[];
}

/**
 * Retryable ticket data extracted from L1 calldata
 */
export interface RetryableTicketData {
  /** Target delayed inbox address on L1 */
  targetInbox: string;

  /** Target contract address on L2 */
  l2Target: string;

  /** ETH value to send on L2 (in wei) */
  l2Value: string;

  /** Gas limit for L2 execution */
  gasLimit: string;

  /** Max fee per gas for L2 execution */
  maxFeePerGas: string;

  /** Calldata to execute on L2 */
  l2Calldata: string;

  /** Target L2 chain (arb1, nova, or unknown) */
  chain: L2Chain | "unknown";
}

/**
 * Known address entry with label
 */
export interface KnownAddress {
  address: string;
  label: string;
  chain: Chain;
}

/**
 * Function signature registry entry
 */
export interface SignatureEntry {
  selector: string;
  signature: string;
}

/**
 * Extracted calldata info with aligned arrays
 */
export interface ExtractedCalldata {
  calldatas: string[];
  targets: string[];
  values: string[];
}

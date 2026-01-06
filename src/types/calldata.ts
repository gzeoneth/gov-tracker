/**
 * Calldata Decoding Types
 *
 * Types for recursive calldata decoding, retryable ticket parsing,
 * and chain-aware address labeling.
 */

/**
 * Chain context for address resolution and explorer links
 */
export type ChainContext = "arb1" | "nova" | "ethereum";

/**
 * Source of function signature decoding
 */
export type DecodingSource = "local" | "api" | "failed";

/**
 * Decoded calldata result
 */
export interface DecodedCalldata {
  /** 4-byte function selector (0x prefix) */
  selector: string;

  /** Decoded function name (null if unknown) */
  functionName: string | null;

  /** Full function signature (null if unknown) */
  signature: string | null;

  /** Decoded parameters (null if decoding failed) */
  parameters: DecodedParameter[] | null;

  /** Raw calldata hex string */
  raw: string;

  /** Source of decoding (local ABI, API lookup, or failed) */
  decodingSource: DecodingSource;

  /** Target contract address (if known during decoding) */
  decodingTarget?: string;

  /** Chain context for this calldata (for simulation extraction) */
  chainContext?: ChainContext;
}

/**
 * Decoded parameter with optional nested calldata
 */
export interface DecodedParameter {
  /** Parameter name from ABI (default: "arg0", "arg1", ...) */
  name: string;

  /** Solidity type (e.g., "address", "uint256", "bytes") */
  type: string;

  /** Decoded value as string */
  value: string;

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
  chain: "arb1" | "nova" | "unknown";
}

/**
 * Known address entry with label
 */
export interface KnownAddress {
  address: string;
  label: string;
  chain: ChainContext;
}

/**
 * Function signature registry entry
 */
export interface SignatureEntry {
  selector: string;
  signature: string;
}

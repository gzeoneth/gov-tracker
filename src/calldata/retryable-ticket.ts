/**
 * Retryable Ticket Decoder
 *
 * Extracts and parses Arbitrum L1→L2 retryable ticket data from calldata.
 */

import { ethers } from "ethers";
import type { RetryableTicketData } from "../types/calldata";
import { ADDRESSES } from "../constants";

// Re-export addresses from constants for backward compatibility (lowercase for comparison)
export const RETRYABLE_TICKET_MAGIC = ADDRESSES.RETRYABLE_TICKET_MAGIC.toLowerCase();
export const ARB1_DELAYED_INBOX = ADDRESSES.ARB1_DELAYED_INBOX.toLowerCase();
export const NOVA_DELAYED_INBOX = ADDRESSES.NOVA_DELAYED_INBOX.toLowerCase();

/**
 * Check if an address is the retryable ticket magic address
 *
 * @param target - Target address to check
 * @returns True if this is the retryable ticket magic address
 */
export function isRetryableTicketMagic(target: string): boolean {
  return target.toLowerCase() === RETRYABLE_TICKET_MAGIC;
}

/**
 * Detect L2 chain from inbox address
 *
 * @param inboxAddress - Delayed inbox address on L1
 * @returns Target L2 chain
 */
export function detectChainFromInbox(inboxAddress: string): "arb1" | "nova" | "unknown" {
  const lowerInbox = inboxAddress.toLowerCase();

  if (lowerInbox === ARB1_DELAYED_INBOX) return "arb1";
  if (lowerInbox === NOVA_DELAYED_INBOX) return "nova";
  return "unknown";
}

/**
 * Get human-readable chain name for display
 *
 * @param chain - Chain identifier
 * @returns Human-readable chain name
 */
export function getRetryableChainName(chain: "arb1" | "nova" | "unknown"): string {
  switch (chain) {
    case "arb1":
      return "Arbitrum One";
    case "nova":
      return "nova";
    default:
      return "Unknown L2";
  }
}

/**
 * Decode retryable ticket data from ABI-encoded bytes
 *
 * Retryable tickets are encoded as tuples (NOT calldata) with this structure:
 * (address inbox, address l2Target, uint256 l2Value, uint256 gasLimit, uint256 maxFeePerGas, bytes l2Calldata)
 *
 * @param bytes - ABI-encoded retryable ticket bytes
 * @returns Decoded retryable ticket data
 */
export function decodeRetryableTicket(bytes: string): RetryableTicketData {
  const decoded = ethers.utils.defaultAbiCoder.decode(
    ["address", "address", "uint256", "uint256", "uint256", "bytes"],
    bytes
  );

  const chain = detectChainFromInbox(decoded[0] as string);

  return {
    targetInbox: decoded[0],
    l2Target: decoded[1],
    l2Value: decoded[2].toString(),
    gasLimit: decoded[3].toString(),
    maxFeePerGas: decoded[4].toString(),
    l2Calldata: decoded[5],
    chain,
  };
}

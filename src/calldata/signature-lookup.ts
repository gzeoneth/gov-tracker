/**
 * Function Signature Lookup
 *
 * Resolves 4-byte function selectors to full function signatures.
 * Uses local registry first, then falls back to 4byte.directory API.
 */

import Debug from "debug";

const debug = Debug("gov-tracker:calldata");

/**
 * Local registry of common governance function signatures
 * Priority 1: Checked before API lookup
 */
const LOCAL_SIGNATURES: Record<string, string> = {
  // Timelock operations
  "0x01d5062a": "schedule(address,uint256,bytes,bytes32,bytes32,uint256)",
  "0x8f2a0bb0": "scheduleBatch(address[],uint256[],bytes[],bytes32,bytes32,uint256)",
  "0x134008d3": "execute(address,uint256,bytes,bytes32,bytes32)",
  "0xe38335e5": "executeBatch(address[],uint256[],bytes[],bytes32,bytes32)",
  "0xc4d252f5": "cancel(bytes32)",
  "0xd45c4435": "hashOperation(address,uint256,bytes,bytes32,bytes32)",
  "0xb1c5f427": "hashOperationBatch(address[],uint256[],bytes[],bytes32,bytes32)",

  // Cross-chain messaging
  "0x928c169a": "sendTxToL1(address,bytes)",

  // UpgradeExecutor
  "0x1cff79cd": "execute(address,bytes)",
  "0x61461954": "executeCall(address,bytes)",

  // ERC20
  "0xa9059cbb": "transfer(address,uint256)",
  "0x095ea7b3": "approve(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0x70a08231": "balanceOf(address)",
  "0xdd62ed3e": "allowance(address,address)",

  // Proxy upgrades
  "0x3659cfe6": "upgradeTo(address)",
  "0x4f1ef286": "upgradeToAndCall(address,bytes)",
  "0x0900f010": "upgrade(address)",
  "0x99a88ec4": "upgrade(address,address)",

  // Ownership
  "0x13af4035": "setOwner(address)",
  "0xf2fde38b": "transferOwnership(address)",
  "0x715018a6": "renounceOwnership()",
  "0x8da5cb5b": "owner()",

  // Governor
  "0x7d5e81e2": "propose(address[],uint256[],bytes[],string)",
  "0xfe0d94c1": "execute(uint256)",
  "0xddf0b009": "queue(uint256)",
  "0x56781388": "castVote(uint256,uint8)",
  "0x3bccf4fd": "castVoteWithReason(uint256,uint8,string)",

  // Security Council
  "0xbf396750": "replaceCohort(address[],address[])",
  "0xb147f40c": "perform()",
};

/**
 * In-memory cache for API lookups (session cache)
 */
const signatureCache = new Map<string, string | null>();

/**
 * API timeout in milliseconds
 */
const API_TIMEOUT_MS = 5000;

/**
 * Look up function signature in local registry
 *
 * @param selector - The 4-byte function selector (e.g., "0x8f2a0bb0")
 * @returns The function signature if found, null otherwise
 */
export function lookupLocalSignature(selector: string): string | null {
  const normalizedSelector = selector.toLowerCase();
  return LOCAL_SIGNATURES[normalizedSelector] ?? null;
}

/**
 * Query 4byte.directory API with caching
 *
 * @param selector - The 4-byte function selector
 * @returns The function signature if found, null otherwise
 */
export async function lookup4byteDirectory(selector: string): Promise<string | null> {
  const normalizedSelector = selector.toLowerCase();

  // Check session cache
  if (signatureCache.has(normalizedSelector)) {
    return signatureCache.get(normalizedSelector) ?? null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${normalizedSelector}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      debug("4byte.directory API error: %d", response.status);
      signatureCache.set(normalizedSelector, null);
      return null;
    }

    const data = (await response.json()) as {
      results?: Array<{ text_signature: string }>;
    };

    if (data.results && data.results.length > 0) {
      // Return the first (most common) signature
      const signature = data.results[0].text_signature;
      signatureCache.set(normalizedSelector, signature);
      debug("4byte.directory found: %s -> %s", normalizedSelector, signature);
      return signature;
    }

    signatureCache.set(normalizedSelector, null);
    return null;
  } catch (error) {
    debug("4byte.directory lookup failed: %O", error);
    signatureCache.set(normalizedSelector, null);
    return null;
  }
}

/**
 * Look up function signature from all sources
 *
 * Priority:
 * 1. Local registry (instant)
 * 2. 4byte.directory API (with caching)
 *
 * @param selector - The 4-byte function selector (e.g., "0x8f2a0bb0")
 * @returns Object with signature and source, or null signature if not found
 */
export async function lookupSignature(
  selector: string
): Promise<{ signature: string | null; source: "local" | "api" | "failed" }> {
  // Try local registry first
  const localResult = lookupLocalSignature(selector);
  if (localResult) {
    return { signature: localResult, source: "local" };
  }

  // Fall back to 4byte.directory API
  const apiResult = await lookup4byteDirectory(selector);
  if (apiResult) {
    return { signature: apiResult, source: "api" };
  }

  return { signature: null, source: "failed" };
}

/**
 * Extract function name from signature
 *
 * @param signature - Full function signature (e.g., "transfer(address,uint256)")
 * @returns Function name (e.g., "transfer")
 */
export function extractFunctionName(signature: string): string {
  const parenIndex = signature.indexOf("(");
  return parenIndex > 0 ? signature.slice(0, parenIndex) : signature;
}

/**
 * Clear the signature cache (useful for testing)
 */
export function clearSignatureCache(): void {
  signatureCache.clear();
}

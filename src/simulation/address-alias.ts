/**
 * Address Aliasing
 *
 * Calculates aliased addresses for L1→L2 message sender context.
 * When an L1 contract sends a message to L2, Arbitrum applies an address offset.
 */

/**
 * Address alias offset applied by Arbitrum for L1→L2 messages
 * Formula: aliased = (address + offset) % 2^160
 */
export const ADDRESS_ALIAS_OFFSET = BigInt("0x1111000000000000000000000000000000001111");

/**
 * L1 Timelock address
 */
export const L1_TIMELOCK_ADDRESS = "0xE6841D92B0C345144506576eC13ECf5103aC7f49";

/**
 * Calculate the aliased address for L1→L2 messaging
 *
 * When an L1 contract sends a message to L2, its address is aliased
 * to prevent it from impersonating existing L2 contracts.
 *
 * @param l1Address - L1 contract address
 * @returns Aliased address on L2
 */
export function calculateAddressAlias(l1Address: string): string {
  const address = BigInt(l1Address);
  const alias = (address + ADDRESS_ALIAS_OFFSET) % BigInt(2 ** 160);
  return "0x" + alias.toString(16).padStart(40, "0");
}

/**
 * Get the aliased address for the L1 Timelock
 *
 * This is the "from" address to use when simulating retryable
 * ticket redemptions on L2.
 *
 * @returns Aliased L1 Timelock address
 */
export function getL1TimelockAlias(): string {
  return calculateAddressAlias(L1_TIMELOCK_ADDRESS);
}

/**
 * Security Sanitization Utilities
 *
 * Functions to sanitize untrusted data from on-chain sources.
 * Proposal data (especially descriptions) can be created by anyone.
 */

/** Maximum description length to prevent DoS via large strings */
export const MAX_DESCRIPTION_LENGTH = 100_000; // ~100KB

/**
 * Truncate description to prevent DoS from extremely large strings.
 * Proposals are user-submitted and could contain arbitrarily large descriptions.
 */
export function truncateDescription(description: string): string {
  if (description.length <= MAX_DESCRIPTION_LENGTH) {
    return description;
  }
  return description.slice(0, MAX_DESCRIPTION_LENGTH) + "... [truncated]";
}

/**
 * Sanitize string for terminal display by removing control characters.
 *
 * Removes ANSI escape codes and control characters that could manipulate
 * terminal output. Preserves newlines and tabs for readability.
 */
export function sanitizeForDisplay(str: string): string {
  // Remove ANSI escape codes (e.g., color codes, cursor movement)
  // Remove control characters except \t (0x09), \n (0x0A), \r (0x0D)
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /\x1B\[[0-9;]*[a-zA-Z]|\x1B\](?:[^\x07\x1B]*)(?:\x07|\x1B\\)|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
    ""
  );
}

/**
 * Safe JSON parse with prototype pollution protection.
 *
 * Prevents attacks via __proto__, constructor, or prototype keys
 * that could pollute Object.prototype when parsing untrusted JSON.
 */
export function safeJsonParse<T>(json: string): T {
  return JSON.parse(json, (key, value) => {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return undefined;
    }
    if (key.startsWith("__") && key.endsWith("__")) {
      return undefined;
    }
    return value;
  });
}

/**
 * Calldata Decoding Module
 *
 * Exports for recursive calldata decoding, signature lookup,
 * and address utilities.
 */

// Main decoder and extraction
export { decodeCalldata, decodeCalldataArray, extractCalldataFromStage } from "./decoder";

// Signature lookup
export { lookupSignature, lookupLocalSignature, clearSignatureCache } from "./signature-lookup";

// Parameter decoder and address utilities
export {
  parseParamTypes,
  isLikelyCalldata,
  formatDecodedValue,
  decodeParameters,
  getAddressLabel,
  getKnownAddresses,
} from "./parameter-decoder";

// Retryable ticket
export {
  RETRYABLE_TICKET_MAGIC,
  ARB1_DELAYED_INBOX,
  NOVA_DELAYED_INBOX,
  isRetryableTicketMagic,
  detectChainFromInbox,
  decodeRetryableTicket,
  getRetryableChainName,
} from "./retryable-ticket";

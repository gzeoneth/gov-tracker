/**
 * Calldata Decoding Module
 *
 * Exports for recursive calldata decoding, signature lookup,
 * and address utilities.
 */

// Main decoder and extraction
export { decodeCalldata, decodeCalldataArray, extractCalldataFromStage } from "./decoder";

// Signature lookup
export { lookupSignature, lookupLocalSignature, LookupSignatureOptions } from "./signature-lookup";

// Parameter decoder and address utilities
export {
  parseParamTypes,
  isLikelyCalldata,
  formatDecodedValue,
  getAddressLabel,
} from "./parameter-decoder";

// Retryable ticket
export {
  RETRYABLE_TICKET_MAGIC,
  isRetryableTicketMagic,
  decodeRetryableTicket,
  getRetryableChainName,
} from "./retryable-ticket";

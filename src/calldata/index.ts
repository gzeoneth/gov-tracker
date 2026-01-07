/**
 * Calldata Decoding Module
 *
 * Exports for recursive calldata decoding, signature lookup,
 * and address utilities.
 */

// Main decoder
export { decodeCalldata, decodeCalldataArray } from "./decoder";

// Signature lookup
export {
  lookupSignature,
  lookupLocalSignature,
  lookup4byteDirectory,
  clearSignatureCache,
} from "./signature-lookup";

// Parameter decoder
export {
  parseParamTypes,
  isLikelyCalldata,
  formatDecodedValue,
  decodeParameters,
} from "./parameter-decoder";

// Address utilities
export { getAddressLabel, getKnownAddresses } from "./address-utils";

// URL utilities
export { getTxExplorerUrl } from "../utils/urls";

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

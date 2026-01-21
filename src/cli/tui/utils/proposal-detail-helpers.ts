/**
 * Helper functions for proposal views
 */

import type { TrackedStage } from "../../../types/index.js";
import type { ProposalListItem } from "../types.js";
import { truncate } from "../../../utils/formatters.js";

export { formatDate, getTxHash, getProposalIdDisplay } from "../../../utils/formatters.js";

export function getStages(proposal: ProposalListItem): TrackedStage[] {
  return proposal.checkpoint.cachedData.completedStages ?? [];
}

export function buildBreadcrumb(proposal: ProposalListItem, suffix: string): string[] {
  const shortTitle = truncate(proposal.title, 30);
  return ["Proposals", shortTitle, suffix];
}

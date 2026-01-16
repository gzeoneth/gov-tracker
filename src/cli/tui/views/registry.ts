/**
 * View registry for TUI navigation
 *
 * Centralizes view metadata and provides lookup functions.
 * View rendering remains in App.tsx for type-safe prop injection.
 */

import type { ViewType } from "../types.js";

export interface ViewConfig {
  id: ViewType;
  title: string;
  requiresProposal: boolean;
}

const VIEW_REGISTRY: readonly ViewConfig[] = [
  { id: "list", title: "Proposals", requiresProposal: false },
  { id: "detail", title: "Proposal Detail", requiresProposal: true },
  { id: "calldata", title: "Calldata", requiresProposal: true },
  { id: "stage", title: "Stage Detail", requiresProposal: true },
  { id: "simulation", title: "Simulation", requiresProposal: true },
  { id: "description", title: "Description", requiresProposal: true },
  { id: "election", title: "Elections", requiresProposal: false },
  { id: "help", title: "Help", requiresProposal: false },
] as const;

const VIEW_MAP = new Map<ViewType, ViewConfig>(VIEW_REGISTRY.map((config) => [config.id, config]));

export function getViewConfig(viewType: ViewType): ViewConfig | undefined {
  return VIEW_MAP.get(viewType);
}

export function isProposalView(viewType: ViewType): boolean {
  return VIEW_MAP.get(viewType)?.requiresProposal ?? false;
}

export function getViewTitle(viewType: ViewType): string {
  return VIEW_MAP.get(viewType)?.title ?? viewType;
}

export { VIEW_REGISTRY };

/**
 * CLI Utilities for Monitor Script
 *
 * NOTE: This is CLI application code that demonstrates SDK usage, not library code.
 * Developers should treat this as part of the CLI application, not as part of the SDK API.
 *
 * Provides RPC option parsing, provider creation, transaction execution,
 * and the core monitoring cycle. This is monitor-specific code, not part of the SDK.
 *
 * Dependencies:
 * - commander is an optional dependency required for CLI usage
 */

import { Command, Option } from "commander";
import { ethers } from "ethers";
import { pLimit } from "./concurrency";
import {
  ProposalStageTracker,
  TrackedStage,
  TrackingResult,
  TrackingCheckpoint,
  PreparedTransaction,
  PrepareResult,
  TrackerStats,
  DEFAULT_RPC_URLS,
  getStageTransactionUrl,
  formatStageTitle,
  findExecutableStage,
  isElectionGovernor,
  isTimelockStage,
  isConstitutional,
  Chain,
  buildDefaultTargets,
  isCheckpointComplete,
  isCheckpointErrored,
  computeCacheStats,
  extractOperationId,
  DiscoveredProposal,
  DiscoveredTimelockOp,
  DiscoveryWatermarks,
  DiscoveryTargets,
  calculateExpectedEta,
  prepareRetryableStage,
  prepareL2ToL1MessageStage,
  getStageData,
  invalidateBlockInfoCache,
  ElectionProposalStatus,
} from "../../index";
import { withScope } from "../../utils/logger";

export { isElectionGovernor };

// ============================================================================
// Constants
// ============================================================================

/** Default block lag to prevent reorg issues */
export const DEFAULT_BLOCK_LAG = 12;

/** Default max age in days for re-tracking incomplete proposals */
export const DEFAULT_MAX_AGE_DAYS = 60;

/** Maximum consecutive errors before skipping an item */
export const MAX_CONSECUTIVE_ERRORS = 5;

/** Default gas settings for L2 chains (Arb1 and Nova) */
export const DEFAULT_L2_GAS_SETTINGS = {
  /** Max fee per gas in gwei (0.10 gwei = 100000000 wei) */
  maxFeePerGas: 0.1,
  /** Max priority fee per gas in gwei */
  maxPriorityFeePerGas: 0,
};

/** Health check timeout in milliseconds */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Gas settings interface */
export interface GasSettings {
  maxFeePerGas: number; // in gwei
  maxPriorityFeePerGas: number; // in gwei
}

// ============================================================================
// RPC Configuration
// ============================================================================

export const rpcOptions = [
  new Option("--l2-rpc <url>", "L2 RPC URL").env("ARB1_RPC"),
  new Option("--l1-rpc <url>", "L1 RPC URL").env("ETH_RPC"),
  new Option("--nova-rpc <url>", "Nova RPC URL").env("NOVA_RPC"),
];

// ============================================================================
// Common Options (shared across multiple commands)
// ============================================================================

/**
 * Verbose logging option - enables debug output
 */
export const verboseOption = new Option("-v, --verbose", "Enable verbose logging");

/**
 * Cache-related options for commands that use the tracker cache
 */
export const cacheOptions = {
  /** Cache file path option (default is set in cli.ts) */
  cache: (defaultPath: string) => new Option("--cache <path>", "Cache file").default(defaultPath),
  /** Force flag to bypass cache and re-track from scratch */
  force: new Option("--force", "Force refresh, ignoring cached data"),
  /** Disable cache entirely */
  noCache: new Option("--no-cache", "Disable cache (don't read or write)"),
};

/**
 * Execution-related options for commands that can prepare/execute transactions
 */
export const executionOptions = [
  new Option("-p, --prepare", "Prepare transactions for ready stages (dry-run)"),
  new Option("-w, --write", "Execute prepared transactions (requires --private-key)"),
  new Option("--private-key <key>", "Private key for execution").env("PRIVATE_KEY"),
  new Option("--prepare-completed", "Prepare completed stages (for historical validation)"),
  new Option("--prepare-pending", "Prepare pending stages (waiting for delays)"),
];

/**
 * Chunking options for log search performance tuning
 */
export const chunkingOptions = (l1Default: number, l2Default: number) => [
  new Option(
    "--l1-chunk-size <size>",
    `L1 chunk size for log searches (default: ${l1Default})`
  ).default(String(l1Default)),
  new Option(
    "--l2-chunk-size <size>",
    `L2 chunk size for log searches (default: ${l2Default})`
  ).default(String(l2Default)),
];

/**
 * Gas options for L2 transaction execution
 */
export const gasOptions = [
  new Option(
    "--l2-max-fee <gwei>",
    `Max fee per gas for L2 chains in gwei (default: ${DEFAULT_L2_GAS_SETTINGS.maxFeePerGas})`
  ),
  new Option(
    "--l2-priority-fee <gwei>",
    `Max priority fee for L2 chains in gwei (default: ${DEFAULT_L2_GAS_SETTINGS.maxPriorityFeePerGas})`
  ),
];

/**
 * Loop-related options for commands that can run continuously
 */
export const loopOptions = [
  new Option("--loop", "Run in continuous loop"),
  new Option("--interval <seconds>", "Loop interval in seconds").default("60"),
  new Option("--health-check-url <url>", "Health check URL to ping").env("HEALTH_CHECK_URL"),
];

export function addOptions(cmd: Command, opts: Option[]): void {
  opts.forEach((o) => cmd.addOption(o));
}

// ============================================================================
// CLI Option Validation
// ============================================================================

interface ValidationError {
  flags: string[];
  message: string;
}

interface CommonCliOptions {
  cache?: string;
  noCache?: boolean;
  force?: boolean;
  startBlock?: string;
  prepare?: boolean;
  write?: boolean;
  prepareCompleted?: boolean;
  preparePending?: boolean;
  inspect?: boolean;
  inspectOnly?: boolean;
}

/**
 * Validate CLI options for contradictions and conflicts.
 * Throws an error if conflicting options are detected.
 */
export function validateCliOptions(opts: CommonCliOptions, command: "run" | "track"): void {
  const errors: ValidationError[] = [];

  // Cache conflicts
  if (opts.cache && opts.noCache) {
    errors.push({
      flags: ["--cache", "--no-cache"],
      message: "--cache and --no-cache are mutually exclusive",
    });
  }

  // --force overrides --start-block (warn, not error)
  if (opts.force && opts.startBlock) {
    errors.push({
      flags: ["--force", "--start-block"],
      message: "--force resets discovery to block 0, overriding --start-block",
    });
  }

  // Track command specific validations
  if (command === "track") {
    // --inspect and --inspect-only are mutually exclusive
    if (opts.inspect && opts.inspectOnly) {
      errors.push({
        flags: ["--inspect", "--inspect-only"],
        message: "--inspect and --inspect-only are mutually exclusive",
      });
    }

    // --inspect-only skips tracking, so execution options don't make sense
    if (opts.inspectOnly) {
      const conflictingFlags: string[] = [];
      if (opts.prepare) conflictingFlags.push("--prepare");
      if (opts.write) conflictingFlags.push("--write");
      if (opts.prepareCompleted) conflictingFlags.push("--prepare-completed");
      if (opts.preparePending) conflictingFlags.push("--prepare-pending");

      if (conflictingFlags.length > 0) {
        errors.push({
          flags: ["--inspect-only", ...conflictingFlags],
          message: `--inspect-only skips tracking; ${conflictingFlags.join(", ")} require tracking`,
        });
      }
    }
  }

  if (errors.length > 0) {
    const messages = errors.map((e) => `  ${e.flags.join(" + ")}: ${e.message}`);
    throw new Error(`Conflicting options detected:\n${messages.join("\n")}`);
  }
}

/**
 * Parse gas settings from CLI options
 */
export function parseGasSettings(opts: { l2MaxFee?: string; l2PriorityFee?: string }): GasSettings {
  const maxFeePerGas = opts.l2MaxFee ? parseFloat(opts.l2MaxFee) : NaN;
  const maxPriorityFeePerGas = opts.l2PriorityFee ? parseFloat(opts.l2PriorityFee) : NaN;

  return {
    maxFeePerGas: isNaN(maxFeePerGas) ? DEFAULT_L2_GAS_SETTINGS.maxFeePerGas : maxFeePerGas,
    maxPriorityFeePerGas: isNaN(maxPriorityFeePerGas)
      ? DEFAULT_L2_GAS_SETTINGS.maxPriorityFeePerGas
      : maxPriorityFeePerGas,
  };
}

/**
 * Parse chunking config from CLI options
 */
export function parseChunkingConfig(
  opts: { l1ChunkSize?: string; l2ChunkSize?: string },
  delayMs: number
): { l1ChunkSize: number; l2ChunkSize: number; novaChunkSize: number; delayBetweenChunks: number } {
  const l1ChunkSize = parseInt(opts.l1ChunkSize || "0", 10);
  const l2ChunkSize = parseInt(opts.l2ChunkSize || "0", 10);
  return {
    l1ChunkSize,
    l2ChunkSize,
    novaChunkSize: l2ChunkSize,
    delayBetweenChunks: delayMs,
  };
}

export interface ProviderBundle {
  l2Provider: ethers.providers.JsonRpcProvider;
  l1Provider: ethers.providers.JsonRpcProvider;
  novaProvider: ethers.providers.JsonRpcProvider;
}

export function createProvidersFromOptions(opts: {
  l2Rpc?: string;
  l1Rpc?: string;
  novaRpc?: string;
}): ProviderBundle {
  const l2Rpc = opts.l2Rpc || process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;
  const l1Rpc = opts.l1Rpc || process.env.ETH_RPC || DEFAULT_RPC_URLS.ETHEREUM;
  const novaRpc = opts.novaRpc || process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

  // Warn when using default public RPCs (no env var or CLI option provided)
  const rpcConfigs = [
    { opt: opts.l1Rpc, env: "ETH_RPC", name: "Ethereum" },
    { opt: opts.l2Rpc, env: "ARB1_RPC", name: "Arbitrum One" },
    { opt: opts.novaRpc, env: "NOVA_RPC", name: "Nova" },
  ] as const;
  const warnings = rpcConfigs
    .filter(({ opt, env }) => !opt && !process.env[env])
    .map(({ name, env }) => `Using public RPC URL for ${name} (${env} not set)`);
  if (warnings.length > 0) {
    console.warn(`Warning: ${warnings.join("; ")}. Public RPCs may have rate limits.`);
  }

  // Use StaticJsonRpcProvider to avoid automatic chainId detection on every call
  return {
    l2Provider: new ethers.providers.StaticJsonRpcProvider(l2Rpc),
    l1Provider: new ethers.providers.StaticJsonRpcProvider(l1Rpc),
    novaProvider: new ethers.providers.StaticJsonRpcProvider(novaRpc),
  };
}

// ============================================================================
// Signer Creation
// ============================================================================

export function requirePrivateKeyForWrite(opts: { write?: boolean; privateKey?: string }): void {
  if (opts.write && !opts.privateKey) {
    console.error("Error: --write requires --private-key or PRIVATE_KEY env var");
    process.exit(1);
  }
}

export function createSigner(privateKey: string): ethers.Wallet {
  return new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : "0x" + privateKey);
}

// ============================================================================
// Transaction Execution
// ============================================================================

function getProviderForChain(chain: Chain, providers: ProviderBundle): ethers.providers.Provider {
  if (chain === "ethereum") return providers.l1Provider;
  if (chain === "nova") return providers.novaProvider;
  return providers.l2Provider;
}

export async function executeTransaction(
  prepared: PreparedTransaction,
  signer: ethers.Wallet,
  providers: ProviderBundle,
  gasSettings?: GasSettings
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const isRetryable = prepared.description?.toLowerCase().includes("retryable") ?? false;

  try {
    const provider = getProviderForChain(prepared.chain, providers);

    const connectedSigner = signer.connect(provider);

    console.log(`\nExecuting on ${prepared.chain}: ${prepared.description}`);
    console.log(`  To: ${prepared.to}`);
    if (prepared.value !== "0") console.log(`  Value: ${prepared.value}`);

    // Use custom gas settings for L2 chains (Arb1 and Nova)
    const isL2Chain = prepared.chain === "arb1" || prepared.chain === "nova";
    const effectiveGasSettings = isL2Chain ? (gasSettings ?? DEFAULT_L2_GAS_SETTINGS) : undefined;

    const txRequest: ethers.providers.TransactionRequest = {
      to: prepared.to,
      data: prepared.data,
      value: prepared.value,
    };

    if (effectiveGasSettings) {
      // Convert gwei to wei
      txRequest.maxFeePerGas = ethers.utils.parseUnits(
        effectiveGasSettings.maxFeePerGas.toString(),
        "gwei"
      );
      txRequest.maxPriorityFeePerGas = ethers.utils.parseUnits(
        effectiveGasSettings.maxPriorityFeePerGas.toString(),
        "gwei"
      );
      console.log(
        `  Gas: ${effectiveGasSettings.maxFeePerGas} gwei maxFee, ${effectiveGasSettings.maxPriorityFeePerGas} gwei priority`
      );
    }

    const tx = await connectedSigner.sendTransaction(txRequest);

    console.log(`  Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`  Confirmed in block ${receipt.blockNumber}`);

    return { success: true, txHash: tx.hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // For retryables, check if already redeemed
    if (
      isRetryable &&
      (message.includes("REDEEMED") ||
        message.includes("already redeemed") ||
        message.includes("NoTicketWithID"))
    ) {
      console.log(`  Retryable already redeemed, treating as success`);
      return { success: true };
    }

    return { success: false, error: message };
  }
}

// ============================================================================
// Output Formatting
// ============================================================================

/** Format the body of a prepared transaction (without header) */
function formatPreparedTxBody(prepared: PreparedTransaction): string[] {
  const lines = [`  Chain: ${prepared.chain}`, `  To: ${prepared.to}`];
  if (prepared.operationId) lines.push(`  OperationId: ${prepared.operationId}`);
  if (prepared.value !== "0") lines.push(`  Value: ${prepared.value}`);
  lines.push(`  Data: ${prepared.data}`);
  if (prepared.hashValidation) {
    lines.push(
      prepared.hashValidation.isValid
        ? `  Hash Valid: YES`
        : `  WARNING: Hash validation failed - ${prepared.hashValidation.error}`
    );
  }
  return lines;
}

export function formatDryRun(prepared: PreparedTransaction): string {
  return [`[DRY RUN] ${prepared.description}`, ...formatPreparedTxBody(prepared)].join("\n");
}

/**
 * Format multiple prepared transactions for display
 */
export function formatMultiplePreparedTransactions(
  preparedTransactions: PreparedTransaction[]
): string {
  if (preparedTransactions.length === 0) return "";
  if (preparedTransactions.length === 1) return formatDryRun(preparedTransactions[0]);

  return preparedTransactions
    .map((prepared, i) => [
      `[DRY RUN ${i + 1}/${preparedTransactions.length}] ${prepared.description}`,
      ...formatPreparedTxBody(prepared),
    ])
    .map((lines) => lines.join("\n"))
    .join("\n\n");
}

export function formatTrackingResult(result: TrackingResult, label?: string): string {
  const lines: string[] = [];

  if (label) lines.push(`--- ${label} ---`);

  const timelockStage = result.stages.find((s) => s.type === "L2_TIMELOCK");
  const operationId = timelockStage?.data.operationId as string | undefined;
  const isSecurityCouncil = timelockStage?.data.isSecurityCouncilOperation === true;
  const scNonce = timelockStage?.data.securityCouncilNonce as string | undefined;

  if (operationId) lines.push(`OperationId: ${operationId}`);
  if (isSecurityCouncil && scNonce) lines.push(`Security Council Nonce: ${scNonce}`);
  if (result.isElection) lines.push(`Type: createElection`);

  lines.push(`Complete: ${result.isComplete}`);
  lines.push(`Stages: ${result.stages.length}\n`);

  for (let i = 0; i < result.stages.length; i++) {
    const stage = result.stages[i];
    const title = formatStageTitle(stage.type);

    // Transaction links
    const txLines: string[] = [];
    for (const tx of stage.transactions) {
      const desc = tx.description ?? "tx";
      txLines.push(`      ${desc}: ${tx.hash}\n        ${getStageTransactionUrl(tx)}`);
    }

    // ETA info
    let etaInfo = "";
    if (stage.timing?.eta) {
      etaInfo = ` | ETA: ${new Date(stage.timing.eta * 1000).toISOString()}`;
    } else if (stage.status === "NOT_STARTED") {
      const expectedEta = calculateExpectedEta(result.stages, i);
      if (expectedEta) {
        etaInfo = ` | Expected: ~${new Date(expectedEta * 1000).toISOString()}`;
      }
    }

    // Retryable info
    let retryableInfo = "";
    if (stage.type === "RETRYABLE_EXECUTED") {
      const ticketCount = stage.data.ticketCount as number | undefined;
      const creationDetails = stage.data.creationDetails as
        | Array<{ targetChain: string }>
        | undefined;
      const redeemedCount = stage.data.redeemedCount as number | undefined;
      const pendingCount = stage.data.pendingCount as number | undefined;

      if (ticketCount && ticketCount > 0) {
        const arb1Count = creationDetails?.filter((d) => d.targetChain === "arb1").length ?? 0;
        const novaCount = creationDetails?.filter((d) => d.targetChain === "nova").length ?? 0;
        const chains = [arb1Count > 0 && `${arb1Count} Arb1`, novaCount > 0 && `${novaCount} Nova`]
          .filter(Boolean)
          .join(", ");

        retryableInfo = ` [${ticketCount} ticket${ticketCount !== 1 ? "s" : ""}: ${chains}`;
        if (stage.status === "COMPLETED") {
          retryableInfo += ` - all redeemed]`;
        } else if (pendingCount && pendingCount > 0) {
          retryableInfo += ` - ${redeemedCount ?? 0} redeemed, ${pendingCount} pending]`;
        } else {
          retryableInfo += `]`;
        }
      }
    }

    lines.push(`  ${title}: ${stage.status}${retryableInfo}${etaInfo}`);
    lines.push(...txLines);
  }

  return lines.join("\n").concat("\n");
}

export function formatCacheStatus(
  checkpoints: Map<string, TrackingCheckpoint>,
  elections: Map<number, TrackingCheckpoint>
): string {
  const stats = computeCacheStats(checkpoints, elections, MAX_CONSECUTIVE_ERRORS);

  const lines = [
    `Total cached: ${stats.total}`,
    ``,
    `Proposals: ${stats.proposals.total}`,
    `  Complete: ${stats.proposals.complete}`,
    `  Active: ${stats.proposals.active}`,
  ];
  if (stats.proposals.errored > 0) lines.push(`  Failed: ${stats.proposals.errored}`);

  lines.push(
    ``,
    `Timelock Ops: ${stats.timelocks.total}`,
    `  Complete: ${stats.timelocks.complete}`,
    `  Active: ${stats.timelocks.active}`
  );
  if (stats.timelocks.errored > 0) lines.push(`  Failed: ${stats.timelocks.errored}`);
  if (stats.elections.total > 0) {
    const active = stats.elections.total - stats.elections.complete;
    lines.push(
      ``,
      `Elections: ${stats.elections.total}`,
      `  Complete: ${stats.elections.complete}`,
      `  Active: ${active}`
    );
  }

  return lines.join("\n");
}

/**
 * Format an election status for CLI output
 */
export function formatElectionResult(election: ElectionProposalStatus): string {
  const lines: string[] = [];
  const cohortName = election.cohort === 0 ? "First" : "Second";
  const phaseName = election.phase.replace(/_/g, " ");

  lines.push(`[Election #${election.electionIndex}]`);
  lines.push(`Phase: ${phaseName}`);
  lines.push(`Cohort: ${cohortName}`);
  lines.push(`Complete: ${election.phase === "COMPLETED"}`);
  lines.push(`Stages: ${election.stages?.length ?? 0}`);
  lines.push("");

  if (election.stages && election.stages.length > 0) {
    for (let i = 0; i < election.stages.length; i++) {
      const stage = election.stages[i];
      const statusStr = stage.status;
      const title = formatStageTitle(stage.type);
      const eta = calculateExpectedEta(election.stages, i);

      let line = `  ${title}: ${statusStr}`;
      if (eta) line += ` | ETA: ${new Date(eta * 1000).toISOString()}`;
      lines.push(line);

      for (const tx of stage.transactions) {
        lines.push(`      tx: ${tx.hash}`);
        const url = getStageTransactionUrl(tx);
        if (url) lines.push(`        ${url}`);
      }
    }
  }

  // Show timelock operation ID if tracked (useful for cross-referencing)
  if (election.timelockOperationId) {
    lines.push(`  Timelock Op: ${election.timelockOperationId}`);
  }

  if (election.canProceedToMemberPhase) {
    lines.push("");
    lines.push("  → Ready to trigger member election");
  }
  if (election.canExecuteMember) {
    lines.push("");
    lines.push("  → Ready to execute member election");
  }
  if (election.canCreateElection) {
    lines.push("");
    lines.push("  → Ready to create election");
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Display a tracking result, automatically switching to election display for election proposals.
 * Handles the election auto-switch logic internally, falling back to formatTrackingResult for non-elections.
 *
 * @param result - Tracking result to display
 * @param label - Optional label prefix
 */
export function displayTrackingResult(result: TrackingResult, label?: string): void {
  if (result.isElection && result.electionStatus) {
    const election = result.electionStatus;
    const cohortName = election.cohort === 0 ? "First" : "Second";
    console.log(`=== Election #${election.electionIndex} ===`);
    console.log(`Phase: ${election.phase}`);
    console.log(`Cohort: ${cohortName} (${election.cohort})`);
    console.log(
      `Compliant Nominees: ${election.compliantNomineeCount}/${election.targetNomineeCount}`
    );

    if (election.nomineeProposalId) {
      console.log(`\nElection ID: ${election.nomineeProposalId}`);
      console.log(`\nNominee Phase:`);
      console.log(`  State: ${election.nomineeProposalState}`);
      if (election.vettingDeadline) {
        console.log(`  Vetting Deadline: block ${election.vettingDeadline}`);
      }
      console.log(`  In Vetting Period: ${election.isInVettingPeriod ? "YES" : "NO"}`);
    }

    if (election.memberProposalId) {
      console.log(`\nMember Phase:`);
      console.log(`  State: ${election.memberProposalState}`);
    }

    if (election.canProceedToMemberPhase) {
      console.log(`\n→ Ready to trigger member election`);
    }
    if (election.canExecuteMember) {
      console.log(`\n→ Ready to execute member election`);
    }
    console.log("");
    return;
  }

  console.log(formatTrackingResult(result, label));
}

// ============================================================================
// Loop Runner
// ============================================================================

async function waitWithChunks(ms: number): Promise<void> {
  const MAX_CHUNK = 60 * 60 * 1000; // 1 hour max per chunk
  let remaining = ms;
  while (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, MAX_CHUNK)));
    remaining -= MAX_CHUNK;
  }
}

/** Shared abort controller for graceful shutdown */
let globalAbortController: AbortController | null = null;

/** Check if shutdown has been requested */
export function isShuttingDown(): boolean {
  return globalAbortController?.signal.aborted ?? false;
}

export async function runWithLoop(
  cycleFn: () => Promise<void>,
  options: { loop: boolean; intervalMs: number; healthCheckUrl?: string }
): Promise<void> {
  if (!options.loop) {
    await cycleFn();
    return;
  }

  let consecutiveErrors = 0;
  let running = true;

  // Create abort controller for graceful shutdown
  globalAbortController = new AbortController();

  process.on("SIGINT", () => {
    running = false;
    globalAbortController?.abort();
    console.log("\nGracefully shutting down...");
  });

  while (running) {
    // Invalidate block cache at start of each cycle to ensure fresh data
    invalidateBlockInfoCache();

    try {
      await cycleFn();
      consecutiveErrors = 0;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("Cycle error:", errMsg);
      consecutiveErrors = Math.min(consecutiveErrors + 1, 10);
      const backoffMs = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 300000);
      console.log(
        `Backing off for ${backoffMs / 1000}s after ${consecutiveErrors} consecutive errors`
      );
      await waitWithChunks(backoffMs);
    }

    if (options.healthCheckUrl) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        await fetch(options.healthCheckUrl, { method: "GET", signal: controller.signal });
      } catch {
        // Silently ignore health check errors (including timeouts)
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (running) await waitWithChunks(options.intervalMs);
  }
}

// ============================================================================
// Monitor Cycle Types
// ============================================================================

export interface TrackCallbackResult {
  key: string;
  result: TrackingResult | null;
  preparedTransactions?: PreparedTransaction[];
  error?: string;
}

export interface TrackCallbackReturn {
  shouldRetrack?: boolean;
}

export interface MonitorRunOptions {
  prepare?: boolean;
  prepareCompleted?: boolean;
  preparePending?: boolean;
  onTrack?: (result: TrackCallbackResult) => Promise<TrackCallbackReturn | void> | void;
  startBlock?: number;
  blockLag?: number;
  maxChainDepth?: number;
  maxAgeDays?: number;
  /** Number of concurrent tracking operations (default: 1 = sequential) */
  concurrency?: number;
  /** Custom discovery targets (default: all enabled via buildDefaultTargets()) */
  targets?: DiscoveryTargets;
  /** Skip discovery and only track elections (faster when only elections needed) */
  electionsOnly?: boolean;
  /** Force re-track all elections, bypassing cache */
  forceElections?: boolean;
}

export interface MonitorRunResult {
  tracked: number;
  prepared: number;
  errors: number;
  retracked: number;
}

// ============================================================================
// Stage Preparation
// ============================================================================

const PREPARABLE_STAGE_TYPES = [
  "L2_TIMELOCK",
  "L1_TIMELOCK",
  "L2_TO_L1_MESSAGE",
  "RETRYABLE_EXECUTED",
] as const;

async function prepareStagesForResult(
  tracker: ProposalStageTracker,
  stages: TrackedStage[],
  options: { prepare?: boolean; prepareCompleted?: boolean; preparePending?: boolean },
  providers: ProviderBundle
): Promise<{
  preparedTransactions: PreparedTransaction[];
  preparations: PrepareResult[];
  count: number;
}> {
  const preparations: PrepareResult[] = [];
  const preparedTransactions: PreparedTransaction[] = [];
  let count = 0;

  if (!options.prepare) return { preparations, preparedTransactions, count };

  /**
   * Helper to prepare a stage and handle bulk results for RETRYABLE_EXECUTED and L2_TO_L1_MESSAGE
   */
  async function prepareSingleStage(stage: TrackedStage, prepOpts: { prepareCompleted?: boolean }) {
    // For retryable and L2→L1 message stages, use bulk prepare to get all transactions
    if (stage.type === "RETRYABLE_EXECUTED") {
      const retryableData = getStageData(stage, "RETRYABLE_EXECUTED");
      const targetChains = retryableData?.targetChains;
      if (!targetChains || targetChains.length === 0) {
        preparations.push({ success: false, error: "No target chains found" });
        return;
      }

      // Prepare retryables for each target chain (can be both Arb1 and Nova)
      for (const targetChain of targetChains) {
        const targetProvider =
          targetChain === "nova" ? providers.novaProvider : providers.l2Provider;
        const { results } = await prepareRetryableStage(
          stage,
          providers.l1Provider,
          targetProvider,
          prepOpts
        );
        preparations.push(...results);
        for (const result of results) {
          if (result.success) {
            count++;
            preparedTransactions.push(result.prepared);
          }
        }
      }
    } else if (stage.type === "L2_TO_L1_MESSAGE") {
      const { results } = await prepareL2ToL1MessageStage(
        stage,
        providers.l2Provider,
        providers.l1Provider,
        prepOpts
      );
      preparations.push(...results);
      for (const result of results) {
        if (result.success) {
          count++;
          preparedTransactions.push(result.prepared);
        }
      }
    } else {
      // For other stages, use the tracker's prepareTransaction
      const prepResult = await tracker.prepareTransaction(stage, prepOpts);
      preparations.push(prepResult);
      if (prepResult.success) {
        count++;
        preparedTransactions.push(prepResult.prepared);
      }
    }
  }

  if (options.prepareCompleted) {
    // Historical validation: prepare COMPLETED timelock stages
    for (const stage of stages) {
      if (stage.status === "COMPLETED" && isTimelockStage(stage.type)) {
        await prepareSingleStage(stage, { prepareCompleted: true });
      }
    }
  } else if (options.preparePending) {
    // Pre-execution: prepare PENDING stages
    for (const stage of stages) {
      const isPreparable = (PREPARABLE_STAGE_TYPES as readonly string[]).includes(stage.type);
      if (isPreparable && stage.status === "PENDING") {
        await prepareSingleStage(stage, { prepareCompleted: true });
      }
    }
  } else {
    // Normal: prepare only READY stages
    const ready = findExecutableStage(stages);
    if (ready) {
      await prepareSingleStage(ready, {});
    }
  }

  return { preparedTransactions, preparations, count };
}

// ============================================================================
// Monitor Cycle
// ============================================================================

/** Extract scope name from a tracking key (no truncation) */
function shortScope(key: string): string {
  // "tx:0x1234..." -> "0x1234..." (full hash, no truncation)
  if (key.startsWith("tx:")) {
    return key.slice(3);
  }
  return key;
}

/**
 * Check if a checkpoint matches the enabled discovery targets.
 * Used to filter incomplete checkpoints to only re-track types that are enabled.
 */
function checkpointMatchesTargets(
  checkpoint: TrackingCheckpoint,
  targets: DiscoveryTargets
): boolean {
  if (checkpoint.input.type === "governor") {
    const governorAddress = checkpoint.input.governorAddress;
    // Skip election governors - they're handled separately
    if (isElectionGovernor(governorAddress)) return false;
    // Check if constitutional or non-constitutional governor is enabled
    const isCore = isConstitutional(governorAddress);
    return isCore ? !!targets.constitutionalGovernor : !!targets.nonConstitutionalGovernor;
  }
  if (checkpoint.input.type === "timelock") {
    // Timelock operations: check if the corresponding timelock target is enabled
    const timelockAddress = checkpoint.input.timelockAddress;
    const isCore = isConstitutional(timelockAddress);
    return isCore ? !!targets.l2ConstitutionalTimelock : !!targets.l2NonConstitutionalTimelock;
  }
  if (checkpoint.input.type === "election") {
    return !!targets.electionNomineeGovernor || !!targets.electionMemberGovernor;
  }
  // Discovery checkpoints don't need re-tracking
  return false;
}

/**
 * Filter checkpoints to only include those matching enabled discovery targets.
 * Used for JSON output and stats to ensure we only show tracked types.
 */
export function filterCheckpointsByTargets(
  checkpoints: Map<string, TrackingCheckpoint>,
  targets: DiscoveryTargets
): Map<string, TrackingCheckpoint> {
  const filtered = new Map<string, TrackingCheckpoint>();
  for (const [key, checkpoint] of checkpoints) {
    if (checkpointMatchesTargets(checkpoint, targets)) {
      filtered.set(key, checkpoint);
    }
  }
  return filtered;
}

/**
 * Calculate stats filtered by enabled discovery targets.
 * Only counts checkpoints that match the enabled governors/timelocks.
 */
export function calculateFilteredStats(
  checkpoints: Map<string, TrackingCheckpoint>,
  targets: DiscoveryTargets,
  maxErrorCount: number = 5
): TrackerStats {
  let proposalTotal = 0,
    proposalComplete = 0,
    proposalActive = 0,
    proposalErrored = 0;
  let timelockTotal = 0,
    timelockComplete = 0,
    timelockActive = 0,
    timelockErrored = 0;
  let electionTotal = 0,
    electionComplete = 0;

  for (const [, checkpoint] of checkpoints) {
    const complete = isCheckpointComplete(checkpoint);
    const errored = isCheckpointErrored(checkpoint, maxErrorCount);
    const inputType = checkpoint.input.type;

    if (inputType === "governor") {
      const governorAddress = checkpoint.input.governorAddress;
      if (isElectionGovernor(governorAddress)) continue;

      const isCore = isConstitutional(governorAddress);
      const matchesTarget = isCore
        ? !!targets.constitutionalGovernor
        : !!targets.nonConstitutionalGovernor;

      if (!matchesTarget) continue;

      proposalTotal++;
      if (complete) proposalComplete++;
      else if (errored) proposalErrored++;
      else proposalActive++;
    } else if (inputType === "timelock") {
      const timelockAddress = checkpoint.input.timelockAddress;
      const isCore = isConstitutional(timelockAddress);
      const matchesTarget = isCore
        ? !!targets.l2ConstitutionalTimelock
        : !!targets.l2NonConstitutionalTimelock;

      if (!matchesTarget) continue;

      timelockTotal++;
      if (complete) timelockComplete++;
      else if (errored) timelockErrored++;
      else timelockActive++;
    } else if (inputType === "election") {
      // Only count elections if election tracking is enabled
      if (!targets.electionNomineeGovernor && !targets.electionMemberGovernor) continue;
      electionTotal++;
      if (complete) electionComplete++;
    }
  }

  return {
    total: proposalTotal + timelockTotal + electionTotal,
    proposals: {
      total: proposalTotal,
      complete: proposalComplete,
      active: proposalActive,
      errored: proposalErrored,
    },
    timelocks: {
      total: timelockTotal,
      complete: timelockComplete,
      active: timelockActive,
      errored: timelockErrored,
    },
    elections: { total: electionTotal, complete: electionComplete },
  };
}

export async function runMonitorCycle(
  tracker: ProposalStageTracker,
  providers: ProviderBundle,
  options: MonitorRunOptions = {}
): Promise<{
  result: MonitorRunResult;
  proposals: DiscoveredProposal[];
  timelockOps: DiscoveredTimelockOp[];
  watermarks: DiscoveryWatermarks;
  elections: ElectionProposalStatus[];
}> {
  const result: MonitorRunResult = { tracked: 0, prepared: 0, errors: 0, retracked: 0 };

  // Fast path: elections-only mode skips discovery entirely
  if (options.electionsOnly) {
    const elections: ElectionProposalStatus[] = [];
    if (!isShuttingDown()) {
      try {
        // Use tracker's cached method - completed elections use cache (0 RPC calls)
        // Use forceElections to bypass cache when --force is specified
        const allElections = await tracker.trackAllElections({ force: options.forceElections });
        for (const electionStatus of allElections) {
          elections.push(electionStatus);
          // Print each election
          console.log(formatElectionResult(electionStatus));
        }
      } catch (err) {
        console.error("Election tracking failed:", err);
      }
    }
    return {
      result,
      proposals: [],
      timelockOps: [],
      watermarks: {},
      elections,
    };
  }

  const l2Provider = providers.l2Provider;
  const tipBlock = await l2Provider.getBlockNumber();
  const blockLag = options.blockLag ?? DEFAULT_BLOCK_LAG;
  const currentBlock = Math.max(0, tipBlock - blockLag);
  const concurrency = options.concurrency ?? 1;
  const limit = pLimit(concurrency);
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;

  // Calculate startBlock based on maxAgeDays if not explicitly provided
  // ~7200 blocks per day on Arbitrum (12s block time on L1, ~250ms on L2)
  const BLOCKS_PER_DAY = 86400 / 0.25; // ~345,600 blocks/day on Arbitrum One
  let startBlockWatermarks: DiscoveryWatermarks | undefined;

  // Load existing watermarks to determine scan range
  const loadedWatermarks = await tracker.loadWatermarks();
  const hasWatermarks = Object.values(loadedWatermarks.watermarks).some((v) => v !== undefined);

  if (options.startBlock !== undefined) {
    // Explicit startBlock override (watermarks are exclusive, so subtract 1)
    startBlockWatermarks = {
      constitutionalGovernor: options.startBlock - 1,
      nonConstitutionalGovernor: options.startBlock - 1,
      electionNomineeGovernor: options.startBlock - 1,
      electionMemberGovernor: options.startBlock - 1,
      l2ConstitutionalTimelock: options.startBlock - 1,
      l2NonConstitutionalTimelock: options.startBlock - 1,
    };
    console.log(`Discovery: blocks ${options.startBlock} → ${currentBlock}`);
  } else if (!hasWatermarks) {
    // No cache - calculate start block from maxAgeDays
    const defaultStartBlock = Math.max(0, currentBlock - Math.floor(maxAgeDays * BLOCKS_PER_DAY));
    startBlockWatermarks = {
      constitutionalGovernor: defaultStartBlock,
      nonConstitutionalGovernor: defaultStartBlock,
      electionNomineeGovernor: defaultStartBlock,
      electionMemberGovernor: defaultStartBlock,
      l2ConstitutionalTimelock: defaultStartBlock,
      l2NonConstitutionalTimelock: defaultStartBlock,
    };
    console.log(
      `No cached watermarks. Discovery: blocks ${defaultStartBlock} → ${currentBlock} (~${maxAgeDays} days)`
    );
  } else {
    // Cached watermarks exist - calculate effective range from min watermark
    const watermarkBlocks = Object.values(loadedWatermarks.watermarks).filter(
      (v): v is number => v !== undefined
    );
    const minWatermark = Math.min(...watermarkBlocks);
    const blockRange = currentBlock - minWatermark;
    console.log(
      `Discovery: blocks ${minWatermark} → ${currentBlock} (${blockRange.toLocaleString()} blocks)`
    );
  }

  const targets = options.targets ?? buildDefaultTargets();
  const discoveryResult = await tracker.discoverAll(targets, currentBlock, startBlockWatermarks);

  const trackedKeys = new Set<string>();
  const trackedOperationIds = new Set<string>();

  async function track(key: string, trackFn: () => Promise<TrackingResult>): Promise<void> {
    if (trackedKeys.has(key)) return;
    trackedKeys.add(key);

    // Wrap tracking in scope for debug logging
    await withScope(shortScope(key), async () => {
      try {
        const trackResult = await trackFn();

        // Skip callback if shutting down
        if (isShuttingDown()) return;

        result.tracked++;

        if (trackResult.timelockLink?.operationId) {
          trackedOperationIds.add(trackResult.timelockLink.operationId.toLowerCase());
        }

        const prepResult = await prepareStagesForResult(
          tracker,
          trackResult.stages,
          options,
          providers
        );
        result.prepared += prepResult.count;

        // Skip callback if shutting down
        if (isShuttingDown()) return;

        const callbackResult = await options.onTrack?.({
          key,
          result: trackResult,
          preparedTransactions: prepResult.preparedTransactions,
        });

        if (callbackResult?.shouldRetrack) {
          trackedKeys.delete(key);
          await track(key, trackFn);
        }
      } catch (error) {
        // Skip error callback if shutting down
        if (isShuttingDown()) return;

        result.errors++;
        // Wrap error callback in try-catch to prevent nested errors from propagating
        try {
          await options.onTrack?.({
            key,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch (callbackError) {
          // Log the callback error but don't let it mask the original error
          console.error(
            `Error in onTrack callback for ${key}:`,
            callbackError instanceof Error ? callbackError.message : String(callbackError)
          );
        }
      }
    });
  }

  // Query incomplete checkpoints first to avoid duplicate tracking
  const incompleteCheckpoints = await tracker.queryIncompleteCheckpoints({
    maxAgeDays,
    maxErrorCount: MAX_CONSECUTIVE_ERRORS,
  });

  // Extract operationIds from governor checkpoints
  const governorOperationIds = new Set<string>();
  for (const { checkpoint } of incompleteCheckpoints) {
    if (checkpoint.input.type === "governor") {
      const stages = checkpoint.cachedData.completedStages ?? [];
      const opId = extractOperationId(stages);
      if (opId) governorOperationIds.add(opId.toLowerCase());
    }
  }

  // Build tracking tasks
  type TrackTask = { key: string; fn: () => Promise<TrackingResult> };

  // Phase 1: Track proposals and incomplete governor checkpoints first
  // This populates trackedOperationIds so we can filter TLOs correctly
  const proposalTasks: TrackTask[] = [];

  // 1a. Newly discovered proposals
  for (const p of discoveryResult.proposals) {
    const key = `tx:${p.creationTxHash.toLowerCase()}`;
    proposalTasks.push({
      key,
      fn: async () => {
        const results = await tracker.trackByTxHash(p.creationTxHash);
        if (results.length === 0) throw new Error(`No proposal found in tx ${p.creationTxHash}`);
        return results[0];
      },
    });
  }

  // 1b. Incomplete checkpoints to re-track (filtered by enabled targets)
  const targetMatchingCheckpoints = incompleteCheckpoints.filter(({ checkpoint }) =>
    checkpointMatchesTargets(checkpoint, targets)
  );
  result.retracked = targetMatchingCheckpoints.length;

  for (const { key, checkpoint } of targetMatchingCheckpoints) {
    if (checkpoint.input.type === "governor") {
      proposalTasks.push({
        key,
        fn: () => tracker.trackFromCheckpoint(checkpoint),
      });
    }
  }

  // Run proposal tasks first to populate trackedOperationIds
  await Promise.all(proposalTasks.map((task) => limit(() => track(task.key, task.fn))));

  // Phase 2: Track TLOs (filter out those already tracked via proposals)
  const timelockTasks: TrackTask[] = [];

  // 2a. Newly discovered timelock operations (filter duplicates)
  for (const op of discoveryResult.timelockOps) {
    const opIdLower = op.operationId.toLowerCase();
    // Skip if already tracked via proposal (either from cache or just tracked)
    if (governorOperationIds.has(opIdLower)) continue;
    if (trackedOperationIds.has(opIdLower)) continue;

    const key = `tx:${op.scheduledTxHash.toLowerCase()}`;
    timelockTasks.push({
      key,
      fn: async () => {
        const results = await tracker.trackByTxHash(op.scheduledTxHash);
        if (results.length === 0)
          throw new Error(`No timelock operation found in tx ${op.scheduledTxHash}`);
        const matchingResult = results.find((r) => {
          if (r.input.type === "timelock") return r.input.operationId.toLowerCase() === opIdLower;
          return r.timelockLink?.operationId?.toLowerCase() === opIdLower;
        });
        trackedOperationIds.add(opIdLower);
        return matchingResult ?? results[0];
      },
    });
  }

  // 2b. Incomplete timelock checkpoints to re-track
  for (const { key, checkpoint } of targetMatchingCheckpoints) {
    if (checkpoint.input.type === "timelock") {
      const operationId = checkpoint.input.operationId;
      // Skip if already tracked via proposal
      if (operationId && governorOperationIds.has(operationId.toLowerCase())) continue;
      if (operationId && trackedOperationIds.has(operationId.toLowerCase())) continue;
      timelockTasks.push({
        key,
        fn: () => tracker.trackFromCheckpoint(checkpoint),
      });
    }
  }

  // Run timelock tasks
  await Promise.all(timelockTasks.map((task) => limit(() => track(task.key, task.fn))));

  // Phase 3: Track elections (only if election targets are enabled)
  const elections: ElectionProposalStatus[] = [];
  const shouldTrackElections = targets.electionNomineeGovernor || targets.electionMemberGovernor;
  if (shouldTrackElections && !isShuttingDown()) {
    try {
      // Use tracker's cached method - completed elections use cache (0 RPC calls)
      const allElections = await tracker.trackAllElections({ force: options.forceElections });
      for (const electionStatus of allElections) {
        elections.push(electionStatus);
      }
    } catch (err) {
      // Election tracking is non-critical, log and continue
      console.error("Election tracking failed:", err);
    }
  }

  return {
    result,
    proposals: discoveryResult.proposals,
    timelockOps: discoveryResult.timelockOps,
    watermarks: discoveryResult.watermarks,
    elections,
  };
}

// ============================================================================
// Track and Prepare (for single-item tracking)
// ============================================================================

export async function trackAndPrepare(
  tracker: ProposalStageTracker,
  txHash: string,
  options: { prepare?: boolean; prepareCompleted?: boolean; preparePending?: boolean } = {},
  providers: ProviderBundle
): Promise<{
  results: TrackingResult[];
  preparations: PrepareResult[];
  preparedTransactions: PreparedTransaction[];
}> {
  const results = await tracker.trackByTxHash(txHash);
  const preparations: PrepareResult[] = [];
  const preparedTransactions: PreparedTransaction[] = [];

  for (const result of results) {
    const prepResult = await prepareStagesForResult(tracker, result.stages, options, providers);
    preparations.push(...prepResult.preparations);
    preparedTransactions.push(...prepResult.preparedTransactions);
  }

  return { results, preparations, preparedTransactions };
}

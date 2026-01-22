#!/usr/bin/env node
/**
 * Monitor CLI - Example SDK Usage
 *
 * NOTE: This is a CLI application that demonstrates SDK usage, not library code.
 * It serves as both a reference implementation and a production-ready tool.
 * Developers should treat this as an application of the SDK, not as part of the SDK API.
 *
 * Demonstrates how to use the governance tracking SDK for:
 * - Discovering proposals and timelock operations
 * - Tracking lifecycle stages
 * - Preparing and executing transactions
 *
 * Usage: npx @gzeoneth/gov-tracker [run|track <tx-hash>|election|status] [options]
 *
 * Dependencies:
 * - commander is an optional dependency required for CLI usage
 * - dotenv is a dev dependency; .env files are loaded if available
 */

// Load .env file if dotenv is available (dev dependency)
// Must be synchronous to ensure env vars are loaded before other imports access them
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch (err: unknown) {
  // Only ignore if module not found; re-throw other errors
  const isModuleNotFound =
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND";
  if (!isModuleNotFound) {
    throw err;
  }
}

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import debug from "debug";

// Check for required CLI dependencies (optional in package.json)
let Command: typeof import("commander").Command;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const commander = require("commander");
  Command = commander.Command;
} catch {
  console.error("Error: CLI requires 'commander' package.");
  console.error("Install it with: yarn add commander");
  process.exit(1);
}

// Read version from package.json
function getPackageVersion(): string {
  const candidates = [
    path.join(__dirname, "..", "..", "package.json"), // dist/cli -> package.json
    path.join(__dirname, "..", "..", "..", "package.json"), // src/cli -> package.json
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf8"));
        return pkg.version || "unknown";
      } catch (error) {
        console.error(`Failed to parse package.json at ${candidate}: ${getErrorMessage(error)}`);
        return "unknown";
      }
    }
  }
  return "unknown";
}
import {
  createTracker,
  ProposalStageTracker,
  formatStageTitle,
  TrackingProgress,
  CHUNK_SIZES,
  ChunkingConfig,
  extractAllSimulationsFromDecoded,
  getBundledCachePath,
  buildDefaultTargets,
  DiscoveryTargets,
  PreparedTransaction,
  FileCache,
} from "../index";
import { getErrorMessage } from "../utils/rpc-utils";
import type { ExtractedSimulation } from "../types/simulation";
import { buildDashboardState, writeDashboardState } from "./lib/json-state";
import { checkAndExecuteElection, formatElectionStatus } from "./lib/election-check";
import {
  rpcOptions,
  addOptions,
  createProvidersFromOptions,
  createSigner,
  requirePrivateKeyForWrite,
  validateCliOptions,
  executeTransaction,
  formatDryRun,
  formatMultiplePreparedTransactions,
  formatCacheStatus,
  displayTrackingResult,
  runWithLoop,
  runMonitorCycle,
  trackAndPrepare,
  TrackCallbackReturn,
  DEFAULT_BLOCK_LAG,
  MAX_CONSECUTIVE_ERRORS,
  isShuttingDown,
  GasSettings,
  formatElectionResult,
  calculateFilteredStats,
  filterCheckpointsByTargets,
  // Common options
  verboseOption,
  cacheOptions,
  executionOptions,
  chunkingOptions,
  gasOptions,
  loopOptions,
  parseGasSettings,
  parseChunkingConfig,
  safeParseInt,
} from "./lib/cli";
import { decodeCalldata, extractCalldataFromStage } from "../calldata";
import { Chain } from "../types";
import type { DecodedCalldata } from "../types/calldata";

// ============================================================================
// Helper Functions for Calldata Decoding and Display
// ============================================================================

/**
 * Format decoded calldata as an indented tree
 */
function formatDecodedCalldata(decoded: DecodedCalldata, indent = 0): string {
  const prefix = "  ".repeat(indent);
  const lines: string[] = [];

  if (decoded.isRetryable) {
    // Format retryable ticket label (use raw chain identifier)
    const chain = decoded.targetChain;
    lines.push(`${prefix}Retryable Ticket → ${chain}`);
  } else if (decoded.signature) {
    lines.push(`${prefix}${decoded.signature}`);
  } else {
    lines.push(`${prefix}Unknown function (${decoded.selector})`);
  }

  if (decoded.parameters) {
    for (const param of decoded.parameters) {
      let paramLine = `${prefix}  ${param.name} (${param.type}): `;

      // For addresses, show label if available
      if (param.addressLabel) {
        paramLine += `${param.displayValue} [${param.addressLabel}]`;
      } else {
        paramLine += param.displayValue;
      }

      lines.push(paramLine);

      // Show nested calldata
      if (param.nested) {
        lines.push(`${prefix}    └─ [NESTED]`);
        lines.push(formatDecodedCalldata(param.nested, indent + 3));
      }

      // Show nested array
      if (param.nestedArray && param.nestedArray.length > 0) {
        for (let i = 0; i < param.nestedArray.length; i++) {
          lines.push(`${prefix}    [${i}]:`);
          lines.push(formatDecodedCalldata(param.nestedArray[i], indent + 3));
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format simulation data for display
 */
function formatSimulations(simulations: ExtractedSimulation[]): string {
  if (simulations.length === 0) return "  No simulatable calls found.";

  const lines: string[] = [];
  for (const sim of simulations) {
    lines.push(`  [${sim.simulation.type.toUpperCase()}] ${sim.label}`);
    lines.push(`    Network: ${sim.simulation.networkId}`);
    lines.push(`    From: ${sim.simulation.from}`);
    lines.push(`    To: ${sim.simulation.to}`);
    lines.push(`    Value: ${sim.simulation.value}`);

    if (sim.simulation.type === "timelock") {
      lines.push(`    Operation ID: ${sim.simulation.operationId}`);
    }

    if (sim.batchIndex !== undefined) {
      lines.push(`    Batch Index: ${sim.batchIndex}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Get the platform-specific application data directory
 * - Windows: %APPDATA%\gov-tracker
 * - macOS: ~/Library/Application Support/gov-tracker
 * - Linux: ~/.config/gov-tracker (follows XDG Base Directory specification)
 */
function getAppDataDir(): string {
  const homeDir = os.homedir();
  const platform = os.platform();

  let baseDir: string;
  if (platform === "win32") {
    // Windows: Use APPDATA or fallback to %USERPROFILE%\AppData\Roaming
    baseDir = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
  } else if (platform === "darwin") {
    // macOS: Use Application Support directory
    baseDir = path.join(homeDir, "Library", "Application Support");
  } else {
    // Linux and others: Use XDG_CONFIG_HOME or fallback to ~/.config
    baseDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  }

  return path.join(baseDir, "gov-tracker");
}

/**
 * Get the default cache path and ensure the directory exists.
 * If user cache doesn't exist, copies bundled cache (if available) to bootstrap.
 */
function getDefaultCachePath(): string {
  const appDataDir = getAppDataDir();

  // Create directory if it doesn't exist (synchronously at startup)
  try {
    if (!fs.existsSync(appDataDir)) {
      fs.mkdirSync(appDataDir, { recursive: true });
    }
  } catch (_error) {
    // If we can't create the directory, fall back to current directory
    console.warn(
      `Warning: Could not create app data directory ${appDataDir}, using ./gov-tracker-cache.json`
    );
    return "./gov-tracker-cache.json";
  }

  const userCachePath = path.join(appDataDir, "gov-tracker-cache.json");

  // If user cache doesn't exist, try to copy bundled cache
  if (!fs.existsSync(userCachePath)) {
    const bundledPath = getBundledCachePath();
    if (bundledPath) {
      try {
        fs.copyFileSync(bundledPath, userCachePath);
        console.log(`Initialized cache from bundled data (${bundledPath})`);
      } catch (err) {
        // Non-fatal: just start with empty cache
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Warning: Could not copy bundled cache: ${errMsg}`);
      }
    }
  }

  return userCachePath;
}

// Default cache path in OS-specific application data directory
const DEFAULT_CACHE_PATH = getDefaultCachePath();

function createProgressCallback() {
  return (progress: TrackingProgress) => {
    if (isShuttingDown()) return;
    const { stage, currentIndex, totalStages } = progress;
    if (stage.status === "NOT_STARTED") return;
    console.log(
      `  [${currentIndex + 1}/${totalStages}] ${formatStageTitle(stage.type)} (${stage.chain}): ${stage.status}`
    );
  };
}

const program = new Command()
  .name("gov-tracker")
  .description(
    `Track and execute Arbitrum DAO governance proposal lifecycle stages\nVersion: ${getPackageVersion()}`
  )
  .version(getPackageVersion());

// ============================================================================
// Run Command
// ============================================================================

const runCmd = program
  .command("run", { isDefault: true })
  .description("Discover, track, and optionally prepare/execute (default command)");
addOptions(runCmd, rpcOptions);
addOptions(runCmd, executionOptions);
addOptions(runCmd, chunkingOptions(CHUNK_SIZES.L1, CHUNK_SIZES.L2));
addOptions(runCmd, gasOptions);
addOptions(runCmd, loopOptions);
runCmd
  .addOption(cacheOptions.cache(DEFAULT_CACHE_PATH))
  .addOption(cacheOptions.force)
  .addOption(cacheOptions.noCache)
  .addOption(verboseOption)
  .option("--start-block <block>", "Start block for discovery (skips cache)")
  .option(
    "--block-lag <blocks>",
    `Blocks behind tip (default: ${DEFAULT_BLOCK_LAG})`,
    String(DEFAULT_BLOCK_LAG)
  )
  .option(
    "--max-age-days <days>",
    "Max age for re-tracking incomplete proposals (default: 60)",
    "60"
  )
  .option("--json-output <path>", "Write JSON state for dashboard integration")
  .option("--election", "Also check for Security Council elections each cycle")
  .option("--concurrency <n>", "Number of concurrent tracking operations", "1")
  .option("--track-core", "Track constitutional (core) governor proposals")
  .option("--track-treasury", "Track non-constitutional (treasury) governor proposals")
  .option("--track-timelocks", "Track L2 timelock operations (direct schedules)")
  .option("--track-elections", "Track election governor proposals")
  .action(async (opts) => {
    if (opts.verbose) debug.enable("gov-tracker:*");
    validateCliOptions(opts, "run");
    requirePrivateKeyForWrite(opts);

    const providers = createProvidersFromOptions(opts);
    const chunkingConfig: ChunkingConfig = parseChunkingConfig(opts, CHUNK_SIZES.DELAY_MS);
    // --no-cache disables cache entirely; use autoFlush: false for batch writes
    const cachePath = opts.noCache ? undefined : opts.cache;
    const cache = cachePath ? new FileCache(cachePath, { autoFlush: false }) : undefined;

    // If --force is specified, clear cache at start to ensure fresh tracking
    // This is cleaner than passing force flags through - all tracking methods
    // work normally with the cache, which starts empty
    if (opts.force && cache) {
      await cache.clear();
    }

    const tracker = createTracker({
      ...providers,
      cache,
      chunkingConfig,
      onProgress: createProgressCallback(),
    });
    const signer = opts.write ? createSigner(opts.privateKey) : null;

    // If --force is specified, start from block 0; otherwise use provided startBlock
    const startBlock = opts.force
      ? 0 // Force re-discovery from the beginning
      : opts.startBlock
        ? safeParseInt(opts.startBlock, 0) || undefined // 0 becomes undefined
        : undefined;
    const blockLag = safeParseInt(opts.blockLag, DEFAULT_BLOCK_LAG);
    const maxAgeDays = safeParseInt(opts.maxAgeDays, 60);
    const intervalMs = safeParseInt(opts.interval, 60) * 1000;
    const concurrency = safeParseInt(opts.concurrency, 1);

    const gasSettings: GasSettings = parseGasSettings(opts);

    // Build discovery targets from --track-* flags
    // If any --track-* flag is specified, only track those; otherwise track all
    const hasTrackFlags =
      opts.trackCore || opts.trackTreasury || opts.trackTimelocks || opts.trackElections;
    // Detect what types are being tracked
    const trackingProposals = !hasTrackFlags || opts.trackCore || opts.trackTreasury;
    const trackingTimelocks = !hasTrackFlags || opts.trackTimelocks;
    const trackingElections = !hasTrackFlags || opts.trackElections;
    // Detect elections-only mode (only --track-elections, no other --track-* flags)
    const electionsOnly =
      opts.trackElections && !opts.trackCore && !opts.trackTreasury && !opts.trackTimelocks;
    const discoveryTargets: DiscoveryTargets = hasTrackFlags
      ? {
          constitutionalGovernor: opts.trackCore,
          nonConstitutionalGovernor: opts.trackTreasury,
          l2ConstitutionalTimelock: opts.trackTimelocks,
          l2NonConstitutionalTimelock: opts.trackTimelocks,
          electionNomineeGovernor: opts.trackElections,
          electionMemberGovernor: opts.trackElections,
        }
      : buildDefaultTargets();

    if (opts.verbose) {
      if (startBlock !== undefined) console.log(`Starting discovery from block ${startBlock}`);
      console.log(`Block lag: ${blockLag} blocks behind tip`);
      console.log(`Max age for re-tracking: ${maxAgeDays} days`);
      console.log(`Max consecutive errors before skip: ${MAX_CONSECUTIVE_ERRORS}`);
      if (concurrency > 1) console.log(`Concurrency: ${concurrency}`);
      if (hasTrackFlags) {
        const enabled = Object.entries(discoveryTargets)
          .filter(([, v]) => v)
          .map(([k]) => k);
        console.log(`Tracking targets: ${enabled.join(", ")}`);
      }
      console.log(
        `L2 gas: ${gasSettings.maxFeePerGas} gwei maxFee, ${gasSettings.maxPriorityFeePerGas} gwei priority`
      );
    }
    if (signer) console.log(`Executing with: ${signer.address}`);

    // Track whether this is the first cycle (for startBlock override)
    let isFirstCycle = true;

    async function runCycle(): Promise<void> {
      if (electionsOnly) {
        console.log("Tracking elections...\n");
      } else {
        console.log("Discovering proposals and operations...\n");
      }
      let electionsSkipped = 0;

      // Only use startBlock on the first cycle; subsequent cycles resume from watermarks
      const cycleStartBlock = isFirstCycle ? startBlock : undefined;
      isFirstCycle = false;

      const { result, proposals, timelockOps, elections } = await runMonitorCycle(
        tracker,
        providers,
        {
          prepare: opts.prepare || opts.write || opts.prepareCompleted || opts.preparePending,
          prepareCompleted: opts.prepareCompleted,
          preparePending: opts.preparePending,
          startBlock: cycleStartBlock,
          blockLag,
          maxAgeDays,
          concurrency,
          targets: discoveryTargets,
          electionsOnly,
          onTrack: async (r): Promise<TrackCallbackReturn> => {
            // Skip showing complete elections
            if (r.result?.isElection && r.result?.isComplete) {
              electionsSkipped++;
              return {};
            }

            if (r.result) {
              console.log(`\n[${r.key}]`);
              displayTrackingResult(r.result);
            } else if (r.error) {
              console.log(`\n[${r.key}] ERROR: ${r.error}`);
            }

            const txsToDisplay = r.preparedTransactions ?? [];
            if (txsToDisplay.length > 0) {
              console.log(`\n[PREPARED] ${r.key}`);
              console.log(formatMultiplePreparedTransactions(txsToDisplay));

              if (signer) {
                let executedAny = false;
                for (const prepared of txsToDisplay) {
                  const execResult = await executeTransaction(
                    prepared,
                    signer,
                    providers,
                    gasSettings
                  );
                  if (!execResult.success) {
                    console.error(`  Execution failed: ${execResult.error}`);
                  } else {
                    executedAny = true;
                  }
                }
                if (executedAny) {
                  console.log(`  Executed! Re-tracking to find next stages...`);
                  return { shouldRetrack: true };
                }
              }
            }
            return {};
          },
        }
      );

      // Skip output if shutting down
      if (isShuttingDown()) return;

      // Get checkpoints and calculate filtered stats based on enabled targets
      const checkpoints = await tracker.getAllCheckpoints();
      const stats = calculateFilteredStats(checkpoints, discoveryTargets);

      // Build summary based on what was tracked this run
      if (electionsOnly) {
        // Elections-only mode: count from tracked elections, not cache
        const electionComplete = elections.filter((e) => e.phase === "COMPLETED").length;
        console.log(
          `\nTracked ${elections.length} elections (${electionComplete}/${elections.length} complete)`
        );
      } else {
        // Discovery mode: show stats for tracked types only
        const electionSummary =
          trackingElections && elections.length > 0
            ? `, ${elections.length} elections (${stats.elections.complete}/${stats.elections.total} complete)`
            : "";

        // Build incomplete stats for tracked types
        const incompleteParts: string[] = [];
        if (trackingProposals && stats.proposals.active > 0) {
          incompleteParts.push(`${stats.proposals.active} proposals`);
        }
        if (trackingTimelocks && stats.timelocks.active > 0) {
          incompleteParts.push(`${stats.timelocks.active} timelocks`);
        }
        const incompleteSummary =
          incompleteParts.length > 0 ? ` | Incomplete: ${incompleteParts.join(", ")}` : "";

        console.log(
          `\nFound ${proposals.length} new proposals, ${timelockOps.length} new ops${electionSummary}${incompleteSummary} | ` +
            `Tracked: ${result.tracked}, Prepared: ${result.prepared}` +
            (electionsSkipped > 0 ? ` (${electionsSkipped} elections skipped)` : "")
        );
      }

      if (opts.jsonOutput) {
        const filteredCheckpoints = filterCheckpointsByTargets(checkpoints, discoveryTargets);
        writeDashboardState(buildDashboardState(filteredCheckpoints), opts.jsonOutput);
        if (opts.verbose) console.log(`JSON state written to ${opts.jsonOutput}`);
      }

      if (opts.election && !isShuttingDown()) {
        try {
          const electionResult = await checkAndExecuteElection(providers, signer, {
            write: opts.write,
            verbose: opts.verbose,
          });
          for (const error of electionResult.errors) {
            console.error(`[ELECTION] ${error}`);
          }
        } catch (error) {
          console.error(`[ELECTION] Check failed: ${getErrorMessage(error)}`);
        }
      }
    }

    if (opts.loop) {
      console.log(`Running in loop mode, checking every ${opts.interval} seconds...`);
      if (opts.healthCheckUrl) console.log(`Health check URL: ${opts.healthCheckUrl}`);
      if (opts.jsonOutput) console.log(`JSON output: ${opts.jsonOutput}`);
      if (opts.election) console.log(`Election checking: enabled`);
    }

    await runWithLoop(runCycle, {
      loop: opts.loop,
      intervalMs,
      healthCheckUrl: opts.healthCheckUrl,
    });

    // Flush cache at end (single write instead of per-item)
    await cache?.flush();
  });

// ============================================================================
// Track Command
// ============================================================================

const trackCmd = program
  .command("track")
  .description("Track a specific proposal or operation")
  .argument("<tx-hash>", "Transaction hash to track");
addOptions(trackCmd, rpcOptions);
addOptions(trackCmd, executionOptions);
addOptions(trackCmd, chunkingOptions(CHUNK_SIZES.L1, CHUNK_SIZES.L2));
addOptions(trackCmd, gasOptions);
trackCmd
  .addOption(cacheOptions.cache(DEFAULT_CACHE_PATH))
  .addOption(cacheOptions.force)
  .addOption(cacheOptions.noCache)
  .addOption(verboseOption)
  .option("-i, --inspect", "Decode and inspect calldata (with tracking)")
  .option("--inspect-only", "Decode and inspect calldata without tracking")
  .option("--show-simulation", "Show simulation data for each call")
  .action(async (txHash: string, opts) => {
    if (opts.verbose) debug.enable("gov-tracker:*");
    validateCliOptions(opts, "track");
    requirePrivateKeyForWrite(opts);

    try {
      const providers = createProvidersFromOptions(opts);
      const chunkingConfig: ChunkingConfig = parseChunkingConfig(opts, CHUNK_SIZES.DELAY_MS);
      const gasSettings: GasSettings = parseGasSettings(opts);
      const chainContext: Chain = "arb1";

      if (opts.verbose) {
        console.log(
          `L2 gas: ${gasSettings.maxFeePerGas} gwei maxFee, ${gasSettings.maxPriorityFeePerGas} gwei priority`
        );
        if (opts.cache) console.log(`Cache: ${opts.cache}`);
        if (opts.force) console.log(`Force: ignoring cached data`);
      }

      // Use cache unless --no-cache is specified
      // --force clears the cache entry before tracking but still writes results
      const cachePath = opts.noCache ? undefined : opts.cache;
      const tracker = createTracker({
        ...providers,
        cachePath,
        chunkingConfig,
        onProgress: opts.verbose ? createProgressCallback() : undefined,
      });

      // Clear all cache entries for this tx if --force to ensure fresh tracking
      if (opts.force && cachePath) {
        await tracker.clearTxCacheEntries(txHash);
      }

      let calldatas: string[] = [];
      let targets: string[] = [];
      let values: string[] = [];

      // If --inspect-only, skip tracking and just decode
      if (opts.inspectOnly) {
        console.log(`Fetching proposal from tx: ${txHash}...\n`);

        const results = await tracker.trackByTxHash(txHash);
        if (results.length === 0) {
          console.error("No proposal found in transaction");
          process.exit(1);
        }

        const result = results[0];
        if (result.stages.length > 0) {
          const {
            calldatas: extractedCalldatas,
            targets: extractedTargets,
            values: extractedValues,
          } = extractCalldataFromStage(result.stages[0]);
          calldatas = extractedCalldatas;
          targets = extractedTargets;
          values = extractedValues;
        }

        if (calldatas.length === 0) {
          console.error("No calldata found in proposal");
          process.exit(1);
        }
      } else {
        // Normal tracking flow
        console.log(`Tracking from tx: ${txHash}\n`);

        const shouldPrepare =
          opts.prepare || opts.write || opts.prepareCompleted || opts.preparePending;

        const { results, preparations, preparedTransactions } = await trackAndPrepare(
          tracker,
          txHash,
          {
            prepare: shouldPrepare,
            prepareCompleted: opts.prepareCompleted,
            preparePending: opts.preparePending,
          },
          providers
        );

        if (results.length === 0) {
          console.error("No proposal or timelock operation found in transaction");
          process.exit(1);
        }

        // Format tracking output
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const label = results.length > 1 ? `Operation ${i + 1}/${results.length}` : undefined;
          displayTrackingResult(r, label);
        }

        // Show all prepared transactions
        if (preparedTransactions.length > 0) {
          console.log(`\n${formatMultiplePreparedTransactions(preparedTransactions)}`);
        }

        // Show preparation errors
        const failedPreparations = preparations.filter((p) => !p.success);
        failedPreparations.forEach((prep) => {
          console.log(`\n[PREPARE ERROR] ${prep.error}`);
        });

        // Extract calldata for decoding (if --inspect or --show-simulation)
        if (opts.inspect || opts.showSimulation) {
          if (results.length > 0 && results[0].stages.length > 0) {
            const {
              calldatas: extractedCalldatas,
              targets: extractedTargets,
              values: extractedValues,
            } = extractCalldataFromStage(results[0].stages[0]);
            calldatas = extractedCalldatas;
            targets = extractedTargets;
            values = extractedValues;
          }
        }

        // Execute if --write (only when not in inspect-only mode)
        if (opts.write && preparedTransactions.length > 0) {
          const signer = createSigner(opts.privateKey);
          console.log(`\n=== Executing with ${signer.address} ===`);

          let currentPreparedTxs = preparedTransactions;
          let chainDepth = 0;
          const maxChainDepth = 10;

          while (currentPreparedTxs.length > 0 && chainDepth < maxChainDepth) {
            chainDepth++;
            let executedAny = false;

            for (const prepared of currentPreparedTxs) {
              const result = await executeTransaction(prepared, signer, providers, gasSettings);
              if (!result.success) {
                console.error(`Execution failed: ${result.error}`);
              } else {
                executedAny = true;
              }
            }

            if (!executedAny) break;

            console.log(`\nRe-tracking to find next stages...`);
            const retracked = await trackAndPrepare(tracker, txHash, { prepare: true }, providers);

            for (let i = 0; i < retracked.results.length; i++) {
              const r = retracked.results[i];
              const label =
                retracked.results.length > 1
                  ? `Operation ${i + 1}/${retracked.results.length}`
                  : undefined;
              displayTrackingResult(r, label);
            }

            if (retracked.preparedTransactions.length > 0) {
              console.log(
                `\n${formatMultiplePreparedTransactions(retracked.preparedTransactions)}`
              );
            }

            const retrackedFailed = retracked.preparations.filter((p) => !p.success);
            retrackedFailed.forEach((prep) => {
              console.log(`\n[PREPARE ERROR] ${prep.error}`);
            });

            currentPreparedTxs = retracked.preparedTransactions;
          }
        }
      }

      // Decode and display calldata if requested
      if (opts.showSimulation || opts.inspectOnly || opts.inspect) {
        if (calldatas.length === 0) {
          console.error("No calldata available for decoding");
          process.exit(1);
        }

        console.log("\n=== Decoded Calldata ===\n");

        const allDecoded: DecodedCalldata[] = [];
        const allSimulations: ExtractedSimulation[] = [];

        for (let i = 0; i < calldatas.length; i++) {
          const decoded = await decodeCalldata(calldatas[i], targets[i], 0, chainContext);
          allDecoded.push(decoded);

          if (calldatas.length > 1) {
            console.log(`--- Action ${i + 1}/${calldatas.length} ---`);
            console.log(`Target: ${targets[i]}`);
            console.log(`Value: ${values[i]}`);
          }
          console.log(formatDecodedCalldata(decoded));
          console.log("");

          if (opts.showSimulation) {
            const sims = extractAllSimulationsFromDecoded(decoded, chainContext);
            allSimulations.push(...sims);
          }
        }

        if (opts.showSimulation) {
          console.log("=== Simulation Data ===\n");
          console.log(formatSimulations(allSimulations));
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(errMsg);
      process.exit(1);
    }
  });

// ============================================================================
// Status Command
// ============================================================================

program
  .command("status")
  .description("Show cached state")
  .addOption(cacheOptions.cache(DEFAULT_CACHE_PATH))
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const { watermarks, checkpoints, elections } = await ProposalStageTracker.readCacheStatus(
      opts.cache
    );

    if (opts.json) {
      const checkpointsObj: Record<string, unknown> = {};
      for (const [key, checkpoint] of checkpoints) {
        checkpointsObj[key] = checkpoint;
      }
      for (const [index, checkpoint] of elections) {
        checkpointsObj[`election:${index}`] = checkpoint;
      }
      console.log(JSON.stringify({ watermarks, checkpoints: checkpointsObj }, null, 2));
    } else {
      console.log(formatCacheStatus(checkpoints, elections));
    }
  });

// ============================================================================
// Election Command
// ============================================================================

const electionCmd = program
  .command("election")
  .description("Check Security Council election status and track elections");
addOptions(electionCmd, rpcOptions);
addOptions(electionCmd, loopOptions);
addOptions(electionCmd, executionOptions);
electionCmd
  .addOption(cacheOptions.cache(DEFAULT_CACHE_PATH))
  .addOption(cacheOptions.noCache)
  .addOption(cacheOptions.force)
  .addOption(verboseOption)
  .option("--list", "List all elections with their statuses")
  .option("--track <index>", "Track a specific election by index")
  .option("--details", "Show detailed nominee/member info (use with --track)")
  .action(async (opts) => {
    if (opts.verbose) debug.enable("gov-tracker:*");
    requirePrivateKeyForWrite(opts);

    const providers = createProvidersFromOptions(opts);
    const signer = opts.write ? createSigner(opts.privateKey) : null;

    // Create tracker with cache (unless --no-cache)
    const cachePath = opts.noCache ? undefined : opts.cache;
    const cache = cachePath ? new FileCache(cachePath) : undefined;

    // If --force is specified, clear cache at start to ensure fresh tracking
    if (opts.force && cache) {
      await cache.clear();
    }

    const tracker = createTracker({
      ...providers,
      cache,
    });

    // Import election tracking functions for detailed queries
    const {
      getNomineeElectionDetails,
      getMemberElectionDetails,
      prepareMemberElectionTrigger,
      prepareMemberElectionExecution,
    } = await import("../index");

    // --list: Show all elections (uses cached data for completed elections)
    if (opts.list) {
      console.log("Fetching all elections...\n");
      const elections = await tracker.trackAllElections();

      if (elections.length === 0) {
        console.log("No elections found.");
        return;
      }

      console.log(`=== Security Council Elections (${elections.length} total) ===\n`);
      for (const election of elections) {
        const cohortName = election.cohort === 0 ? "First" : "Second";
        console.log(`Election #${election.electionIndex}`);
        console.log(`  Phase: ${election.phase}`);
        console.log(`  Cohort: ${cohortName} (${election.cohort})`);
        console.log(
          `  Compliant Nominees: ${election.compliantNomineeCount}/${election.targetNomineeCount}`
        );
        if (election.nomineeProposalId) {
          console.log(`  Nominee Proposal: ${election.nomineeProposalState}`);
        }
        if (election.memberProposalId) {
          console.log(`  Member Proposal: ${election.memberProposalState}`);
        }
        if (election.canProceedToMemberPhase) {
          console.log(`  → Ready to trigger member election`);
        }
        if (election.canExecuteMember) {
          console.log(`  → Ready to execute member election`);
        }
        console.log("");
      }
      return;
    }

    // --track <index>: Track specific election (uses cache unless --force cleared it)
    if (opts.track !== undefined) {
      const electionIndex = parseInt(opts.track, 10);
      if (isNaN(electionIndex) || electionIndex < 0) {
        console.error(`Invalid election index: ${opts.track}`);
        process.exit(1);
      }
      console.log(`Tracking election #${electionIndex}...\n`);

      const election = await tracker.trackElection(electionIndex);

      // Use shared formatter for consistent output with stages
      console.log(formatElectionResult(election));

      // Show detailed info if requested
      if (opts.details) {
        console.log(`\n--- Detailed Information ---`);

        if (election.nomineeProposalId) {
          const nomineeDetails = await getNomineeElectionDetails(
            electionIndex,
            providers.l2Provider
          );
          if (nomineeDetails) {
            console.log(`\nNominee Election Details:`);
            console.log(`  Contenders: ${nomineeDetails.contenders.length}`);
            console.log(`  Total Nominees: ${nomineeDetails.nominees.length}`);
            console.log(`  Compliant: ${nomineeDetails.compliantNominees.length}`);
            console.log(`  Excluded: ${nomineeDetails.excludedNominees.length}`);
            console.log(`  Quorum Threshold: ${nomineeDetails.quorumThreshold.toString()} votes`);

            if (nomineeDetails.contenders.length > 0) {
              console.log(`\n  Registered Contenders (${nomineeDetails.contenders.length}):`);
              for (const contender of nomineeDetails.contenders) {
                const extra = opts.verbose ? ` (block ${contender.registeredAtBlock})` : "";
                console.log(`    ${contender.address}${extra}`);
              }
            }

            if (nomineeDetails.compliantNominees.length > 0) {
              console.log(`\n  Qualified Nominees (${nomineeDetails.compliantNominees.length}):`);
              for (const nominee of nomineeDetails.compliantNominees) {
                const extra =
                  opts.verbose && nominee.nominatedAtBlock
                    ? ` (block ${nominee.nominatedAtBlock})`
                    : "";
                console.log(
                  `    ${nominee.address}: ${nominee.votesReceived.toString()} votes${extra}`
                );
              }
            }

            if (nomineeDetails.excludedNominees.length > 0) {
              console.log(`\n  Excluded Nominees (${nomineeDetails.excludedNominees.length}):`);
              for (const nominee of nomineeDetails.excludedNominees) {
                const extra =
                  opts.verbose && nominee.excludedAtBlock
                    ? ` (block ${nominee.excludedAtBlock})`
                    : "";
                console.log(`    ${nominee.address}: excluded${extra}`);
              }
            }
          }
        }

        if (election.memberProposalId) {
          const memberDetails = await getMemberElectionDetails(electionIndex, providers.l2Provider);
          if (memberDetails) {
            console.log(`\nMember Election Details:`);
            console.log(`  Full Weight Deadline: block ${memberDetails.fullWeightDeadline}`);
            console.log(`  Proposal Deadline: block ${memberDetails.proposalDeadline}`);

            if (memberDetails.nominees.length > 0) {
              console.log(`\n  Candidates by Weight (${memberDetails.nominees.length}):`);
              for (const nominee of memberDetails.nominees) {
                const winnerTag = nominee.isWinner ? " [WINNER]" : "";
                console.log(
                  `    #${nominee.rank} ${nominee.address}: ${nominee.weightReceived.toString()}${winnerTag}`
                );
              }
            }

            if (memberDetails.winners.length > 0) {
              console.log(`\n  Elected Members (${memberDetails.winners.length}):`);
              for (const winner of memberDetails.winners) {
                console.log(`    ${winner}`);
              }
            }
          }
        }
      }

      // Determine action status: READY (can execute), PENDING (waiting), or COMPLETED
      type ActionStatus = "READY" | "PENDING" | "COMPLETED";
      function getActionStatus(
        isReady: boolean,
        isPending: boolean,
        isCompleted: boolean
      ): ActionStatus {
        if (isReady) return "READY";
        if (isCompleted) return "COMPLETED";
        if (isPending) return "PENDING";
        return "PENDING";
      }

      // Should we show/prepare this action based on flags?
      function shouldShowAction(status: ActionStatus): boolean {
        // Always show READY actions
        if (status === "READY") return true;
        // Otherwise, only if --prepare* flags match the status
        if (opts.preparePending && status === "PENDING") return true;
        if (opts.prepareCompleted && status === "COMPLETED") return true;
        return false;
      }

      // Helper to prepare and optionally execute an election action
      async function handleElectionAction(
        actionName: string,
        prepareFunc: () => Promise<PreparedTransaction | null>,
        status: ActionStatus
      ): Promise<void> {
        if (!shouldShowAction(status)) return;

        console.log(`\n[ACTION] ${actionName} (${status})`);
        const prepared = await prepareFunc();
        if (!prepared) return;

        console.log(formatDryRun(prepared));
        if (signer && opts.write && status === "READY") {
          const execResult = await executeTransaction(prepared, signer, providers);
          if (execResult.success) {
            console.log(`\n[EXECUTED] ${actionName} succeeded! Tx: ${execResult.txHash}`);
          } else {
            console.error(`\n[ERROR] Execution failed: ${execResult.error}`);
          }
        }
      }

      // Trigger member election
      const triggerStatus = getActionStatus(
        election.canProceedToMemberPhase,
        election.phase === "VETTING_PERIOD" && !election.canProceedToMemberPhase,
        election.memberProposalId !== null
      );
      await handleElectionAction(
        "Trigger member election",
        () => prepareMemberElectionTrigger(election, providers.l2Provider),
        triggerStatus
      );

      // Execute member election
      const executeStatus = getActionStatus(
        election.canExecuteMember,
        election.phase === "MEMBER_ELECTION" && !election.canExecuteMember,
        election.phase === "COMPLETED"
      );
      await handleElectionAction(
        "Execute member election - install new council",
        () => prepareMemberElectionExecution(election, providers.l2Provider),
        executeStatus
      );

      return;
    }

    // Default: Check election status (original behavior)
    async function checkElection(): Promise<void> {
      try {
        const result = await checkAndExecuteElection(providers, signer, {
          write: opts.write,
          verbose: true,
        });
        console.log(`\n${formatElectionStatus(result.status, result.currentElectionStatus)}`);
        for (const error of result.errors) {
          console.error(`[ERROR] ${error}`);
        }
      } catch (error) {
        console.error("Election check failed:", getErrorMessage(error));
      }
    }

    const intervalMs = safeParseInt(opts.interval, 60) * 1000;

    if (opts.loop) {
      console.log(`Running in loop mode, checking every ${opts.interval} seconds...`);
      if (opts.healthCheckUrl) console.log(`Health check URL: ${opts.healthCheckUrl}`);
    }

    await runWithLoop(checkElection, {
      loop: opts.loop,
      intervalMs,
      healthCheckUrl: opts.healthCheckUrl,
    });
  });

// ============================================================================
// UI Command - Interactive TUI
// ============================================================================

program
  .command("ui")
  .description("Interactive TUI for browsing proposals (cache-only)")
  .addOption(cacheOptions.cache(DEFAULT_CACHE_PATH))
  .addOption(verboseOption)
  .option("--log-file <path>", "Write debug logs to file (for debugging TUI)")
  .option("--debug-namespaces <pattern>", "Debug namespaces to enable (default: gov-tracker:*)")
  .action(async (opts) => {
    try {
      const { runTui } = await import("./tui");

      const debugNamespaces = opts.debugNamespaces || "gov-tracker:*";
      if (opts.logFile || opts.verbose) {
        debug.enable(debugNamespaces);
      }

      await runTui({
        cachePath: opts.cache,
        verbose: opts.verbose,
        logFile: opts.logFile,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
        console.error("Error: TUI requires 'ink' and 'react' packages.");
        console.error("Install them with: yarn add ink react");
        process.exit(1);
      }
      throw error;
    }
  });

program.parse();

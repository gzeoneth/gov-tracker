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
 */
import * as dotenv from "dotenv";
dotenv.config();

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import debug from "debug";
import { Command, Option } from "commander";
import {
  createTracker,
  ProposalStageTracker,
  formatStageTitle,
  TrackingProgress,
  CHUNK_SIZES,
  ChunkingConfig,
  extractAllSimulationsFromDecoded,
} from "../index";
import type { ExtractedSimulation } from "../types/simulation";
import { buildDashboardState, writeDashboardState } from "./lib/json-state";
import { checkAndExecuteElection, formatElectionStatus } from "./lib/election-check";
import {
  rpcOptions,
  addOptions,
  createProvidersFromOptions,
  createSigner,
  requirePrivateKeyForWrite,
  executeTransaction,
  formatMultiplePreparedTransactions,
  formatTrackingResult,
  formatCacheStatus,
  runWithLoop,
  runMonitorCycle,
  trackAndPrepare,
  TrackCallbackReturn,
  DEFAULT_BLOCK_LAG,
  MAX_CONSECUTIVE_ERRORS,
  isShuttingDown,
  GasSettings,
  // Common options
  verboseOption,
  cacheOptions,
  executionOptions,
  chunkingOptions,
  gasOptions,
  loopOptions,
  parseGasSettings,
  parseChunkingConfig,
} from "./lib/cli";
import { decodeCalldata } from "../calldata";
import type { DecodedCalldata, ChainContext } from "../types/calldata";

// ============================================================================
// Helper Functions for Calldata Decoding and Display
// ============================================================================

/**
 * Format decoded calldata as an indented tree
 */
function formatDecodedCalldata(decoded: DecodedCalldata, indent = 0): string {
  const prefix = "  ".repeat(indent);
  const lines: string[] = [];

  if (decoded.functionName) {
    lines.push(`${prefix}${decoded.functionName}`);
    if (decoded.signature) {
      lines.push(`${prefix}  Signature: ${decoded.signature}`);
    }
  } else {
    lines.push(`${prefix}Unknown function (${decoded.selector})`);
  }

  if (decoded.parameters) {
    for (const param of decoded.parameters) {
      let paramLine = `${prefix}  ${param.name} (${param.type}): `;

      // For addresses, show label if available
      if (param.addressLabel) {
        paramLine += `${param.value} [${param.addressLabel}]`;
      } else {
        paramLine += param.value;
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
 * Get the default cache path and ensure the directory exists
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

  return path.join(appDataDir, "gov-tracker-cache.json");
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
  .name("monitor")
  .description("Monitor Arbitrum governance proposals")
  .version("0.1.0");

// ============================================================================
// Run Command
// ============================================================================

const runCmd = program
  .command("run")
  .description("Discover, track, and optionally prepare/execute");
addOptions(runCmd, rpcOptions);
addOptions(runCmd, executionOptions);
addOptions(runCmd, chunkingOptions(CHUNK_SIZES.L1, CHUNK_SIZES.L2));
addOptions(runCmd, gasOptions);
addOptions(runCmd, loopOptions);
runCmd
  .addOption(cacheOptions.cache(DEFAULT_CACHE_PATH))
  .addOption(cacheOptions.force)
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
  .action(async (opts) => {
    if (opts.verbose) debug.enable("gov-tracker:*");
    requirePrivateKeyForWrite(opts);

    const providers = createProvidersFromOptions(opts);
    const chunkingConfig: ChunkingConfig = parseChunkingConfig(opts, CHUNK_SIZES.DELAY_MS);
    const tracker = createTracker({
      ...providers,
      cachePath: opts.cache,
      chunkingConfig,
      onProgress: createProgressCallback(),
    });
    const signer = opts.write ? createSigner(opts.privateKey) : null;

    // If --force is specified, clear cache for this run by using a fresh start block
    const startBlock = opts.force
      ? 0 // Force re-discovery from the beginning
      : opts.startBlock
        ? parseInt(opts.startBlock, 10)
        : undefined;
    const blockLag = parseInt(opts.blockLag, 10);
    const maxAgeDays = parseInt(opts.maxAgeDays, 10);
    const intervalMs = parseInt(opts.interval, 10) * 1000;
    const concurrency = parseInt(opts.concurrency, 10);

    const gasSettings: GasSettings = parseGasSettings(opts);

    if (opts.verbose) {
      if (startBlock !== undefined) console.log(`Starting discovery from block ${startBlock}`);
      console.log(`Block lag: ${blockLag} blocks behind tip`);
      console.log(`Max age for re-tracking: ${maxAgeDays} days`);
      console.log(`Max consecutive errors before skip: ${MAX_CONSECUTIVE_ERRORS}`);
      if (concurrency > 1) console.log(`Concurrency: ${concurrency}`);
      console.log(
        `L2 gas: ${gasSettings.maxFeePerGas} gwei maxFee, ${gasSettings.maxPriorityFeePerGas} gwei priority`
      );
    }
    if (signer) console.log(`Executing with: ${signer.address}`);

    // Track whether this is the first cycle (for startBlock override)
    let isFirstCycle = true;

    async function runCycle(): Promise<void> {
      console.log("Discovering proposals and operations...\n");
      let electionsSkipped = 0;

      // Only use startBlock on the first cycle; subsequent cycles resume from watermarks
      const cycleStartBlock = isFirstCycle ? startBlock : undefined;
      isFirstCycle = false;

      const { result, proposals, timelockOps } = await runMonitorCycle(tracker, providers, {
        prepare: opts.prepare || opts.write || opts.prepareCompleted || opts.preparePending,
        prepareCompleted: opts.prepareCompleted,
        preparePending: opts.preparePending,
        startBlock: cycleStartBlock,
        blockLag,
        maxAgeDays,
        concurrency,
        onTrack: async (r): Promise<TrackCallbackReturn> => {
          // Skip showing complete elections
          if (r.result?.isElection && r.result?.isComplete) {
            electionsSkipped++;
            return {};
          }

          if (r.result) {
            console.log(`\n[${r.key}]`);
            console.log(formatTrackingResult(r.result));
          } else if (r.error) {
            console.log(`\n[${r.key}] ERROR: ${r.error}`);
          }

          // Use preparedTransactions if available, otherwise fall back to prepared (legacy)
          const txsToDisplay = r.preparedTransactions ?? (r.prepared ? [r.prepared] : []);
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
      });

      // Skip output if shutting down
      if (isShuttingDown()) return;

      const stats = await tracker.getStats();
      console.log(
        `\nFound ${proposals.length} new proposals, ${timelockOps.length} new ops | ` +
          `Incomplete: ${stats.proposals.active} proposals, ${stats.timelocks.active} timelocks | ` +
          `Tracked: ${result.tracked}, Prepared: ${result.prepared}` +
          (electionsSkipped > 0 ? ` (${electionsSkipped} elections skipped)` : "")
      );

      if (opts.jsonOutput) {
        const checkpoints = await tracker.getAllCheckpoints();
        writeDashboardState(buildDashboardState(checkpoints), opts.jsonOutput);
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
          console.error(`[ELECTION] Check failed: ${(error as Error).message}`);
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
  .addOption(verboseOption)
  .option("--inspect-only", "Decode and inspect calldata without tracking")
  .option("--show-simulation", "Show simulation data for each call")
  .action(async (txHash: string, opts) => {
    if (opts.verbose) debug.enable("gov-tracker:*");
    requirePrivateKeyForWrite(opts);

    try {
      const providers = createProvidersFromOptions(opts);
      const chunkingConfig: ChunkingConfig = parseChunkingConfig(opts, CHUNK_SIZES.DELAY_MS);
      const gasSettings: GasSettings = parseGasSettings(opts);
      const chainContext: ChainContext = "arb1";

      if (opts.verbose) {
        console.log(
          `L2 gas: ${gasSettings.maxFeePerGas} gwei maxFee, ${gasSettings.maxPriorityFeePerGas} gwei priority`
        );
        if (opts.cache) console.log(`Cache: ${opts.cache}`);
        if (opts.force) console.log(`Force: ignoring cached data`);
      }

      // Use cache unless --force is specified
      const tracker = createTracker({
        ...providers,
        cachePath: opts.force ? undefined : opts.cache,
        chunkingConfig,
        onProgress: opts.verbose ? createProgressCallback() : undefined,
      });

      let calldatas: string[] = [];
      let targets: string[] = [];

      // If --inspect-only, skip tracking and just decode
      if (opts.inspectOnly) {
        console.log(`Fetching proposal from tx: ${txHash}...\n`);

        const results = await tracker.trackByTxHash(txHash);
        if (results.length === 0) {
          console.error("No proposal found in transaction");
          process.exit(1);
        }

        const result = results[0];
        if (result.stages.length > 0 && result.stages[0].data) {
          const stage = result.stages[0];
          const data = stage.data as { calldatas?: string[]; targets?: string[] };
          if (data.calldatas) {
            calldatas = data.calldatas;
            targets = data.targets || [];
          }
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

        const { results, preparations, preparedTransactions } = !opts.inspectOnly
          ? await trackAndPrepare(
              tracker,
              txHash,
              {
                prepare: shouldPrepare,
                prepareCompleted: opts.prepareCompleted,
                preparePending: opts.preparePending,
              },
              providers
            )
          : { results: [], preparations: [], preparedTransactions: [] };

        // Format tracking output
        if (!opts.inspectOnly) {
          results.forEach((r, i) => {
            const label = results.length > 1 ? `Operation ${i + 1}/${results.length}` : undefined;
            console.log(formatTrackingResult(r, label));
          });

          // Show all prepared transactions
          if (preparedTransactions.length > 0) {
            console.log(`\n${formatMultiplePreparedTransactions(preparedTransactions)}`);
          }

          // Show preparation errors
          const failedPreparations = preparations.filter((p) => !p.success);
          failedPreparations.forEach((prep) => {
            console.log(`\n[PREPARE ERROR] ${prep.error}`);
          });
        }

        // Extract calldata for decoding
        if (results.length > 0 && results[0].stages.length > 0 && results[0].stages[0].data) {
          const stage = results[0].stages[0];
          const data = stage.data as { calldatas?: string[]; targets?: string[] };
          if (data.calldatas) {
            calldatas = data.calldatas;
            targets = data.targets || [];
          }
        }

        // Execute if --write (only when not in inspect-only mode)
        if (opts.write && preparedTransactions.length > 0 && !opts.inspectOnly) {
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

            retracked.results.forEach((r, i) => {
              const label =
                retracked.results.length > 1
                  ? `Operation ${i + 1}/${retracked.results.length}`
                  : undefined;
              console.log(formatTrackingResult(r, label));
            });

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
      if (opts.showSimulation || opts.inspectOnly) {
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
            if (targets[i]) console.log(`Target: ${targets[i]}`);
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
      console.error((e as Error).message);
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
    const { watermarks, checkpoints } = await ProposalStageTracker.readCacheStatus(opts.cache);

    if (opts.json) {
      const checkpointsObj: Record<string, unknown> = {};
      for (const [key, checkpoint] of checkpoints) {
        checkpointsObj[key] = checkpoint;
      }
      console.log(JSON.stringify({ watermarks, checkpoints: checkpointsObj }, null, 2));
    } else {
      console.log(formatCacheStatus(checkpoints));
    }
  });

// ============================================================================
// Election Command
// ============================================================================

const electionCmd = program
  .command("election")
  .description("Check Security Council election status");
addOptions(electionCmd, rpcOptions);
addOptions(electionCmd, loopOptions);
electionCmd
  .addOption(verboseOption)
  .option("--write", "Create election if ready (requires --private-key)")
  .addOption(new Option("--private-key <key>", "Private key for execution").env("PRIVATE_KEY"))
  .action(async (opts) => {
    if (opts.verbose) debug.enable("gov-tracker:*");
    requirePrivateKeyForWrite(opts);

    const providers = createProvidersFromOptions(opts);
    const signer = opts.write ? createSigner(opts.privateKey) : null;

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
        console.error("Election check failed:", (error as Error).message);
      }
    }

    const intervalMs = parseInt(opts.interval, 10) * 1000;

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

program.parse();

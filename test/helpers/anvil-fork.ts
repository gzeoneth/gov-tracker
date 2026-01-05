/**
 * Anvil Fork Test Helpers
 *
 * Provides utilities for creating anvil forks of L1 and L2 at specific block numbers.
 * Used for deterministic testing of historical blockchain state.
 *
 * NOTE: Anvil forks do NOT support certain Arbitrum-specific functions:
 * - Outbox proof fetching
 * - Any function that requires direct Arbitrum node RPC extensions
 * Use these forks for testing tracking logic, not execution logic.
 *
 * IMPORTANT: L1/L2 Block Consistency
 * When forking L2, the forked block contains an embedded `l1BlockNumber` field
 * indicating which L1 block was referenced at that point. The L1 fork must be
 * at or after this block, otherwise queries that need L1 data will fail.
 *
 * Use `getL1BlockForL2Block()` to query the real archive RPC (not the fork) to
 * determine the correct L1 block before starting the forks.
 */

import { spawn, ChildProcess } from "child_process";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as net from "net";
import { DEFAULT_RPC_URLS } from "../../src";

dotenv.config({ quiet: true });

/**
 * Get the L1 block number embedded in an L2 block.
 *
 * This queries the REAL archive RPC (not a fork) to get the l1BlockNumber
 * field from a specific L2 block. Use this to determine the correct L1
 * fork block before starting dual forks.
 *
 * @param l2ArchiveUrl - The real L2 archive RPC URL
 * @param l2BlockNumber - The L2 block number to query
 * @returns The L1 block number embedded in that L2 block
 */
export async function getL1BlockForL2Block(
  l2ArchiveUrl: string,
  l2BlockNumber: number
): Promise<number> {
  const provider = new ethers.providers.JsonRpcProvider(l2ArchiveUrl);
  const rawBlock = await provider.send("eth_getBlockByNumber", [
    "0x" + l2BlockNumber.toString(16),
    false,
  ]);

  if (!rawBlock || !rawBlock.l1BlockNumber) {
    throw new Error(
      `Could not get L1 block number for L2 block ${l2BlockNumber}. ` +
        `Ensure you're using an Arbitrum archive RPC that supports historical blocks.`
    );
  }

  return parseInt(rawBlock.l1BlockNumber, 16);
}

export interface AnvilForkConfig {
  /** Fork URL (archive RPC for historical blocks) */
  forkUrl: string;
  /** Block number to fork from */
  blockNumber: number;
  /** Port to run anvil on */
  port: number;
  /** Chain ID to use (optional, auto-detected from fork) */
  chainId?: number;
}

export interface ForkResult {
  /** JSON-RPC provider for the forked chain */
  provider: ethers.providers.JsonRpcProvider;
  /** Port the fork is running on */
  port: number;
  /** Block number the fork is at */
  blockNumber: number;
  /** Stop the fork process */
  stop: () => Promise<void>;
}

export interface DualForkResult {
  l1: ForkResult;
  l2: ForkResult;
  /** Stop both fork processes */
  stopAll: () => Promise<void>;
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // Port in use, close server and try next
      server.close();
      findAvailablePort(startPort + 1)
        .then(resolve)
        .catch(reject);
    });
  });
}

/**
 * Wait for anvil to be ready by polling the RPC endpoint
 */
async function waitForAnvil(
  port: number,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 100
): Promise<void> {
  const url = `http://127.0.0.1:${port}`;
  const provider = new ethers.providers.JsonRpcProvider(url);
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }
  throw new Error(`Anvil did not start within ${maxWaitMs}ms on port ${port}`);
}

/**
 * Start an anvil fork at a specific block
 */
export async function startAnvilFork(config: AnvilForkConfig): Promise<ForkResult> {
  const port = await findAvailablePort(config.port);

  const args = [
    "--fork-url",
    config.forkUrl,
    "--fork-block-number",
    config.blockNumber.toString(),
    "--port",
    port.toString(),
    "--silent",
  ];

  if (config.chainId) {
    args.push("--chain-id", config.chainId.toString());
  }

  const anvilProcess: ChildProcess = spawn("anvil", args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  // Capture stderr for debugging
  let stderr = "";
  anvilProcess.stderr?.on("data", (data) => {
    stderr += data.toString();
  });

  // Handle process errors
  anvilProcess.on("error", (err) => {
    console.error("Anvil process error:", err);
  });

  try {
    await waitForAnvil(port);
  } catch (err) {
    anvilProcess.kill();
    throw new Error(`Failed to start anvil: ${stderr || (err as Error).message}`);
  }

  const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${port}`);

  const stop = async (): Promise<void> => {
    return new Promise((resolve) => {
      if (anvilProcess.killed) {
        resolve();
        return;
      }
      anvilProcess.once("exit", () => resolve());
      anvilProcess.kill("SIGTERM");
      // Force kill after timeout
      setTimeout(() => {
        if (!anvilProcess.killed) {
          anvilProcess.kill("SIGKILL");
        }
        resolve();
      }, 5000);
    });
  };

  return {
    provider,
    port,
    blockNumber: config.blockNumber,
    stop,
  };
}

/**
 * Start both L1 and L2 anvil forks at consistent block numbers
 *
 * The L1 block number should be chosen to be consistent with the L2 block.
 * For Arbitrum, you can use the L1 block number embedded in the ArbSys contract.
 */
export async function startDualForks(options: {
  l1Url: string;
  l2Url: string;
  l1BlockNumber: number;
  l2BlockNumber: number;
  l1Port?: number;
  l2Port?: number;
}): Promise<DualForkResult> {
  const { l1Url, l2Url, l1BlockNumber, l2BlockNumber } = options;
  const l1Port = options.l1Port ?? 8545;
  const l2Port = options.l2Port ?? 8546;

  const [l1Fork, l2Fork] = await Promise.all([
    startAnvilFork({
      forkUrl: l1Url,
      blockNumber: l1BlockNumber,
      port: l1Port,
      chainId: 1, // Ethereum mainnet
    }),
    startAnvilFork({
      forkUrl: l2Url,
      blockNumber: l2BlockNumber,
      port: l2Port,
      chainId: 42161, // Arbitrum One
    }),
  ]);

  const stopAll = async (): Promise<void> => {
    await Promise.all([l1Fork.stop(), l2Fork.stop()]);
  };

  return {
    l1: l1Fork,
    l2: l2Fork,
    stopAll,
  };
}

/**
 * Start both L1 and L2 anvil forks with automatic L1 block detection.
 *
 * This is the preferred method for starting dual forks. It queries the real
 * L2 archive RPC to determine the correct L1 block that corresponds to the
 * target L2 block, ensuring consistency.
 *
 * @param options.l1Url - L1 archive RPC URL for forking
 * @param options.l2Url - L2 archive RPC URL for forking
 * @param options.l2BlockNumber - The L2 block to fork at
 * @param options.l1Port - Port for L1 anvil (default: 8545)
 * @param options.l2Port - Port for L2 anvil (default: 8546)
 */
export async function startDualForksAtL2Block(options: {
  l1Url: string;
  l2Url: string;
  l2BlockNumber: number;
  l1Port?: number;
  l2Port?: number;
}): Promise<DualForkResult> {
  const { l1Url, l2Url, l2BlockNumber } = options;

  // Query the REAL L2 archive RPC to get the L1 block embedded in the L2 block
  const l1BlockNumber = await getL1BlockForL2Block(l2Url, l2BlockNumber);

  // Start forks with the correct L1 block
  return startDualForks({
    l1Url,
    l2Url,
    l1BlockNumber,
    l2BlockNumber,
    l1Port: options.l1Port,
    l2Port: options.l2Port,
  });
}

/**
 * Get environment RPC URLs for testing
 */
export function getTestRpcUrls(): {
  l1: string;
  l2Archive: string;
  nova: string;
} | null {
  const l1 = process.env.ETH_RPC;
  const l2Archive = process.env.ARB1_ARCHIVE_RPC;
  const nova = process.env.NOVA_RPC || DEFAULT_RPC_URLS.NOVA;

  if (!l1 || !l2Archive) {
    return null;
  }

  return { l1, l2Archive, nova };
}

/**
 * Create providers from dual forks for use with the tracker
 */
export function createProviders(
  forks: DualForkResult,
  novaUrl?: string
): {
  l1Provider: ethers.providers.JsonRpcProvider;
  l2Provider: ethers.providers.JsonRpcProvider;
  novaProvider: ethers.providers.JsonRpcProvider;
} {
  const novaRpc =
    novaUrl || process.env.NOVA_RPC || process.env.NOVA_RPC || "https://nova.arbitrum.io/rpc";
  return {
    l1Provider: forks.l1.provider,
    l2Provider: forks.l2.provider,
    novaProvider: new ethers.providers.JsonRpcProvider(novaRpc),
  };
}

/**
 * Hook for spawning CLI subprocess to perform tracking/discovery
 *
 * Instead of implementing discovery logic in TUI, we delegate to the CLI
 * which is the single source of truth for tracking operations.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

export interface CliProcessResult {
  success: boolean;
  error?: string;
}

export interface UseCliProcessResult {
  isRunning: boolean;
  progress: string | null;
  error: string | null;
  run: (args: string[]) => Promise<CliProcessResult>;
  cancel: () => void;
}

const CLI_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const MAX_STDERR_LENGTH = 10000; // Limit stderr buffer size

function findCliPath(): string {
  // __dirname points to either src/cli/tui/hooks or dist/cli/tui/hooks
  // The CLI is always at dist/cli/cli.js after build

  // If we're in src/, navigate to project root and then to dist/cli/cli.js
  if (__dirname.includes("/src/")) {
    const projectRoot = __dirname.replace(/\/src\/cli\/tui\/hooks$/, "");
    return join(projectRoot, "dist", "cli", "cli.js");
  }

  // If we're already in dist/, navigate relative to dist/cli/cli.js
  const relativeCliPath = join(__dirname, "..", "..", "cli.js");
  if (existsSync(relativeCliPath)) {
    return relativeCliPath;
  }

  // Fallback for unexpected directory structure
  const projectRoot = __dirname.replace(/\/dist\/cli\/tui\/hooks$/, "");
  return join(projectRoot, "dist", "cli", "cli.js");
}

export function useCliProcess(): UseCliProcessResult {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processRef = useRef<ChildProcess | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cancel = useCallback(() => {
    if (processRef.current) {
      processRef.current.kill("SIGTERM");
      // Process close event will handle cleanup and state updates
    }
  }, []);

  const run = useCallback(
    async (args: string[]): Promise<CliProcessResult> => {
      if (isRunning) {
        return { success: false, error: "Already running" };
      }

      setIsRunning(true);
      setProgress("Starting CLI...");
      setError(null);

      return new Promise((resolve) => {
        const cliPath = findCliPath();
        const proc = spawn("node", [cliPath, ...args], {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, FORCE_COLOR: "0" },
        });

        processRef.current = proc;
        let stderrOutput = "";
        let resolved = false;

        const cleanup = (result: CliProcessResult): void => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          proc.stdout?.removeAllListeners();
          proc.stderr?.removeAllListeners();
          processRef.current = null;
          if (mountedRef.current) {
            setIsRunning(false);
            setProgress(null);
            if (!result.success && result.error) {
              setError(result.error);
            }
          }
          resolve(result);
        };

        const timeoutId = setTimeout(() => {
          if (proc.pid && !resolved) {
            proc.kill("SIGTERM");
            cleanup({ success: false, error: "CLI timed out after 10 minutes" });
          }
        }, CLI_TIMEOUT_MS);

        proc.stdout?.on("data", (data: Buffer) => {
          if (!mountedRef.current) return;
          const lines = data.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            const trimmed = line.trim();
            if (
              trimmed.startsWith("[") ||
              trimmed.startsWith("Discovery:") ||
              trimmed.startsWith("Discovering") ||
              trimmed.startsWith("Found") ||
              trimmed.startsWith("Tracking") ||
              trimmed.startsWith("No cached") ||
              trimmed.startsWith("Starting") ||
              trimmed.includes("proposals") ||
              trimmed.includes("operations") ||
              trimmed.includes("blocks")
            ) {
              setProgress(trimmed);
            }
          }
        });

        proc.stderr?.on("data", (data: Buffer) => {
          if (stderrOutput.length < MAX_STDERR_LENGTH) {
            stderrOutput += data.toString().slice(0, MAX_STDERR_LENGTH - stderrOutput.length);
          }
        });

        proc.on("close", (code) => {
          if (code === 0) {
            cleanup({ success: true });
          } else {
            const errMsg = stderrOutput.trim() || `CLI exited with code ${code}`;
            cleanup({ success: false, error: errMsg });
          }
        });

        proc.on("error", (err) => {
          cleanup({ success: false, error: err.message });
        });
      });
    },
    [isRunning]
  );

  return {
    isRunning,
    progress,
    error,
    run,
    cancel,
  };
}

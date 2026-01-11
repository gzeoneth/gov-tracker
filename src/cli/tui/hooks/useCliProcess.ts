/**
 * Hook for spawning CLI subprocess to perform tracking/discovery
 *
 * Instead of implementing discovery logic in TUI, we delegate to the CLI
 * which is the single source of truth for tracking operations.
 */

import { useState, useCallback, useRef } from "react";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";

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

function findCliPath(): string {
  // Navigate from dist/cli/tui/hooks to dist/cli/cli.js
  // This works because at runtime, the code runs from dist/
  return join(__dirname, "..", "..", "cli.js");
}

export function useCliProcess(): UseCliProcessResult {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processRef = useRef<ChildProcess | null>(null);

  const cancel = useCallback(() => {
    if (processRef.current) {
      processRef.current.kill("SIGTERM");
      processRef.current = null;
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
        let lastLine = "";
        let stderrOutput = "";

        proc.stdout?.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          for (const line of lines) {
            lastLine = line.trim();
            // Parse progress from CLI output
            if (lastLine.startsWith("[") || lastLine.startsWith("Discovering")) {
              setProgress(lastLine);
            } else if (lastLine.startsWith("Found")) {
              setProgress(lastLine);
            } else if (lastLine.startsWith("Tracking")) {
              setProgress(lastLine);
            }
          }
        });

        proc.stderr?.on("data", (data: Buffer) => {
          stderrOutput += data.toString();
        });

        proc.on("close", (code) => {
          processRef.current = null;
          setIsRunning(false);
          setProgress(null);

          if (code === 0) {
            resolve({ success: true });
          } else {
            const errMsg = stderrOutput.trim() || `CLI exited with code ${code}`;
            setError(errMsg);
            resolve({ success: false, error: errMsg });
          }
        });

        proc.on("error", (err) => {
          processRef.current = null;
          setIsRunning(false);
          setProgress(null);
          const errMsg = err.message;
          setError(errMsg);
          resolve({ success: false, error: errMsg });
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

/**
 * TUI Module Entry Point
 *
 * Interactive terminal UI for browsing and tracking governance proposals.
 * Requires: ink@3.x, react@17.x (CommonJS compatible versions)
 */

import * as fs from "fs";
import type { ProviderBundle } from "../lib/cli.js";
import { React, render, checkTuiDependencies } from "./ink-wrapper.js";

export interface TuiOptions {
  cachePath: string;
  providers?: ProviderBundle;
  verbose?: boolean;
  logFile?: string;
}

function checkTtySupport(): void {
  if (!process.stdin.isTTY) {
    console.error("Error: TUI requires an interactive terminal (TTY).");
    console.error("");
    console.error("The TUI cannot run in:");
    console.error("  - Piped input (e.g., echo 'q' | gov-tracker ui)");
    console.error("  - CI/CD environments without TTY allocation");
    console.error("  - Non-interactive shells");
    console.error("");
    console.error("For non-interactive use, try: gov-tracker status");
    process.exit(1);
  }
}

export async function runTui(options: TuiOptions): Promise<void> {
  checkTtySupport();
  checkTuiDependencies();

  // Set up file logging if logFile is specified
  let logStream: fs.WriteStream | null = null;
  let originalStderrWrite: typeof process.stderr.write | null = null;

  if (options.logFile) {
    logStream = fs.createWriteStream(options.logFile, { flags: "a" });
    logStream.write(`\n--- TUI Session Started: ${new Date().toISOString()} ---\n`);

    // Redirect stderr (where debug writes) to file
    originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      // Write to log file
      logStream?.write(chunk);
      // Don't write debug output to terminal (it would corrupt TUI)
      // Only return true to indicate successful write
      return true;
    }) as typeof process.stderr.write;
  }

  const { App } = await import("./App.js");

  try {
    const { waitUntilExit } = render(
      React.createElement(App, {
        cachePath: options.cachePath,
        providers: options.providers,
        verbose: options.verbose,
      }),
      { fullScreen: true }
    );

    await waitUntilExit();
  } finally {
    // Restore stderr and close log file
    if (originalStderrWrite) {
      process.stderr.write = originalStderrWrite;
    }
    if (logStream) {
      logStream.write(`--- TUI Session Ended: ${new Date().toISOString()} ---\n`);
      logStream.end();
    }
  }
}

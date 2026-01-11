/**
 * TUI Module Entry Point
 *
 * Interactive terminal UI for browsing and tracking governance proposals.
 * Requires: ink@3.x, react@17.x (CommonJS compatible versions)
 */

import type { ProviderBundle } from "../lib/cli.js";
import { React, render, checkTuiDependencies } from "./ink-wrapper.js";

export interface TuiOptions {
  cachePath: string;
  providers?: ProviderBundle;
  verbose?: boolean;
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

  const { App } = await import("./App.js");

  const { waitUntilExit } = render(
    React.createElement(App, {
      cachePath: options.cachePath,
      providers: options.providers,
      verbose: options.verbose,
    }),
    { fullScreen: true }
  );

  await waitUntilExit();
}

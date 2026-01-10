/**
 * TUI Module Entry Point
 *
 * Interactive terminal UI for browsing and tracking governance proposals.
 * Requires: ink@3.x, react@17.x (CommonJS compatible versions)
 */

import type { ProviderBundle } from "../lib/cli";

// Check for TTY environment (required for keyboard input)
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

// Check for required TUI dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let render: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let React: any;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ink = require("ink");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  React = require("react");
  render = ink.render;
} catch {
  console.error("Error: TUI requires 'ink' and 'react' packages.");
  console.error("Install them with: yarn add ink@^3.2.0 react@^17.0.2");
  process.exit(1);
}

export interface TuiOptions {
  cachePath: string;
  providers?: ProviderBundle;
  verbose?: boolean;
}

/**
 * Launch the interactive TUI
 */
export async function runTui(options: TuiOptions): Promise<void> {
  // Check TTY support before attempting to render
  checkTtySupport();

  // Dynamically import App to avoid loading React until needed
  const { App } = await import("./App");

  const { waitUntilExit } = render(
    React.createElement(App, {
      cachePath: options.cachePath,
      providers: options.providers,
      verbose: options.verbose,
    })
  );

  await waitUntilExit();
}

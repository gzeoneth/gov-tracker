/**
 * TUI Module Entry Point
 *
 * Interactive terminal UI for browsing and tracking governance proposals.
 * Requires optional dependencies: ink, react, ink-select-input
 */

import type { ProviderBundle } from "../lib/cli";

// Check for required TUI dependencies (optional in package.json)
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
  console.error("Install them with: yarn add ink react ink-select-input ink-spinner");
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

/**
 * Ink wrapper to handle module resolution
 *
 * This module provides type-safe wrappers for ink components
 * that work with the project's CommonJS module resolution.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ink: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let React: any;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ink = require("ink");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  React = require("react");
} catch {
  // Dependencies loaded lazily - will be checked at runtime
}

export function checkTuiDependencies(): void {
  if (!ink || !React) {
    console.error("Error: TUI requires 'ink' and 'react' packages.");
    console.error("Install them with: yarn add ink@^3.2.0 react@^17.0.2");
    process.exit(1);
  }
}

export { React };
export const render = ink?.render;
export const Box = ink?.Box;
export const Text = ink?.Text;
export const useInput = ink?.useInput as (
  callback: (input: string, key: KeyInput) => void,
  options?: { isActive?: boolean }
) => void;
export const useApp = ink?.useApp as () => { exit: (error?: Error) => void };
export const useStdout = ink?.useStdout as () => {
  stdout: NodeJS.WriteStream;
  write: (data: string) => void;
};

export interface KeyInput {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
  return: boolean;
  escape: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

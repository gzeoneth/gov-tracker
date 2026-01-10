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
  // Will fail at runtime if ink is not installed
}

export { React };

// Re-export ink components with proper types
export const Box = ink?.Box;
export const Text = ink?.Text;
export const useInput = ink?.useInput as (
  callback: (input: string, key: KeyInput) => void,
  options?: { isActive?: boolean }
) => void;
export const useApp = ink?.useApp as () => { exit: (error?: Error) => void };

export interface KeyInput {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  return: boolean;
  escape: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

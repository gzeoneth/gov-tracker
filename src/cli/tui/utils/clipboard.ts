/**
 * Clipboard utilities for TUI
 * Uses native OS clipboard commands via safe execFile
 */

import { execFileSync } from "child_process";

export function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;

    if (platform === "darwin") {
      execFileSync("pbcopy", [], { input: text });
    } else if (platform === "linux") {
      // Try xclip first, then xsel
      try {
        execFileSync("xclip", ["-selection", "clipboard"], { input: text });
      } catch {
        execFileSync("xsel", ["--clipboard", "--input"], { input: text });
      }
    } else if (platform === "win32") {
      execFileSync("clip", [], { input: text });
    } else {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function formatForCopy(value: string, type: "hash" | "address" | "id"): string {
  // Remove any display formatting
  const cleaned = value.replace(/\s+/g, "").trim();

  // Ensure proper prefix for addresses and hashes
  if ((type === "hash" || type === "address") && !cleaned.startsWith("0x")) {
    return `0x${cleaned}`;
  }

  return cleaned;
}

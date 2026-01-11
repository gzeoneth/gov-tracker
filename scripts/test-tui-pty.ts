/**
 * Test TUI in a pseudo-terminal environment
 *
 * This script uses node-pty to create a real PTY and run the TUI,
 * capturing output to help debug rendering issues.
 */

import * as pty from "node-pty";
import * as fs from "fs";

const TIMEOUT_MS = 10000; // 10 seconds
const OUTPUT_FILE = "/tmp/tui-output.txt";

async function testTui(): Promise<void> {
  console.log("Starting TUI in PTY...\n");

  const outputs: string[] = [];
  let hasError = false;
  let errorMessage = "";

  const ptyProcess = pty.spawn("yarn", ["cli", "ui"], {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: process.cwd(),
    env: { ...process.env, FORCE_COLOR: "1" },
  });

  ptyProcess.onData((data) => {
    outputs.push(data);
    process.stdout.write(data);

    // Check for errors
    if (data.includes("ERROR") || data.includes("must be rendered inside")) {
      hasError = true;
      errorMessage = data;
    }
  });

  // Send 'q' after a delay to quit the TUI
  setTimeout(() => {
    console.log("\n--- Sending 'q' to quit ---\n");
    ptyProcess.write("q");
  }, 3000);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ptyProcess.kill();
      reject(new Error("TUI test timed out"));
    }, TIMEOUT_MS);

    ptyProcess.onExit(({ exitCode }) => {
      clearTimeout(timeout);

      // Write output to file for inspection
      const fullOutput = outputs.join("");
      fs.writeFileSync(OUTPUT_FILE, fullOutput);
      console.log(`\n\nOutput saved to: ${OUTPUT_FILE}`);

      if (hasError) {
        console.error("\n\n=== ERROR DETECTED ===");
        console.error(errorMessage);
        reject(new Error("TUI rendered with errors"));
      } else if (exitCode !== 0) {
        reject(new Error(`TUI exited with code ${exitCode}`));
      } else {
        console.log("\n\n=== TUI TEST PASSED ===");
        resolve();
      }
    });
  });
}

testTui()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err.message);
    process.exit(1);
  });

/**
 * TUI Configuration - persistent settings stored alongside cache file
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface TuiConfig {
  rpc: {
    l1Url: string;
    l2Url: string;
    novaUrl: string;
  };
  cache: {
    path: string;
  };
  display: {
    theme: "dark" | "light";
    showProgressBar: boolean;
    compactMode: boolean;
  };
  discovery: {
    defaultDays: number;
    startBlock: number | null;
    chunkSize: number;
    concurrency: number;
  };
  debug: {
    logFile: string;
    namespaces: string;
  };
}

const DEFAULT_CONFIG: TuiConfig = {
  rpc: {
    l1Url: "",
    l2Url: "",
    novaUrl: "",
  },
  cache: {
    path: "",
  },
  display: {
    theme: "dark",
    showProgressBar: true,
    compactMode: false,
  },
  discovery: {
    defaultDays: 60,
    startBlock: null,
    chunkSize: 10_000_000, // Match gov-tracker default (10M blocks for L2)
    concurrency: 1,
  },
  debug: {
    logFile: "",
    namespaces: "gov-tracker:*",
  },
};

// Module-level cache path for config location
let configBasePath: string | null = null;

/**
 * Set the base path for config storage (same directory as cache)
 * Call this before using loadConfig/saveConfig in TUI context
 */
export function setConfigBasePath(cachePath: string): void {
  // If cachePath is a file, use its directory; if a directory, use it directly
  try {
    const stats = fs.existsSync(cachePath) && fs.statSync(cachePath);
    configBasePath = stats && stats.isDirectory() ? cachePath : path.dirname(cachePath);
  } catch {
    // Fall back to parent directory if stat fails (permissions, race condition, etc.)
    configBasePath = path.dirname(cachePath);
  }
}

function getConfigDir(): string {
  if (configBasePath) {
    return configBasePath;
  }
  return path.join(os.homedir(), ".gov-tracker");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "tui-config.json");
}

export function loadConfig(): TuiConfig {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TuiConfig>;
    return {
      rpc: { ...DEFAULT_CONFIG.rpc, ...parsed.rpc },
      cache: { ...DEFAULT_CONFIG.cache, ...parsed.cache },
      display: { ...DEFAULT_CONFIG.display, ...parsed.display },
      discovery: { ...DEFAULT_CONFIG.discovery, ...parsed.discovery },
      debug: { ...DEFAULT_CONFIG.debug, ...parsed.debug },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: TuiConfig): boolean {
  try {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

export function getDefaultConfig(): TuiConfig {
  return { ...DEFAULT_CONFIG };
}

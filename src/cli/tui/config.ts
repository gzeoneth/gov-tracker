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
  discovery: {
    defaultDays: 60,
    startBlock: null,
    chunkSize: 10_000_000,
    concurrency: 1,
  },
  debug: {
    logFile: "",
    namespaces: "gov-tracker:*",
  },
};

let configBasePath: string | null = null;

export function setConfigBasePath(cachePath: string): void {
  try {
    const stats = fs.existsSync(cachePath) && fs.statSync(cachePath);
    configBasePath = stats && stats.isDirectory() ? cachePath : path.dirname(cachePath);
  } catch {
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

export interface ConfigLoadResult {
  config: TuiConfig;
  warning?: string;
}

export function loadConfigWithStatus(): ConfigLoadResult {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return { config: { ...DEFAULT_CONFIG } };
    }
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<TuiConfig>;
    return {
      config: {
        rpc: { ...DEFAULT_CONFIG.rpc, ...parsed.rpc },
        cache: { ...DEFAULT_CONFIG.cache, ...parsed.cache },
        discovery: { ...DEFAULT_CONFIG.discovery, ...parsed.discovery },
        debug: { ...DEFAULT_CONFIG.debug, ...parsed.debug },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      config: { ...DEFAULT_CONFIG },
      warning: `Config file corrupted, using defaults: ${message}`,
    };
  }
}

export function loadConfig(): TuiConfig {
  return loadConfigWithStatus().config;
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

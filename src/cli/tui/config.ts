/**
 * TUI Configuration - persistent settings stored in ~/.gov-tracker/config.json
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
    chunkSize: 50000,
    concurrency: 1,
  },
};

function getConfigDir(): string {
  return path.join(os.homedir(), ".gov-tracker");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
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
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: TuiConfig): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getDefaultConfig(): TuiConfig {
  return { ...DEFAULT_CONFIG };
}

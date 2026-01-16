/**
 * Settings data helpers for SettingsView
 */

import type { TuiConfig } from "../config.js";

export type SettingSection = "rpc" | "cache" | "discovery" | "debug";

export interface SettingItem {
  section: SettingSection;
  key: string;
  label: string;
  value: string;
  type: "text" | "number";
}

export const SECTION_TITLES: Record<SettingSection, string> = {
  rpc: "RPC Configuration",
  cache: "Cache Settings",
  discovery: "Discovery Parameters",
  debug: "Debug Settings",
};

export function getSettingItems(config: TuiConfig): SettingItem[] {
  return [
    {
      section: "rpc",
      key: "l1Url",
      label: "L1 (Ethereum) RPC",
      value: config.rpc.l1Url || "(default)",
      type: "text",
    },
    {
      section: "rpc",
      key: "l2Url",
      label: "L2 (Arbitrum) RPC",
      value: config.rpc.l2Url || "(default)",
      type: "text",
    },
    {
      section: "rpc",
      key: "novaUrl",
      label: "Nova RPC",
      value: config.rpc.novaUrl || "(default)",
      type: "text",
    },
    {
      section: "cache",
      key: "path",
      label: "Cache Path",
      value: config.cache.path || "(default)",
      type: "text",
    },
    {
      section: "discovery",
      key: "defaultDays",
      label: "Default Days",
      value: config.discovery.defaultDays.toString(),
      type: "number",
    },
    {
      section: "discovery",
      key: "startBlock",
      label: "Start Block",
      value: config.discovery.startBlock?.toString() ?? "(auto)",
      type: "number",
    },
    {
      section: "discovery",
      key: "chunkSize",
      label: "Chunk Size",
      value: config.discovery.chunkSize.toString(),
      type: "number",
    },
    {
      section: "discovery",
      key: "concurrency",
      label: "Concurrency",
      value: config.discovery.concurrency.toString(),
      type: "number",
    },
    {
      section: "debug",
      key: "logFile",
      label: "Log File",
      value: config.debug.logFile || "(none)",
      type: "text",
    },
    {
      section: "debug",
      key: "namespaces",
      label: "Debug Namespaces",
      value: config.debug.namespaces || "gov-tracker:*",
      type: "text",
    },
  ];
}

type UpdateResult =
  | { success: true; config: TuiConfig }
  | { success: false; error: { message: string } };

export function updateConfigValue(
  config: TuiConfig,
  item: SettingItem,
  newValue: string
): UpdateResult {
  const { section, key, label } = item;

  if (section === "discovery") {
    if (key === "startBlock") {
      const parsed = parseInt(newValue, 10);
      const startBlock = newValue === "(auto)" || isNaN(parsed) ? null : Math.max(0, parsed);
      return {
        success: true,
        config: { ...config, discovery: { ...config.discovery, startBlock } },
      };
    }
    const parsed = parseInt(newValue, 10);
    if (isNaN(parsed) || parsed < 1) {
      return {
        success: false,
        error: { message: `Invalid value for ${label}: must be a positive number` },
      };
    }
    if (key === "defaultDays" && parsed > 365) {
      return { success: false, error: { message: "Default days cannot exceed 365" } };
    }
    if (key === "chunkSize" && (parsed < 1000 || parsed > 10_000_000)) {
      return {
        success: false,
        error: { message: "Chunk size must be between 1,000 and 10,000,000" },
      };
    }
    if (key === "concurrency" && parsed > 20) {
      return { success: false, error: { message: "Concurrency cannot exceed 20" } };
    }
    return {
      success: true,
      config: { ...config, discovery: { ...config.discovery, [key]: parsed } },
    };
  }

  const placeholders: Record<SettingSection, string> = {
    rpc: "(default)",
    cache: "(default)",
    debug: "(none)",
    discovery: "",
  };
  const normalized = newValue === placeholders[section] ? "" : newValue;
  return {
    success: true,
    config: { ...config, [section]: { ...config[section], [key]: normalized } },
  };
}

export interface GroupedSettingItems {
  section: SettingSection;
  items: { item: SettingItem; index: number }[];
}

export function groupSettingItems(items: SettingItem[]): GroupedSettingItems[] {
  const groups: GroupedSettingItems[] = [];
  let currentGroup: GroupedSettingItems | null = null;

  items.forEach((item, index) => {
    if (!currentGroup || currentGroup.section !== item.section) {
      currentGroup = { section: item.section, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push({ item, index });
  });

  return groups;
}

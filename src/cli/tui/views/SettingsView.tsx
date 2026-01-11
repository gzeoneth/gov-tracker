/**
 * Settings view for configuring TUI options
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import { useState, useEffect } from "react";
import type { UseNavigationResult } from "../hooks/index.js";
import type { TuiConfig } from "../config.js";
import { loadConfig, saveConfig, getDefaultConfig } from "../config.js";

interface SettingsViewProps {
  navigation: UseNavigationResult;
  onConfigChange?: (config: TuiConfig) => void;
}

type SettingSection = "rpc" | "cache" | "display" | "discovery";

interface SettingItem {
  section: SettingSection;
  key: string;
  label: string;
  value: string;
  type: "text" | "number" | "boolean" | "select";
  options?: string[];
}

function getSettingItems(config: TuiConfig): SettingItem[] {
  return [
    { section: "rpc", key: "l1Url", label: "L1 (Ethereum) RPC", value: config.rpc.l1Url || "(default)", type: "text" },
    { section: "rpc", key: "l2Url", label: "L2 (Arbitrum) RPC", value: config.rpc.l2Url || "(default)", type: "text" },
    { section: "rpc", key: "novaUrl", label: "Nova RPC", value: config.rpc.novaUrl || "(default)", type: "text" },
    { section: "cache", key: "path", label: "Cache Path", value: config.cache.path || "(default)", type: "text" },
    { section: "display", key: "theme", label: "Theme", value: config.display.theme, type: "select", options: ["dark", "light"] },
    { section: "display", key: "showProgressBar", label: "Show Progress Bar", value: config.display.showProgressBar ? "yes" : "no", type: "boolean" },
    { section: "display", key: "compactMode", label: "Compact Mode", value: config.display.compactMode ? "yes" : "no", type: "boolean" },
    { section: "discovery", key: "defaultDays", label: "Default Days", value: config.discovery.defaultDays.toString(), type: "number" },
    { section: "discovery", key: "startBlock", label: "Start Block", value: config.discovery.startBlock?.toString() ?? "(auto)", type: "number" },
    { section: "discovery", key: "chunkSize", label: "Chunk Size", value: config.discovery.chunkSize.toString(), type: "number" },
    { section: "discovery", key: "concurrency", label: "Concurrency", value: config.discovery.concurrency.toString(), type: "number" },
  ];
}

const SECTION_TITLES: Record<SettingSection, string> = {
  rpc: "RPC Configuration",
  cache: "Cache Settings",
  display: "Display Options",
  discovery: "Discovery Parameters",
};

export function SettingsView({ navigation, onConfigChange }: SettingsViewProps): React.ReactElement {
  const [config, setConfig] = useState<TuiConfig>(getDefaultConfig());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const items = getSettingItems(config);

  const updateConfig = (item: SettingItem, newValue: string): void => {
    const newConfig = { ...config };

    if (item.section === "rpc") {
      newConfig.rpc = { ...config.rpc, [item.key]: newValue === "(default)" ? "" : newValue };
    } else if (item.section === "cache") {
      newConfig.cache = { ...config.cache, [item.key]: newValue === "(default)" ? "" : newValue };
    } else if (item.section === "display") {
      if (item.type === "boolean") {
        (newConfig.display as Record<string, unknown>)[item.key] = newValue === "yes";
      } else {
        (newConfig.display as Record<string, unknown>)[item.key] = newValue;
      }
    } else if (item.section === "discovery") {
      if (item.key === "startBlock") {
        newConfig.discovery = { ...config.discovery, startBlock: newValue === "(auto)" ? null : parseInt(newValue, 10) || null };
      } else {
        (newConfig.discovery as Record<string, unknown>)[item.key] = parseInt(newValue, 10) || 0;
      }
    }

    setConfig(newConfig);
    saveConfig(newConfig);
    onConfigChange?.(newConfig);
    setMessage("Settings saved");
    setTimeout(() => setMessage(null), 2000);
  };

  useInput((input: string, key: KeyInput) => {
    if (isEditing) {
      if (key.escape) {
        setIsEditing(false);
        setEditValue("");
      } else if (key.return) {
        const item = items[selectedIndex];
        updateConfig(item, editValue);
        setIsEditing(false);
        setEditValue("");
      } else if (key.backspace || key.delete) {
        setEditValue((v) => v.slice(0, -1));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setEditValue((v) => v + input);
      }
      return;
    }

    if (key.escape || input === "b") {
      navigation.back();
    } else if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (key.return || input === " ") {
      const item = items[selectedIndex];
      if (item.type === "boolean") {
        const newValue = item.value === "yes" ? "no" : "yes";
        updateConfig(item, newValue);
      } else if (item.type === "select" && item.options) {
        const currentIdx = item.options.indexOf(item.value);
        const newValue = item.options[(currentIdx + 1) % item.options.length];
        updateConfig(item, newValue);
      } else {
        setIsEditing(true);
        setEditValue(item.value === "(default)" || item.value === "(auto)" ? "" : item.value);
      }
    } else if (input === "r") {
      setConfig(getDefaultConfig());
      saveConfig(getDefaultConfig());
      setMessage("Settings reset to defaults");
      setTimeout(() => setMessage(null), 2000);
    }
  });

  const renderItem = (item: SettingItem, index: number): React.ReactElement => {
    const isSelected = index === selectedIndex;
    const isEditingThis = isSelected && isEditing;

    return (
      <Box key={`${item.section}-${item.key}`}>
        <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
          {isSelected ? ">" : " "} {item.label.padEnd(20)}
        </Text>
        {isEditingThis ? (
          <Text color="yellow">{editValue}_</Text>
        ) : (
          <Text color={item.value.startsWith("(") ? "gray" : "green"}>{item.value}</Text>
        )}
      </Box>
    );
  };

  const groupedItems: { section: SettingSection; items: { item: SettingItem; index: number }[] }[] = [];
  let currentGroup: { section: SettingSection; items: { item: SettingItem; index: number }[] } | null = null;

  items.forEach((item, index) => {
    if (!currentGroup || currentGroup.section !== item.section) {
      currentGroup = { section: item.section, items: [] };
      groupedItems.push(currentGroup);
    }
    currentGroup.items.push({ item, index });
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Settings</Text>
        <Text color="gray"> - Configure TUI options</Text>
      </Box>

      <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
        {message && (
          <Box marginBottom={1}>
            <Text color="green">{message}</Text>
          </Box>
        )}

        {groupedItems.map((group) => (
          <Box key={group.section} flexDirection="column" marginBottom={1}>
            <Text bold color="yellow">{SECTION_TITLES[group.section]}</Text>
            {group.items.map(({ item, index }) => renderItem(item, index))}
          </Box>
        ))}
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="cyan">j/k</Text>
        <Text color="gray">: Navigate </Text>
        <Text color="cyan">Enter/Space</Text>
        <Text color="gray">: Edit </Text>
        <Text color="cyan">r</Text>
        <Text color="gray">: Reset </Text>
        <Text color="cyan">b</Text>
        <Text color="gray">: Back</Text>
      </Box>
    </Box>
  );
}

/**
 * Settings view for configuring TUI options
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";
import { useState, useEffect, useRef, useCallback } from "react";
import type { UseNavigationResult } from "../hooks/index.js";
import type { TuiConfig } from "../config.js";
import { loadConfig, saveConfig, getDefaultConfig } from "../config.js";
import {
  getSettingItems,
  updateConfigValue,
  groupSettingItems,
  SECTION_TITLES,
  type SettingItem,
} from "../utils/settings-data.js";

interface SettingsViewProps {
  navigation: UseNavigationResult;
  onConfigChange?: (config: TuiConfig) => void;
}

export function SettingsView({ navigation, onConfigChange }: SettingsViewProps): React.ReactElement {
  const [config, setConfig] = useState<TuiConfig>(getDefaultConfig());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((msg: string, isError = false) => {
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
    }
    setMessage({ text: msg, isError });
    messageTimeoutRef.current = setTimeout(() => setMessage(null), 2000);
  }, []);

  useEffect(() => {
    setConfig(loadConfig());
    return () => {
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
      }
    };
  }, []);

  const items = getSettingItems(config);

  const handleUpdateConfig = (item: SettingItem, newValue: string): void => {
    const result = updateConfigValue(config, item, newValue);
    if (!result.success) {
      showMessage(result.error.message, true);
      return;
    }

    setConfig(result.config);
    const saved = saveConfig(result.config);
    onConfigChange?.(result.config);
    showMessage(saved ? "Settings saved" : "Failed to save settings", !saved);
  };

  const handleEditInput = (input: string, key: KeyInput): boolean => {
    if (key.escape) {
      setIsEditing(false);
      setEditValue("");
      return true;
    }
    if (key.return) {
      handleUpdateConfig(items[selectedIndex], editValue);
      setIsEditing(false);
      setEditValue("");
      return true;
    }
    if (key.backspace || key.delete) {
      setEditValue((v) => v.slice(0, -1));
      return true;
    }
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setEditValue((v) => v + input);
      return true;
    }
    return true;
  };

  const handleItemSelect = (item: SettingItem): void => {
    if (item.type === "boolean") {
      handleUpdateConfig(item, item.value === "yes" ? "no" : "yes");
      return;
    }
    if (item.type === "select" && item.options) {
      const currentIdx = item.options.indexOf(item.value);
      handleUpdateConfig(item, item.options[(currentIdx + 1) % item.options.length]);
      return;
    }
    setIsEditing(true);
    const isPlaceholder = item.value === "(default)" || item.value === "(auto)";
    setEditValue(isPlaceholder ? "" : item.value);
  };

  const handleResetToDefaults = (): void => {
    const defaults = getDefaultConfig();
    setConfig(defaults);
    const saved = saveConfig(defaults);
    showMessage(saved ? "Settings reset to defaults" : "Failed to save defaults", !saved);
  };

  const handleNavigationInput = (input: string, key: KeyInput): void => {
    if (key.escape || input === "b") {
      navigation.back();
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
      return;
    }
    if (key.return || input === " ") {
      handleItemSelect(items[selectedIndex]);
      return;
    }
    if (input === "r") {
      handleResetToDefaults();
    }
  };

  useInput((input: string, key: KeyInput) => {
    if (isEditing) {
      handleEditInput(input, key);
      return;
    }
    handleNavigationInput(input, key);
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

  const groupedItems = groupSettingItems(items);

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">Settings</Text>
        <Text color="gray"> - Configure TUI options</Text>
      </Box>

      <Box flexDirection="column" paddingX={2} paddingY={1} flexGrow={1}>
        {message && (
          <Box marginBottom={1}>
            <Text color={message.isError ? "red" : "green"}>{message.text}</Text>
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

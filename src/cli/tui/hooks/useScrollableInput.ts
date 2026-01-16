/**
 * Shared input handler for scrollable views
 */

import { useInput, KeyInput } from "../ink-wrapper.js";
import type { UseNavigationResult } from "./useNavigation.js";

interface ScrollableInputOptions {
  navigation: UseNavigationResult;
  itemCount: number;
  onBack?: () => void;
  extraHandlers?: (input: string, key: KeyInput) => boolean;
}

export function useScrollableInput({
  navigation,
  itemCount,
  onBack,
  extraHandlers,
}: ScrollableInputOptions): void {
  useInput((input: string, key: KeyInput) => {
    // Check extra handlers first - if they return true, stop processing
    if (extraHandlers?.(input, key)) return;

    // Back navigation
    if (input === "b" || key.escape) {
      if (onBack) {
        onBack();
      } else {
        navigation.back();
      }
      return;
    }

    // Vertical navigation
    if (key.upArrow || input === "k") {
      navigation.moveUp();
    } else if (key.downArrow || input === "j") {
      navigation.moveDown(itemCount);
    } else if (key.pageUp || (key.ctrl && input === "u")) {
      navigation.pageUp(itemCount);
    } else if (key.pageDown || (key.ctrl && input === "d")) {
      navigation.pageDown(itemCount);
    } else if (input === "g") {
      navigation.goToTop();
    } else if (input === "G") {
      navigation.goToBottom(itemCount);
    }
  });
}

/**
 * Confirmation dialog component
 */

import { React, Box, Text, useInput, KeyInput } from "../ink-wrapper.js";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.ReactElement {
  useInput((input: string, key: KeyInput) => {
    if (input.toLowerCase() === "y" || key.return) {
      onConfirm();
    } else if (input.toLowerCase() === "n" || key.escape) {
      onCancel();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow">{title}</Text>
      <Text>{message}</Text>
      <Box marginTop={1}>
        <Text color="green">[Y] {confirmLabel}</Text>
        <Text> </Text>
        <Text color="red">[N] {cancelLabel}</Text>
      </Box>
    </Box>
  );
}

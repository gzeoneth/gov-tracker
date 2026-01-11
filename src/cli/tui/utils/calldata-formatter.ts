/**
 * Calldata formatting utilities for TUI display
 */

import { wrapText } from "./text.js";
import type { DecodedCalldata, DecodedParameter } from "../../../types/calldata.js";

export interface FormattedLine {
  text: string;
  indent: number;
  foldable: boolean;
  foldKey?: string;
  foldedLineCount?: number;
  isFoldedContent?: boolean;
}

const FOLD_THRESHOLD = 100;

function formatParameter(
  param: DecodedParameter,
  indent: number,
  keyPrefix: string
): FormattedLine[] {
  const lines: FormattedLine[] = [];
  const foldKey = `${keyPrefix}-${param.name}`;

  let value = param.displayValue;
  if (param.addressLabel) {
    value = `${param.displayValue} [${param.addressLabel}]`;
  }

  const isFoldable = value.length > FOLD_THRESHOLD;
  const wrappedLines = isFoldable ? wrapText(value, 80) : [value];

  lines.push({
    text: `${param.name} (${param.type}): ${wrappedLines[0]}`,
    indent,
    foldable: isFoldable,
    foldKey: isFoldable ? foldKey : undefined,
    foldedLineCount: isFoldable ? wrappedLines.length - 1 : undefined,
  });

  if (isFoldable && wrappedLines.length > 1) {
    for (let i = 1; i < wrappedLines.length; i++) {
      lines.push({
        text: wrappedLines[i],
        indent: indent + 1,
        foldable: false,
        isFoldedContent: true,
        foldKey,
      });
    }
  }

  if (param.nested) {
    lines.push({ text: "└─ [NESTED]", indent: indent + 1, foldable: false });
    lines.push(...formatDecodedCalldata(param.nested, indent + 2, `${foldKey}-nested`));
  }

  if (param.nestedArray && param.nestedArray.length > 0) {
    param.nestedArray.forEach((nested, i) => {
      lines.push({ text: `[${i}]:`, indent: indent + 1, foldable: false });
      lines.push(...formatDecodedCalldata(nested, indent + 2, `${foldKey}-arr-${i}`));
    });
  }

  return lines;
}

export function formatDecodedCalldata(
  decoded: DecodedCalldata,
  indent = 0,
  keyPrefix = "root"
): FormattedLine[] {
  const lines: FormattedLine[] = [];

  let header: string;
  if (decoded.isRetryable) {
    header = `Retryable Ticket → ${decoded.targetChain}`;
  } else if (decoded.signature) {
    header = decoded.signature;
  } else {
    header = `Unknown function (${decoded.selector})`;
  }
  lines.push({ text: header, indent, foldable: false });

  if (decoded.parameters) {
    decoded.parameters.forEach((param, i) => {
      lines.push(...formatParameter(param, indent + 1, `${keyPrefix}-p${i}`));
    });
  }

  return lines;
}

export function filterVisibleLines(
  allLines: FormattedLine[],
  expandedKeys: Set<string>
): FormattedLine[] {
  return allLines.filter((line) => {
    if (!line.isFoldedContent) return true;
    return line.foldKey && expandedKeys.has(line.foldKey);
  });
}

export function getAllFoldableKeys(lines: FormattedLine[]): string[] {
  return lines.filter((l) => l.foldable && l.foldKey).map((l) => l.foldKey!);
}

export function toggleFoldKey(expandedKeys: Set<string>, foldKey: string): Set<string> {
  const next = new Set(expandedKeys);
  if (next.has(foldKey)) {
    next.delete(foldKey);
  } else {
    next.add(foldKey);
  }
  return next;
}

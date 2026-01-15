/**
 * Markdown parsing utilities for TUI display
 */

export type MarkdownLineType =
  | "normal"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "link"
  | "code"
  | "separator";

export interface MarkdownLine {
  text: string;
  type: MarkdownLineType;
  indent: number;
}

function wrapTextToLines(
  text: string,
  width: number,
  type: MarkdownLineType,
  indent: number,
  result: MarkdownLine[]
): void {
  const safeWidth = Math.max(10, width);
  const words = text.split(/\s+/);
  let currentLine = "";
  let currentIndent = indent;

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= safeWidth) {
      currentLine += " " + word;
    } else {
      result.push({ text: currentLine, type, indent: currentIndent });
      currentLine = word;
      // Continuation lines of bullets get extra indent
      if (type === "bullet" && currentIndent === 2) {
        currentIndent = 4;
      }
    }
  }

  if (currentLine.length > 0) {
    result.push({ text: currentLine, type, indent: currentIndent });
  }
}

export function parseMarkdown(text: string, width: number): MarkdownLine[] {
  const result: MarkdownLine[] = [];
  const lines = text.split("\n");
  // Guard against very narrow terminals
  const safeWidth = Math.max(20, width);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Empty line
    if (trimmed.length === 0) {
      result.push({ text: "", type: "normal", indent: 0 });
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      result.push({
        text: "─".repeat(Math.min(safeWidth - 4, 60)),
        type: "separator",
        indent: 0,
      });
      continue;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      result.push({ text: trimmed.slice(4), type: "h3", indent: 0 });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      result.push({ text: trimmed.slice(3), type: "h2", indent: 0 });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      result.push({ text: trimmed.slice(2), type: "h1", indent: 0 });
      continue;
    }

    // Bullet points
    if (/^[-*+] /.test(trimmed)) {
      const bulletText = trimmed.slice(2);
      wrapTextToLines(bulletText, safeWidth - 6, "bullet", 2, result);
      continue;
    }

    // Numbered lists
    if (/^\d+\. /.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\. /);
      if (match) {
        const numText = trimmed.slice(match[0].length);
        const textWidth = safeWidth - 6;
        result.push({
          text: `${match[1]}. ${numText.slice(0, textWidth)}`,
          type: "bullet",
          indent: 0,
        });
        if (numText.length > textWidth) {
          wrapTextToLines(numText.slice(textWidth), textWidth, "normal", 3, result);
        }
        continue;
      }
    }

    // Code blocks (just show as-is with code styling)
    if (trimmed.startsWith("```")) {
      continue; // Skip code fence markers
    }

    // Links - simplify [text](url) to just text
    const processedLine = trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

    // Normal paragraph
    wrapTextToLines(processedLine, safeWidth - 4, "normal", 0, result);
  }

  return result;
}

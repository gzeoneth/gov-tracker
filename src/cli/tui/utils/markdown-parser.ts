/**
 * Minimal markdown parsing for TUI display
 */

export type MarkdownLineType = "normal" | "h1" | "h2" | "h3" | "bullet" | "separator";

export interface MarkdownLine {
  text: string;
  type: MarkdownLineType;
  indent: number;
}

function wrapText(
  text: string,
  width: number,
  type: MarkdownLineType,
  indent: number,
  result: MarkdownLine[]
): void {
  const safeWidth = Math.max(10, width);
  const words = text.split(/\s+/);
  let line = "";
  let lineIndent = indent;

  for (const word of words) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= safeWidth) {
      line += " " + word;
    } else {
      result.push({ text: line, type, indent: lineIndent });
      line = word;
      if (type === "bullet" && lineIndent === 2) lineIndent = 4;
    }
  }
  if (line) result.push({ text: line, type, indent: lineIndent });
}

export function parseMarkdown(text: string, width: number): MarkdownLine[] {
  const result: MarkdownLine[] = [];
  const safeWidth = Math.max(20, width);

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      result.push({ text: "", type: "normal", indent: 0 });
      continue;
    }

    if (/^[-*_]{3,}$/.test(line)) {
      result.push({ text: "─".repeat(Math.min(safeWidth - 4, 60)), type: "separator", indent: 0 });
      continue;
    }

    if (line.startsWith("### ")) {
      result.push({ text: line.slice(4), type: "h3", indent: 0 });
      continue;
    }
    if (line.startsWith("## ")) {
      result.push({ text: line.slice(3), type: "h2", indent: 0 });
      continue;
    }
    if (line.startsWith("# ")) {
      result.push({ text: line.slice(2), type: "h1", indent: 0 });
      continue;
    }

    if (/^[-*+] /.test(line)) {
      wrapText(line.slice(2), safeWidth - 6, "bullet", 2, result);
      continue;
    }

    const numMatch = line.match(/^(\d+)\. /);
    if (numMatch) {
      const content = line.slice(numMatch[0].length);
      result.push({
        text: `${numMatch[1]}. ${content.slice(0, safeWidth - 6)}`,
        type: "bullet",
        indent: 0,
      });
      if (content.length > safeWidth - 6)
        wrapText(content.slice(safeWidth - 6), safeWidth - 6, "normal", 3, result);
      continue;
    }

    if (line.startsWith("```")) continue;

    const processed = line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    wrapText(processed, safeWidth - 4, "normal", 0, result);
  }

  return result;
}

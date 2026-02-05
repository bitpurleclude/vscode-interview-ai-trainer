import type { ItOutlineNode } from "./it_reportTypes";

export function it_indentLines(text: string, prefix: string): string {
  const raw = String(text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return `${prefix}（空）\n`;
  }
  return raw
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function it_extractOutlinePaths(items: string[]): string[][] {
  const paths: string[][] = [];
  let currentLevel1: string | null = null;
  let currentLevel2: string | null = null;
  const level1Pattern = /^([一二三四五六七八九十]+|\d+)[、.]/;
  const level2Pattern = /^[（(]?([一二三四五六七八九十]+|\d+)[）)]/;
  const markerPattern = /^(?<indent>\s*)(?:[-*+]\s+|\d+[.)]\s+)(?<text>.+)$/;
  const stack: Array<{ depth: number; text: string }> = [];

  items.forEach((item) => {
    const rawLine = String(item || "").replace(/\t/g, "  ");
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.includes("->")) {
      const parts = trimmed
        .split("->")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length) {
        stack.length = 0;
        parts.forEach((part, idx) => stack.push({ depth: idx, text: part }));
        currentLevel1 = parts[0] || currentLevel1;
        currentLevel2 = parts.length > 1 ? parts[1] : null;
        paths.push(parts);
      }
      return;
    }
    const markerMatch = rawLine.match(markerPattern);
    if (markerMatch?.groups?.text) {
      const indentRaw = markerMatch.groups.indent || "";
      const indentLen = indentRaw.replace(/\t/g, "  ").length;
      const depth = Math.max(0, Math.floor(indentLen / 2));
      const text = markerMatch.groups.text.trim();
      if (!text) {
        return;
      }
      while (stack.length && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      stack.push({ depth, text });
      paths.push(stack.map((node) => node.text));
      currentLevel1 = stack[0]?.text ?? currentLevel1;
      currentLevel2 = stack[1]?.text ?? null;
      return;
    }
    if (level1Pattern.test(trimmed)) {
      currentLevel1 = trimmed;
      currentLevel2 = null;
      stack.length = 0;
      stack.push({ depth: 0, text: trimmed });
      paths.push([trimmed]);
      return;
    }
    if (level2Pattern.test(trimmed) && currentLevel1) {
      currentLevel2 = trimmed;
      stack.length = 0;
      stack.push({ depth: 0, text: currentLevel1 });
      stack.push({ depth: 1, text: trimmed });
      paths.push([currentLevel1, trimmed]);
      return;
    }
    if (currentLevel1) {
      if (currentLevel2) {
        paths.push([currentLevel1, currentLevel2, trimmed]);
      } else {
        paths.push([currentLevel1, trimmed]);
      }
      return;
    }
    paths.push([trimmed]);
  });
  return paths;
}

export function it_buildOutlineTree(items: string[]): ItOutlineNode[] {
  const roots: ItOutlineNode[] = [];
  const findOrCreate = (list: ItOutlineNode[], text: string): ItOutlineNode => {
    const existing = list.find((node) => node.text === text);
    if (existing) {
      return existing;
    }
    const node = { text, children: [] };
    list.push(node);
    return node;
  };
  const paths = it_extractOutlinePaths(items);
  paths.forEach((parts) => {
    let current = roots;
    parts.forEach((part) => {
      const node = findOrCreate(current, part);
      current = node.children;
    });
  });
  return roots;
}

export function it_renderOutlineTree(
  nodes: ItOutlineNode[],
  prefix: string,
  level: number,
): string {
  const indent = "  ".repeat(level);
  let lines = "";
  nodes.forEach((node) => {
    lines += `${prefix}${indent}- ${node.text}\n`;
    if (node.children.length) {
      lines += it_renderOutlineTree(node.children, prefix, level + 1);
    }
  });
  return lines;
}

export function it_renderOutline(items: string[], prefix: string): string {
  if (!items.length) {
    return `${prefix}- （空）\n`;
  }
  const tree = it_buildOutlineTree(items);
  return it_renderOutlineTree(tree, prefix, 0);
}
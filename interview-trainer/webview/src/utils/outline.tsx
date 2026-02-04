import React from "react";

type ItOutlineNode = {
  text: string;
  children: ItOutlineNode[];
};

const IT_OUTLINE_LEVEL1_PATTERN = /^([一二三四五六七八九十]+|\d+)[、.]/;
const IT_OUTLINE_LEVEL2_PATTERN = /^[（(]([一二三四五六七八九十]+|\d+)[）)]/;
const IT_OUTLINE_MARKER_PATTERN =
  /^(?<indent>\s*)(?:[-*+]\s+|\d+[.)]\s+)(?<text>.+)$/;

export function extractOutlinePaths(items: string[]): string[][] {
  const paths: string[][] = [];
  let currentLevel1: string | null = null;
  let currentLevel2: string | null = null;
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
    const markerMatch = rawLine.match(IT_OUTLINE_MARKER_PATTERN);
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
    if (IT_OUTLINE_LEVEL1_PATTERN.test(trimmed)) {
      currentLevel1 = trimmed;
      currentLevel2 = null;
      stack.length = 0;
      stack.push({ depth: 0, text: trimmed });
      paths.push([trimmed]);
      return;
    }
    if (IT_OUTLINE_LEVEL2_PATTERN.test(trimmed) && currentLevel1) {
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

export function buildOutlineTree(items: string[]): ItOutlineNode[] {
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
  const paths = extractOutlinePaths(items);
  paths.forEach((parts) => {
    let current = roots;
    parts.forEach((part) => {
      const node = findOrCreate(current, part);
      current = node.children;
    });
  });
  return roots;
}

export function renderOutlineTree(nodes: ItOutlineNode[], keyPrefix: string): JSX.Element {
  return (
    <ul>
      {nodes.map((node, idx) => {
        const key = `${keyPrefix}-${idx}`;
        return (
          <li key={key}>
            {node.text}
            {node.children.length ? renderOutlineTree(node.children, key) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function renderParagraphs(text: string, keyPrefix: string): JSX.Element {
  const raw = String(text || "").trim();
  if (!raw) {
    return <span>（空）</span>;
  }
  const parts = raw.split(/\r?\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  return (
    <div className="it-paragraphs">
      {parts.map((part, idx) => (
        <p key={`${keyPrefix}-${idx}`}>{part}</p>
      ))}
    </div>
  );
}

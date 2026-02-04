function it_toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function it_splitOutlineLines(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  ").replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);
}

function it_outlineTreeFromPaths(paths: string[][]): Array<{ text: string; children: any[] }> {
  const roots: Array<{ text: string; children: any[] }> = [];
  const findOrCreate = (
    list: Array<{ text: string; children: any[] }>,
    text: string,
  ) => {
    const existing = list.find((node) => node.text === text);
    if (existing) {
      return existing;
    }
    const node = { text, children: [] as any[] };
    list.push(node);
    return node;
  };
  paths.forEach((parts) => {
    let current = roots;
    parts.forEach((part) => {
      const node = findOrCreate(current, part);
      current = node.children;
    });
  });
  return roots;
}

function it_outlineLinesFromTree(
  nodes: Array<{ text: string; children: any[] }>,
  level: number = 0,
): string[] {
  const indent = "  ".repeat(level);
  const lines: string[] = [];
  nodes.forEach((node) => {
    lines.push(`${indent}- ${node.text}`);
    if (node.children?.length) {
      lines.push(...it_outlineLinesFromTree(node.children, level + 1));
    }
  });
  return lines;
}

function it_pathsToOutlineLines(lines: string[]): string[] {
  const paths: string[][] = [];
  lines.forEach((line) => {
    if (!line.includes("->")) {
      return;
    }
    const parts = line
      .split("->")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length) {
      paths.push(parts);
    }
  });
  if (!paths.length) {
    return lines;
  }
  const tree = it_outlineTreeFromPaths(paths);
  return it_outlineLinesFromTree(tree, 0);
}

function it_toOutlineArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    const rawLines = value.map((item) => String(item)).filter(Boolean);
    const hasArrow = rawLines.some((line) => line.includes("->"));
    if (hasArrow) {
      return it_pathsToOutlineLines(rawLines);
    }
    return rawLines.map((line) => line.replace(/\t/g, "  ").replace(/\s+$/g, ""));
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) {
      return [];
    }
    const lines = it_splitOutlineLines(raw);
    const hasArrow = lines.some((line) => line.includes("->"));
    if (hasArrow) {
      return it_pathsToOutlineLines(lines);
    }
    return lines;
  }
  return [];
}

function it_isOutlineKeywordLike(items?: string[]): boolean {
  if (!Array.isArray(items) || items.length < 4 || items.length > 24) {
    return false;
  }
  for (const item of items) {
    const raw = String(item || "");
    const trimmed = raw.trim();
    if (!trimmed) {
      return false;
    }
    if (/[。！？]/.test(trimmed)) {
      return false;
    }
    const cleaned = trimmed.replace(
      /^\s*(?:[-*+]\s+|\d+[.)]\s+|[一二三四五六七八九十]+、\s+|[（(]?[一二三四五六七八九十]+[）)]\s+)/,
      "",
    );
    if (!cleaned) {
      return false;
    }
    if (cleaned.length > 24) {
      return false;
    }
  }
  return true;
}

function it_outlineHasIndent(items?: string[]): boolean {
  if (!Array.isArray(items) || !items.length) {
    return false;
  }
  return items.some((line) => /^\s{2,}[-*+]/.test(String(line || "")));
}

function it_extractOutlineHeadings(lines?: string[]): string[] {
  if (!Array.isArray(lines)) {
    return [];
  }
  const headings: string[] = [];
  lines.forEach((line) => {
    if (!line) {
      return;
    }
    if (/^\s+/.test(line)) {
      return;
    }
    const trimmed = String(line).trim();
    if (!trimmed) {
      return;
    }
    const cleaned = trimmed.replace(/^[-*+]\s+/, "").trim();
    if (cleaned) {
      headings.push(cleaned);
    }
  });
  return headings;
}
function it_pickRevisedAnswers(payload: any): any[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  const candidates = [
    payload.revisedAnswers,
    payload.revised_answers,
    payload.revisedAnswer,
    payload.revised_answer,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item;
    }
  }
  return [];
}

function it_extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const fencedMatches = Array.from(
    text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi),
  );
  fencedMatches.forEach((match) => {
    if (match[1]) {
      candidates.push(match[1]);
    }
  });
  const blocks: string[] = [];
  const stack: string[] = [];
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      if (stack.length === 0) {
        start = i;
      }
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      const last = stack[stack.length - 1];
      if (
        (ch === "}" && last === "{") ||
        (ch === "]" && last === "[")
      ) {
        stack.pop();
        if (stack.length === 0 && start !== -1) {
          blocks.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  blocks.forEach((block) => candidates.push(block));
  return candidates;
}

function it_sanitizeJsonCandidate(candidate: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (!inString) {
      if (ch === "\"") {
        inString = true;
        result += ch;
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      result += ch;
      continue;
    }
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = false;
      result += ch;
      continue;
    }
    if (ch === "\n") {
      result += "\\n";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\t") {
      result += "\\t";
      continue;
    }
    result += ch;
  }
  return result;
}

function it_extractJsonPayload(text: string): any | null {
  if (!text) {
    return null;
  }
  const candidates = it_extractJsonCandidates(text);
  let fallback: any | null = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        if (it_pickRevisedAnswers(parsed).length) {
          return parsed;
        }
        if (!fallback) {
          fallback = parsed;
        }
      }
    } catch {
      try {
        const parsed = JSON.parse(it_sanitizeJsonCandidate(candidate));
        if (parsed && typeof parsed === "object") {
          if (it_pickRevisedAnswers(parsed).length) {
            return parsed;
          }
          if (!fallback) {
            fallback = parsed;
          }
        }
      } catch {
        continue;
      }
    }
  }
  return fallback;
}

export {
  it_toStringArray,
  it_toOutlineArray,
  it_extractOutlineHeadings,
  it_isOutlineKeywordLike,
  it_outlineHasIndent,
  it_pickRevisedAnswers,
  it_extractJsonPayload,
};

export type ItPathToken = string | number | "*";

function it_parsePath(path: string): ItPathToken[] {
  let raw = String(path || "").trim();
  if (!raw) {
    return [];
  }
  if (raw.startsWith("$.")) {
    raw = raw.slice(2);
  } else if (raw.startsWith("$")) {
    raw = raw.slice(1);
  }
  if (raw.startsWith(".")) {
    raw = raw.slice(1);
  }
  const tokens: ItPathToken[] = [];
  let buffer = "";
  let i = 0;
  const flushBuffer = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = "";
    }
  };
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === ".") {
      flushBuffer();
      i += 1;
      continue;
    }
    if (ch === "[") {
      flushBuffer();
      const end = raw.indexOf("]", i);
      if (end === -1) {
        break;
      }
      const content = raw.slice(i + 1, end).trim();
      if (content === "*") {
        tokens.push("*");
      } else if (content) {
        const num = Number(content);
        tokens.push(Number.isFinite(num) ? num : content.replace(/^['"]|['"]$/g, ""));
      }
      i = end + 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flushBuffer();
  return tokens;
}

export function it_readPath(obj: any, path: string | undefined): any {
  if (!path) {
    return undefined;
  }
  const tokens = it_parsePath(path);
  if (!tokens.length) {
    return undefined;
  }
  const walk = (current: any, index: number): any => {
    if (index >= tokens.length) {
      return current;
    }
    const token = tokens[index];
    if (token === "*") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      const next = current
        .map((item) => walk(item, index + 1))
        .filter((item) => item !== undefined);
      return next;
    }
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof token === "number") {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return undefined;
      }
      return walk(current[token], index + 1);
    }
    return walk(current[token], index + 1);
  };
  return walk(obj, 0);
}

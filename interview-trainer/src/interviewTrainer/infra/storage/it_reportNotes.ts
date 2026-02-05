export function it_parseSection(content: string, title: string): string[] {
  const lines = content.split(/\r?\n/);
  const items: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      inSection = line.trim() === `## ${title}`;
      continue;
    }
    if (inSection && line.trim().startsWith("- ")) {
      items.push(line.trim().slice(2).trim());
    }
  }
  return items;
}

export function it_mergeUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  incoming.forEach((item) => {
    if (!item) {
      return;
    }
    if (seen.has(item)) {
      return;
    }
    seen.add(item);
    merged.push(item);
  });
  return merged;
}
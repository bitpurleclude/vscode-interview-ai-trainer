import fs from "fs";

export function it_ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export async function it_ensureDirAsync(dirPath: string): Promise<string> {
  await fs.promises.mkdir(dirPath, { recursive: true });
  return dirPath;
}

export function it_readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function it_writeJson(filePath: string, payload: any): void {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function it_readJsonAsync(filePath: string): Promise<any> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function it_writeJsonAsync(filePath: string, payload: any): Promise<void> {
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}
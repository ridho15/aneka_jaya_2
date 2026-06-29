import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");

function filePath(fileName: string) {
  return path.join(dataDir, fileName);
}

export async function readJsonArray<T>(fileName: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath(fileName), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function writeJsonArray<T>(fileName: string, rows: T[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const target = filePath(fileName);
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(rows, null, 2));
  await rename(temporary, target);
}

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

describe("runtime data integrity", () => {
  it("does not import mock modules or test fixtures from runtime source", async () => {
    const roots = ["app", "components", "lib"].map((name) => path.join(process.cwd(), name));
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/from\s+["'][^"']*(?:\/mock\/|tests\/fixtures)/.test(source)) violations.push(path.relative(process.cwd(), file));
    }
    expect(violations).toEqual([]);
  });
});

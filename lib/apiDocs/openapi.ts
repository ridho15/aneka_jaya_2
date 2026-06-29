import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as { load: (source: string) => unknown };

const openApiPath = path.join(process.cwd(), "docs", "openapi.yaml");

export async function readOpenApiYaml() {
  return readFile(openApiPath, "utf8");
}

export async function readOpenApiDocument() {
  return yaml.load(await readOpenApiYaml());
}

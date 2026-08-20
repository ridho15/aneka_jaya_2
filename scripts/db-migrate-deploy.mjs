import { spawnSync } from "node:child_process";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 0);

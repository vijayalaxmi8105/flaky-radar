import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(__dirname, "../../.env.test") });

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    // DB-heavy tests share one schema — run files sequentially to avoid cross-test row collisions
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
});
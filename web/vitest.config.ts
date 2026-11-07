import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the web app's pure logic. (API tests use the root config, inside workerd.)
export default defineConfig({
  test: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

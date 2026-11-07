import { defineConfig, devices } from "@playwright/test";

// End-to-end tests: the real app and API under `wrangler dev`, in a real browser.
// Each run starts from an empty world (separate state directory, wiped first).
// Run with `npm run e2e`. Needs .dev.vars (copy .dev.vars.example).
const PORT = 8788;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
  },
  // Software WebGL (SwiftShader) so the three.js world renders in headless Chromium.
  projects: [
    {
      name: "phone",
      use: { ...devices["Pixel 7"], launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } },
    },
  ],
  webServer: {
    command: `rm -rf .wrangler/e2e && npm run build:web && npx wrangler dev --port ${PORT} --persist-to .wrangler/e2e`,
    url: `http://localhost:${PORT}/api`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "ignore",
  },
});

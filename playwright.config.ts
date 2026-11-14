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
  // Signing up through the app takes ~20 s on its own with software WebGL, so Playwright's default
  // 30 s per test is too tight for anything that signs up and then does something.
  timeout: 90_000,
  // A reload restarts the software-rendered globe, and the page can take more than the default
  // 5 s to show what it fetched.
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure", // in test-results/, next to the error report
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

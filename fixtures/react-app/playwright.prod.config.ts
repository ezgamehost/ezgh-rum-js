// e2e:prod (plan 25 I4): drives a build made with EZGH_RUM_ENDPOINT=https://obs-browser.ezghcloud.com
// (and a real EZGH_RUM_TOKEN) in Chromium, so the data can be checked in obs. Asserts nothing.
import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e-prod", testMatch: /.*\.pw\.ts$/, timeout: 120_000, reporter: "list",
  use: { baseURL: "http://localhost:4173" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "bun run preview", url: "http://localhost:4173", reuseExistingServer: true },
})

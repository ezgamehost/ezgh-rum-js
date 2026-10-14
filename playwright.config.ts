import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "e2e", testMatch: /.*\.pw\.ts$/, fullyParallel: true, retries: 1, reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:4173" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    { command: "bun fixtures/fake-intake/server.ts", url: "http://localhost:4318/_health", reuseExistingServer: !process.env.CI },
    { command: "bun run --cwd fixtures/react-app build && bun run --cwd fixtures/react-app preview",
      url: "http://localhost:4173", reuseExistingServer: !process.env.CI, env: { EZGH_RUM_ENDPOINT: "http://localhost:4318" } },
  ],
})

import { test } from "@playwright/test"

test("drive the fixture app against production", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("link", { name: "User 42" }).click()
  await page.getByRole("link", { name: "Home" }).click()
  await page.getByRole("link", { name: "User UUID" }).click()
  await page.getByRole("link", { name: "Home" }).click()
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  await page.getByRole("button", { name: "Throw", exact: true }).click()
  await page.getByRole("button", { name: "Throw 50", exact: true }).click()
  await page.waitForTimeout(60_000)
  await page.evaluate(() => window.__rum?.flush())
})

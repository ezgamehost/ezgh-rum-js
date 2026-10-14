import { test, expect, waitFor, spans, views, attr, setHidden } from "./intake.ts"

test("a view's events count updates from 0 with increments; update 0 carries the vitals", async ({ page, ct, browserName }) => {
  const metrics: string[] = []
  page.on("request", (r) => {
    if (r.url().includes("/v1/metrics")) metrics.push(r.url())
  })
  await page.goto(`/?ct=${ct}`)
  await expect(page.locator("img")).toBeVisible()
  const loaded = await waitFor(ct, c => spans(c).some(s => s.name === "documentLoad"), page)
  const viewId = attr(spans(loaded).find(s => s.name === "documentLoad")!.attributes, "ezgh.rum.view.id")
  // Update 0 must carry LCP whenever the browser reported one before the page was hidden.
  const lcpSeen = await page.evaluate(() => new Promise<boolean>((resolve) => {
    if (!PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint")) return resolve(false)
    new PerformanceObserver(l => resolve(l.getEntries().length > 0)).observe({ type: "largest-contentful-paint", buffered: true })
    setTimeout(() => resolve(false), 3000)
  }))
  if (browserName !== "webkit") expect(lcpSeen).toBe(true)
  await setHidden(page, true)
  await page.waitForTimeout(300)
  await setHidden(page, false)
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  await expect(page.locator("pre")).toContainText("items")
  await page.waitForTimeout(300)
  await setHidden(page, true)
  await page.waitForTimeout(300)
  await setHidden(page, false)
  await page.getByRole("link", { name: "User 42" }).click()
  const caps = await waitFor(ct, c => views(c).filter(v => attr(v.attributes, "ezgh.rum.view.id") === viewId).length >= 3, page)
  const mine = views(caps).filter(v => attr(v.attributes, "ezgh.rum.view.id") === viewId)
    .sort((a, b) => Number(attr(a.attributes, "ezgh.rum.view.update")) - Number(attr(b.attributes, "ezgh.rum.view.update")))
  expect(mine.map(v => attr(v.attributes, "ezgh.rum.view.update"))).toEqual([0, 1, 2])
  expect(mine.map(v => attr(v.attributes, "ezgh.rum.view.final"))).toEqual([false, false, true])
  const first = mine[0]!.attributes
  expect(attr(first, "ezgh.rum.vitals.fcp")).toBeGreaterThan(0)
  expect(attr(first, "ezgh.rum.vitals.ttfb")).toBeGreaterThanOrEqual(0)
  if (browserName === "chromium") expect(attr(first, "ezgh.rum.vitals.cls")).toBeGreaterThanOrEqual(0)
  if (lcpSeen) expect(attr(first, "ezgh.rum.vitals.lcp")).toBeGreaterThan(0)
  expect(mine.map(v => attr(v.attributes, "ezgh.rum.view.requests"))).toEqual([0, 1, 0])
  expect(mine.every(v => v.severityNumber === 9 && v.body === undefined)).toBe(true)
  expect(metrics).toEqual([])
})

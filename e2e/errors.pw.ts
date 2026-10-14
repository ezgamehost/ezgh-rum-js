import { test, expect, waitFor, exceptions, spans, attr } from "./intake.ts"

test("an uncaught error carries its debug ID, breadcrumbs and source", async ({ page, request, ct }) => {
  await page.goto(`/?ct=${ct}`)
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  await expect(page.locator("pre")).toContainText("items")
  await page.getByRole("button", { name: "Throw", exact: true }).click()
  const caps = await waitFor(ct, c => exceptions(c).length > 0, page)
  const exc = exceptions(caps)[0]!
  expect(attr(exc.attributes, "exception.type")).toBe("TypeError")
  expect(attr(exc.attributes, "ezgh.rum.error.source")).toBe("uncaught")
  expect(exc.severityNumber).toBe(17)
  const ids = JSON.parse(attr(exc.attributes, "ezgh.rum.debug_ids") as string) as Record<string, string>
  const [url, id] = Object.entries(ids).find(([u]) => /\/assets\/main-[^/]+\.js$/.test(u))!
  expect((await (await request.get(url)).text()).trimEnd().endsWith(`//# debugId=${id}`)).toBe(true)
  const crumbs = JSON.parse(attr(exc.attributes, "ezgh.rum.breadcrumbs") as string) as Array<{ t: number, type: string, name?: string, status?: number | null }>
  expect(crumbs.every(b => typeof b.t === "number")).toBe(true)
  expect(crumbs.some(b => b.type === "action" && b.name === "fetch-items")).toBe(true)
  expect(crumbs.some(b => b.type === "request" && b.status === 200)).toBe(true)
  if (exc.traceId) {
    const all = await waitFor(ct, c => spans(c).some(s => s.traceId === exc.traceId), page)
    expect(spans(all).find(s => s.traceId === exc.traceId)?.name).toMatch(/^(interaction|documentLoad|routeChange|HTTP GET)$/)
  }
})

test("Throw 50 sends at most 10 identical exceptions", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}`)
  await page.getByRole("button", { name: "Throw 50", exact: true }).click()
  const caps = await waitFor(ct, c => exceptions(c).length >= 10, page)
  await page.waitForTimeout(1000)
  await waitFor(ct, () => true, page)
  expect(exceptions(caps).length).toBeLessThanOrEqual(10)
  const later = exceptions(await waitFor(ct, () => true, page))
  expect(later.length).toBe(10)
})

test("a render error caught by EzghErrorBoundary has source boundary", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}`)
  await page.getByRole("button", { name: "Render throw", exact: true }).click()
  await expect(page.getByText("broken")).toBeVisible()
  const caps = await waitFor(ct, c => exceptions(c).some(e => attr(e.attributes, "ezgh.rum.error.source") === "boundary"), page)
  const exc = exceptions(caps).find(e => attr(e.attributes, "ezgh.rum.error.source") === "boundary")!
  expect(attr(exc.attributes, "exception.message")).toBe("render exploded")
  expect(String(attr(exc.attributes, "ezgh.rum.react.component_stack"))).not.toBe("") // its format is per engine, and names are minified in production builds
})

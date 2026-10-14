import { test, expect, waitFor, captured, respond, setHidden, spans } from "./intake.ts"

test("periodic flushes are gzipped and small; a hidden flush is raw", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}`)
  const caps = await waitFor(ct, c => spans(c).some(s => s.name === "documentLoad"), page)
  for (const c of caps) {
    expect(c.query.enc).toBe("gzip")
    expect(c.size).toBeLessThan(60_000)
    expect(c.contentType).toBe("text/plain;charset=UTF-8")
    expect(c.query.sv).toBeTruthy()
  }
  const before = caps.length
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  await page.waitForTimeout(300)
  await setHidden(page, true)
  const after = await waitFor(ct, c => c.length > before)
  expect(after.slice(before).every(c => c.query.enc === undefined && !c.gzip)).toBe(true)
})

test("a 401 stops sending for the page", async ({ page, ct }) => {
  await respond(ct, [{ status: 401 }])
  await page.goto(`/?ct=${ct}`)
  await waitFor(ct, c => c.length >= 1, page)
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  await page.getByRole("button", { name: "Throw", exact: true }).click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.__rum!.flush())
  expect(await captured(ct)).toHaveLength(1)
})

test("a 429 with Retry-After: 3 delays the next request at least 3 s", async ({ page, ct }) => {
  test.setTimeout(60_000)
  await respond(ct, [{ status: 429, retryAfter: "3" }])
  await page.goto(`/?ct=${ct}`)
  const first = await waitFor(ct, c => c.length >= 1, page)
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  const next = await waitFor(ct, c => c.length >= 2, page, 30_000)
  expect(next[1]!.at - first[0]!.at).toBeGreaterThanOrEqual(3000)
})

test("the tunnel carries path and the same parameters", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}&tunnel=1`)
  const caps = await waitFor(ct, c => c.length >= 1, page)
  expect(caps[0]!.via).toBe("tunnel")
  expect(["/v1/traces", "/v1/logs"]).toContain(caps[0]!.query.path)
  expect(caps[0]!.query.ct).toBe(ct)
})

test("an unsampled session sends nothing", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}&sample=0`)
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  await page.getByRole("button", { name: "Throw", exact: true }).click()
  await page.evaluate(() => window.__rum!.flush())
  await page.waitForTimeout(5000)
  expect(await captured(ct)).toHaveLength(0)
  expect(await page.evaluate(() => window.__rum!.sessionId())).toBeUndefined()
})

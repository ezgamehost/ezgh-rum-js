import { test, expect, waitFor, spans, attr } from "./intake.ts"

test("documentLoad with phase children and the resource attributes", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}`)
  const caps = await waitFor(ct, c => spans(c).some(s => s.name === "documentLoad"), page)
  const all = spans(caps)
  const load = all.find(s => s.name === "documentLoad")!
  const children = all.filter(s => s.parentSpanId === load.spanId).map(s => s.name)
  // dns, connect, tls and response can take 0 ms on localhost (a phase is sent only when it took time)
  expect(children).toContain("domProcessing")
  for (const n of children) expect(["dns", "connect", "tls", "request", "response", "domProcessing"]).toContain(n)
  for (const c of all.filter(s => s.parentSpanId === load.spanId)) expect(c.traceId).toBe(load.traceId)
  expect(attr(load.resource, "telemetry.sdk.name")).toBe("ezgh-rum")
  expect(["desktop", "mobile", "tablet"]).toContain(attr(load.resource, "device.type"))
  expect(attr(load.resource, "service.version")).toBe("dev")
  expect(attr(load.attributes, "ezgh.rum.view.name")).toBe("/")
})

test("reloads and other tabs keep the session", async ({ page, context, ct }) => {
  await page.goto(`/?ct=${ct}`)
  const first = await page.evaluate(() => window.__rum!.sessionId())
  expect(first).toMatch(/^[0-9a-f]{32}$/)
  await page.reload()
  expect(await page.evaluate(() => window.__rum!.sessionId())).toBe(first)
  const other = await context.newPage()
  await other.goto(`/?ct=${ct}`)
  expect(await other.evaluate(() => window.__rum!.sessionId())).toBe(first)
  // (a reload can unload the page before its documentLoad ends, so not every load is sent)
  const caps = await waitFor(ct, c => spans(c).length > 0, other)
  for (const s of spans(caps)) expect(attr(s.attributes, "session.id")).toBe(first)
})

test("a <meta name=traceparent> parents documentLoad into the server's trace", async ({ page, ct }) => {
  await page.goto(`/traced.html?ct=${ct}`)
  const caps = await waitFor(ct, c => spans(c).some(s => s.name === "documentLoad"), page)
  const load = spans(caps).find(s => s.name === "documentLoad")!
  expect(load.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736")
  expect(load.parentSpanId).toBe("00f067aa0ba902b7")
})

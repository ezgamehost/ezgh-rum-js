import { test, expect, waitFor, spans, attr, tracedCalls } from "./intake.ts"

test("Fetch is an interaction with a traced HTTP GET child; untraced origins get no traceparent", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}`)
  await page.getByRole("button", { name: "Fetch", exact: true }).click()
  await page.getByRole("button", { name: "Fetch untraced", exact: true }).click()
  const caps = await waitFor(ct, c => spans(c).some(s => s.name === "interaction" && attr(s.attributes, "ezgh.rum.action.name") === "fetch-items")
    && spans(c).filter(s => s.name === "HTTP GET").length >= 2, page)
  const all = spans(caps)
  const ia = all.find(s => s.name === "interaction" && attr(s.attributes, "ezgh.rum.action.name") === "fetch-items")!
  const get = all.find(s => s.name === "HTTP GET" && String(attr(s.attributes, "url.full")).includes("/api/items"))!
  expect(get.parentSpanId).toBe(ia.spanId)
  expect(get.traceId).toBe(ia.traceId)
  expect(get.kind).toBe(3)
  expect(attr(get.attributes, "http.response.status_code")).toBe(200)
  expect(attr(get.attributes, "server.address")).toBe("localhost")
  const calls = await tracedCalls(ct)
  expect(calls.traced[0]!.traceparent).toBe(`00-${get.traceId}-${get.spanId}-01`)
  expect(calls.untraced[0]!.traceparent).toBe(false)
  expect(all.some(s => String(attr(s.attributes, "url.full") ?? "").startsWith("http://localhost:4318"))).toBe(false)
})

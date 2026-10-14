import { expect, test } from "bun:test"
import { ErrorThrottle } from "../src/throttle.ts"
import { Breadcrumbs } from "../src/breadcrumbs.ts"
import { exceptionAttrs } from "../src/errors.ts"
import { AttributeStore, filterAttrs } from "../src/attributes.ts"

test("10 identical errors a minute; the rest are counted onto the next one sent", () => {
  const t = new ErrorThrottle()
  const r = Array.from({ length: 15 }, (_, i) => t.admit("k", i))
  expect(r.filter(x => x.send)).toHaveLength(10)
  expect(t.admit("k", 60_001)).toEqual({ send: true, suppressed: 5 })
  expect(t.admit("other", 1).send).toBe(true)
})
test("breadcrumbs keep 50 and fit 16 KB by dropping the oldest (Console's shape: t in unix ms)", () => {
  const b = new Breadcrumbs()
  for (let i = 0; i < 80; i++) b.add({ type: "console", t: i, level: "warn", message: String(i).padEnd(300, "x") })
  const parsed = JSON.parse(b.toJSON()) as Array<{ t: number, message: string }>
  expect(parsed.length).toBeLessThanOrEqual(50)
  expect(new TextEncoder().encode(b.toJSON()).byteLength).toBeLessThanOrEqual(16_384)
  expect(parsed[0]!.message).toHaveLength(256) // truncated at add
  expect(parsed.at(-1)!.message.startsWith("79")).toBe(true)
  expect(parsed.at(-1)!.t).toBe(79)
  const small = new Breadcrumbs()
  small.add({ type: "request", t: 5, method: "GET", url: "https://a.example/x", status: null, durationMs: 12 })
  expect(JSON.parse(small.toJSON())).toEqual([{ type: "request", t: 5, method: "GET", url: "https://a.example/x", status: null, durationMs: 12 }])
})
test("exception attributes for Errors, non-Errors and rejections, capped", () => {
  const e = new TypeError("Cannot read properties of undefined (reading 'price')")
  expect(exceptionAttrs(e, "uncaught")).toMatchObject({ type: "TypeError", message: e.message })
  expect(exceptionAttrs("boom", "uncaught")).toMatchObject({ type: "Error", message: "boom", stack: "" })
  expect(exceptionAttrs({ a: 1 }, "unhandledrejection")).toMatchObject({ type: "UnhandledRejection", message: "[object Object]" })
  expect(exceptionAttrs(new Error("x".repeat(10_000)), "manual").message).toHaveLength(4096)
})
test("attributes: max 32 keys, SDK-owned keys refused", () => {
  const s = new AttributeStore()
  expect(s.set({ "session.id": "x", "ezgh.rum.view.name": "x", "user.id": "x", "plan": "pro" })).toEqual(["session.id", "ezgh.rum.view.name", "user.id"])
  s.set(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i])))
  expect(Object.keys(s.get())).toHaveLength(32)
  expect(filterAttrs({ "a": "x".repeat(2000), "b": NaN, "c": true, "http.x": 1 })).toEqual({ kept: { a: "x".repeat(1024), c: true }, refused: ["http.x"] })
})

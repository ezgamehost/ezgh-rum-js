import { expect, mock, test } from "bun:test"

const calls: Array<[string, Record<string, unknown>]> = []
void mock.module("@ezgh/rum-build", () => ({
  processOutput: (dir: string, o: Record<string, unknown>) => {
    calls.push([dir, o])
    return Promise.resolve({ injected: 0, uploaded: 0 })
  },
}))
const { withEzghRum } = await import("../src/config.ts")

test("withEzghRum keeps the customer's config, adds trace metadata once, and chains the compile hook", async () => {
  const order: string[] = []
  const prev = () => {
    order.push("prev")
    return Promise.resolve()
  }
  const out = withEzghRum({ reactStrictMode: true, experimental: { clientTraceMetadata: ["baggage", "traceparent"] }, compiler: { runAfterProductionCompile: prev } },
    { application: "shop" })
  expect(out.reactStrictMode).toBe(true)
  expect(out.productionBrowserSourceMaps).toBe(true)
  expect(out.experimental?.clientTraceMetadata).toEqual(["baggage", "traceparent", "tracestate"])
  await out.compiler!.runAfterProductionCompile!({ projectDir: "/app", distDir: ".next" })
  order.push(...calls.map(() => "process"))
  expect(order).toEqual(["prev", "process"])
  expect(calls[0]![0]).toBe("/app/.next/static")
  expect(calls[0]![1]).toMatchObject({ pathPrefix: "_next/static/", deleteMapsAfterUpload: true, deleteMapsAlways: true, application: "shop" })
})

test("maps the customer already serves are kept", async () => {
  calls.length = 0
  await withEzghRum({ productionBrowserSourceMaps: true }).compiler!.runAfterProductionCompile!({ projectDir: "/app", distDir: "/abs/out" })
  expect(calls[0]![0]).toBe("/abs/out/static")
  expect(calls[0]![1].deleteMapsAlways).toBeUndefined()
})

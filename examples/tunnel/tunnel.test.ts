// The tunnel handlers against a fake obs-browser upstream: query and body unchanged, Origin and
// X-Forwarded-For forwarded, Cookie and Authorization never, only /v1/traces and /v1/logs, 1 MiB.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { AddressInfo } from "node:net"
import type { Server } from "node:http"
import express from "express"

type Seen = { url: string, headers: Record<string, string>, body: Uint8Array }
const seen: Seen[] = []
let upstreamStatus: { status: number, retryAfter?: string } = { status: 200 }
const upstream = Bun.serve({
  port: 0,
  async fetch(req) {
    const u = new URL(req.url)
    seen.push({ url: u.pathname + u.search, headers: Object.fromEntries(req.headers), body: new Uint8Array(await req.arrayBuffer()) })
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (upstreamStatus.retryAfter) headers["Retry-After"] = upstreamStatus.retryAfter
    return new Response("{\"partialSuccess\":{}}", { status: upstreamStatus.status, headers })
  },
})
const UP = `http://localhost:${upstream.port}`
process.env.EZGH_RUM_UPSTREAM = UP

type Send = (query: string, init: { body: Uint8Array<ArrayBuffer>, headers: Record<string, string> }) => Promise<Response>
let expressServer: Server
const handlers: Record<string, Send> = {}

beforeAll(async () => {
  const worker = (await import("./cloudflare-worker.ts")).default
  handlers.worker = (query, init) => worker.fetch(new Request(`https://shop.example/_ezgh${query}`, { method: "POST", ...init }), { EZGH_RUM_UPSTREAM: UP })
  const next = await import("./nextjs-route.ts")
  handlers.nextjs = (query, init) => next.POST(new Request(`https://shop.example/_ezgh${query}`, { method: "POST", ...init }))
  const { ezghTunnel } = await import("./express.ts")
  const app = express()
  app.use("/_ezgh", ezghTunnel())
  expressServer = app.listen(0)
  await new Promise<void>(r => expressServer.once("listening", () => r()))
  const port = (expressServer.address() as AddressInfo).port
  handlers.express = (query, init) => fetch(`http://localhost:${port}/_ezgh${query}`, { method: "POST", ...init })
})
afterAll(async () => {
  expressServer.close()
  await upstream.stop(true)
})

const Q = "?path=/v1/logs&ct=ezgh_ct_" + "a".repeat(43) + "&enc=gzip&sv=1"
const gz = Bun.gzipSync(new TextEncoder().encode("{\"resourceLogs\":[]}"))
const browserHeaders = {
  "Content-Type": "text/plain;charset=UTF-8", "Origin": "https://shop.example", "Cookie": "session=s3cret",
  "Authorization": "Bearer nope", "X-Forwarded-For": "203.0.113.9", "CF-Connecting-IP": "198.51.100.7",
}

for (const name of ["worker", "express", "nextjs"]) {
  describe(name, () => {
    test("forwards the query and the gzip bytes unchanged, Origin and X-Forwarded-For, never Cookie or Authorization", async () => {
      upstreamStatus = { status: 200 }
      seen.length = 0
      const res = await handlers[name]!(Q, { body: gz, headers: browserHeaders })
      expect(res.status).toBe(200)
      expect(res.headers.get("Content-Type")).toBe("application/json")
      expect(seen).toHaveLength(1)
      const s = seen[0]!
      expect(s.url).toBe("/v1/logs" + Q)
      expect(s.body).toEqual(gz)
      expect(s.headers.origin).toBe("https://shop.example")
      expect(s.headers["content-type"]).toBe("text/plain;charset=UTF-8")
      expect(s.headers.cookie).toBeUndefined()
      expect(s.headers.authorization).toBeUndefined()
      const xff = s.headers["x-forwarded-for"]!.split(",").map(x => x.trim())
      expect(xff[0]).toBe("203.0.113.9")
      // The browser's address is last: CF-Connecting-IP (Worker), req.ip (Express), or the
      // platform's header passed through as is (Next.js).
      if (name === "worker") expect(xff.at(-1)).toBe("198.51.100.7")
      if (name === "express") expect(xff.at(-1)).toMatch(/127\.0\.0\.1|::1/)
    })
    test("only /v1/traces and /v1/logs", async () => {
      seen.length = 0
      for (const p of ["/v1/metrics", "/v1/other", ""]) {
        const res = await handlers[name]!(`?path=${p}&ct=x`, { body: gz, headers: { "Content-Type": "text/plain" } })
        expect(res.status).toBe(404)
      }
      expect((await handlers[name]!("", { body: gz, headers: {} })).status).toBe(404)
      expect(seen).toHaveLength(0)
    })
    test("a body over 1 MiB is 413", async () => {
      seen.length = 0
      const res = await handlers[name]!(Q, { body: new Uint8Array(2 << 20), headers: { "Content-Type": "text/plain" } })
      expect(res.status).toBe(413)
      expect(seen).toHaveLength(0)
    })
    test("an upstream 429 comes back with its Retry-After", async () => {
      upstreamStatus = { status: 429, retryAfter: "7" }
      const res = await handlers[name]!(Q.replace("/v1/logs", "/v1/traces"), { body: gz, headers: { "Content-Type": "text/plain" } })
      expect(res.status).toBe(429)
      expect(res.headers.get("Retry-After")).toBe("7")
      upstreamStatus = { status: 200 }
    })
  })
}

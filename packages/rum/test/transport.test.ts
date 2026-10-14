import { describe, expect, test } from "bun:test"
import { classify, Exporter, type ExporterDeps, WIRE_MAX } from "../src/transport.ts"
import { item } from "../src/chunk.ts"

const CFG = { endpoint: "https://obs-browser.ezghcloud.com", token: "ezgh_ct_" + "a".repeat(43), sdkVersion: "0.1.0", resource: "[]" }
type Call = { url: string, init: RequestInit }
function fake(responses: Array<number | [number, string] | "network">): ExporterDeps & { calls: Call[], t: number } {
  const d = {
    calls: [] as Call[], t: 1_000_000,
    now: () => d.t,
    compress: (s: string) => Promise.resolve(Bun.gzipSync(new TextEncoder().encode(s))),
    fetch: ((url: string, init: RequestInit) => {
      d.calls.push({ url, init })
      const r = responses.shift() ?? 200
      if (r === "network") return Promise.reject(new TypeError("Failed to fetch"))
      const [status, ra] = Array.isArray(r) ? r : [r, ""]
      return Promise.resolve(new Response("{}", { status, headers: ra ? { "Retry-After": ra } : {} }))
    }) as unknown as typeof fetch,
  }
  return d
}

describe("classify", () => {
  test("statuses", () => {
    expect(classify(200, null, 0)).toEqual({ kind: "ok" })
    expect(classify(401, null, 0)).toEqual({ kind: "stop" })
    expect(classify(403, null, 0)).toEqual({ kind: "stop" })
    expect(classify(429, "2", 0)).toEqual({ kind: "retry", afterMs: 2000 })
    expect(classify(429, "3600", 0)).toEqual({ kind: "budget", untilMs: 3_600_000 })
    expect(classify(503, null, 0)).toEqual({ kind: "retry", afterMs: 0 })
    expect(classify(400, null, 0)).toEqual({ kind: "drop" })
  })
})

describe("Exporter", () => {
  test("gzip, query parameters, text/plain, keepalive, no credentials", async () => {
    const d = fake([200])
    const e = new Exporter(CFG, d, () => undefined)
    e.enqueue(item("logs", "{\"x\":1}"))
    await e.flush()
    expect(d.calls[0]!.url).toBe(`https://obs-browser.ezghcloud.com/v1/logs?ct=${CFG.token}&enc=gzip&sv=0.1.0`)
    expect(d.calls[0]!.init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain;charset=UTF-8" } })
    const body = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(d.calls[0]!.init.body as Uint8Array<ArrayBuffer>)))
    expect(body.resourceLogs[0].scopeLogs[0].logRecords).toEqual([{ x: 1 }])
  })
  test("tunnel URL carries path and the same parameters; own URLs are recognized", () => {
    const e = new Exporter({ ...CFG, tunnel: "https://shop.example/_ezgh" }, fake([]), () => undefined)
    expect(e.url("traces", true)).toBe(`https://shop.example/_ezgh?path=/v1/traces&ct=${CFG.token}&enc=gzip&sv=0.1.0`)
    expect(e.isOwnUrl("https://shop.example/_ezgh?path=/v1/logs&ct=x")).toBe(true)
    expect(e.isOwnUrl("https://shop.example/api/cart")).toBe(false)
    expect(new Exporter(CFG, fake([]), () => undefined).isOwnUrl("https://obs-browser.ezghcloud.com/v1/logs?ct=x")).toBe(true)
  })
  test("every request is under 60 KB on the wire, even for incompressible records", async () => {
    const d = fake(new Array<number>(50).fill(200))
    const e = new Exporter(CFG, d, () => undefined)
    for (let i = 0; i < 40; i++) e.enqueue(item("logs", JSON.stringify({ r: crypto.getRandomValues(new Uint8Array(6000)).toString() })))
    await e.flush()
    for (const c of d.calls) expect((c.init.body as Uint8Array).byteLength).toBeLessThan(WIRE_MAX)
    expect(e.queue.count).toBe(0)
  })
  test("401 stops for the page and clears the queue", async () => {
    let reason = ""
    const d = fake([401])
    const e = new Exporter(CFG, d, (r) => {
      reason = r
    })
    e.enqueue(item("logs", "{}"))
    await e.flush()
    e.enqueue(item("logs", "{}"))
    await e.flush()
    expect(reason).toBe("unauthorized")
    expect(d.calls).toHaveLength(1)
    expect(e.queue.count).toBe(0)
  })
  test("429 keeps the records and waits at least Retry-After (and the backoff)", async () => {
    const d = fake([[429, "30"], 200])
    const e = new Exporter(CFG, d, () => undefined)
    e.enqueue(item("logs", "{}"))
    await e.flush()
    d.t += 29_000
    await e.flush()
    expect(d.calls).toHaveLength(1) // still paused
    d.t += 1_001
    await e.flush()
    expect(d.calls).toHaveLength(2)
    expect(e.queue.count).toBe(0)
  })
  test("a daily-budget 429 stops with its end time", async () => {
    let until = 0
    const d = fake([[429, "7200"]])
    const e = new Exporter(CFG, d, (r, u) => {
      if (r === "budget") until = u!
    })
    e.enqueue(item("logs", "{}"))
    await e.flush()
    expect(until).toBe(1_000_000 + 7_200_000)
  })
  test("5 network failures before any delivery stop the page (refused Origin is opaque)", async () => {
    let reason = ""
    const d = fake(new Array<"network">(5).fill("network"))
    const e = new Exporter(CFG, d, (r) => {
      reason = r
    })
    e.enqueue(item("logs", "{}"))
    for (let i = 0; i < 5; i++) {
      await e.flush()
      d.t += 600_000
    }
    expect(reason).toBe("unreachable")
  })
  test("network failures after a delivery only back off", async () => {
    let reason = ""
    const d = fake([200, ...new Array<"network">(6).fill("network")])
    const e = new Exporter(CFG, d, (r) => {
      reason = r
    })
    e.enqueue(item("logs", "{}"))
    await e.flush()
    e.enqueue(item("logs", "{}"))
    for (let i = 0; i < 6; i++) {
      await e.flush()
      d.t += 600_000
    }
    expect(reason).toBe("")
    expect(e.queue.count).toBe(1)
  })
  test("hidden flush is synchronous, raw, and beacons first", () => {
    const beacons: string[] = []
    const d = fake([])
    const e = new Exporter(CFG, { ...d, sendBeacon: u => (beacons.push(u), true) }, () => undefined)
    e.enqueue(item("traces", "{}"))
    e.enqueue(item("logs", "{}"))
    e.flushHidden()
    expect(beacons.sort()).toEqual([`https://obs-browser.ezghcloud.com/v1/logs?ct=${CFG.token}&sv=0.1.0`,
      `https://obs-browser.ezghcloud.com/v1/traces?ct=${CFG.token}&sv=0.1.0`])
    expect(d.calls).toHaveLength(0)
  })
  test("hidden flush falls back to keepalive fetch when the beacon is refused", () => {
    const d = fake([200])
    const e = new Exporter(CFG, { ...d, sendBeacon: () => false }, () => undefined)
    e.enqueue(item("logs", "{}"))
    e.flushHidden()
    expect(d.calls).toHaveLength(1)
    expect(d.calls[0]!.init).toMatchObject({ keepalive: true, credentials: "omit" })
    expect(typeof d.calls[0]!.init.body).toBe("string")
  })
  test("a hidden flush claims the chunk a periodic flush is still compressing", async () => {
    const beacons: string[] = []
    let release: () => void = () => undefined
    const d = fake([200])
    const e = new Exporter(CFG, {
      ...d, sendBeacon: (u) => {
        beacons.push(u)
        return true
      },
      compress: s => new Promise((resolve) => {
        release = () => resolve(Bun.gzipSync(new TextEncoder().encode(s)))
      }),
    }, () => undefined)
    e.enqueue(item("logs", "{}"))
    const p = e.flush()
    e.flushHidden()
    release()
    await p
    expect(beacons).toHaveLength(1)
    expect(d.calls).toHaveLength(0)
  })
  test("a hidden flush keeps what's over the keepalive budget and records over 60 KB", () => {
    const beacons: string[] = []
    const e = new Exporter(CFG, { ...fake([]), sendBeacon: (u) => {
      beacons.push(u)
      return true
    } }, () => undefined)
    for (let i = 0; i < 3; i++) e.enqueue(item("logs", JSON.stringify({ r: "x".repeat(30_000) })))
    e.enqueue(item("traces", JSON.stringify({ r: "y".repeat(70_000) })))
    e.flushHidden()
    expect(beacons).toHaveLength(2) // one 30 KB record per chunk; a third would pass the 64 KB budget
    expect(e.queue.count).toBe(2)
  })
  test("server errors don't count toward the unreachable stop; flush waits for an in-flight send", async () => {
    let reason = ""
    const d = fake([503, 503, 503, 503, "network", 200])
    const e = new Exporter(CFG, d, (r) => {
      reason = r
    })
    e.enqueue(item("logs", "{}"))
    for (let i = 0; i < 5; i++) {
      await e.flush()
      d.t += 600_000
    }
    expect(reason).toBe("")
    const first = e.flush()
    expect(e.flush()).toBe(first)
    await first
    expect(e.queue.count).toBe(0)
  })
})

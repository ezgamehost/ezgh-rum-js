// The exporter: gzip where CompressionStream exists, requests under 60 KB on the wire (the
// keepalive/sendBeacon quota), and the stop rules of spec "Safety" and plan 25 corrections 2 and 12.
import { chunkItems, utf8Length, type Chunk, type Item } from "./chunk.ts"
import { envelope, type Signal } from "./otlp.ts"
import { RecordQueue } from "./queue.ts"

export const WIRE_MAX = 60_000
export const RAW_MAX_GZIP = 240_000
export const KEEPALIVE_BUDGET = 64_000 // shared by in-flight beacons and keepalive fetches
const MAX_DEAD_FAILURES = 5
const TEXT = "text/plain;charset=UTF-8"

export type Outcome = { kind: "ok" } | { kind: "stop" } | { kind: "drop" } | { kind: "retry", afterMs: number } | { kind: "budget", untilMs: number }
export function retryAfterMs(h: string | null, now: number): number | undefined {
  if (!h) return undefined
  const s = h.trim()
  if (/^\d+$/.test(s)) return Number(s) * 1000
  const t = Date.parse(s)
  return Number.isNaN(t) ? undefined : Math.max(0, t - now)
}
export function classify(status: number, retryAfter: string | null, now: number): Outcome {
  if (status >= 200 && status < 300) return { kind: "ok" }
  if (status === 401 || status === 403) return { kind: "stop" }
  if (status === 429) {
    const ms = retryAfterMs(retryAfter, now) ?? 10_000
    // Per-second buckets never ask for more than a minute; the daily budget does.
    return ms > 60_000 ? { kind: "budget", untilMs: now + ms } : { kind: "retry", afterMs: ms }
  }
  if (status === 408 || status >= 500) return { kind: "retry", afterMs: retryAfterMs(retryAfter, now) ?? 0 }
  return { kind: "drop" } // 400, 413, 415: resending can't help
}

export type Bytes = Uint8Array<ArrayBuffer>
export interface ExporterConfig { endpoint: string, tunnel?: string, token: string, sdkVersion: string, resource: string }
export interface ExporterDeps { fetch: typeof fetch, sendBeacon?: (url: string, data: Blob) => boolean, compress?: (s: string) => Promise<Bytes | undefined>, now: () => number }
export type StopReason = "unauthorized" | "budget" | "unreachable"

export function gzipCompressor(): ((s: string) => Promise<Bytes | undefined>) | undefined {
  if (typeof CompressionStream === "undefined") return undefined
  return async (s) => {
    try {
      const stream = new Blob([s]).stream().pipeThrough(new CompressionStream("gzip"))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    }
    catch {
      return undefined
    }
  }
}

export class Exporter {
  readonly queue = new RecordQueue()
  stopped: StopReason | undefined
  private pausedUntil = 0
  private failures = 0 // for the backoff: network errors, 408, 429 and 5xx
  private networkFailures = 0 // consecutive requests with no HTTP response at all
  private delivered = false
  private inFlight: Promise<void> | undefined
  private keepaliveBytes = 0
  // The chunk a periodic flush is compressing: a hidden flush claims it, since the page may unload
  // before the compression promise resumes.
  private compressing: { items: Item[], claimed: boolean } | undefined

  constructor(private readonly cfg: ExporterConfig, private readonly deps: ExporterDeps,
    private readonly onStop: (r: StopReason, untilMs?: number) => void) {}

  /** The encoded resource attributes, known once the SDK starts. */
  setResource(resource: string): void {
    this.cfg.resource = resource
  }

  url(signal: Signal, gzip: boolean): string {
    const q = `ct=${this.cfg.token}${gzip ? "&enc=gzip" : ""}&sv=${encodeURIComponent(this.cfg.sdkVersion)}`
    if (this.cfg.tunnel) return `${this.cfg.tunnel}${this.cfg.tunnel.includes("?") ? "&" : "?"}path=/v1/${signal}&${q}`
    return `${this.cfg.endpoint.replace(/\/+$/, "")}/v1/${signal}?${q}`
  }

  /** `url` is absolute; cfg.tunnel was resolved against location.href by the caller. */
  isOwnUrl(url: string): boolean {
    if (this.cfg.tunnel) {
      const base = this.cfg.tunnel.split("?")[0]!
      return url === base || url.startsWith(base + "?") || url.startsWith(base + "#")
    }
    return url.startsWith(`${this.cfg.endpoint.replace(/\/+$/, "")}/v1/`)
  }

  enqueue(i: Item): void {
    if (!this.stopped) this.queue.push(i)
  }

  /** Single-flight; gzip; sequential fetches. Resolves when the queue is sent (or kept for later). */
  flush(): Promise<void> {
    if (this.inFlight) return this.inFlight
    if (this.stopped || this.deps.now() < this.pausedUntil || this.queue.count === 0) return Promise.resolve()
    const p = this.sendAll().catch(() => undefined).finally(() => {
      this.inFlight = undefined
    })
    this.inFlight = p
    return p
  }

  /**
   * Synchronous, for a page being hidden: raw JSON through sendBeacon, then keepalive fetch. Browsers
   * share one 64 KiB budget across in-flight beacons and keepalive fetches, so what doesn't fit stays
   * queued for the next flush (the page may come back), as do records over 60 KB.
   */
  flushHidden(): void {
    if (this.stopped || this.deps.now() < this.pausedUntil) return
    const items: Item[] = []
    if (this.compressing && !this.compressing.claimed) {
      this.compressing.claimed = true
      items.push(...this.compressing.items)
    }
    items.push(...this.queue.takeAll())
    const { chunks, oversized } = chunkItems(items, WIRE_MAX, s => this.overhead(s))
    const kept: Item[] = []
    let budget = KEEPALIVE_BUDGET - this.keepaliveBytes
    for (const c of chunks) {
      const url = this.url(c.signal, false), body = this.body(c), n = utf8Length(body)
      if (n > budget) {
        kept.push(...c.items)
        continue
      }
      let ok = false
      try {
        ok = this.deps.sendBeacon?.(url, new Blob([body], { type: TEXT })) ?? false
      }
      catch { /* falls back to fetch */ }
      if (!ok) {
        this.keepaliveBytes += n
        try {
          void this.deps.fetch(url, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "Content-Type": TEXT } })
            .then(() => undefined, () => this.queue.unshift(c.items))
            .finally(() => {
              this.keepaliveBytes -= n
            })
          ok = true
        }
        catch {
          this.keepaliveBytes -= n
        }
      }
      if (ok) budget -= n
      else kept.push(...c.items)
    }
    this.queue.unshift([...kept, ...oversized])
  }

  private overhead(s: Signal): number {
    return utf8Length(envelope(s, this.cfg.resource, this.cfg.sdkVersion, []))
  }

  private body(c: Chunk): string {
    return envelope(c.signal, this.cfg.resource, this.cfg.sdkVersion, c.items.map(i => i.json))
  }

  // One chunk at a time, the rest left in the queue, so a hidden flush can still send it.
  private async sendAll(): Promise<void> {
    const max = this.deps.compress !== undefined ? RAW_MAX_GZIP : WIRE_MAX
    while (!this.stopped && this.queue.count > 0 && this.deps.now() >= this.pausedUntil) {
      const { chunks } = chunkItems(this.queue.takeAll(), max, s => this.overhead(s)) // oversized records can't be sent
      const [first, ...rest] = chunks
      this.queue.unshift(rest.flatMap(c => c.items))
      if (!first) return
      const kept = await this.send(first)
      if (this.stopped) return
      if (kept.length > 0) {
        this.queue.unshift(kept)
        return
      }
    }
  }

  // Sends one chunk and answers the records to keep for later (none when sent, dropped or claimed by
  // a hidden flush). A chunk that's 60 KB or more on the wire is sent as two halves; a single record
  // that big is dropped.
  private async send(c: Chunk): Promise<Item[]> {
    const raw = this.body(c)
    let z: Bytes | undefined
    if (this.deps.compress) {
      const pending = { items: c.items, claimed: false }
      this.compressing = pending
      try {
        z = await this.deps.compress(raw)
      }
      finally {
        if (this.compressing === pending) this.compressing = undefined
      }
      if (pending.claimed) return []
    }
    const payload: string | Bytes = z ?? raw
    const size = typeof payload === "string" ? utf8Length(payload) : payload.byteLength
    if (size >= WIRE_MAX) {
      if (c.items.length === 1) return []
      const mid = c.items.length >> 1
      const second: Chunk = { signal: c.signal, items: c.items.slice(mid) }
      const keptFirst = await this.send({ signal: c.signal, items: c.items.slice(0, mid) })
      if (keptFirst.length > 0 || this.stopped) return [...keptFirst, ...second.items]
      return this.send(second)
    }
    const keepalive = this.keepaliveBytes + size <= KEEPALIVE_BUDGET
    if (keepalive) this.keepaliveBytes += size
    let res: Response
    try {
      res = await this.deps.fetch(this.url(c.signal, z !== undefined), {
        method: "POST", body: payload, keepalive, credentials: "omit", headers: { "Content-Type": TEXT },
      })
    }
    catch {
      this.failures++
      this.networkFailures++
      if (!this.delivered && this.networkFailures >= MAX_DEAD_FAILURES) {
        this.stop("unreachable")
        return []
      }
      this.pause(0)
      return c.items
    }
    finally {
      if (keepalive) this.keepaliveBytes -= size
    }
    this.networkFailures = 0
    const o = classify(res.status, res.headers.get("Retry-After"), this.deps.now())
    switch (o.kind) {
      case "ok":
        this.delivered = true
        this.failures = 0
        return []
      case "drop": return []
      case "stop":
        this.stop("unauthorized")
        return []
      case "budget":
        this.stop("budget", o.untilMs)
        return []
      case "retry":
        this.failures++
        this.pause(o.afterMs)
        return c.items
    }
  }

  private pause(atLeastMs: number): void {
    const backoff = Math.min(300_000, 10_000 * 2 ** Math.max(0, this.failures - 1))
    this.pausedUntil = this.deps.now() + Math.max(atLeastMs, backoff)
  }

  private stop(r: StopReason, untilMs?: number): void {
    this.stopped = r
    this.queue.takeAll()
    try {
      this.onStop(r, untilMs)
    }
    catch { /* never reaches the page */ }
  }
}

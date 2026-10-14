// Helpers over the fake intake (fixtures/fake-intake/server.ts), and a `test` fixture that validates
// every body the test's token sent against fixtures/otlp-rum.schema.json.
import { test as base, expect, type Page } from "@playwright/test"
import Ajv2020 from "ajv/dist/2020.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const INTAKE = "http://localhost:4318"
const schema = JSON.parse(readFileSync(join(import.meta.dirname, "../fixtures/otlp-rum.schema.json"), "utf8")) as object
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema)

export type KV = Array<{ key: string, value: Record<string, unknown> }>
export interface Capture { ct: string, path: string, via: "direct" | "tunnel", size: number, query: Record<string, string>, origin: string | null, contentType: string | null, gzip: boolean, body: any, raw: string, at: number }
export interface SpanRec { traceId: string, spanId: string, parentSpanId?: string, name: string, kind: number, startTimeUnixNano: string, endTimeUnixNano: string, attributes: KV, status?: { code: number }, resource: KV }
export interface LogRec { timeUnixNano: string, severityNumber: number, body?: { stringValue: string }, attributes: KV, traceId?: string, spanId?: string, resource: KV }

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
export function newToken(): string {
  let s = ""
  for (const b of crypto.getRandomValues(new Uint8Array(43))) s += ALNUM[b % ALNUM.length]
  return `ezgh_ct_${s}`
}

export async function captured(ct: string): Promise<Capture[]> {
  return (await (await fetch(`${INTAKE}/_captured?ct=${ct}`)).json()) as Capture[]
}
export async function respond(ct: string, script: Array<{ status: number, retryAfter?: string }>): Promise<void> {
  await fetch(`${INTAKE}/_respond?ct=${ct}`, { method: "POST", body: JSON.stringify(script) })
}
export async function tracedCalls(ct: string): Promise<{ traced: Array<{ traceparent: string | null }>, untraced: Array<{ traceparent: boolean }> }> {
  return (await (await fetch(`${INTAKE}/_traced?ct=${ct}`)).json()) as { traced: Array<{ traceparent: string | null }>, untraced: Array<{ traceparent: boolean }> }
}

export function spans(caps: readonly Capture[]): SpanRec[] {
  return caps.filter(c => c.path === "/v1/traces").flatMap(c => (c.body.resourceSpans as any[]).flatMap(rs =>
    (rs.scopeSpans as any[]).flatMap(ss => (ss.spans as any[]).map(s => ({ ...s, resource: rs.resource.attributes })))))
}
export function logs(caps: readonly Capture[]): LogRec[] {
  return caps.filter(c => c.path === "/v1/logs").flatMap(c => (c.body.resourceLogs as any[]).flatMap(rl =>
    (rl.scopeLogs as any[]).flatMap(sl => (sl.logRecords as any[]).map(l => ({ ...l, resource: rl.resource.attributes })))))
}
export function attr(kvs: KV, key: string): string | number | boolean | undefined {
  const v = kvs.find(k => k.key === key)?.value
  if (!v) return undefined
  if ("intValue" in v) return Number(v.intValue)
  return (v.stringValue ?? v.doubleValue ?? v.boolValue) as string | number | boolean | undefined
}
export const views = (caps: readonly Capture[]) => logs(caps).filter(l => attr(l.attributes, "event.name") === "ezgh.rum.view")
export const exceptions = (caps: readonly Capture[]) => logs(caps).filter(l => attr(l.attributes, "event.name") === "exception")

export async function flush(page: Page): Promise<void> {
  await page.evaluate(() => window.__rum?.flush())
}

/** Polls the intake every 100 ms (flushing the page first, when given) until `predicate` holds. */
export async function waitFor(ct: string, predicate: (c: Capture[]) => boolean, page?: Page, timeoutMs = 15_000): Promise<Capture[]> {
  const until = Date.now() + timeoutMs
  for (;;) {
    if (page) await flush(page).catch(() => undefined)
    const caps = await captured(ct)
    if (predicate(caps)) return caps
    if (Date.now() > until) throw new Error(`timed out waiting for ${ct}; captured ${caps.length} bodies`)
    await new Promise(r => setTimeout(r, 100))
  }
}

export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") })
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h })
    document.dispatchEvent(new Event("visibilitychange"))
  }, hidden)
}

// Each test gets its own token (tokens partition the intake), and every body sent with it must
// match the schema.
export const test = base.extend<{ ct: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern
  ct: async ({}, use) => {
    const ct = newToken()
    await use(ct)
    for (const c of await captured(ct)) {
      const ok = validate(c.body)
      expect(ok, `${c.path} body doesn't match otlp-rum.schema.json: ${JSON.stringify(validate.errors?.slice(0, 5))}\n${c.raw.slice(0, 2000)}`).toBe(true)
    }
  },
})
export { expect }

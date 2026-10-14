// HTTP <method> client spans for fetch and XMLHttpRequest, children of the active span. traceparent
// (and the page's tracestate) is added only for allowedTracingUrls. Requests to the SDK's own
// endpoint or tunnel are never tracked. Each patch calls the original even when the SDK fails.
import type { Rum } from "../rum.ts"
import { matchesAny } from "../matchers.ts"
import { SPAN_KIND_CLIENT } from "../otlp.ts"
import { nowMs } from "../time.ts"
import { formatTraceparent } from "../traceparent.ts"
import type { Span } from "../tracer.ts"

interface Pending { span: Span, url: string, method: string, start: number, wall: number, traced: boolean }

function begin(r: Rum, method: string, raw: string): Pending | undefined {
  if (!r.active) return undefined
  const url = new URL(raw, location.href)
  if (r.exporter.isOwnUrl(url.href)) return undefined
  r.interactions.materializeRecent()
  const m = method.toUpperCase()
  const start = nowMs()
  const span = r.tracer.start(`HTTP ${m}`, SPAN_KIND_CLIENT, start, r.tracer.active(), {
    "http.request.method": m, "url.full": r.redact(url.href).full, "server.address": url.hostname,
  })
  const v = r.views.current
  if (v) v.counts.requests += 1
  r.quiescence.begin()
  return { span, url: url.href, method: m, start, wall: Date.now(), traced: matchesAny(url.href, r.opts.allowedTracingUrls) }
}

function finish(r: Rum, p: Pending, status: number | undefined): void {
  const end = nowMs()
  r.quiescence.done()
  if (status) p.span.attrs["http.response.status_code"] = status
  if (!status || status >= 500) p.span.error = true
  r.crumb({ type: "request", t: p.wall, method: p.method, url: r.redact(p.url).full, status: status || null, durationMs: Math.round(end - p.start) })
  r.tracer.end(p.span, end)
}

function traceHeaders(r: Rum, p: Pending): Array<[string, string]> {
  if (!p.traced) return []
  const h: Array<[string, string]> = [["traceparent", formatTraceparent(p.span.traceId, p.span.spanId, true)]]
  if (r.tracestate) h.push(["tracestate", r.tracestate])
  return h
}

export function installHttp(r: Rum): void {
  const originalFetch = window.fetch
  window.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let nextInit = init
    const p = r.guard.run(() => {
      const raw = input instanceof Request ? input.url : String(input)
      const method = init?.method ?? (input instanceof Request ? input.method : "GET")
      const pending = begin(r, method, raw)
      if (pending) {
        const extra = traceHeaders(r, pending)
        if (extra.length) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
          for (const [k, v] of extra) headers.set(k, v)
          nextInit = { ...init, headers }
        }
      }
      return pending
    })
    let out: Promise<Response>
    try {
      out = originalFetch.call(this === undefined ? window : this, input, nextInit)
    }
    catch (e) {
      if (p) r.guard.run(() => finish(r, p, undefined))
      throw e
    }
    if (p) {
      out.then(
        res => r.guard.run(() => finish(r, p, res.status)),
        () => r.guard.run(() => finish(r, p, undefined)),
      )
    }
    return out
  } as typeof fetch

  const info = new WeakMap<XMLHttpRequest, { method: string, url: string, headers: Set<string> }>()
  const proto = XMLHttpRequest.prototype
  const { open, send, setRequestHeader } = proto
  proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    r.guard.run(() => info.set(this, { method: String(method), url: String(url), headers: new Set() }))
    return (open as (...a: unknown[]) => void).call(this, method, url, ...rest)
  }
  proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    r.guard.run(() => info.get(this)?.headers.add(String(name).toLowerCase()))
    return setRequestHeader.call(this, name, value)
  }
  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    r.guard.run(() => {
      const i = info.get(this)
      if (!i) return
      const p = begin(r, i.method, i.url)
      if (!p) return
      for (const [k, v] of traceHeaders(r, p)) if (!i.headers.has(k)) setRequestHeader.call(this, k, v)
      this.addEventListener("loadend", r.guard.wrap(() => finish(r, p, this.status)), { once: true })
    })
    return send.call(this, body)
  }
}

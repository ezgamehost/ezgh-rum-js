// documentLoad: from navigation start (timeOrigin) to the load event plus the next paint, with
// Navigation Timing phase children and, with trackResources, resource children. A
// <meta name="traceparent"> (a server-rendered page) parents it into the server's trace.
import type { Rum } from "../rum.ts"
import { SPAN_KIND_INTERNAL } from "../otlp.ts"
import { afterPaint } from "../quiescence.ts"
import { nowMs } from "../time.ts"
import { parseTraceparent } from "../traceparent.ts"

type Mark = "domainLookupStart" | "domainLookupEnd" | "connectStart" | "connectEnd" | "secureConnectionStart" | "requestStart" | "responseStart" | "responseEnd" | "domComplete"
const PHASES: Array<[string, Mark, Mark]> = [
  ["dns", "domainLookupStart", "domainLookupEnd"],
  ["connect", "connectStart", "connectEnd"],
  ["tls", "secureConnectionStart", "connectEnd"],
  ["request", "requestStart", "responseStart"],
  ["response", "responseStart", "responseEnd"],
  ["domProcessing", "responseEnd", "domComplete"],
]
const MAX_RESOURCES = 200

function meta(name: string): string | undefined {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content || undefined
}

export function installNavigation(r: Rum): void {
  const parent = parseTraceparent(meta("traceparent"))
  r.tracestate = parent ? meta("tracestate") : undefined
  const origin = performance.timeOrigin
  const span = r.tracer.start("documentLoad", SPAN_KIND_INTERNAL, origin, parent)
  const loadView = r.views.current

  const end = r.guard.wrap((late: boolean) => {
    if (!span.open) return
    const nav = performance.getEntriesByType("navigation")[0]
    // Started after the load (late init, or consent granted later): the load's own end, not now.
    const endMs = late && nav && nav.loadEventEnd > 0 ? origin + nav.loadEventEnd : nowMs()
    if (nav) {
      for (const [name, a, b] of PHASES) {
        const s = nav[a], e = nav[b]
        if (s > 0 && e > 0 && e > s) {
          const child = r.tracer.start(name, SPAN_KIND_INTERNAL, origin + s, span)
          r.tracer.end(child, origin + e)
        }
      }
      if (r.opts.trackResources) {
        let n = 0
        for (const e of performance.getEntriesByType("resource")) {
          if (n >= MAX_RESOURCES) break
          if (e.startTime >= nav.loadEventEnd || r.exporter.isOwnUrl(e.name)) continue
          const child = r.tracer.start("resource", SPAN_KIND_INTERNAL, origin + e.startTime, span,
            { "url.full": r.redact(e.name).full, "ezgh.rum.resource.type": e.initiatorType })
          r.tracer.end(child, origin + e.responseEnd)
          n++
        }
      }
    }
    if (loadView && r.isLoadView(loadView)) loadView.loadingEnd = endMs
    r.tracer.end(span, endMs)
  })
  const loaded = () => (performance.getEntriesByType("navigation")[0]?.loadEventEnd ?? 0) > 0
  if (loaded() || document.readyState === "complete") end(true)
  else addEventListener("load", () => setTimeout(r.guard.wrap(() => afterPaint(fn => r.guard.wrap(fn), () => end(false))), 0), { once: true })
}

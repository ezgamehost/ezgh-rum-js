// instrumentation.ts: `export async function register() { await ezghTraceparent() }`. Next.js
// renders <meta name="traceparent"> from the active server span only when a W3C propagator and a
// tracer provider are registered: this installs the propagator when none is (without depending on
// @opentelemetry/core) and warns once when there's no tracer provider (use @vercel/otel's
// registerOTel, for example).
import type { Context, TextMapGetter, TextMapPropagator, TextMapSetter } from "@opentelemetry/api"

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/
let warned = false
function warnOnce(msg: string): void {
  if (warned) return
  warned = true
  console.warn(`[ezgh-rum] ${msg}`)
}

export async function ezghTraceparent(): Promise<void> {
  let api: typeof import("@opentelemetry/api")
  try {
    api = await import("@opentelemetry/api")
  }
  catch {
    warnOnce("ezghTraceparent: install @opentelemetry/api (and a tracer provider) so pages carry <meta name=\"traceparent\">")
    return
  }
  try {
    if (api.propagation.fields().length === 0) {
      const w3c: TextMapPropagator = {
        fields: () => ["traceparent", "tracestate"],
        inject(ctx: Context, carrier: unknown, setter: TextMapSetter) {
          const sc = api.trace.getSpanContext(ctx)
          if (!sc || !api.isSpanContextValid(sc)) return
          setter.set(carrier, "traceparent", `00-${sc.traceId}-${sc.spanId}-0${sc.traceFlags & 1}`)
          const ts = sc.traceState?.serialize()
          if (ts) setter.set(carrier, "tracestate", ts)
        },
        extract(ctx: Context, carrier: unknown, getter: TextMapGetter) {
          const raw = getter.get(carrier, "traceparent")
          const m = TRACEPARENT.exec((Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "")
          if (!m) return ctx
          const sc = { traceId: m[1]!, spanId: m[2]!, traceFlags: parseInt(m[3]!, 16) & 1, isRemote: true }
          if (!api.isSpanContextValid(sc)) return ctx
          const ts = getter.get(carrier, "tracestate")
          const state = Array.isArray(ts) ? ts.join(",") : ts
          return api.trace.setSpanContext(ctx, state ? { ...sc, traceState: api.createTraceState(state) } : sc)
        },
      }
      api.propagation.setGlobalPropagator(w3c)
    }
    const provider = api.trace.getTracerProvider() as { getDelegate?: () => object }
    const delegate = provider.getDelegate?.()
    if (!delegate || delegate.constructor.name === "NoopTracerProvider") {
      warnOnce("ezghTraceparent: no tracer provider is registered, so Next.js can't render <meta name=\"traceparent\"> (register one, e.g. registerOTel from @vercel/otel)")
    }
  }
  catch { /* never breaks the server */ }
}

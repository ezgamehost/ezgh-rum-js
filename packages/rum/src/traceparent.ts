// W3C Trace Context, version 00 only.
export interface ParentContext { traceId: string, spanId: string, sampled: boolean }
const RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/

export function parseTraceparent(s: string | null | undefined): ParentContext | undefined {
  const m = RE.exec((s ?? "").trim())
  if (!m) return undefined
  const [, traceId, spanId, flags] = m
  if (/^0+$/.test(traceId!) || /^0+$/.test(spanId!)) return undefined
  return { traceId: traceId!, spanId: spanId!, sampled: (parseInt(flags!, 16) & 1) === 1 }
}
export function formatTraceparent(traceId: string, spanId: string, sampled: boolean): string {
  return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`
}

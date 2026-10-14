// OTLP/HTTP JSON (the proto3 JSON mapping). Strings are built directly: records are encoded once,
// at enqueue, so the queue measures and chunks bytes without re-serializing.
import { epochMsToNanos } from "./time.ts"

export type AttrValue = string | number | boolean
export type Attrs = Record<string, AttrValue>
export type Signal = "traces" | "logs"
export const SCOPE_NAME = "ezgh-rum"
export const SPAN_KIND_INTERNAL = 1
export const SPAN_KIND_CLIENT = 3
export const SEVERITY_INFO = 9
export const SEVERITY_ERROR = 17
export interface SpanData { traceId: string, spanId: string, parentSpanId?: string, name: string, kind: 1 | 3, startMs: number, endMs: number, attrs: Attrs, error?: boolean }
export interface LogData { timeMs: number, severity: 9 | 17, body?: string, attrs: Attrs, traceId?: string, spanId?: string }

const q = JSON.stringify
function anyValue(v: AttrValue): string {
  if (typeof v === "string") return `{"stringValue":${q(v)}}`
  if (typeof v === "boolean") return `{"boolValue":${v}}`
  if (Number.isSafeInteger(v)) return `{"intValue":"${v}"}`
  return Number.isFinite(v) ? `{"doubleValue":${v}}` : `{"stringValue":${q(String(v))}}`
}
export function encodeAttrs(a: Attrs): string {
  const parts: string[] = []
  for (const k in a) parts.push(`{"key":${q(k)},"value":${anyValue(a[k]!)}}`)
  return `[${parts.join(",")}]`
}
export function encodeSpan(s: SpanData): string {
  return `{"traceId":"${s.traceId}","spanId":"${s.spanId}"${s.parentSpanId ? `,"parentSpanId":"${s.parentSpanId}"` : ""}`
    + `,"name":${q(s.name)},"kind":${s.kind},"startTimeUnixNano":"${epochMsToNanos(s.startMs)}"`
    + `,"endTimeUnixNano":"${epochMsToNanos(Math.max(s.startMs, s.endMs))}","attributes":${encodeAttrs(s.attrs)}`
    + `${s.error ? ",\"status\":{\"code\":2}" : ""}}`
}
export function encodeLog(l: LogData): string {
  const t = epochMsToNanos(l.timeMs)
  return `{"timeUnixNano":"${t}","observedTimeUnixNano":"${t}","severityNumber":${l.severity}`
    + `,"severityText":"${l.severity === SEVERITY_ERROR ? "ERROR" : "INFO"}"`
    + `${l.body !== undefined ? `,"body":{"stringValue":${q(l.body)}}` : ""},"attributes":${encodeAttrs(l.attrs)}`
    + `${l.traceId ? `,"traceId":"${l.traceId}"` : ""}${l.spanId ? `,"spanId":"${l.spanId}"` : ""}}`
}
const NAMES = {
  traces: ["resourceSpans", "scopeSpans", "spans"],
  logs: ["resourceLogs", "scopeLogs", "logRecords"],
} as const
export function envelope(signal: Signal, resourceAttrs: string, sdkVersion: string, items: readonly string[]): string {
  const [r, s, i] = NAMES[signal]
  return `{"${r}":[{"resource":{"attributes":${resourceAttrs}},"${s}":[{"scope":{"name":"${SCOPE_NAME}","version":${q(sdkVersion)}},"${i}":[${items.join(",")}]}]}]}`
}

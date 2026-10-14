import { expect, test } from "bun:test"
import { encodeLog, encodeSpan, envelope, encodeAttrs } from "../src/otlp.ts"

test("attributes use the proto3 JSON mapping (int64 as strings)", () => {
  expect(JSON.parse(encodeAttrs({ s: "a\"b", i: 3, d: 1.5, b: true }))).toEqual([
    { key: "s", value: { stringValue: "a\"b" } }, { key: "i", value: { intValue: "3" } },
    { key: "d", value: { doubleValue: 1.5 } }, { key: "b", value: { boolValue: true } },
  ])
  expect(JSON.parse(encodeAttrs({ n: NaN }))).toEqual([{ key: "n", value: { stringValue: "NaN" } }])
})
test("a span and a log record decode to valid OTLP JSON in their envelopes", () => {
  const span = encodeSpan({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7", name: "HTTP GET",
    kind: 3, startMs: 1_700_000_000_000, endMs: 1_700_000_000_250.5, attrs: { "http.response.status_code": 500 }, error: true })
  const body = JSON.parse(envelope("traces", encodeAttrs({ "telemetry.sdk.name": "ezgh-rum" }), "0.1.0", [span]))
  expect(body.resourceSpans[0].scopeSpans[0].scope).toEqual({ name: "ezgh-rum", version: "0.1.0" })
  expect(body.resourceSpans[0].scopeSpans[0].spans[0]).toMatchObject({ kind: 3, startTimeUnixNano: "1700000000000000000",
    endTimeUnixNano: "1700000000250500000", status: { code: 2 } })
  expect(body.resourceSpans[0].scopeSpans[0].spans[0].parentSpanId).toBeUndefined()
  const log = JSON.parse(envelope("logs", "[]", "0.1.0", [encodeLog({ timeMs: 1_700_000_000_000, severity: 17, body: "TypeError: x", attrs: {} })]))
  expect(log.resourceLogs[0].scopeLogs[0].logRecords[0]).toMatchObject({ severityNumber: 17, severityText: "ERROR", body: { stringValue: "TypeError: x" } })
})

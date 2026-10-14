import { expect, test } from "bun:test"
import { epochMsToNanos } from "../src/time.ts"
import { formatTraceparent, parseTraceparent } from "../src/traceparent.ts"
import { matchesAny } from "../src/matchers.ts"
import { newSpanId, newTraceId } from "../src/ids.ts"

test("epochMsToNanos keeps sub-millisecond precision without float overflow", () => {
  expect(epochMsToNanos(1_700_000_000_000)).toBe("1700000000000000000")
  expect(epochMsToNanos(1_700_000_000_000.5)).toBe("1700000000000500000")
  expect(epochMsToNanos(1_700_000_000_000.25)).toBe("1700000000000250000")
  expect(epochMsToNanos(1_700_000_000_000 + 0.9999999)).toBe("1700000000001000000")
})
test("traceparent round-trips and refuses zero IDs and other versions", () => {
  const tp = formatTraceparent("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", true)
  expect(tp).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
  expect(parseTraceparent(tp)).toEqual({ traceId: "4bf92f3577b34da6a3ce929d0e0e4736", spanId: "00f067aa0ba902b7", sampled: true })
  expect(parseTraceparent("00-" + "0".repeat(32) + "-00f067aa0ba902b7-01")).toBeUndefined()
  expect(parseTraceparent("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeUndefined()
  expect(parseTraceparent(" 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00 ")?.sampled).toBe(false)
})
test("matchers: string prefix, RegExp (global-safe) and functions that may throw", () => {
  const g = /api\.example\.com/g
  expect(matchesAny("https://api.example.com/x", ["https://api.example.com"])).toBe(true)
  expect(matchesAny("https://api.example.com.evil.io/x", ["https://api.example.com/"])).toBe(false)
  expect(matchesAny("https://api.example.com/x", [g]) && matchesAny("https://api.example.com/y", [g])).toBe(true)
  const bad = (): boolean => {
    throw new Error("bad")
  }
  expect(matchesAny("https://x", [bad])).toBe(false)
})
test("IDs are lowercase hex of the right length", () => {
  expect(newTraceId()).toMatch(/^[0-9a-f]{32}$/)
  expect(newSpanId()).toMatch(/^[0-9a-f]{16}$/)
})

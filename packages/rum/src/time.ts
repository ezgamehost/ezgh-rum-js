// Wall-clock milliseconds with sub-millisecond precision, and OTLP's fixed64 nanoseconds.
export function nowMs(): number {
  return performance.timeOrigin + performance.now()
}

// ms × 1e6 overflows 2^53, so whole milliseconds and the nanosecond fraction are joined as strings.
export function epochMsToNanos(ms: number): string {
  let whole = Math.floor(ms)
  let frac = Math.round((ms - whole) * 1e6)
  if (frac >= 1e6) {
    whole += 1
    frac -= 1e6
  }
  return `${whole}${String(frac).padStart(6, "0")}`
}

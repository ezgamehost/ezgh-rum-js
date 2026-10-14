// Random IDs from crypto.getRandomValues, as lowercase hex.
export function randomHex(bytes: number): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  let s = ""
  for (const x of b) s += (x < 16 ? "0" : "") + x.toString(16)
  return s
}
function nonZero(bytes: number): string {
  for (;;) {
    const h = randomHex(bytes)
    if (/[^0]/.test(h)) return h
  }
}
export const newTraceId = (): string => nonZero(16)
export const newSpanId = (): string => nonZero(8)
export const newSessionId = (): string => randomHex(16)
export const newViewId = (): string => randomHex(16)

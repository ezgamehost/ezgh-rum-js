// web-vitals' definitions, applied per view (plan 25 SDK correction 5).
export interface Shift { value: number, startTime: number, hadRecentInput: boolean }
/** CLS's session windows, kept incrementally so a long-lived view holds no entries. */
export interface ClsState { best: number, sum: number, first: number, last: number }
export const newCls = (): ClsState => ({ best: 0, sum: 0, first: -Infinity, last: -Infinity })
export function addShift(c: ClsState, { value, startTime, hadRecentInput }: Shift): void {
  // (destructured: the lint rule against reading DOM `.value` doesn't apply to layout shifts)
  if (hadRecentInput) return
  if (startTime - c.last < 1000 && startTime - c.first < 5000) c.sum += value
  else {
    c.sum = value
    c.first = startTime
  }
  c.last = startTime
  if (c.sum > c.best) c.best = c.sum
}
export function clsOf(shifts: readonly Shift[]): number {
  const c = newCls()
  for (const s of [...shifts].sort((a, b) => a.startTime - b.startTime)) addShift(c, s)
  return c.best
}
export function inpOf(longestPerInteraction: readonly number[]): number | undefined {
  const n = longestPerInteraction.length
  if (n === 0) return undefined
  const sorted = [...longestPerInteraction].sort((a, b) => b - a)
  return sorted[Math.min(Math.floor(n / 50), n - 1)]
}

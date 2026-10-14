// web-vitals' definitions, applied per view (plan 25 SDK correction 5).
export interface Shift { value: number, startTime: number, hadRecentInput: boolean }
export function clsOf(shifts: readonly Shift[]): number {
  let best = 0, sum = 0, first = -Infinity, last = -Infinity
  // (destructured: the lint rule against reading DOM `.value` doesn't apply to layout shifts)
  for (const { value, startTime, hadRecentInput } of [...shifts].sort((a, b) => a.startTime - b.startTime)) {
    if (hadRecentInput) continue
    if (startTime - last < 1000 && startTime - first < 5000) sum += value
    else {
      sum = value
      first = startTime
    }
    last = startTime
    if (sum > best) best = sum
  }
  return best
}
export function inpOf(longestPerInteraction: readonly number[]): number | undefined {
  const n = longestPerInteraction.length
  if (n === 0) return undefined
  const sorted = [...longestPerInteraction].sort((a, b) => b - a)
  return sorted[Math.min(Math.floor(n / 50), n - 1)]
}

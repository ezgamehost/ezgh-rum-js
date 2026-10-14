// "Done" for routeChange and interaction spans: no pending tracked request for 100 ms, then the
// next paint, capped at 30 s from the span's start.
import { nowMs } from "./time.ts"

const QUIET_MS = 100
const MAX_MS = 30_000

/**
 * Runs `fn` once at the next paint, or after 100 ms if no frame comes first (a page hidden now or
 * later gets no frames until it's visible again).
 */
export function afterPaint(wrap: <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => void, fn: () => void): void {
  let done = false
  const once = wrap(() => {
    if (done) return
    done = true
    fn()
  })
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return once()
  requestAnimationFrame(once)
  setTimeout(once, 100)
}

export class Quiescence {
  private pending = 0
  private lastDone = 0

  constructor(private readonly wrap: <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => void) {}

  begin(): void { this.pending++ }
  done(): void {
    this.pending = Math.max(0, this.pending - 1)
    this.lastDone = nowMs()
  }

  whenIdle(startMs: number, cb: (endMs: number) => void): void {
    const tick = this.wrap(() => {
      const now = nowMs()
      if (now - startMs >= MAX_MS) {
        cb(startMs + MAX_MS)
        return
      }
      if (this.pending === 0 && now - Math.max(this.lastDone, startMs) >= QUIET_MS) {
        afterPaint(this.wrap, () => cb(nowMs()))
        return
      }
      setTimeout(tick, 50)
    })
    setTimeout(tick, 50)
  }
}

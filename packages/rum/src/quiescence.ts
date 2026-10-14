// "Done" for routeChange and interaction spans: no pending tracked request for 100 ms, then the
// next paint, capped at 30 s from the span's start.
import { nowMs } from "./time.ts"

const QUIET_MS = 100
const MAX_MS = 30_000

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
        if (typeof document !== "undefined" && document.visibilityState === "hidden") cb(nowMs()) // no paint while hidden
        else requestAnimationFrame(this.wrap(() => cb(nowMs())))
        return
      }
      setTimeout(tick, 50)
    })
    setTimeout(tick, 50)
  }
}

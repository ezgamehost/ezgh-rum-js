// Identical exceptions (same type, message and top frame) are sent at most 10 times a minute per
// page; the rest are counted onto the next one sent (ezgh.rum.error.suppressed).
const PER_WINDOW = 10
const WINDOW_MS = 60_000
const MAX_KEYS = 100

export class ErrorThrottle {
  private keys = new Map<string, { start: number, sent: number, suppressed: number }>()

  admit(key: string, now: number): { send: boolean, suppressed: number } {
    let k = this.keys.get(key)
    if (!k) {
      if (this.keys.size >= MAX_KEYS) {
        for (const oldest of this.keys.keys()) {
          this.keys.delete(oldest)
          break
        }
      }
      k = { start: now, sent: 0, suppressed: 0 }
      this.keys.set(key, k)
    }
    else if (now - k.start >= WINDOW_MS) {
      k.start = now
      k.sent = 0
    }
    if (k.sent >= PER_WINDOW) {
      k.suppressed++
      return { send: false, suppressed: 0 }
    }
    k.sent++
    const suppressed = k.suppressed
    k.suppressed = 0
    return { send: true, suppressed }
  }
}

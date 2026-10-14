// Every hook, observer and patched API runs through a Guard: an internal error is swallowed and
// counted, and the 10th in a page turns the SDK off (spec "Safety").
export const MAX_INTERNAL_ERRORS = 10
export class Guard {
  private errors = 0
  private off = false
  constructor(private readonly onDisable: () => void) {}
  get disabled(): boolean { return this.off }
  run<T>(fn: () => T): T | undefined {
    if (this.off) return undefined
    try {
      return fn()
    }
    catch {
      this.fail()
      return undefined
    }
  }

  wrap<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
    return (...a: A) => {
      this.run(() => fn(...a))
    }
  }

  fail(): void {
    if (this.off || ++this.errors < MAX_INTERNAL_ERRORS) return
    this.off = true
    try {
      this.onDisable()
    }
    catch { /* nothing more to do */ }
  }
}

// One visit, shared by the origin's tabs through localStorage; no cookies.
import { newSessionId } from "./ids.ts"

export const SESSION_KEY = "ezgh_rum_s"
export const INACTIVITY_MS = 30 * 60_000
export const MAX_SESSION_MS = 4 * 60 * 60_000
const WRITE_EVERY_MS = 1_000

export interface SessionState { id: string, start: number, last: number, sampled: boolean, stoppedUntil?: number }
export interface KV { getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void }

function valid(v: unknown): v is SessionState {
  const s = v as SessionState
  return typeof s === "object" && s !== null && typeof s.id === "string" && /^[0-9a-f]{32}$/.test(s.id)
    && Number.isFinite(s.start) && Number.isFinite(s.last) && typeof s.sampled === "boolean"
}

export class Sessions {
  private mem: SessionState | undefined // used only when storage is unavailable
  private storageOk = true
  constructor(
    private readonly store: KV | undefined,
    private readonly sampleRate: number,
    private readonly random: () => number = Math.random,
  ) {}

  /** The live session at `now`, renewed if expired. Re-reads storage every time, so tabs agree. */
  current(now: number): SessionState {
    const s = this.read()
    if (s && now - s.last <= INACTIVITY_MS && now - s.start <= MAX_SESSION_MS) return s
    const rate = Math.min(100, Math.max(0, this.sampleRate))
    const fresh: SessionState = { id: newSessionId(), start: now, last: now, sampled: rate >= 100 || this.random() * 100 < rate }
    if (s?.stoppedUntil && s.stoppedUntil > now) fresh.stoppedUntil = s.stoppedUntil // the daily budget outlives a session
    this.write(fresh)
    return fresh
  }

  /** current() plus activity: `last` moves to `now` (written at most once a second). */
  touch(now: number): SessionState {
    const s = this.current(now)
    if (now - s.last >= WRITE_EVERY_MS || s.last === now) {
      s.last = now
      this.write(s)
    }
    return s
  }

  stopUntil(now: number, until: number): void {
    const s = this.current(now)
    s.stoppedUntil = until
    this.write(s)
  }

  clear(): void {
    this.mem = undefined
    try {
      this.store?.removeItem(SESSION_KEY)
    }
    catch { /* unavailable */ }
  }

  // Storage is the truth while it works, so a session cleared in another tab (consent revoked) is
  // gone here too. Memory is used only when storage can't be read or the last write failed.
  private read(): SessionState | undefined {
    if (this.store && this.storageOk) {
      let raw: string | null
      try {
        raw = this.store.getItem(SESSION_KEY)
      }
      catch {
        return this.mem
      }
      try {
        const v: unknown = raw ? JSON.parse(raw) : undefined
        return valid(v) ? v : undefined
      }
      catch {
        return undefined // corrupt: a new session
      }
    }
    return this.mem
  }

  private write(s: SessionState): void {
    this.mem = s
    if (!this.store) return
    try {
      this.store.setItem(SESSION_KEY, JSON.stringify(s))
      this.storageOk = true
    }
    catch {
      this.storageOk = false
    }
  }
}

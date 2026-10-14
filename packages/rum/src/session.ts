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

  private read(): SessionState | undefined {
    if (this.store) {
      try {
        const raw = this.store.getItem(SESSION_KEY)
        const v: unknown = raw ? JSON.parse(raw) : undefined
        if (valid(v)) return v
      }
      catch { /* storage denied or corrupt: fall through to memory */ }
    }
    return this.mem
  }

  private write(s: SessionState): void {
    this.mem = s
    try {
      this.store?.setItem(SESSION_KEY, JSON.stringify(s))
    }
    catch { /* memory only */ }
  }
}

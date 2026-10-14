import { describe, expect, test } from "bun:test"
import { SESSION_KEY, Sessions, type KV } from "../src/session.ts"

function memKV(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>()
  return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k) }
}
const MIN = 60_000

describe("Sessions", () => {
  test("creates, persists and reuses a session across instances (tabs)", () => {
    const kv = memKV()
    const a = new Sessions(kv, 100, () => 0.5).touch(1_000)
    const b = new Sessions(kv, 100, () => 0.5).current(2_000)
    expect(a.id).toMatch(/^[0-9a-f]{32}$/)
    expect(b.id).toBe(a.id)
    expect(JSON.parse(kv.m.get(SESSION_KEY)!)).toMatchObject({ id: a.id, start: 1_000, sampled: true })
  })
  test("renews after 30 minutes of inactivity", () => {
    const kv = memKV(), s = new Sessions(kv, 100)
    const first = s.touch(0)
    expect(s.touch(29 * MIN).id).toBe(first.id)
    expect(s.current(29 * MIN + 30 * MIN + 1).id).not.toBe(first.id)
  })
  test("renews after 4 hours even when active", () => {
    const kv = memKV(), s = new Sessions(kv, 100)
    const first = s.touch(0)
    for (let t = 10 * MIN; t < 240 * MIN; t += 10 * MIN) s.touch(t)
    expect(s.current(240 * MIN + 1).id).not.toBe(first.id)
  })
  test("decides sampling once per session and remembers an unsampled one", () => {
    const kv = memKV()
    expect(new Sessions(kv, 25, () => 0.30).touch(0).sampled).toBe(false)
    expect(new Sessions(kv, 25, () => 0.01).current(1).sampled).toBe(false) // stored decision wins
    expect(new Sessions(memKV(), 25, () => 0.249).touch(0).sampled).toBe(true)
    expect(new Sessions(memKV(), 0, () => 0).touch(0).sampled).toBe(false)
  })
  test("survives corrupt storage and storage that throws", () => {
    const kv = memKV()
    kv.m.set(SESSION_KEY, "{nope")
    expect(new Sessions(kv, 100).touch(5).start).toBe(5)
    const deny = (): never => {
      throw new Error("denied")
    }
    const throwing: KV = { getItem: deny, setItem: deny, removeItem: () => undefined }
    const s = new Sessions(throwing, 100)
    expect(s.touch(1).id).toBe(s.current(2).id) // falls back to memory for the page
  })
  test("stopUntil holds across tabs; clear removes the key", () => {
    const kv = memKV(), s = new Sessions(kv, 100)
    s.touch(0)
    s.stopUntil(0, 5_000)
    expect(new Sessions(kv, 100).current(1_000).stoppedUntil).toBe(5_000)
    s.clear()
    expect(kv.m.has(SESSION_KEY)).toBe(false)
  })
})

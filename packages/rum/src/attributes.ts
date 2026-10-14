// Customer record attributes (setAttributes, captureException's attrs): at most 32 keys, values
// strings (≤ 1,024 characters), finite numbers or booleans; keys the SDK or ingest own are refused.
import type { AttrValue, Attrs } from "./otlp.ts"

const OWNED = ["session.", "ezgh.", "url.", "user.", "exception.", "geo.", "event.", "service.", "telemetry.", "http.",
  "server.", "browser.", "os.", "device."]
const MAX_KEYS = 32

export const isOwnedKey = (k: string): boolean => OWNED.some(p => k === p.slice(0, -1) || k.startsWith(p))

function clean(v: unknown): AttrValue | undefined {
  if (typeof v === "string") return v.length > 1024 ? v.slice(0, 1024) : v
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined
  if (typeof v === "boolean") return v
  return undefined
}

export function filterAttrs(a: Readonly<Record<string, unknown>>, max = MAX_KEYS): { kept: Attrs, refused: string[] } {
  const kept: Attrs = {}
  const refused: string[] = []
  let n = 0
  for (const k of Object.keys(a)) {
    if (!k) continue
    if (isOwnedKey(k)) {
      refused.push(k)
      continue
    }
    const v = clean(a[k])
    if (v === undefined || n >= max) continue
    kept[k] = v
    n++
  }
  return { kept, refused }
}

export class AttributeStore {
  private attrs: Attrs = {}

  set(a: Readonly<Record<string, unknown>>): string[] {
    const { kept, refused } = filterAttrs(a, Infinity)
    for (const [k, v] of Object.entries(kept)) {
      if (k in this.attrs || Object.keys(this.attrs).length < MAX_KEYS) this.attrs[k] = v
    }
    return refused
  }

  get(): Attrs { return this.attrs }
}

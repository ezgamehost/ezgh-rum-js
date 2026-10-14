// Records grouped into per-signal requests that fit a byte limit (envelope and commas included).
import type { Signal } from "./otlp.ts"

export interface Item { signal: Signal, json: string, bytes: number }
export interface Chunk { signal: Signal, items: Item[] }

export function utf8Length(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4
      i++
    }
    else n += 3 // BMP, or a lone surrogate (encoded as U+FFFD)
  }
  return n
}

export function item(signal: Signal, json: string): Item {
  return { signal, json, bytes: utf8Length(json) }
}

export function chunkItems(items: readonly Item[], maxBytes: number, overhead: (s: Signal) => number): { chunks: Chunk[], oversized: Item[] } {
  const chunks: Chunk[] = []
  const oversized: Item[] = []
  const open = new Map<Signal, { chunk: Chunk, size: number }>()
  for (const it of items) {
    const base = overhead(it.signal)
    if (base + it.bytes + 1 > maxBytes) {
      oversized.push(it)
      continue
    }
    let o = open.get(it.signal)
    if (!o || o.size + it.bytes + 1 > maxBytes) {
      o = { chunk: { signal: it.signal, items: [] }, size: base }
      chunks.push(o.chunk)
      open.set(it.signal, o)
    }
    o.chunk.items.push(it)
    o.size += it.bytes + 1
  }
  return { chunks, oversized }
}

// The offline queue: in memory, at most 1 MB, oldest records dropped first (spec "Offline").
import type { Item } from "./chunk.ts"

export const QUEUE_MAX_BYTES = 1_000_000

export class RecordQueue {
  private items: Item[] = []
  private total = 0

  get count(): number { return this.items.length }
  get bytes(): number { return this.total }

  /** Adds a record; answers how many old records were dropped to fit. */
  push(i: Item): number {
    this.items.push(i)
    this.total += i.bytes
    return this.trim()
  }

  /** Puts records back in front (they're older than what's queued). */
  unshift(items: readonly Item[]): void {
    if (items.length === 0) return
    this.items = [...items, ...this.items]
    for (const i of items) this.total += i.bytes
    this.trim()
  }

  takeAll(): Item[] {
    const out = this.items
    this.items = []
    this.total = 0
    return out
  }

  private trim(): number {
    let dropped = 0
    while (this.total > QUEUE_MAX_BYTES && this.items.length > 0) {
      this.total -= this.items.shift()!.bytes
      dropped++
    }
    return dropped
  }
}

// The last 50 breadcrumbs, sent with each exception as ezgh.rum.breadcrumbs (Console correction 8:
// a JSON array, oldest first, `t` in unix milliseconds), at most 16 KB by dropping the oldest.
import { utf8Length } from "./chunk.ts"

export type Breadcrumb = { type: "view" | "action", t: number, name: string }
  | { type: "request", t: number, method: string, url: string, status: number | null, durationMs: number }
  | { type: "console", t: number, level: string, message: string }

const MAX = 50
const MAX_MESSAGE = 256

export class Breadcrumbs {
  private ring: Breadcrumb[] = []

  add(b: Breadcrumb): void {
    if (b.type === "console" && b.message.length > MAX_MESSAGE) b = { ...b, message: b.message.slice(0, MAX_MESSAGE) }
    this.ring.push(b)
    if (this.ring.length > MAX) this.ring.shift()
  }

  toJSON(maxBytes = 16_384): string {
    let items = this.ring
    let s = JSON.stringify(items)
    while (items.length > 0 && utf8Length(s) > maxBytes) {
      items = items.slice(1)
      s = JSON.stringify(items)
    }
    return s
  }
}

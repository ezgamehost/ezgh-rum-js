// Console levels from captureConsole become breadcrumbs on later errors, never log records.
import type { Rum } from "../rum.ts"

function describe(v: unknown): string {
  if (typeof v === "string") return v
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (v !== null && (typeof v === "object" || typeof v === "function")) return Object.prototype.toString.call(v)
  return String(v)
}

export function installConsole(r: Rum): void {
  for (const level of r.opts.captureConsole) {
    const original = console[level] as ((...a: unknown[]) => void) | undefined
    if (typeof original !== "function") continue
    console[level] = function (this: Console, ...args: unknown[]) {
      if (r.active) r.guard.run(() => r.crumb({ type: "console", t: Date.now(), level, message: args.map(describe).join(" ").slice(0, 256) }))
      original.apply(this, args)
    }
  }
}

// routeChange: History API navigations that change the pathname start a new view (named by the
// path template until a framework package renames it) and a span that ends at quiescence.
// bfcache restores start a new view of the same path, with no span.
import type { Rum } from "../rum.ts"
import { SPAN_KIND_INTERNAL } from "../otlp.ts"
import { nowMs } from "../time.ts"

export function installHistory(r: Rum): void {
  let path = location.pathname
  const changed = r.guard.wrap(() => {
    if (!r.active || location.pathname === path) return
    path = location.pathname
    const from = r.views.current?.name ?? ""
    const start = nowMs()
    const view = r.views.start(r.templateOf(path), start, start)
    const span = r.tracer.start("routeChange", SPAN_KIND_INTERNAL, start, undefined, { "ezgh.rum.route.from": from, "ezgh.rum.route.to": view.name })
    r.crumb({ type: "view", t: Date.now(), name: view.name })
    r.quiescence.whenIdle(start, (endMs) => {
      view.loadingEnd = endMs
      r.tracer.end(span, endMs)
    })
  })
  for (const m of ["pushState", "replaceState"] as const) {
    const original = history[m]
    history[m] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const out = original.apply(this, args)
      changed()
      return out
    }
  }
  addEventListener("popstate", changed, true)
  addEventListener("pageshow", r.guard.wrap((e: PageTransitionEvent) => {
    if (!e.persisted || !r.active) return
    const now = nowMs()
    r.views.start(r.views.current?.name ?? r.templateOf(location.pathname), now, now)
  }), true)
}

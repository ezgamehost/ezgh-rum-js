// Long tasks count toward the view's long_tasks increments (obs derives ezgh_rum_long_tasks_total).
import type { Rum } from "../rum.ts"

export function installLongTasks(r: Rum): void {
  if (typeof PerformanceObserver === "undefined" || !(PerformanceObserver.supportedEntryTypes ?? []).includes("longtask")) return
  new PerformanceObserver(r.guard.wrap((list: PerformanceObserverEntryList) => {
    const v = r.views.current
    if (r.active && v) v.counts.long_tasks += list.getEntries().length
  })).observe({ type: "longtask" })
}

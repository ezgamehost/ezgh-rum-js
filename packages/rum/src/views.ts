// Views: one per page load or route, ended by the next view or (repeatedly) by the page being
// hidden. Each end emits an ezgh.rum.view event (spec "Events"; plan 25 SDK correction 5).
import type { Attrs } from "./otlp.ts"
import { newViewId } from "./ids.ts"
import { capViewName } from "./route.ts"
import type { Shift } from "./vitals.ts"

export interface ViewCounts { errors: number, requests: number, long_tasks: number, actions: number }
export type VitalName = "lcp" | "inp" | "cls" | "fcp" | "ttfb"
export interface ViewState { id: string, name: string, start: number, loadingEnd?: number, update: number, counts: ViewCounts, vitals: Partial<Record<VitalName, number>> }
export interface View extends ViewState { shifts: Shift[], interactions: Map<number, number> }

const zero = (): ViewCounts => ({ errors: 0, requests: 0, long_tasks: 0, actions: 0 })

/** The attributes of the view's next event. It advances `update` and resets `counts` (increments). */
export function takeViewEvent(v: ViewState, now: number, final: boolean): Attrs {
  const a: Attrs = { "event.name": "ezgh.rum.view", "ezgh.rum.view.update": v.update, "ezgh.rum.view.final": final,
    "ezgh.rum.view.duration_ms": Math.max(0, Math.round(now - v.start)) }
  if (v.loadingEnd !== undefined) a["ezgh.rum.view.loading_ms"] = Math.max(0, Math.round(v.loadingEnd - v.start))
  for (const [k, n] of Object.entries(v.vitals) as Array<[string, number | undefined]>) if (n !== undefined) a[`ezgh.rum.vitals.${k}`] = n
  for (const [k, n] of Object.entries(v.counts) as Array<[string, number]>) a[`ezgh.rum.view.${k}`] = n
  v.update += 1
  v.counts = zero()
  return a
}

export interface ViewHooks {
  /** Refreshes the view's CLS/INP from the observers (takeRecords) just before an event. */
  refresh(v: View): void
  emit(v: View, attrs: Attrs): void
  /** The view's name changed (framework template): open spans of the view follow it. */
  renamed(v: View): void
}

export class Views {
  current: View | undefined

  constructor(private readonly hooks: ViewHooks) {}

  /** Ends the current view (final event), then starts a new one. */
  start(name: string, startMs: number, now: number): View {
    if (this.current) this.end(now, true)
    this.current = { id: newViewId(), name: capViewName(name), start: startMs, update: 0, counts: zero(), vitals: {}, shifts: [], interactions: new Map() }
    return this.current
  }

  /** Emits the current view's event (final when it ends; not final on page hide). */
  end(now: number, final: boolean): void {
    const v = this.current
    if (!v) return
    this.hooks.refresh(v)
    this.hooks.emit(v, takeViewEvent(v, now, final))
  }

  rename(template: string): void {
    const v = this.current
    if (!v) return
    const name = capViewName(template)
    if (name === v.name) return
    v.name = name
    this.hooks.renamed(v)
  }
}

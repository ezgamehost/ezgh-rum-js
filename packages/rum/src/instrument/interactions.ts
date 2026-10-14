// Clicks, Enter/Space and submits record a candidate action (and an `action` breadcrumb). A tracked
// request starting within 100 ms materializes it into an `interaction` span that becomes the active
// parent and ends at quiescence. Names come only from data-ezgh-action, aria-label, or the tag and
// id: never element text or values (spec "Privacy").
import type { Rum } from "../rum.ts"
import { SPAN_KIND_INTERNAL, type Attrs } from "../otlp.ts"
import { nowMs } from "../time.ts"
import type { Span } from "../tracer.ts"

const WINDOW_MS = 100
const INTERACTIVE = "button, a, input, select, textarea, [role]"

export function actionName(target: EventTarget | null): string | undefined {
  let el = target instanceof Element ? target : null
  if (!el) return undefined
  for (let e: Element | null = el, i = 0; e && i <= 10; e = e.parentElement, i++) {
    const a = e.getAttribute("data-ezgh-action")
    if (a) return a.slice(0, 128)
  }
  el = el.closest(INTERACTIVE) ?? el
  const label = el.getAttribute("aria-label")
  if (label) return label.slice(0, 128)
  return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "")
}

export class Interactions {
  private candidate: { t: number, name: string } | undefined

  constructor(private readonly r: Rum) {}

  install(): void {
    const on = (type: string, filter?: (e: Event) => boolean) => document.addEventListener(type, this.r.guard.wrap((e: Event) => {
      if (!this.r.active || (filter && !filter(e))) return
      const name = actionName(e.target)
      if (!name) return
      this.candidate = { t: nowMs(), name }
      this.r.crumb({ type: "action", t: Date.now(), name })
    }), true)
    on("click")
    on("keydown", e => (e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ")
    on("submit")
  }

  /** Called by the HTTP instrumentation when a tracked request starts. */
  materializeRecent(): Span | undefined {
    const c = this.candidate
    if (!c) return undefined
    this.candidate = undefined
    if (nowMs() - c.t > WINDOW_MS) return undefined
    return this.begin(c.name, c.t, {})
  }

  /** addAction: always materializes, with a breadcrumb. */
  add(name: string, attrs: Attrs): void {
    const t = nowMs()
    this.r.crumb({ type: "action", t: Date.now(), name })
    this.begin(name, t, attrs)
  }

  private begin(name: string, t: number, attrs: Attrs): Span {
    const span = this.r.tracer.start("interaction", SPAN_KIND_INTERNAL, t, undefined, { ...attrs, "ezgh.rum.action.name": name })
    const v = this.r.views.current
    if (v) v.counts.actions += 1
    this.r.quiescence.whenIdle(t, end => this.r.tracer.end(span, end))
    return span
  }
}

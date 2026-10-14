// Spans in the page. A span snapshots its view at start, so a routeChange (started after its view)
// belongs to the new view. The active span is the innermost open interaction, then routeChange,
// then documentLoad.
import { newSpanId, newTraceId } from "./ids.ts"
import type { Attrs } from "./otlp.ts"
import type { ParentContext } from "./traceparent.ts"

export interface Span {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: 1 | 3
  startMs: number
  attrs: Attrs
  error?: boolean
  viewId: string
  viewName: string
  open: boolean
}

const ACTIVE = ["interaction", "routeChange", "documentLoad"]

export class Tracer {
  private openSpans: Span[] = []

  constructor(private readonly view: () => { id: string, name: string }, private readonly onEnd: (s: Span, endMs: number) => void) {}

  start(name: string, kind: 1 | 3, startMs: number, parent?: Span | ParentContext, attrs: Attrs = {}): Span {
    const v = this.view()
    const s: Span = { traceId: parent?.traceId ?? newTraceId(), spanId: newSpanId(), name, kind, startMs, attrs, viewId: v.id, viewName: v.name, open: true }
    if (parent) s.parentSpanId = parent.spanId
    if (ACTIVE.includes(name)) this.openSpans.push(s)
    return s
  }

  end(s: Span, endMs: number): void {
    if (!s.open) return
    s.open = false
    this.openSpans = this.openSpans.filter(o => o !== s)
    this.onEnd(s, endMs)
  }

  active(): Span | undefined {
    for (const name of ACTIVE) {
      for (let i = this.openSpans.length - 1; i >= 0; i--) if (this.openSpans[i]!.name === name) return this.openSpans[i]
    }
    return undefined
  }

  /** Open spans of a view, for renames. */
  openOf(viewId: string): Span[] {
    return this.openSpans.filter(s => s.viewId === viewId)
  }
}

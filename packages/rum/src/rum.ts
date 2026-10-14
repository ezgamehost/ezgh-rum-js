// The SDK instance: sessions, views, spans, errors and the exporter. `emit` is the only path to the
// queue. Every listener, observer and patch runs inside the Guard; patches stay installed after a
// stop but pass straight through (`active` is false).
import { onFCP, onLCP, onTTFB } from "web-vitals"
import { AttributeStore, filterAttrs } from "./attributes.ts"
import { Breadcrumbs, type Breadcrumb } from "./breadcrumbs.ts"
import { item } from "./chunk.ts"
import { exceptionAttrs, type ErrorSource } from "./errors.ts"
import { Guard } from "./guard.ts"
import { installConsole } from "./instrument/console.ts"
import { installGlobalErrors } from "./instrument/globalerrors.ts"
import { installHistory } from "./instrument/history.ts"
import { installHttp } from "./instrument/http.ts"
import { Interactions } from "./instrument/interactions.ts"
import { installLongTasks } from "./instrument/longtasks.ts"
import { installNavigation } from "./instrument/navigation.ts"
import type { ResolvedOptions, RumEvent } from "./options.ts"
import { encodeAttrs, encodeLog, encodeSpan, SEVERITY_ERROR, SEVERITY_INFO, type Attrs } from "./otlp.ts"
import { Quiescence } from "./quiescence.ts"
import { makeRedactor, type RedactedUrl } from "./redact.ts"
import { resourceAttrs } from "./resource.ts"
import { templatePath } from "./route.ts"
import { Sessions, type KV } from "./session.ts"
import { debugIdsFor, topFrame } from "./stack.ts"
import { ErrorThrottle } from "./throttle.ts"
import { nowMs } from "./time.ts"
import { Tracer, type Span } from "./tracer.ts"
import { Exporter, gzipCompressor, type StopReason } from "./transport.ts"
import { parseUserAgent, type UAHints } from "./useragent.ts"
import { SDK_VERSION } from "./version.ts"
import { Views, type View, type VitalName } from "./views.ts"
import { clsOf, inpOf, type Shift } from "./vitals.ts"

const FLUSH_EVERY_MS = 10_000
const FLUSH_AT_RECORDS = 50
const HIDE_DEBOUNCE_MS = 100

function localStorageKV(): KV | undefined {
  try {
    const s = window.localStorage
    s.getItem("ezgh_rum_s")
    return s
  }
  catch {
    return undefined
  }
}

export class Rum {
  readonly guard: Guard
  readonly sessions: Sessions
  readonly exporter: Exporter
  readonly tracer: Tracer
  readonly views: Views
  readonly breadcrumbs = new Breadcrumbs()
  readonly attributes = new AttributeStore()
  readonly quiescence: Quiescence
  readonly interactions: Interactions
  readonly throttle = new ErrorThrottle()
  readonly redact: (raw: string, base?: string) => RedactedUrl
  /** The page's <meta name="tracestate">, forwarded with traceparent on allowed URLs. */
  tracestate: string | undefined
  userId: string | undefined
  active = false
  started = false
  revoked = false
  private loadViewId: string | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private lastHide = -Infinity
  private hiddenEmitted = false
  private shiftObserver: PerformanceObserver | undefined
  private eventObserver: PerformanceObserver | undefined

  constructor(readonly opts: ResolvedOptions) {
    this.guard = new Guard(() => this.stop(false))
    this.sessions = new Sessions(localStorageKV(), opts.sessionSampleRate)
    this.redact = makeRedactor(opts.redactQueryParams)
    const tunnel = opts.tunnel ? new URL(opts.tunnel, location.href).href : undefined
    const nativeFetch = window.fetch.bind(window)
    const beacon = typeof navigator.sendBeacon === "function" ? navigator.sendBeacon.bind(navigator) : undefined
    const compress = gzipCompressor()
    this.exporter = new Exporter(
      { endpoint: opts.endpoint, ...(tunnel ? { tunnel } : {}), token: opts.token, sdkVersion: SDK_VERSION, resource: "[]" },
      { fetch: nativeFetch, ...(beacon ? { sendBeacon: beacon } : {}), ...(compress ? { compress } : {}), now: () => Date.now() },
      (r, until) => this.onStop(r, until),
    )
    this.views = new Views({
      refresh: v => this.refreshVitals(v),
      emit: (v, attrs) => this.emitLog({ severity: SEVERITY_INFO, attrs }, v),
      renamed: v => this.renamed(v),
    })
    this.tracer = new Tracer(() => this.views.current ?? { id: "", name: "/" }, (s, end) => this.emitSpan(s, end))
    this.quiescence = new Quiescence(fn => this.guard.wrap(fn))
    this.interactions = new Interactions(this)
  }

  /** On init with consent granted, or on consent.grant(). */
  start(): void {
    if (this.started || this.revoked) return
    this.started = true
    this.guard.run(() => {
      const now = Date.now()
      const s = this.sessions.touch(now)
      if (!s.sampled || (s.stoppedUntil ?? 0) > now) return
      this.exporter.setResource(encodeAttrs(this.resource()))
      this.active = true
      const v = this.views.start(this.initialViewName(), performance.timeOrigin, nowMs())
      this.loadViewId = v.id
      this.observeVitals()
      installNavigation(this)
      installHistory(this)
      this.interactions.install()
      installHttp(this)
      if (this.opts.trackLongTasks) installLongTasks(this)
      installGlobalErrors(this)
      installConsole(this)
      this.timer = setInterval(this.guard.wrap(() => void this.exporter.flush()), FLUSH_EVERY_MS)
      const onHide = this.guard.wrap(() => this.onHide())
      addEventListener("visibilitychange", this.guard.wrap(() => {
        if (document.visibilityState === "hidden") onHide()
        else this.hiddenEmitted = false
      }), true)
      addEventListener("pagehide", onHide, true)
    })
  }

  stop(clear: boolean): void {
    this.active = false
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    try {
      this.shiftObserver?.disconnect()
      this.eventObserver?.disconnect()
    }
    catch { /* gone */ }
    if (clear) {
      this.exporter.queue.takeAll()
      this.sessions.clear()
    }
  }

  revoke(): void {
    this.revoked = true
    this.stop(true)
  }

  private initialViewName(): string {
    return this.templateOf(location.pathname)
  }

  templateOf(path: string): string {
    return templatePath(path)
  }

  private resource(): Attrs {
    const ua = navigator.userAgent
    const uad = (navigator as Navigator & { userAgentData?: UAHints }).userAgentData
    const hints = uad && Array.isArray(uad.brands) ? { brands: uad.brands, mobile: Boolean(uad.mobile), platform: String(uad.platform ?? "") } : undefined
    return resourceAttrs(parseUserAgent(ua, navigator.maxTouchPoints || 0, hints), ua, this.opts.release)
  }

  private onStop(r: StopReason, until?: number): void {
    if (r === "budget" && until !== undefined) this.sessions.stopUntil(Date.now(), until)
    this.stop(false)
  }

  private onHide(): void {
    if (!this.active) return
    const now = nowMs()
    if (now - this.lastHide < HIDE_DEBOUNCE_MS) return
    this.lastHide = now
    if (!this.hiddenEmitted) {
      this.hiddenEmitted = true
      this.views.end(now, false)
    }
    this.exporter.flushHidden()
  }

  // Vitals: LCP, FCP and TTFB from web-vitals for the load view while it's current; CLS and INP per
  // view from the SDK's own observers (web-vitals reports per page load, not per SPA view).
  private observeVitals(): void {
    const setLoad = (k: VitalName) => this.guard.wrap(({ value }: { value: number }) => {
      const v = this.views.current
      if (this.active && v && v.id === this.loadViewId && Number.isFinite(value)) v.vitals[k] = k === "cls" ? value : Math.round(value)
    })
    onLCP(setLoad("lcp"), { reportAllChanges: true })
    onFCP(setLoad("fcp"))
    onTTFB(setLoad("ttfb"))
    const supported = typeof PerformanceObserver !== "undefined" ? PerformanceObserver.supportedEntryTypes ?? [] : []
    if (supported.includes("layout-shift")) {
      this.shiftObserver = new PerformanceObserver(this.guard.wrap((list: PerformanceObserverEntryList) => this.takeShifts(list.getEntries())))
      this.shiftObserver.observe({ type: "layout-shift", buffered: true })
    }
    if (supported.includes("event")) {
      this.eventObserver = new PerformanceObserver(this.guard.wrap((list: PerformanceObserverEntryList) => this.takeEvents(list.getEntries())))
      this.eventObserver.observe({ type: "event", buffered: true, durationThreshold: 40 })
    }
  }

  private takeShifts(entries: readonly PerformanceEntry[]): void {
    const v = this.views.current
    if (!v) return
    for (const e of entries) {
      const { value, startTime, hadRecentInput } = e as PerformanceEntry & Shift
      v.shifts.push({ value, startTime, hadRecentInput })
    }
  }

  private takeEvents(entries: readonly PerformanceEntry[]): void {
    const v = this.views.current
    if (!v) return
    for (const e of entries) {
      const { interactionId, duration } = e as PerformanceEntry & { interactionId?: number }
      if (!interactionId) continue
      v.interactions.set(interactionId, Math.max(v.interactions.get(interactionId) ?? 0, duration))
    }
  }

  private refreshVitals(v: View): void {
    if (v !== this.views.current) return
    if (this.shiftObserver) {
      this.takeShifts(this.shiftObserver.takeRecords())
      v.vitals.cls = clsOf(v.shifts)
    }
    if (this.eventObserver) this.takeEvents(this.eventObserver.takeRecords())
    const inp = inpOf([...v.interactions.values()])
    if (inp !== undefined) v.vitals.inp = Math.round(inp)
  }

  private renamed(v: View): void {
    for (const s of this.tracer.openOf(v.id)) {
      s.viewName = v.name
      if (s.name === "routeChange") s.attrs["ezgh.rum.route.to"] = v.name
    }
  }

  crumb(b: Breadcrumb): void {
    this.breadcrumbs.add(b)
  }

  // Record attributes in order: customer attributes, url.*, session.id, the view, user.id, then the
  // record's own. Later keys win, so customers can't overwrite the SDK's. Answers undefined when the
  // record must not be sent.
  private recordAttrs(own: Attrs, view: { id: string, name: string } | undefined): Attrs | undefined {
    const now = Date.now()
    const s = this.sessions.touch(now)
    if (!s.sampled) return undefined
    if ((s.stoppedUntil ?? 0) > now) { // another tab hit the daily budget
      this.stop(false)
      return undefined
    }
    const u = this.redact(location.href)
    const a: Attrs = { ...this.attributes.get(), "url.path": u.path || "/" }
    if (u.query) a["url.query"] = u.query
    a["session.id"] = s.id
    if (view) {
      a["ezgh.rum.view.id"] = view.id
      a["ezgh.rum.view.name"] = view.name
    }
    if (this.userId !== undefined) a["user.id"] = this.userId
    return Object.assign(a, own)
  }

  private beforeSend(kind: "span" | "log", name: string, attrs: Attrs): Attrs | undefined {
    const hook = this.opts.beforeSend
    if (!hook) return attrs
    try {
      const ev: RumEvent = { kind, name, attributes: attrs }
      const out = hook(ev)
      if (!out || typeof out !== "object" || typeof out.attributes !== "object" || out.attributes === null) return undefined
      return out.attributes
    }
    catch {
      return undefined // a broken redaction hook never leaks
    }
  }

  private enqueue(signal: "traces" | "logs", json: string): void {
    this.exporter.enqueue(item(signal, json))
    if (this.exporter.queue.count >= FLUSH_AT_RECORDS) void this.exporter.flush()
  }

  emitSpan(s: Span, endMs: number): void {
    if (!this.active) return
    const view = s.viewId ? { id: s.viewId, name: s.viewName } : this.views.current
    const base = this.recordAttrs(s.attrs, view)
    if (!base) return
    const attrs = this.beforeSend("span", s.name, base)
    if (!attrs) return
    this.enqueue("traces", encodeSpan({ traceId: s.traceId, spanId: s.spanId, ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
      name: s.name, kind: s.kind, startMs: s.startMs, endMs, attrs, ...(s.error ? { error: true } : {}) }))
  }

  emitLog(l: { severity: 9 | 17, body?: string, attrs: Attrs, traceId?: string, spanId?: string }, view?: { id: string, name: string }): void {
    if (!this.active) return
    const base = this.recordAttrs(l.attrs, view ?? this.views.current)
    if (!base) return
    const name = typeof base["event.name"] === "string" ? base["event.name"] : "log"
    const attrs = this.beforeSend("log", name, base)
    if (!attrs) return
    this.enqueue("logs", encodeLog({ timeMs: nowMs(), severity: l.severity, attrs,
      ...(l.body !== undefined ? { body: l.body } : {}), ...(l.traceId ? { traceId: l.traceId, spanId: l.spanId } : {}) }))
  }

  captureError(err: unknown, source: ErrorSource, o: { fingerprint?: string, attrs?: Record<string, unknown> } = {}): void {
    if (!this.active) return
    const { type, message, stack } = exceptionAttrs(err, source)
    const v = this.views.current
    if (v) v.counts.errors += 1
    const { send, suppressed } = this.throttle.admit(`${type}\0${message}\0${topFrame(stack)}`, Date.now())
    if (!send) return
    const attrs: Attrs = o.attrs ? filterAttrs(o.attrs).kept : {}
    Object.assign(attrs, { "event.name": "exception", "exception.type": type, "exception.message": message,
      "exception.stacktrace": stack, "ezgh.rum.error.source": source })
    const ids = debugIdsFor(stack, (globalThis as { _ezghDebugIds?: Record<string, string> })._ezghDebugIds)
    if (Object.keys(ids).length > 0) attrs["ezgh.rum.debug_ids"] = JSON.stringify(ids)
    attrs["ezgh.rum.breadcrumbs"] = this.breadcrumbs.toJSON()
    if (typeof o.fingerprint === "string" && o.fingerprint) attrs["ezgh.rum.fingerprint.override"] = o.fingerprint.slice(0, 256)
    if (suppressed > 0) attrs["ezgh.rum.error.suppressed"] = suppressed
    const span = this.tracer.active()
    this.emitLog({ severity: SEVERITY_ERROR, body: `${type}: ${message}`, attrs, ...(span ? { traceId: span.traceId, spanId: span.spanId } : {}) })
    void this.exporter.flush() // a crash about to navigate still reports
  }

  startView(name: string): void {
    if (!this.active) return
    const now = nowMs()
    this.views.start(name, now, now)
    this.crumb({ type: "view", t: Date.now(), name: this.views.current!.name })
  }

  sessionId(): string | undefined {
    if (!this.active) return undefined
    const s = this.sessions.current(Date.now())
    return s.sampled ? s.id : undefined
  }
}

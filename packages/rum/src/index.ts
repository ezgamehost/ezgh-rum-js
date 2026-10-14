// The public API (spec "SDK"). Every function is a no-op before init, after a stop and when the
// SDK has disabled itself, and none ever throws.
import { filterAttrs } from "./attributes.ts"
import { resolveOptions, TOKEN_RE, type InitOptions } from "./options.ts"
import type { AttrValue } from "./otlp.ts"
import { templateFromParams } from "./route.ts"
import { Rum } from "./rum.ts"

export type { InitOptions, RumEvent } from "./options.ts"
export type { AttrValue } from "./otlp.ts"
export type { UrlMatcher } from "./matchers.ts"

type Global = { __ezghRum?: Rum }
const g = globalThis as Global
let rum: Rum | undefined
const warned = new Set<string>()

function warn(msg: string): void {
  if (warned.has(msg)) return
  warned.add(msg)
  try {
    console.warn(`[ezgh-rum] ${msg}`)
  }
  catch { /* no console */ }
}

function safe(fn: (r: Rum) => void): void {
  const r = rum
  if (!r || !r.active || r.guard.disabled) return
  r.guard.run(() => fn(r))
}

export function init(options: InitOptions): void {
  try {
    if (rum || g.__ezghRum) {
      warn("already initialized")
      return
    }
    if (typeof window === "undefined" || typeof document === "undefined") return // server rendering
    if (!options || typeof options.token !== "string" || !TOKEN_RE.test(options.token)) {
      warn("init: token isn't a client token (ezgh_ct_…); RUM is off")
      return
    }
    const r = new Rum(resolveOptions(options))
    rum = r
    g.__ezghRum = r
    if (r.opts.trackingConsent === "granted") r.start()
  }
  catch { /* never break the page */ }
}

export function setUser(user: { id: string }): void {
  safe((r) => {
    const id = user && typeof user.id === "string" ? user.id.slice(0, 256) : undefined
    r.userId = id || undefined
  })
}

export function clearUser(): void {
  safe((r) => {
    r.userId = undefined
  })
}

export function setAttributes(attrs: Record<string, AttrValue>): void {
  safe((r) => {
    for (const k of r.attributes.set(attrs ?? {})) warn(`setAttributes: "${k}" is set by the SDK; ignored`)
  })
}

export function addAction(name: string, attrs?: Record<string, AttrValue>): void {
  safe((r) => {
    if (typeof name !== "string" || !name) return
    r.interactions.add(name.slice(0, 128), attrs ? filterAttrs(attrs).kept : {})
  })
}

export function captureException(err: unknown, options?: { fingerprint?: string, attrs?: Record<string, AttrValue> }): void {
  safe(r => r.captureError(err, "manual", options ?? {}))
}

export function startView(name: string): void {
  safe((r) => {
    if (typeof name === "string" && name) r.startView(name)
  })
}

export const consent = {
  grant: (): void => {
    try {
      const r = rum
      if (r && !r.started && !r.revoked) r.start()
    }
    catch { /* never throws */ }
  },
  revoke: (): void => {
    try {
      rum?.revoke()
    }
    catch { /* never throws */ }
  },
}

export function getSessionId(): string | undefined {
  const r = rum
  if (!r || !r.active) return undefined
  return r.guard.run(() => r.sessionId())
}

export function flush(): Promise<void> {
  const r = rum
  if (!r || !r.active) return Promise.resolve()
  return r.exporter.flush().catch(() => undefined)
}

/** Internal: used by @ezgh/rum-react, -nextjs, -vue and -angular. Not part of the public API. */
export const _integration = {
  setRouteTemplate(template: string): void {
    safe((r) => {
      if (typeof template === "string" && template) r.views.rename(template)
    })
  },
  captureBoundaryError(err: unknown, attrs?: Record<string, AttrValue>): void {
    safe(r => r.captureError(err, "boundary", attrs ? { attrs } : {}))
  },
  templateFromParams,
}

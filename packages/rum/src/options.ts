// init() options (spec "SDK") and their defaults.
import type { UrlMatcher } from "./matchers.ts"
import type { AttrValue } from "./otlp.ts"

export type ConsoleLevel = "error" | "warn" | "info" | "log" | "debug"
export interface InitOptions {
  token: string
  release?: string
  endpoint?: string // default "https://obs-browser.ezghcloud.com"
  tunnel?: string // e.g. "/_ezgh"; resolved against location.href
  sessionSampleRate?: number // 0–100, default 100
  allowedTracingUrls?: UrlMatcher[] // default []
  trackResources?: boolean // default false
  trackLongTasks?: boolean // default true
  captureConsole?: ConsoleLevel[] // default ["error", "warn"]
  trackingConsent?: "granted" | "pending" // default "granted"
  redactQueryParams?: string[] // added to DEFAULT_REDACTED_PARAMS
  beforeSend?: (event: RumEvent) => RumEvent | null
}
export interface RumEvent { readonly kind: "span" | "log", readonly name: string, attributes: Record<string, AttrValue> }
export const TOKEN_RE = /^ezgh_ct_[A-Za-z0-9]{43}$/
export const DEFAULT_ENDPOINT = "https://obs-browser.ezghcloud.com"

export type ResolvedOptions = Required<Omit<InitOptions, "release" | "tunnel" | "beforeSend">> & Pick<InitOptions, "release" | "tunnel" | "beforeSend">

export function resolveOptions(o: InitOptions): ResolvedOptions {
  const rate = Number(o.sessionSampleRate ?? 100)
  const r: ResolvedOptions = {
    token: o.token,
    endpoint: o.endpoint || DEFAULT_ENDPOINT,
    sessionSampleRate: Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 100,
    allowedTracingUrls: Array.isArray(o.allowedTracingUrls) ? o.allowedTracingUrls : [],
    trackResources: o.trackResources === true,
    trackLongTasks: o.trackLongTasks !== false,
    captureConsole: Array.isArray(o.captureConsole) ? o.captureConsole : ["error", "warn"],
    trackingConsent: o.trackingConsent === "pending" ? "pending" : "granted",
    redactQueryParams: Array.isArray(o.redactQueryParams) ? o.redactQueryParams.map(String) : [],
  }
  if (typeof o.release === "string" && o.release) r.release = o.release
  if (typeof o.tunnel === "string" && o.tunnel) r.tunnel = o.tunnel
  if (typeof o.beforeSend === "function") r.beforeSend = o.beforeSend
  return r
}

// Resource attributes, one resource per page lifetime (spec "Data model"). Ingest pins
// service.name and ezgh.metadata.* from the token.
import type { Agent } from "./useragent.ts"
import type { Attrs } from "./otlp.ts"
import { SDK_VERSION } from "./version.ts"

export function resourceAttrs(a: Agent, ua: string, release: string | undefined): Attrs {
  const r: Attrs = {}
  if (release) r["service.version"] = release
  r["telemetry.sdk.name"] = "ezgh-rum"
  r["telemetry.sdk.language"] = "webjs"
  r["telemetry.sdk.version"] = SDK_VERSION
  r["user_agent.original"] = ua
  r["browser.name"] = a.browserName
  if (a.browserVersion) r["browser.version"] = a.browserVersion
  r["os.name"] = a.osName
  r["device.type"] = a.deviceType
  return r
}

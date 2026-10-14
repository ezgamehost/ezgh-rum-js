// The client part: <EzghRum …/> in the root layout initializes the SDK once and names views by the
// App Router's route template (dynamic segments `:name`, catch-alls `:name*`).
import { useEffect } from "react"
import { useParams, usePathname } from "next/navigation"
import { _integration, init, type InitOptions } from "@ezgh/rum"

export type { InitOptions } from "@ezgh/rum"

let initialized = false

/** Render once in app/layout.tsx. A second init (e.g. from instrumentation-client.ts) is a no-op. */
export function EzghRum(props: InitOptions): null {
  const pathname = usePathname()
  const params = useParams()
  useEffect(() => {
    if (initialized) return
    initialized = true
    init(props)
  }, [])
  useEffect(() => {
    try {
      if (pathname) _integration.setRouteTemplate(_integration.templateFromParams(pathname, params ?? {}))
    }
    catch { /* never breaks the app */ }
    // keyed by pathname: params change with it
  }, [pathname])
  return null
}

/** In app/error.tsx and app/global-error.tsx: reports the error the boundary caught. */
export function useEzghErrorReport(error: unknown): void {
  useEffect(() => {
    _integration.captureBoundaryError(error)
  }, [error])
}

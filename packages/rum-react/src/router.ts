// React Router templates. Data routers (createBrowserRouter) expose the matched routes, whose
// `path` fields join into the exact template; framework mode exposes params (useEzghRouteTemplate).
import { useEffect } from "react"
import { useLocation, useParams } from "react-router"
import { _integration } from "@ezgh/rum"

export interface RouteMatchLike { route: { path?: string } }
export interface RouterStateLike { location: { pathname: string }, matches: readonly RouteMatchLike[] }
export interface RouterLike { state: RouterStateLike, subscribe(fn: (s: RouterStateLike) => void): () => void }

export function routeTemplate(matches: readonly RouteMatchLike[]): string {
  let t = ""
  for (const { route } of matches) {
    const p = route.path
    if (!p) continue
    if (p.startsWith("/")) t = p.replace(/\/+$/, "")
    else t = `${t}/${p}`
  }
  return t.replace(/\/{2,}/g, "/") || "/"
}

/** Data routers (createBrowserRouter): exact templates from the matched routes' `path`. */
export function instrumentReactRouter(router: RouterLike): () => void {
  try {
    let last: string | undefined
    const update = (s: RouterStateLike) => {
      try {
        if (s.location.pathname === last) return
        last = s.location.pathname
        _integration.setRouteTemplate(routeTemplate(s.matches))
      }
      catch { /* never breaks the app */ }
    }
    update(router.state)
    return router.subscribe(update)
  }
  catch {
    return () => undefined
  }
}

/** Framework mode, or any tree under a router: the template comes from params. */
export function useEzghRouteTemplate(): void {
  const { pathname } = useLocation()
  const params = useParams()
  useEffect(() => {
    try {
      _integration.setRouteTemplate(_integration.templateFromParams(pathname, params))
    }
    catch { /* never breaks the app */ }
  }, [pathname])
}

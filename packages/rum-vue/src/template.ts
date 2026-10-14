import { _integration } from "@ezgh/rum"

export interface RouteLike { path: string, matched: ReadonlyArray<{ path: string }> }

/** Vue Router's matched records carry full patterns (`/users/:id`, `/:pathMatch(.*)*`): the last wins. */
export function vueTemplate(route: RouteLike): string {
  return route.matched[route.matched.length - 1]?.path || _integration.templatePath(route.path)
}

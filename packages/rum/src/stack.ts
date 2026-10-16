// Script URLs in V8, SpiderMonkey and JavaScriptCore stacks. The registration snippet (CLI L2,
// @ezghcloud/rum-build) keys _ezghDebugIds by the Error stack of the injected file's own top-level code,
// whose first frame is that file's URL.
export const STACK_URL = /(?:blob:)?(?:https?|file):\/\/[^\s()]+?(?=:\d+:\d+)/g
export function stackUrls(stack: string): string[] {
  const seen = new Set<string>()
  for (const m of stack.matchAll(STACK_URL)) seen.add(m[0])
  return [...seen]
}
export function topFrame(stack: string): string {
  return stack.split("\n").find(l => /:\d+:\d+\)?\s*$/.test(l))?.trim() ?? ""
}
export function debugIdsFor(stack: string, registry: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!registry || typeof registry !== "object") return out
  const byUrl = new Map<string, string>() // rebuilt per exception: the registry grows as chunks load
  for (const key in registry) {
    const url = stackUrls(key)[0]
    const id = registry[key]
    if (url && typeof id === "string" && !byUrl.has(url)) byUrl.set(url, id)
  }
  for (const u of stackUrls(stack)) {
    const id = byUrl.get(u)
    if (id) out[u] = id
  }
  return out
}

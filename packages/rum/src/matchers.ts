// allowedTracingUrls: a string is a prefix of the absolute URL, a RegExp is tested (lastIndex
// reset, so /g is safe), and a function must return exactly true. A matcher that throws doesn't match.
export type UrlMatcher = string | RegExp | ((url: string) => boolean)

export function matchesAny(url: string, matchers: readonly UrlMatcher[]): boolean {
  for (const m of matchers) {
    try {
      if (typeof m === "string") {
        if (url.startsWith(m)) return true
      }
      else if (m instanceof RegExp) {
        m.lastIndex = 0
        if (m.test(url)) return true
      }
      else if (m(url) === true) return true
    }
    catch { /* doesn't match */ }
  }
  return false
}

// URLs as the SDK records them: query values of sensitive parameters replaced with REDACTED,
// userinfo and fragments dropped, non-http(s) schemes reduced to the scheme (spec "Privacy").
export const DEFAULT_REDACTED_PARAMS: readonly string[] = [
  "token", "access_token", "id_token", "code", "state", "password", "passwd", "secret", "key", "api_key",
  "apikey", "session", "sessionid", "auth", "signature", "sig",
]
export interface RedactedUrl { full: string, path: string, query: string }
const MAX = 2048
const cap = (s: string) => (s.length > MAX ? s.slice(0, MAX) : s)

export function makeRedactor(extra: readonly string[]): (raw: string, base?: string) => RedactedUrl {
  const names = new Set([...DEFAULT_REDACTED_PARAMS, ...extra].map(n => n.toLowerCase()))
  return (raw, base) => {
    let u: URL
    try {
      u = new URL(raw, base)
    }
    catch {
      return { full: "", path: "", query: "" }
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { full: u.protocol, path: "", query: "" }
    const parts: string[] = []
    for (const [k, v] of u.searchParams) {
      parts.push(`${encodeURIComponent(k)}=${names.has(k.toLowerCase()) ? "REDACTED" : encodeURIComponent(v)}`)
    }
    const query = parts.join("&")
    return { full: cap(u.origin + u.pathname + (query ? "?" + query : "")), path: cap(u.pathname), query: cap(query) }
  }
}

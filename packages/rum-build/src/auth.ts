// The upload credential: an API key (EZGH_API_KEY, which setup-ezgh sets in GitHub Actions), or a
// GitHub Actions OIDC token exchanged at org-api for a short-lived bot key. Keys are never logged.
export interface OidcOptions { bot: string, audience?: string }

export async function resolveAuthorization(
  o: { apiKey?: string, oidc?: OidcOptions, organizationId: string, domain: string, fetch?: typeof fetch },
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const key = o.apiKey || env.EZGH_API_KEY
  if (key) return `Bearer ${key}`
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL, requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!o.oidc || !url || !requestToken) return undefined
  const f = o.fetch ?? fetch
  const audience = o.oidc.audience ?? o.domain
  const idRes = await f(`${url}${url.includes("?") ? "&" : "?"}audience=${encodeURIComponent(audience)}`, {
    headers: { Authorization: `Bearer ${requestToken}` },
  })
  if (!idRes.ok) throw new Error(`ezgh-rum: GitHub Actions didn't issue an OIDC token (${idRes.status}): give the job "permissions: id-token: write"`)
  const { value } = await idRes.json() as { value?: string }
  if (!value) throw new Error("ezgh-rum: GitHub Actions answered without an OIDC token")
  const exchange = `https://orgs.${o.domain}/v1/organizations/${encodeURIComponent(o.organizationId)}/bots/${encodeURIComponent(o.oidc.bot)}/oidc-api-keys`
  for (let attempt = 0; ; attempt++) {
    // No Authorization header: the OIDC token is the credential.
    const res = await f(exchange, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: value, name: "ezgh-rum-build", expiresInSeconds: 900 }),
    })
    if (res.ok) {
      const { token } = await res.json() as { token?: string }
      if (!token) throw new Error("ezgh-rum: org-api answered the OIDC exchange without a key")
      return `Bearer ${token}`
    }
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      const ra = Number(res.headers.get("Retry-After"))
      await new Promise(r => setTimeout(r, Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 1000 * 2 ** attempt))
      continue
    }
    const body = await res.json().catch(() => ({})) as { error?: { code?: string, message?: string } }
    throw new Error(`ezgh-rum: the OIDC exchange for bot ${o.oidc.bot} failed (${res.status} ${body.error?.code ?? ""}): ${body.error?.message ?? res.statusText}`)
  }
}

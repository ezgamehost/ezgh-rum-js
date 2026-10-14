import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider, createBrowserRouter } from "react-router"
import { consent, flush, getSessionId, init } from "@ezgh/rum"
import { instrumentReactRouter } from "@ezgh/rum-react"
import { routes } from "./routes.tsx"

const q = new URLSearchParams(location.search)
export const token = q.get("ct") ?? __EZGH_RUM_TOKEN__

init({
  token,
  release: __EZGH_RUM_RELEASE__,
  endpoint: __EZGH_RUM_ENDPOINT__,
  ...(q.get("tunnel") === "1" ? { tunnel: "http://localhost:4318/tunnel" } : {}),
  trackingConsent: q.get("consent") === "pending" ? "pending" : "granted",
  sessionSampleRate: q.get("sample") === "0" ? 0 : 100,
  allowedTracingUrls: [__FIXTURE_API__ || location.origin],
  captureConsole: ["error", "warn"],
  redactQueryParams: ["coupon"],
})

const router = createBrowserRouter(routes)
instrumentReactRouter(router)
window.__rum = { flush, grant: consent.grant, revoke: consent.revoke, sessionId: getSessionId }

createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { ezghRumBuild } from "@ezghcloud/rum-build"

// EZGH_RUM_TOKEN, EZGH_RUM_RELEASE and EZGH_RUM_ENDPOINT are read at build. Without an endpoint the
// app talks to the fake intake (fixtures/fake-intake) and its traced API; with one (I4, e2e:prod)
// Fetch is a same-origin /api/items. Maps are hidden and uploaded by I4 with the CLI.
const endpoint = process.env.EZGH_RUM_ENDPOINT
const release = process.env.EZGH_RUM_RELEASE ?? "dev"
const local = !endpoint || /^http:\/\/localhost(:\d+)?$/.test(endpoint)

export default defineConfig({
  plugins: [react(), ezghRumBuild.vite({ application: "rum-e2e", release, upload: false })],
  build: {
    sourcemap: "hidden",
    rollupOptions: { input: { main: "index.html", traced: "traced.html" } },
  },
  define: {
    __EZGH_RUM_TOKEN__: JSON.stringify(process.env.EZGH_RUM_TOKEN ?? "ezgh_ct_" + "A".repeat(43)),
    __EZGH_RUM_RELEASE__: JSON.stringify(release),
    __EZGH_RUM_ENDPOINT__: JSON.stringify(endpoint ?? "http://localhost:4318"),
    __FIXTURE_API__: JSON.stringify(local ? "http://localhost:4319" : ""),
    __FIXTURE_UNTRACED__: JSON.stringify(local ? "http://localhost:4320" : ""),
  },
  preview: { port: 4173, strictPort: true },
})

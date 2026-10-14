# Tunnel handlers

Ad blockers drop requests to third-party telemetry hosts. With `init({ tunnel: "/_ezgh" })`,
`@ezgh/rum` sends to your own origin instead (`POST /_ezgh?path=/v1/logs&ct=…&enc=gzip&sv=…`), and
one of these handlers forwards the request to `https://obs-browser.ezghcloud.com`.

Every handler:

- answers only `POST` with `?path=/v1/traces` or `?path=/v1/logs` (anything else is `404`) and
  bodies up to 1 MiB (else `413`);
- forwards the whole query and the body unchanged, with `Content-Type`, `Origin` and
  `X-Forwarded-For` (the client's chain with the browser's address appended);
- **never forwards `Cookie` or `Authorization`**: `sendBeacon` always carries your site's cookies;
- relays the status, the body, `Content-Type` and `Retry-After`.

| File | Mount |
| --- | --- |
| [`cloudflare-worker.ts`](cloudflare-worker.ts) | Route `https://shop.example.com/_ezgh*` to the Worker. The browser's address comes from `CF-Connecting-IP`. |
| [`express.ts`](express.ts) | `app.use("/_ezgh", ezghTunnel())`. Set `app.set("trust proxy", …)` for your load balancer so `req.ip` is the browser's address. |
| [`nextjs-route.ts`](nextjs-route.ts) | Save as `app/%5Fezgh/route.ts` (the URL is `/_ezgh`; folders starting with `_` are private). The platform's `X-Forwarded-For` is passed through. |
| [`go/tunnel.go`](go/tunnel.go) | `mux.Handle("/_ezgh", ezghtunnel.Handler(""))`. Behind a load balancer, set `r.RemoteAddr` to the browser's address first. |

Without the tunnel's egress addresses in the client token's **tunnel addresses**, every user
shares the tunnel's per-address limit and geo. Add them to use the forwarded browser address.

Each handler reads its upstream from `EZGH_RUM_UPSTREAM` (default
`https://obs-browser.ezghcloud.com`); the tests point it at a fake. Run `bun test examples/tunnel`
and `cd examples/tunnel/go && go test ./...`.

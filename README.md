# ezgh-rum-js

Real user monitoring for web apps on [EZGH Cloud](https://ezghcloud.com): page loads, route
changes, Web Vitals, requests and errors from your users' browsers, sent as OpenTelemetry to EZGH
Observability. Errors are grouped into issues, symbolicated with the source maps your build uploads.

## Packages

| Package | What it is | Size (gzipped) |
| --- | --- | --- |
| [`@ezghcloud/rum`](packages/rum) | The SDK: sessions, views, spans, vitals, errors, the exporter; ESM and a script tag (`window.EzghRum`) | ≤ 25 KB |
| [`@ezghcloud/rum-react`](packages/rum-react) | `EzghErrorBoundary`, `useEzghView`, React Router route templates | ≤ 3 KB over core |
| [`@ezghcloud/rum-nextjs`](packages/rum-nextjs) | Next.js App Router: `<EzghRum>`, `useEzghErrorReport`, `withEzghRum`, `ezghTraceparent` | ≤ 3 KB over core |
| [`@ezghcloud/rum-vue`](packages/rum-vue) | Vue plugin: error handler and Vue Router templates | ≤ 3 KB over core |
| [`@ezghcloud/rum-angular`](packages/rum-angular) | `provideEzghRum` and `EzghErrorHandler` | ≤ 3 KB over core |
| [`@ezghcloud/rum-build`](packages/rum-build) | Build plugin for Vite, webpack, Rollup, esbuild and Rspack: debug IDs and source-map upload | build time only |

`bun run size` enforces the budgets.

## Install

```sh
npm install @ezghcloud/rum                          # plus the integration for your framework:
npm install @ezghcloud/rum-react                    # or rum-nextjs, rum-vue, rum-angular
npm install -D @ezghcloud/rum-build                 # source maps (rum-nextjs includes it)
```

The script tag (`window.EzghRum`) is served by jsDelivr from `@ezghcloud/rum`; each release's notes
carry the tag with its SRI hash.

## What it collects

- **Spans:** `documentLoad` (with Navigation Timing phases), `routeChange`, `interaction` (a click,
  Enter/Space or submit that starts a request) and `HTTP <method>` for `fetch` and
  `XMLHttpRequest`. `traceparent` is added only to requests whose URL matches `allowedTracingUrls`.
- **View events** (`ezgh.rum.view`) with duration, loading time, LCP, FCP, TTFB, CLS, INP and
  counts of errors, requests, long tasks and actions. EZGH Observability turns them into the
  `ezgh_rum_*` metrics; browsers send no metrics.
- **Exceptions:** uncaught errors, unhandled rejections, framework error boundaries and
  `captureException`, with the stack, the debug IDs of the scripts in it and the last 50
  breadcrumbs (views, actions, requests and, by default, `console.error`/`warn` messages).

Every record carries `session.id`, the view's ID and route template, the page's path and redacted
query, and `user.id` once you call `setUser`.

## Privacy defaults

- No cookies: the session lives in `localStorage` (`ezgh_rum_s`): 30 minutes of inactivity, 4
  hours at most.
- No DOM text or input values, ever. Action names come from `data-ezgh-action`, then
  `aria-label`, then the element's tag and ID.
- Query parameters named `token`, `access_token`, `id_token`, `code`, `state`, `password`,
  `passwd`, `secret`, `key`, `api_key`, `apikey`, `session`, `sessionid`, `auth`, `signature` or
  `sig` (plus your `redactQueryParams`) are sent as `REDACTED`. URL fragments and user info are
  dropped.
- IP addresses are never stored: EZGH derives the country, region and city, then discards the
  address.
- `trackingConsent: "pending"` sends and stores nothing until `consent.grant()`;
  `consent.revoke()` stops and clears the session.
- `beforeSend` can edit or drop any record.

## Browser support

Chrome and Edge 96+, Firefox 100+, Safari 15.4+ (ES2022). Browsers without `CompressionStream`
send uncompressed.

## The tunnel

Ad blockers drop requests to telemetry hosts. With `init({ tunnel: "/_ezgh" })` the SDK sends to
your own origin, and a small handler forwards to `https://obs-browser.ezghcloud.com`.
[`examples/tunnel`](examples/tunnel) has handlers for a Cloudflare Worker, Express, a Next.js
route handler and Go's `net/http`.

## Development

```sh
bun install
bun run check   # lint, typecheck, unit tests, build, size budgets, pack
bun run e2e     # Playwright: the fixture app against a fake intake in Chromium, Firefox and WebKit
```

`bunx playwright install chromium firefox webkit` installs the browsers. The debug-ID injection
vectors in `packages/rum-build/test/vectors` come from ezgh-cli (`scripts/sync-inject-vectors.sh`),
so `@ezghcloud/rum-build` and `ezgh obs sourcemaps inject` produce identical output.

## Releasing

The packages are published to npm under `@ezghcloud` by `.github/workflows/release.yml` with npm
trusted publishing (GitHub Actions OIDC, provenance attached; there is no npm token).

1. `bun scripts/version.ts X.Y.Z` sets all six versions. Commit that on main and push.
2. Tag the commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The workflow
   checks that the tag matches every package version, runs `bun run check`, packs, publishes in
   dependency order (skipping versions already on npm, so a failed run can be re-run) and creates
   the GitHub release.

Adding a package: before its first tagged release, the npm owner runs
`scripts/npm-trust.sh @ezghcloud/<name>` once (logged in to npm with 2FA). npm can only trust a
package that exists, so the script publishes a deprecated 0.0.0 placeholder if needed, trusts this
repository's `release.yml` and requires 2FA for any manual publish. Also add the package to the
publish order in `release.yml` and to `scripts/pack.ts`, `scripts/version.ts` and `scripts/build.ts`.

## License

Apache-2.0

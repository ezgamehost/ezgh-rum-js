# @ezghcloud/rum

Real user monitoring for web apps on EZGH Cloud: page loads, route changes, Web Vitals, requests
and errors as OpenTelemetry. Create a browser app (a client token) in the EZGH console under
Observability → Real user monitoring.

## Install

```sh
npm install @ezghcloud/rum
```

```ts
import { init } from "@ezghcloud/rum"

init({
  token: "ezgh_ct_…",            // the browser app's client token (public by design)
  release: "2026.10.13-4f2a9c1", // your build's version: matches errors to source maps and releases
})
```

Call `init` as early as you can, once. Framework packages add error boundaries and route
templates: `@ezghcloud/rum-react`, `@ezghcloud/rum-nextjs`, `@ezghcloud/rum-vue`, `@ezghcloud/rum-angular`.

### Script tag

<!-- sri -->
See the release notes for this version's tag.
<!-- /sri -->

## Options

| Option | Default | |
| --- | --- | --- |
| `token` | (required) | `ezgh_ct_…` |
| `release` | | `service.version` |
| `endpoint` | `https://obs-browser.ezghcloud.com` | |
| `tunnel` | | A first-party URL that forwards to the endpoint, such as `/_ezgh` |
| `sessionSampleRate` | `100` | Percent of sessions kept, decided once per session |
| `allowedTracingUrls` | `[]` | Strings (URL prefixes), RegExps or functions: requests that get `traceparent` |
| `trackResources` | `false` | Resource-timing spans under `documentLoad` |
| `trackLongTasks` | `true` | Long tasks counted per view |
| `captureConsole` | `["error", "warn"]` | Console levels kept as breadcrumbs on errors, never sent as logs |
| `trackingConsent` | `"granted"` | `"pending"`: nothing is sent or stored until `consent.grant()` |
| `redactQueryParams` | `[]` | Added to the default list of redacted query parameters |
| `beforeSend` | | `(event) => event \| null`: edit or drop any record |

## API

- `setUser({ id })`, `clearUser()`
- `setAttributes({ … })`: attributes on later records (at most 32; keys the SDK owns are refused)
- `addAction(name, attrs?)`
- `captureException(err, { fingerprint?, attrs? })`
- `startView(name)`: a manual view
- `consent.grant()`, `consent.revoke()`
- `getSessionId()`
- `flush()`

None of them throws, and all are no-ops before `init`. The SDK swallows its own errors and turns
itself off after 10 in a page.

## License

Apache-2.0

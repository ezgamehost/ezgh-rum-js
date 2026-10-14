# @ezgh/rum-build

Build plugin for [`@ezgh/rum`](https://www.npmjs.com/package/@ezgh/rum): adds a debug ID to every
emitted JavaScript file and its source map, then uploads the maps to EZGH Observability, so errors
are symbolicated whatever the file names or CDN. Works with Vite, webpack, Rollup, esbuild and
Rspack. The same injection as `ezgh obs sourcemaps inject`: running both is harmless.

```sh
npm install -D @ezgh/rum-build
```

```ts
// vite.config.ts
import { ezghRumBuild } from "@ezgh/rum-build"

export default defineConfig({
  build: { sourcemap: "hidden" },
  plugins: [ezghRumBuild.vite({ application: "storefront", release: process.env.RELEASE })],
})
```

`ezghRumBuild.webpack(…)`, `.rollup(…)`, `.esbuild(…)` and `.rspack(…)` take the same options.
Build with source maps on (hidden maps are fine).

| Option | Default |
| --- | --- |
| `application` | `EZGH_RUM_APPLICATION` |
| `release` | `EZGH_RUM_RELEASE` |
| `organizationId`, `projectId` (UUIDs, shown on the console's Setup tab) | `EZGH_ORG`, `EZGH_PROJECT` |
| `apiKey` | `EZGH_API_KEY` |
| `oidc: { bot, audience? }` | GitHub Actions OIDC to a short-lived bot key, when there's no API key |
| `domain` | `EZGH_DOMAIN`, else `ezghcloud.com` |
| `upload` | `true`; `false` only injects |
| `failOnError` | `true` |
| `deleteMapsAfterUpload` | `false` |

Without credentials, an application or a release, the plugin injects and says what's missing. The
key's owner needs the `ObsSourceMapUploadAccess` policy.

## License

Apache-2.0

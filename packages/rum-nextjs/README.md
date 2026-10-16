# @ezghcloud/rum-nextjs

Next.js (App Router, 15.4+) integration for [`@ezghcloud/rum`](https://www.npmjs.com/package/@ezghcloud/rum).

```sh
npm install @ezghcloud/rum @ezghcloud/rum-nextjs
```

**`app/layout.tsx`:**

```tsx
import { EzghRum } from "@ezghcloud/rum-nextjs"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <EzghRum token="ezgh_ct_…" release={process.env.NEXT_PUBLIC_RELEASE} />
        {children}
      </body>
    </html>
  )
}
```

`<EzghRum>` initializes the SDK once and names views by route template (`/users/:id`,
`/docs/:slug*`). To start even earlier, also call `init` from `@ezghcloud/rum` in
`instrumentation-client.ts`; the second init is a no-op.

**`app/error.tsx` and `app/global-error.tsx`:**

```tsx
"use client"
import { useEzghErrorReport } from "@ezghcloud/rum-nextjs"

export default function Error({ error, reset }: { error: Error, reset: () => void }) {
  useEzghErrorReport(error)
  return <button onClick={reset}>Try again</button>
}
```

**`next.config.ts`:**

```ts
import { withEzghRum } from "@ezghcloud/rum-nextjs/config"

export default withEzghRum({ /* your config */ }, { application: "storefront" })
```

`withEzghRum` adds debug IDs to the client bundles after the production build, uploads the source
maps through EZGH Observability (with `EZGH_API_KEY`, `EZGH_ORG`, `EZGH_PROJECT` and a release:
`EZGH_RUM_RELEASE`), and removes the maps from the output so they aren't served. It also asks
Next.js to render `<meta name="traceparent">`, so the page load joins the server's trace.

**`instrumentation.ts`** (for that trace join; needs a tracer provider, such as `@vercel/otel`):

```ts
export async function register() {
  const { registerOTel } = await import("@vercel/otel")
  registerOTel({ serviceName: "storefront" })
  const { ezghTraceparent } = await import("@ezghcloud/rum-nextjs/instrumentation")
  await ezghTraceparent()
}
```

## License

Apache-2.0

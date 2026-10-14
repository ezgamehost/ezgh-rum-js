# @ezgh/rum-react

React integration for [`@ezgh/rum`](https://www.npmjs.com/package/@ezgh/rum): an error boundary
that reports render errors, manual views, and route templates from React Router.

```sh
npm install @ezgh/rum @ezgh/rum-react
```

```tsx
import { init } from "@ezgh/rum"
import { EzghErrorBoundary, instrumentReactRouter } from "@ezgh/rum-react"
import { createBrowserRouter, RouterProvider } from "react-router"

init({ token: "ezgh_ct_…", release: "…" })
const router = createBrowserRouter(routes)
instrumentReactRouter(router) // views named by route pattern: /users/:id

root.render(
  <EzghErrorBoundary fallback={<p>Something went wrong.</p>}>
    <RouterProvider router={router} />
  </EzghErrorBoundary>,
)
```

## Exports

- `EzghErrorBoundary`: props `fallback` (a node, or `(error, reset) => node`) and `attributes`.
  Errors it catches are reported with source `boundary` and React's component stack.
- `useEzghView(name)`: starts a view named `name`.
- `instrumentReactRouter(router)`: for data routers (`createBrowserRouter`); returns an unsubscribe.
- `useEzghRouteTemplate()`: for framework mode or any tree under a router; names views from the
  route params.

## License

Apache-2.0

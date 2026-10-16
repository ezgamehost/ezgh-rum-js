# @ezghcloud/rum-angular

Angular (19+) integration for [`@ezghcloud/rum`](https://www.npmjs.com/package/@ezghcloud/rum): an
`ErrorHandler` that reports errors and view names from the Router.

```sh
npm install @ezghcloud/rum @ezghcloud/rum-angular
```

**`app.config.ts`:**

```ts
import { ApplicationConfig } from "@angular/core"
import { provideRouter } from "@angular/router"
import { provideEzghRum } from "@ezghcloud/rum-angular"

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideEzghRum({ token: "ezgh_ct_…", release: "…" })],
}
```

`provideEzghRum(options)` initializes the SDK at startup and provides `EzghErrorHandler`, which
reports the error and then calls Angular's default handler.

## License

Apache-2.0

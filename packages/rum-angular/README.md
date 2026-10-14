# @ezgh/rum-angular

Angular (19+) integration for [`@ezgh/rum`](https://www.npmjs.com/package/@ezgh/rum): an
`ErrorHandler` that reports errors and view names from the Router.

```sh
npm install @ezgh/rum @ezgh/rum-angular
```

**`app.config.ts`:**

```ts
import { ApplicationConfig } from "@angular/core"
import { provideRouter } from "@angular/router"
import { provideEzghRum } from "@ezgh/rum-angular"

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideEzghRum({ token: "ezgh_ct_…", release: "…" })],
}
```

`provideEzghRum(options)` initializes the SDK at startup and provides `EzghErrorHandler`, which
reports the error and then calls Angular's default handler.

## License

Apache-2.0

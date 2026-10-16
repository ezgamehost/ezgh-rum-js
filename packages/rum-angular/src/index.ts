// providers: [provideEzghRum({ token, … })] in app.config.ts: init at startup, an ErrorHandler that
// reports (source `boundary`), and view names from the Router's route config. No decorators, so no
// Angular compiler is needed to build or consume this package.
import { ErrorHandler, inject, makeEnvironmentProviders, provideAppInitializer, type EnvironmentProviders } from "@angular/core"
import { NavigationEnd, Router } from "@angular/router"
import { filter } from "rxjs"
import { _integration, init, type InitOptions } from "@ezghcloud/rum"
import { angularTemplate } from "./template.ts"

export { angularTemplate } from "./template.ts"

function unwrap(error: unknown): unknown {
  let e = error
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    const o = e as { rejection?: unknown, ngOriginalError?: unknown }
    if (o.rejection !== undefined) e = o.rejection // zone.js promise rejections
    else if (o.ngOriginalError !== undefined) e = o.ngOriginalError
    else break
  }
  return e
}

export class EzghErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    try {
      _integration.captureBoundaryError(unwrap(error))
    }
    catch { /* never breaks the app */ }
    super.handleError(error)
  }
}

export function provideEzghRum(options: InitOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ErrorHandler, useFactory: () => new EzghErrorHandler() },
    provideAppInitializer(() => {
      init(options)
      const router = inject(Router, { optional: true })
      router?.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
        try {
          _integration.setRouteTemplate(angularTemplate(router.routerState.snapshot.root))
        }
        catch { /* never breaks the app */ }
      })
    }),
  ])
}

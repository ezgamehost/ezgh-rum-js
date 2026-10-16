// app.use(createEzghRum({ token, router, … })): init, Vue's errorHandler (source `boundary`) and
// view names from Vue Router's matched route patterns.
import type { App, ComponentPublicInstance, Plugin } from "vue"
import type { Router } from "vue-router"
import { _integration, init, type InitOptions } from "@ezghcloud/rum"
import { vueTemplate } from "./template.ts"

export { vueTemplate } from "./template.ts"
export interface EzghRumVueOptions extends InitOptions { router?: Router }

export function createEzghRum(options: EzghRumVueOptions): Plugin {
  return {
    install(app: App) {
      const { router, ...initOptions } = options
      init(initOptions)
      const previous = app.config.errorHandler
      app.config.errorHandler = (err: unknown, instance: ComponentPublicInstance | null, info: string) => {
        try {
          _integration.captureBoundaryError(err, { "ezgh.rum.vue.info": String(info) })
        }
        catch { /* never breaks the app */ }
        if (previous) previous(err, instance, info)
        else console.error(err) // what Vue does without a handler
      }
      router?.afterEach((to) => {
        try {
          _integration.setRouteTemplate(vueTemplate(to))
        }
        catch { /* never breaks the app */ }
      })
    },
  }
}

# @ezghcloud/rum-vue

Vue 3 integration for [`@ezghcloud/rum`](https://www.npmjs.com/package/@ezghcloud/rum): errors from Vue's
error handler and view names from Vue Router.

```sh
npm install @ezghcloud/rum @ezghcloud/rum-vue
```

```ts
import { createApp } from "vue"
import { createEzghRum } from "@ezghcloud/rum-vue"

const app = createApp(App)
app.use(router)
app.use(createEzghRum({ token: "ezgh_ct_…", release: "…", router }))
app.mount("#app")
```

`createEzghRum(options)` takes the `@ezghcloud/rum` init options plus `router`. It chains any
`app.config.errorHandler` you already set.

## License

Apache-2.0

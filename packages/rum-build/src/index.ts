// @ezgh/rum-build: one unplugin whose hooks all run processOutput after the bundler wrote its
// files, so the same on-disk algorithm serves Vite, Rollup, webpack, Rspack, esbuild and Next.js.
import { dirname, resolve } from "node:path"
import { createUnplugin, type UnpluginInstance } from "unplugin"
import { processOutput, type EzghRumBuildOptions } from "./process.ts"

interface RspackCompiler {
  hooks: { afterEmit: { tapPromise(name: string, fn: () => Promise<void>): void } }
  options: { output: { path?: string } }
}

export const ezghRumBuild: UnpluginInstance<EzghRumBuildOptions | undefined> = createUnplugin((o: EzghRumBuildOptions | undefined = {}) => {
  let viteOut: string | undefined, viteSsr = false
  return {
    name: "ezgh-rum-build",
    vite: {
      apply: "build",
      configResolved(c) {
        viteOut = resolve(c.root, c.build.outDir)
        viteSsr = Boolean(c.build.ssr)
      },
      async writeBundle(out) {
        const env = (this as { environment?: { name: string } }).environment
        if (viteSsr || (env && env.name !== "client")) return
        await processOutput(out.dir ?? viteOut!, o)
      },
    },
    rollup: {
      async writeBundle(out) {
        await processOutput(out.dir ?? dirname(out.file!), o)
      },
    },
    webpack(compiler) {
      compiler.hooks.afterEmit.tapPromise("ezgh-rum-build", async () => {
        if (compiler.options.target === "node" || !compiler.options.devtool) return
        await processOutput(compiler.options.output.path!, o)
      })
    },
    rspack(compiler) {
      // Typed structurally: @rspack/core is the customer's, not a dependency of this package.
      const c = compiler as unknown as RspackCompiler
      c.hooks.afterEmit.tapPromise("ezgh-rum-build", async () => {
        await processOutput(c.options.output.path!, o)
      })
    },
    esbuild: {
      setup(build) {
        build.onEnd(async (r) => {
          const io = build.initialOptions
          if (r.errors.length || io.write === false) return
          await processOutput(io.outdir ?? dirname(io.outfile!), o)
        })
      },
    },
  }
})
export { processOutput, type EzghRumBuildOptions } from "./process.ts"
export { injectDebugId, debugIdFor, snippet, shiftColumns, InjectError, type Injected } from "./inject.ts"
export { upload, UploadError, CHUNK_BYTES, type UploadFile, type UploadTarget } from "./upload.ts"
export { resolveAuthorization, type OidcOptions } from "./auth.ts"

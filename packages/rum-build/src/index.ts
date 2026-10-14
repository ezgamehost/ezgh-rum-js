// @ezgh/rum-build: one unplugin whose hooks all run processOutput after the bundler wrote its
// files, so the same on-disk algorithm serves Vite, Rollup, webpack, Rspack, esbuild and Next.js.
import { dirname, resolve } from "node:path"
import { createUnplugin, type UnpluginInstance } from "unplugin"
import { processOutput, type EzghRumBuildOptions } from "./process.ts"

interface CompilerLike {
  hooks: { afterEmit: { tapPromise(name: string, fn: () => Promise<void>): void } }
  options: { output: { path?: string }, target?: unknown, devtool?: unknown }
  watchMode?: boolean
}

// Browser output only, written to disk by a production build: server targets, dev servers and
// watch mode (often an in-memory file system) are left alone.
function browserBuild(c: CompilerLike, needDevtool: boolean): boolean {
  if (c.watchMode || (needDevtool && !c.options.devtool)) return false
  const t = c.options.target
  const targets = (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string")
  return !targets.some(x => /^(?:async-)?node|^electron-(?:main|preload)/.test(x))
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
        const env = (this as { environment?: { config?: { consumer?: string } } }).environment
        if (viteSsr || (env?.config?.consumer !== undefined && env.config.consumer !== "client")) return
        await processOutput(out.dir ?? viteOut!, o)
      },
    },
    rollup: {
      async writeBundle(out) {
        await processOutput(out.dir ?? dirname(out.file!), o)
      },
    },
    webpack(compiler) {
      const c = compiler as unknown as CompilerLike
      c.hooks.afterEmit.tapPromise("ezgh-rum-build", async () => {
        if (!browserBuild(c, true)) return
        await processOutput(c.options.output.path!, o)
      })
    },
    rspack(compiler) {
      // Typed structurally: @rspack/core is the customer's, not a dependency of this package.
      const c = compiler as unknown as CompilerLike
      c.hooks.afterEmit.tapPromise("ezgh-rum-build", async () => {
        if (!browserBuild(c, true)) return
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

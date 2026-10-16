// next.config.ts: withEzghRum(nextConfig, { application }) turns on client source maps, injects
// debug IDs into .next/static after the production compile (webpack and Turbopack alike), uploads
// them through obs-api and deletes the maps from the output, and asks Next.js to render
// <meta name="traceparent"> (experimental.clientTraceMetadata) so documentLoad joins the server trace.
import { resolve } from "node:path"
import type { NextConfig } from "next"
import { processOutput, type EzghRumBuildOptions } from "@ezghcloud/rum-build"

export type { EzghRumBuildOptions } from "@ezghcloud/rum-build"

export function withEzghRum(config: NextConfig, options: EzghRumBuildOptions = {}): NextConfig {
  return wrap(config, options, processOutput)
}

/** @internal The implementation, with processOutput passed in (tests). */
export function wrap(config: NextConfig, options: EzghRumBuildOptions, process: typeof processOutput): NextConfig {
  const prev = config.compiler?.runAfterProductionCompile
  const meta = config.experimental?.clientTraceMetadata ?? []
  const ownMaps = config.productionBrowserSourceMaps !== true // we turn them on, so we never leave them served
  return {
    ...config,
    productionBrowserSourceMaps: true,
    experimental: { ...config.experimental, clientTraceMetadata: [...new Set([...meta, "traceparent", "tracestate"])] },
    compiler: {
      ...config.compiler,
      async runAfterProductionCompile(m) {
        await prev?.(m)
        await process(resolve(m.projectDir, m.distDir, "static"), {
          pathPrefix: "_next/static/", deleteMapsAfterUpload: true, ...(ownMaps ? { deleteMapsAlways: true } : {}), ...options,
        })
      },
    },
  }
}

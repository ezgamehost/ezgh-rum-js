declare const __EZGH_RUM_VERSION__: string | undefined
export const SDK_VERSION: string = typeof __EZGH_RUM_VERSION__ === "string" ? __EZGH_RUM_VERSION__ : "0.0.0-dev"

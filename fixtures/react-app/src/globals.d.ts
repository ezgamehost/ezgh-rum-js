declare const __EZGH_RUM_TOKEN__: string
declare const __EZGH_RUM_RELEASE__: string
declare const __EZGH_RUM_ENDPOINT__: string
declare const __FIXTURE_API__: string
declare const __FIXTURE_UNTRACED__: string
interface Window { __rum?: { flush: () => Promise<void>, grant: () => void, revoke: () => void, sessionId: () => string | undefined, setUser: (id: string) => void } }

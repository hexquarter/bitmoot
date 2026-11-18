/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BREEZ_API_KEY: string
    /** Platform-controlled destination for the per-payment fee. */
    readonly VITE_PLATFORM_FEE_ADDRESS: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
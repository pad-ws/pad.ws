/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PUBLIC_POSTHOG_KEY: string
    readonly VITE_PUBLIC_POSTHOG_HOST: string
    readonly CODER_URL: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
} 
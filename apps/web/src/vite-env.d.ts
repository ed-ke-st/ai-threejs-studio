/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PAYPAL_CLIENT_ID?: string;
  readonly VITE_PAYPAL_ENVIRONMENT?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_MCP_API_URL?: string;
}

interface Window {
  turnstile?: {
    render: (container: HTMLElement, options: { sitekey: string; theme: "dark" | "light"; callback: (token: string) => void; "expired-callback": () => void }) => string;
  };
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

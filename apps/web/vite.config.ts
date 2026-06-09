import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Env lives in the monorepo-root .env (same file the API reads), not apps/web.
  // Only VITE_-prefixed vars are exposed to the browser, so secrets stay server-side.
  envDir: fileURLToPath(new URL("../../", import.meta.url)),
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});

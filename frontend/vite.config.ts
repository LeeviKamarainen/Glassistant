import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BACKEND = "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
        // SSE endpoint must not be buffered/compressed by the proxy.
        ws: false,
      },
      "/healthz": BACKEND,
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

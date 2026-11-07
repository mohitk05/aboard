import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev:web` serves the app with hot reload and forwards /api to `wrangler dev` on :8787.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  // The map chunk (MapLibre) is ~1 MB but only loads on screens with a map.
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
});

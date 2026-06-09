import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev, Vite proxifie /api vers le backend Fastify : pas de CORS, et le
// frontend ne parle jamais directement aux sources externes.
const API_TARGET = process.env.API_TARGET ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});

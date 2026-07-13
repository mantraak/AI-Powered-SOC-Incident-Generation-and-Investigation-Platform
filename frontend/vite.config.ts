import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Set VITE_API_TARGET to override the proxy target (e.g. http://localhost:8001)
const API_TARGET = process.env.VITE_API_TARGET || "http://localhost:8000";
const FRONTEND_PORT = parseInt(process.env.PORT || "5173", 10);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: FRONTEND_PORT,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        ws: true, // needed for /api/v1/lab-groups/ws/{id} (collaborative lab realtime channel)
      },
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/** Readable stacks / Safari mapping for Capacitor (set `VITE_CAP_DEBUG=1` when building). */
const capDebug = process.env.VITE_CAP_DEBUG === "1";

export default defineConfig({
  plugins: [
    react(),
  ],
  // Tell Vite where to find .env files (project root, not client/)
  envDir: path.resolve(import.meta.dirname),
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    /** Emit `.map` files so Safari Web Inspector can map minified stacks to source (dev workflow). */
    sourcemap: capDebug ? true : process.env.VITE_SOURCEMAP === "1" ? true : false,
    /** Turn off minification for Capacitor debug builds — stacks show real file/line in Safari. */
    minify: capDebug ? false : "esbuild",
  },
  server: {
    host: true, // Listen on 0.0.0.0 so dev server is accessible from local network (e.g. http://192.168.1.xxx:5173)
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:5001",
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying for HMR
      },
      "/videos": {
        target: process.env.VITE_API_URL || "http://localhost:5001",
        changeOrigin: true,
        secure: false,
      },
      "/images": {
        target: process.env.VITE_API_URL || "http://localhost:5001",
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      clientPort: 5173, // Ensure HMR WebSocket uses correct port
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

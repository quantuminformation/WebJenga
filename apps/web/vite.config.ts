import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(appRoot),
  build: {
    chunkSizeWarningLimit: 650,
    emptyOutDir: true,
    outDir: resolve(appRoot, "../../web"),
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/three")) {
            return "three";
          }
        },
      },
    },
  },
  publicDir: resolve(appRoot, "public"),
  server: {
    fs: {
      allow: [resolve(appRoot, "../..")],
    },
    host: "0.0.0.0",
  },
});

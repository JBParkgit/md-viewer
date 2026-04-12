// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var __electron_vite_injected_dirname = "C:\\web\\md-viewer";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__electron_vite_injected_dirname, "electron/main.ts")
      },
      outDir: "dist-electron",
      emptyOutDir: false
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__electron_vite_injected_dirname, "electron/preload.ts")
      },
      outDir: "dist-electron",
      emptyOutDir: false
    }
  },
  renderer: {
    root: ".",
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "index.html")
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};

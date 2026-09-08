import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "fs";
import { resolve } from "path";

const host = process.env.TAURI_DEV_HOST;

// Una edición con funciones añadidas trae su propio frontend junto a su motor, y aquí se
// decide cuál de los dos se compila. Sin esa carpeta se usa `src/extension`, que cumple el
// mismo contrato sin hacer nada, y la aplicación se compila igual: es la misma decisión que
// toma `lib.rs` en Rust con la bandera `pro`, tomada aquí por la presencia del archivo.
const EXTENSION = resolve(__dirname, "src-tauri/src/pro/frontend/index.ts");
const hayExtension = existsSync(EXTENSION);
const extension = hayExtension
  ? EXTENSION
  : resolve(__dirname, "./src/extension/index.ts");

/**
 * Las ventanas sueltas que puede traer una extensión, además de la principal.
 *
 * Su HTML vive aquí y no junto a la extensión, y es a propósito: Vite emite cada página de
 * entrada conservando su ruta desde la raíz del proyecto, así que una que viviera bajo
 * `src-tauri/` acabaría en `dist/src-tauri/…`, y ahí Tauri PARA el build («the configured
 * frontendDist includes the src-tauri folder»), porque nadie quiere empaquetar su propio
 * código Rust dentro de la app. El HTML de aquí es un cascarón sin nada dentro: quien pone
 * el contenido es la extensión, a través del alias `@/extension-ventanas`.
 *
 * Se añaden como punto de entrada solo si hay extensión que las llene.
 */
const VENTANAS_DE_EXTENSION: Record<string, string> = hayExtension
  ? { region: resolve(__dirname, "src/extension/ventanas/region/index.html") }
  : {};

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Path aliases. `@/extension` va PRIMERO a propósito: Vite se queda con la primera clave
  // que case por prefijo, así que puesto detrás de `@` no se usaría nunca.
  resolve: {
    alias: {
      "@/extension-ventanas": hayExtension
        ? resolve(__dirname, "src-tauri/src/pro/frontend/ventanas")
        : resolve(__dirname, "./src/extension/ventanas"),
      "@/extension": extension,
      "@": resolve(__dirname, "./src"),
      "@/bindings": resolve(__dirname, "./src/bindings.ts"),
    },
  },

  // Multiple entry points for main app and overlay
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        overlay: resolve(__dirname, "src/overlay/index.html"),
        "tray-menu": resolve(__dirname, "src/tray-menu/index.html"),
        ...VENTANAS_DE_EXTENSION,
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 14200,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 14201,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`, except an extension's frontend, which
      //    lives next to its engine but is web code and deserves hot reload like any other.
      //    `src-tauri/.taurignore` keeps Tauri from restarting the app for those same files.
      ignored: ["**/src-tauri/**", "!**/src-tauri/src/pro/frontend/**"],
    },
  },
}));

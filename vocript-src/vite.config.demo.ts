import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import { resolve } from "path";

// Build de la DEMO: compila la misma app de `src/` para un navegador normal,
// sustituyendo el backend de Tauri por el simulador de `demo/src/`.
//
// La razón de hacerlo así y no reescribir la interfaz en la web: una copia a
// mano se desfasa de la app en cuanto se toca un ajuste, que es exactamente lo
// que ya pasó con las capturas de la v3.4.5. Aquí la fuente es el código real,
// así que la demo se actualiza sola al recompilar.
//
// Nada de esto entra en el build normal: `tsconfig.json` solo incluye `src`, y
// la app se sigue compilando con `vite.config.ts`.
const shim = (nombre: string) => resolve(__dirname, `./demo/src/shims/${nombre}.ts`);

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Se sirve dentro de un <iframe> en vocript.app/demo/, no en la raíz.
  // La demo se sirve bajo vocript.app/demo/, y su raiz de fuentes es la
  // carpeta demo/, para que el HTML compilado quede en la raiz del outDir.
  root: resolve(__dirname, "demo"),
  base: "/demo/",

  // La pantalla "Acerca de" enseña la versión: se lee del package.json de la
  // app para que la demo diga la misma que el instalador de ese día.
  define: {
    __VERSION_DEMO__: JSON.stringify(
      JSON.parse(readFileSync(resolve(__dirname, "./package.json"), "utf8")).version,
    ),
  },

  resolve: {
    // Array (no objeto) porque el orden importa: `@/bindings` tiene que
    // resolverse antes que el comodín `@/`.
    alias: [
      { find: /^@\/bindings$/, replacement: resolve(__dirname, "./src/bindings.ts") },
      { find: /^@\//, replacement: resolve(__dirname, "./src/") + "/" },

      // El backend entero entra por aquí: los 145 comandos de `bindings.ts`
      // pasan por el `invoke` de `api/core`, así que un solo alias los cubre.
      { find: /^@tauri-apps\/api\/core$/, replacement: shim("core") },
      { find: /^@tauri-apps\/api\/event$/, replacement: shim("event") },
      { find: /^@tauri-apps\/api\/window$/, replacement: shim("window") },
      { find: /^@tauri-apps\/api\/webviewWindow$/, replacement: shim("webviewWindow") },
      { find: /^@tauri-apps\/api\/webview$/, replacement: shim("webview") },
      { find: /^@tauri-apps\/api\/app$/, replacement: shim("app") },
      { find: /^@tauri-apps\/plugin-os$/, replacement: shim("os") },
      { find: /^@tauri-apps\/plugin-opener$/, replacement: shim("opener") },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: shim("dialog") },
      { find: /^@tauri-apps\/plugin-clipboard-manager$/, replacement: shim("clipboard") },
      { find: /^@tauri-apps\/plugin-process$/, replacement: shim("process") },
      { find: /^@tauri-apps\/plugin-updater$/, replacement: shim("updater") },
      { find: /^tauri-plugin-macos-permissions-api$/, replacement: shim("macos-permissions") },
    ],
  },

  build: {
    outDir: resolve(__dirname, "dist-demo"),
    emptyOutDir: true,
  },

  server: {
    port: 14300,
    strictPort: true,
  },
});

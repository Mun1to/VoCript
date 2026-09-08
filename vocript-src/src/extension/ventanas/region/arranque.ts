/**
 * El arranque de una ventana suelta que aporta una extensión, para seleccionar una región de
 * la pantalla.
 *
 * Aquí no hay nada: el contenido lo pone la extensión a través del alias
 * `@/extension-ventanas`, que sin extensión apunta a la carpeta de al lado y no monta nada.
 * Esta página solo se compila cuando hay una extensión que la llene (ver `vite.config.ts`).
 */
import "@/extension-ventanas/region/main";

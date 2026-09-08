/**
 * Los puntos por donde otra edición añade pantallas y comportamiento a esta, y lo que
 * contesta VoCript cuando no hay ninguna montada, que es el caso de este repositorio.
 *
 * Es el gemelo en el frontend de `src-tauri/src/extension.rs`. Un alias de Vite decide cuál
 * de los dos archivos se compila (ver `vite.config.ts`), así que el código de la aplicación
 * importa siempre de `@/extension` y no se entera de en cuál de las dos ediciones corre.
 *
 * Este archivo es también el CONTRATO: una extensión tiene que exportar exactamente estos
 * nombres con estos tipos. Si añades algo aquí, hay que añadirlo allí, o el TypeScript de la
 * otra edición deja de compilar.
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/** Lo que una extensión quiere contar la primera vez que hay pantalla donde contarlo. */
export interface AvisoDePrimerArranque {
  /** Ya traducido por la extensión: aquí no se sabe de qué va. */
  titulo: string;
  detalle: string;
}

/**
 * La pantalla de ajustes que aporta la extensión, o `null` si no hay ninguna. El menú
 * lateral solo la enseña cuando `usarExtensionDisponible()` dice que sí: ofrecer una
 * pantalla que no puede hacer nada es peor que no ofrecer ninguna.
 */
export const PanelDeExtension: ComponentType | null = null;

/** La clave de traducción del nombre de esa pantalla en el menú lateral. */
export const CLAVE_DEL_PANEL = "";

/** El icono de esa pantalla en el menú lateral. */
export const ICONO_DEL_PANEL: LucideIcon | null = null;

/** La clave de traducción de la línea que va bajo su título. */
export const SUBTITULO_DEL_PANEL = "";

/**
 * Si esta copia trae una extensión con pantalla propia. Es un hook porque la respuesta llega
 * del backend y la barra lateral tiene que volver a pintarse cuando llegue.
 */
export function usarExtensionDisponible(): boolean {
  return false;
}

/**
 * Cabeceras para pedir la actualización. Esta edición se actualiza de un sitio público y no
 * necesita ninguna.
 */
export async function cabecerasDeActualizacion(): Promise<Record<string, string>> {
  return {};
}

/**
 * El aviso del primer arranque, si la extensión tiene algo que contar. Se pide una sola vez:
 * quien lo implemente se encarga de no repetirlo.
 */
export async function avisoDePrimerArranque(): Promise<AvisoDePrimerArranque | null> {
  return null;
}

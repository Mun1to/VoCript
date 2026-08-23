// `@tauri-apps/plugin-dialog`. Elegir un archivo del disco o guardar en él no
// existe aquí: se responde como si el usuario hubiera cancelado, que es el
// camino que la app ya sabe manejar.
import { avisarNoDisponible } from "../simulador/aviso";

export async function open(
  _opciones?: unknown,
): Promise<string | string[] | null> {
  avisarNoDisponible("archivos");
  return null;
}

export async function save(_opciones?: unknown): Promise<string | null> {
  avisarNoDisponible("archivos");
  return null;
}

export async function ask(
  _mensaje: string,
  _opciones?: unknown,
): Promise<boolean> {
  return false;
}

export async function confirm(
  _mensaje: string,
  _opciones?: unknown,
): Promise<boolean> {
  return false;
}

export async function message(
  _mensaje: string,
  _opciones?: unknown,
): Promise<void> {}

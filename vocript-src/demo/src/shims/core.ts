// `@tauri-apps/api/core`. La puerta por la que la app entera habla con su
// backend: `bindings.ts` importa de aquí, así que redirigiendo este módulo se
// simulan los 145 comandos de golpe.
import { invocar } from "../simulador/comandos";

export async function invoke<T>(
  comando: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return (await invocar(comando, args ?? {})) as T;
}

/**
 * Los canales de Tauri sirven para que Rust vaya empujando datos (el progreso
 * de una descarga, por ejemplo). En la demo nada descarga nada, así que el
 * canal existe pero no recibe nunca.
 */
export class Channel<T = unknown> {
  onmessage: ((mensaje: T) => void) | null = null;
  id = 0;

  toJSON(): string {
    return "__CHANNEL__:demo";
  }
}

export function convertFileSrc(ruta: string, _protocolo?: string): string {
  return ruta;
}

export function transformCallback(
  callback?: (carga: unknown) => void,
  _once = false,
): number {
  void callback;
  return 0;
}

export function isTauri(): boolean {
  return false;
}

export class Resource {
  constructor(public rid: number = 0) {}
  async close(): Promise<void> {}
}

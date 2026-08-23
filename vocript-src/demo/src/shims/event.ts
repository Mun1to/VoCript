// Bus de eventos local: sustituye a `@tauri-apps/api/event`.
//
// En la app los eventos vienen de Rust (progreso de descarga, estado del
// modelo, dictado terminado). Aquí los emite el propio simulador, así que
// basta con un emisor en memoria.
export type UnlistenFn = () => void;
export interface Event<T> {
  event: string;
  id: number;
  payload: T;
}

type Manejador = (evento: Event<unknown>) => void;

const suscriptores = new Map<string, Set<Manejador>>();
let siguienteId = 1;

export async function listen<T>(
  nombre: string,
  manejador: (evento: Event<T>) => void,
): Promise<UnlistenFn> {
  const conjunto = suscriptores.get(nombre) ?? new Set();
  suscriptores.set(nombre, conjunto);
  conjunto.add(manejador as Manejador);
  return () => {
    conjunto.delete(manejador as Manejador);
  };
}

export async function once<T>(
  nombre: string,
  manejador: (evento: Event<T>) => void,
): Promise<UnlistenFn> {
  const parar = await listen<T>(nombre, (evento) => {
    parar();
    manejador(evento);
  });
  return parar;
}

export async function emit(nombre: string, carga?: unknown): Promise<void> {
  emitirLocal(nombre, carga);
}

export async function emitTo(
  _destino: string,
  nombre: string,
  carga?: unknown,
): Promise<void> {
  emitirLocal(nombre, carga);
}

/** Lo que usa el simulador para empujar eventos a la interfaz. */
export function emitirLocal(nombre: string, carga?: unknown): void {
  const conjunto = suscriptores.get(nombre);
  if (!conjunto) return;
  const evento: Event<unknown> = { event: nombre, id: siguienteId++, payload: carga };
  for (const manejador of [...conjunto]) manejador(evento);
}

export const TauriEvent = {
  WINDOW_CLOSE_REQUESTED: "tauri://close-requested",
  WINDOW_FOCUS: "tauri://focus",
  WINDOW_BLUR: "tauri://blur",
  DRAG_DROP: "tauri://drag-drop",
} as const;

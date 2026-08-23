// `@tauri-apps/api/webviewWindow`. `bindings.ts` solo lo importa como TIPO
// (para su envoltorio de eventos por ventana), así que basta con la forma.
import { getCurrentWindow, type Window } from "./window";

export type WebviewWindow = Window & {
  listen: (nombre: string, manejador: (evento: unknown) => void) => Promise<() => void>;
};

export function getCurrentWebviewWindow(): WebviewWindow {
  return getCurrentWindow() as WebviewWindow;
}

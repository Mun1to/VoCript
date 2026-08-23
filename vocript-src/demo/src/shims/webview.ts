// `@tauri-apps/api/webview`. La app lo usa para escuchar el arrastrar-y-soltar
// de archivos sobre la ventana (transcribir un archivo). En el navegador ese
// gesto existe, pero el archivo no se puede transcribir sin backend, así que la
// suscripción se queda vacía y la pantalla enseña su propio aviso.
export type DragDropEvent = {
  payload: { type: string; paths?: string[]; position?: { x: number; y: number } };
};

const webviewFalso = {
  async onDragDropEvent(_manejador: (evento: DragDropEvent) => void) {
    return () => {};
  },
  async listen() {
    return () => {};
  },
};

export function getCurrentWebview() {
  return webviewFalso;
}

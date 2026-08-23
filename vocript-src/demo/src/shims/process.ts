// `@tauri-apps/plugin-process`. Reiniciar la app en una demo web es recargar
// la página; salir no se hace, cerraría el iframe de la landing.
export async function relaunch(): Promise<void> {
  window.location.reload();
}

export async function exit(_codigo?: number): Promise<void> {}

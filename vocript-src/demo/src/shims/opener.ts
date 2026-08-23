// `@tauri-apps/plugin-opener`. Los enlaces externos sí se abren de verdad: es
// lo que hace la app y no hay nada que simular.
export async function openUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openPath(_ruta: string): Promise<void> {
  // Abrir una carpeta del disco no existe en un navegador. Se ignora en
  // silencio: el aviso de "esto no va en la demo" lo da la propia interfaz.
}

export async function revealItemInDir(_ruta: string): Promise<void> {}

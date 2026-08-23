// `@tauri-apps/plugin-clipboard-manager`. El portapapeles del navegador sirve
// igual, y así el botón de copiar de la demo copia de verdad.
export async function writeText(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    // Sin permiso de portapapeles (o sin HTTPS) no se puede: no es motivo
    // para romper el resto de la pantalla.
  }
}

export async function readText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

// `@tauri-apps/api/app`. La versión la inyecta el build desde package.json,
// para que la pantalla "Acerca de" de la demo no mienta.
declare const __VERSION_DEMO__: string;

export async function getVersion(): Promise<string> {
  return typeof __VERSION_DEMO__ === "string" ? __VERSION_DEMO__ : "0.0.0";
}

export async function getName(): Promise<string> {
  return "VoCript";
}

export async function getTauriVersion(): Promise<string> {
  return "2.0.0";
}

// `@tauri-apps/plugin-os`. La demo se presenta siempre como Windows: es donde
// vive el grueso de los usuarios y donde la interfaz enseña todas sus opciones
// (en macOS se ocultan las de permisos de accesibilidad, y al revés).
export type Platform = "windows" | "macos" | "linux";
export type OsType = "windows" | "macos" | "linux";

export function platform(): Platform {
  return "windows";
}

export function type(): OsType {
  return "windows";
}

export function locale(): string | null {
  return typeof navigator !== "undefined" ? navigator.language : "en-US";
}

export function version(): string {
  return "10.0.26200";
}

export function arch(): string {
  return "x86_64";
}

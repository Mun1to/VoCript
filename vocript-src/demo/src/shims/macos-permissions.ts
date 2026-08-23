// `tauri-plugin-macos-permissions-api`. La demo se presenta como Windows, así
// que estos permisos ni se piden; se responde que sí para que el arranque no
// se quede en la pantalla de permisos.
export async function checkAccessibilityPermission(): Promise<boolean> {
  return true;
}

export async function requestAccessibilityPermission(): Promise<void> {}

export async function checkMicrophonePermission(): Promise<boolean> {
  return true;
}

export async function requestMicrophonePermission(): Promise<void> {}

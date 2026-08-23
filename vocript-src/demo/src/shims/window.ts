// `@tauri-apps/api/window`. En la demo no hay ventana del sistema que mover ni
// esconder: los métodos existen para que el código de la app no reviente, pero
// no hacen nada.
export class PhysicalPosition {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export class LogicalPosition {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export class PhysicalSize {
  constructor(
    public width: number,
    public height: number,
  ) {}
}

const ventanaFalsa = {
  label: "main",
  async hide() {},
  async show() {},
  async close() {},
  async destroy() {},
  async setFocus() {},
  async isVisible() {
    return true;
  },
  async isMinimized() {
    return false;
  },
  async minimize() {},
  async maximize() {},
  async unmaximize() {},
  async toggleMaximize() {},
  async startDragging() {},
  async setPosition(_posicion: unknown) {},
  async setSize(_tamano: unknown) {},
  async setAlwaysOnTop(_valor: boolean) {},
  async outerPosition() {
    return new PhysicalPosition(0, 0);
  },
  async innerSize() {
    return new PhysicalSize(window.innerWidth, window.innerHeight);
  },
  async scaleFactor() {
    return window.devicePixelRatio || 1;
  },
  async listen() {
    return () => {};
  },
  async once() {
    return () => {};
  },
  async emit() {},
  async onCloseRequested() {
    return () => {};
  },
  async onFocusChanged() {
    return () => {};
  },
  // La app se suscribe al tema del sistema por aquí (useResolvedTheme.ts). Sin
  // este método el hook revienta y el botón de claro/oscuro deja de funcionar,
  // aunque el resto de la ventana se vea bien.
  async onThemeChanged(manejador: (evento: { payload: string }) => void) {
    const medio = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!medio) return () => {};
    const alCambiar = (e: MediaQueryListEvent) =>
      manejador({ payload: e.matches ? "dark" : "light" });
    medio.addEventListener("change", alCambiar);
    return () => medio.removeEventListener("change", alCambiar);
  },
  async theme() {
    return window.matchMedia?.("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  },
};

export type Window = typeof ventanaFalsa;

export function getCurrentWindow(): Window {
  return ventanaFalsa;
}

export async function getAllWindows(): Promise<Window[]> {
  return [ventanaFalsa];
}

export const currentMonitor = async () => ({
  name: "Demo",
  size: new PhysicalSize(1920, 1080),
  position: new PhysicalPosition(0, 0),
  scaleFactor: 1,
});

/**
 * Suppresses the WebView2 right-click menu ("Reload", "Print", "Inspect"…),
 * which belongs to a browser, not to a desktop app.
 *
 * For the main window use `AppContextMenu` instead: it suppresses the native
 * menu *and* offers a themed one where a menu is genuinely useful. The overlay
 * and tray windows have nothing to cut or paste, so they only need this.
 */
export const suppressBrowserContextMenu = (): void => {
  window.addEventListener("contextmenu", (event) => event.preventDefault());
};

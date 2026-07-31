import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardCopy,
  ClipboardPaste,
  Scissors,
  TextSelect,
} from "lucide-react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useSettings } from "../../hooks/useSettings";

/**
 * Replaces the WebView2 right-click menu, which offers browser actions that make
 * no sense in a desktop app ("Reload", "Print", "Save as", "Inspect") and looks
 * nothing like the rest of VoCript.
 *
 * The native menu is suppressed everywhere; this one only appears where a menu
 * is actually useful — inside a text field, or over selected text. With debug
 * mode on, the browser menu is left alone so the devtools stay reachable.
 */

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

interface MenuState {
  x: number;
  y: number;
  field: EditableElement | null;
  selection: string;
}

const MENU_WIDTH = 190;
const ITEM_HEIGHT = 32;

const isEditable = (node: EventTarget | null): node is EditableElement =>
  node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;

export const AppContextMenu: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const debugMode = getSetting("debug_mode") ?? false;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (debugMode) return; // Leave devtools reachable while debugging.
      event.preventDefault();

      const target = event.target;
      const field = isEditable(target) ? target : null;
      const selection = window.getSelection()?.toString() ?? "";
      const fieldSelection = field
        ? field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0)
        : "";

      // Nothing to offer: no field to paste into and nothing selected to copy.
      if (!field && !selection) {
        close();
        return;
      }

      setMenu({
        x: event.clientX,
        y: event.clientY,
        field,
        selection: field ? fieldSelection : selection,
      });
    };

    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, [debugMode, close]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  const { field, selection } = menu;
  const canEdit = field !== null && !field.readOnly && !field.disabled;

  /** Replaces the field's selection, keeping undo history and firing the React
   *  onChange handlers that a direct `value =` assignment would bypass. */
  const replaceSelection = (text: string) => {
    if (!field) return;
    field.focus();
    document.execCommand("insertText", false, text);
  };

  const actions = [
    {
      id: "cut",
      icon: <Scissors className="h-3.5 w-3.5" />,
      label: t("contextMenu.cut"),
      enabled: canEdit && selection.length > 0,
      run: async () => {
        await writeText(selection);
        replaceSelection("");
      },
    },
    {
      id: "copy",
      icon: <ClipboardCopy className="h-3.5 w-3.5" />,
      label: t("contextMenu.copy"),
      enabled: selection.length > 0,
      run: () => writeText(selection),
    },
    {
      id: "paste",
      icon: <ClipboardPaste className="h-3.5 w-3.5" />,
      label: t("contextMenu.paste"),
      enabled: canEdit,
      run: async () => {
        const text = await readText();
        if (text) replaceSelection(text);
      },
    },
    {
      id: "selectAll",
      icon: <TextSelect className="h-3.5 w-3.5" />,
      label: t("contextMenu.selectAll"),
      enabled: field !== null,
      run: () => {
        field?.focus();
        field?.select();
      },
    },
  ].filter((action) => action.enabled);

  if (actions.length === 0) return null;

  // Keep the menu inside the window: near the right or bottom edge it would
  // otherwise open off-screen and be unreachable.
  const height = actions.length * ITEM_HEIGHT + 8;
  const x = Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8);
  const y = Math.min(menu.y, window.innerHeight - height - 8);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[100] rounded-xl border border-mid-gray/25 bg-background/95 p-1 shadow-2xl backdrop-blur-sm"
      style={{ left: Math.max(8, x), top: Math.max(8, y), width: MENU_WIDTH }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          onClick={() => {
            void action.run();
            close();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-start text-[13px] font-medium text-text transition-colors hover:bg-logo-primary/15"
        >
          <span className="text-text/55">{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  );
};

export default AppContextMenu;

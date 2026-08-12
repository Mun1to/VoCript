import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/**
 * Backend event carrying a transcription meant for VoCript's own window. See
 * `dictating_into_ourselves` in `clipboard.rs` for why the usual simulated
 * Ctrl+V cannot deliver it here.
 */
const INSERT_EVENT = "insert-transcription";

type EditableTarget = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** The field the text should go into, or null if the user is not in one. */
const focusedEditable = (): EditableTarget | null => {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active instanceof HTMLTextAreaElement) {
    return active.readOnly || active.disabled ? null : active;
  }
  if (active instanceof HTMLInputElement) {
    // Checkboxes, sliders and colour pickers are focusable but hold no text.
    const takesText = /^(text|search|url|email|tel|password|number|)$/i.test(
      active.type,
    );
    return takesText && !active.readOnly && !active.disabled ? active : null;
  }
  return active.isContentEditable ? active : null;
};

/**
 * Insert at the caret, replacing the selection, the same way typing would.
 *
 * `execCommand` is deprecated but it is still the only call that goes through
 * the browser's own editing pipeline: it respects the caret and the undo stack,
 * and it fires the native input event React listens to. Writing `.value`
 * directly does none of that — React would never see the change, so the field
 * would look updated and then snap back on the next render.
 */
const insertAtCaret = (field: EditableTarget, text: string): boolean => {
  if (document.execCommand("insertText", false, text)) return true;

  // Fallback for the day execCommand finally goes away. Assigning through the
  // prototype setter is what makes React's onChange fire.
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    setter.call(
      field,
      field.value.slice(0, start) + text + field.value.slice(end),
    );
    field.setSelectionRange(start + text.length, start + text.length);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
};

/**
 * Makes dictation work inside VoCript itself: the tour's practice box, the
 * custom words and dictionary fields, the feedback form.
 *
 * With no text field focused there is nowhere to put the words, so they go to
 * the clipboard instead of vanishing.
 */
export const useDictationIntoApp = () => {
  const { t } = useTranslation();

  useEffect(() => {
    const unlisten = listen<string>(INSERT_EVENT, async (event) => {
      const text = event.payload;
      if (!text) return;

      const field = focusedEditable();
      if (field && insertAtCaret(field, text)) return;

      try {
        await writeText(text);
        toast.success(t("dictation.copiedNoField"), {
          description: t("dictation.copiedNoFieldHint"),
        });
      } catch {
        toast.error(t("errors.pasteFailedTitle"));
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);
};

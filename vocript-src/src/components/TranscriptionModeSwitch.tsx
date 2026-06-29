import React from "react";
import { useTranslation } from "react-i18next";
import { Mic, Volume2, Clipboard, Hand } from "lucide-react";
import type { AppSettings } from "@/bindings";
import { useSettings } from "../hooks/useSettings";
import { useOsType } from "../hooks/useOsType";

/**
 * Quick-control bar shown in the header. Each setting is a single compact
 * "chip" (icon + the label of the *current* value); clicking it toggles the
 * value. Showing one word instead of a two-word segmented control keeps the
 * row narrow and roughly the same width across all 20 UI languages, so the
 * window can shrink without the header overflowing. The tooltip spells out
 * what a click switches to.
 *
 * - Voz / Sistema: `live_mode` / `live_mode_system` (Normal ↔ En vivo).
 * - Salida: `clipboard_only` (Pegar ↔ Copiar al portapapeles).
 * - Activación: `push_to_talk` (Mantener pulsado ↔ Alternar).
 *
 * `live_mode_system` is Windows-only, so that chip is hidden elsewhere.
 */

type BoolSettingKey = Extract<
  keyof AppSettings,
  "live_mode" | "live_mode_system" | "clipboard_only" | "push_to_talk"
>;

interface QuickControl {
  key: BoolSettingKey;
  icon: typeof Mic;
  tooltipKey: string;
  /** `data-tour` anchor so the guided tour can spotlight this chip on its own. */
  tour: string;
  /** Label for the `false` value (left segment). */
  offKey: string;
  /** Label for the `true` value (right segment). */
  onKey: string;
  windowsOnly?: boolean;
}

const CONTROLS: QuickControl[] = [
  {
    key: "live_mode",
    icon: Mic,
    tooltipKey: "header.mode.voice",
    tour: "header-voice",
    offKey: "header.mode.normal",
    onKey: "header.mode.live",
  },
  {
    key: "live_mode_system",
    icon: Volume2,
    tooltipKey: "header.mode.system",
    tour: "header-system",
    offKey: "header.mode.normal",
    onKey: "header.mode.live",
    windowsOnly: true,
  },
  {
    key: "clipboard_only",
    icon: Clipboard,
    tooltipKey: "header.output.label",
    tour: "header-output",
    offKey: "header.output.paste",
    onKey: "header.output.clipboard",
  },
  {
    key: "push_to_talk",
    icon: Hand,
    tooltipKey: "header.activation.label",
    tour: "header-activation",
    offKey: "header.activation.toggle",
    onKey: "header.activation.hold",
  },
];

export const TranscriptionModeSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { settings, getSetting, updateSetting, isUpdating } = useSettings();
  const isLight = settings?.theme === "light";
  const isWindows = useOsType() === "windows";

  const renderControl = (control: QuickControl) => {
    const value = (getSetting(control.key) as boolean) || false;
    const updating = isUpdating(control.key);
    const Icon = control.icon;
    const label = t(value ? control.onKey : control.offKey);
    const nextLabel = t(value ? control.offKey : control.onKey);

    return (
      <button
        key={control.key}
        type="button"
        data-tour={control.tour}
        disabled={updating}
        onClick={() => updateSetting(control.key, !value)}
        title={`${t(control.tooltipKey)} · → ${nextLabel}`}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
          value
            ? "bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.4)]"
            : isLight
              ? "bg-slate-100 text-slate-600 hover:text-slate-900"
              : "bg-white/[0.06] text-slate-300 hover:text-white"
        } ${updating ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {CONTROLS.filter((c) => isWindows || !c.windowsOnly).map(renderControl)}
    </div>
  );
};

export default TranscriptionModeSwitch;

import React from "react";
import { useTranslation } from "react-i18next";
import { Mic, Volume2, Clipboard, Hand } from "lucide-react";
import type { AppSettings } from "@/bindings";
import { useSettings } from "../hooks/useSettings";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { useOsType } from "../hooks/useOsType";
import { HeaderDropdown, HeaderDropdownOption } from "./ui/HeaderDropdown";

/**
 * Quick-control bar shown in the header. Each setting is a compact chip that
 * shows its *current* value; clicking opens a small dropdown with the two
 * options stacked together, the same interaction as every other header
 * dropdown (profile, language, accent color) via `HeaderDropdown`.
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
  /** Title shown inside the dropdown (e.g. "Voz", "Sistema"). */
  labelKey: string;
  /** `data-tour` anchor so the guided tour can spotlight this control on its own. */
  tour: string;
  /** Label for the `false` value. */
  offKey: string;
  /** Label for the `true` value. */
  onKey: string;
  windowsOnly?: boolean;
}

const CONTROLS: QuickControl[] = [
  {
    key: "live_mode",
    icon: Mic,
    labelKey: "header.mode.voice",
    tour: "header-voice",
    offKey: "header.mode.normal",
    onKey: "header.mode.live",
  },
  {
    key: "live_mode_system",
    icon: Volume2,
    labelKey: "header.mode.system",
    tour: "header-system",
    offKey: "header.mode.normal",
    onKey: "header.mode.live",
    windowsOnly: true,
  },
  {
    key: "clipboard_only",
    icon: Clipboard,
    labelKey: "header.output.label",
    tour: "header-output",
    offKey: "header.output.paste",
    onKey: "header.output.clipboard",
  },
  {
    key: "push_to_talk",
    icon: Hand,
    labelKey: "header.activation.label",
    tour: "header-activation",
    offKey: "header.activation.toggle",
    onKey: "header.activation.hold",
  },
];

export const TranscriptionModeSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const isLight = useResolvedTheme() === "light";
  const isWindows = useOsType() === "windows";

  const renderControl = (control: QuickControl) => {
    const value = (getSetting(control.key) as boolean) || false;
    const updating = isUpdating(control.key);
    const Icon = control.icon;
    const currentLabel = t(value ? control.onKey : control.offKey);

    return (
      <HeaderDropdown
        key={control.key}
        dataTour={control.tour}
        tooltip={t(control.labelKey)}
        title={t(control.labelKey)}
        icon={
          <Icon
            className={`w-3.5 h-3.5 shrink-0 ${
              isLight ? "text-slate-500" : "text-slate-400"
            } ${updating ? "opacity-50" : ""}`}
          />
        }
        label={currentLabel}
      >
        <HeaderDropdownOption
          active={!value}
          disabled={updating}
          onClick={() => updateSetting(control.key, false)}
        >
          {t(control.offKey)}
        </HeaderDropdownOption>
        <HeaderDropdownOption
          active={value}
          disabled={updating}
          onClick={() => updateSetting(control.key, true)}
        >
          {t(control.onKey)}
        </HeaderDropdownOption>
      </HeaderDropdown>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {CONTROLS.filter((c) => isWindows || !c.windowsOnly).map(renderControl)}
    </div>
  );
};

export default TranscriptionModeSwitch;

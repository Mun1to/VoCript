import React from "react";
import { useTranslation } from "react-i18next";
import { Mic, Volume2 } from "lucide-react";
import type { AppSettings } from "@/bindings";
import { useSettings } from "../hooks/useSettings";
import { useOsType } from "../hooks/useOsType";

/**
 * Quick "transcription mode" switch shown in the header. For each source
 * (voice / system audio) it flips between **Normal** and **Live** with one
 * click, writing `live_mode` / `live_mode_system` — the same settings the
 * (now removed) toggles in General used. The two keyboard shortcuts are
 * unchanged: this only decides whether each source shows the live capsule.
 *
 * System audio is Windows-only, so that group is hidden elsewhere.
 */
export const TranscriptionModeSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { settings, getSetting, updateSetting, isUpdating } = useSettings();
  const isLight = settings?.theme === "light";
  const isWindows = useOsType() === "windows";

  const renderGroup = (
    settingKey: Extract<keyof AppSettings, "live_mode" | "live_mode_system">,
    Icon: typeof Mic,
    label: string,
  ) => {
    const isLive = (getSetting(settingKey) as boolean) || false;
    const updating = isUpdating(settingKey);

    return (
      <div className="flex items-center gap-1.5" title={label}>
        <Icon
          className={`w-3.5 h-3.5 shrink-0 ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        />
        <div
          className={`flex items-center rounded-lg p-0.5 ${
            isLight ? "bg-slate-100" : "bg-white/[0.06]"
          } ${updating ? "opacity-50" : ""}`}
        >
          {[false, true].map((live) => {
            const active = isLive === live;
            return (
              <button
                key={live ? "live" : "normal"}
                type="button"
                disabled={updating}
                onClick={() => updateSetting(settingKey, live)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors ${
                  active
                    ? "bg-blue-600 text-white shadow-[0_0_8px_rgba(37,99,235,0.4)]"
                    : isLight
                      ? "text-slate-500 hover:text-slate-800"
                      : "text-slate-400 hover:text-slate-200"
                } ${updating ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                {t(live ? "header.mode.live" : "header.mode.normal")}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div data-tour="live-mode" className="flex items-center gap-3">
      {renderGroup("live_mode", Mic, t("header.mode.voice"))}
      {isWindows &&
        renderGroup("live_mode_system", Volume2, t("header.mode.system"))}
    </div>
  );
};

export default TranscriptionModeSwitch;

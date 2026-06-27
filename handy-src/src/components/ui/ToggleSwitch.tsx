import React from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer } from "./SettingContainer";
import { useSettings } from "../../hooks/useSettings";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  label: string;
  description: string;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isUpdating = false,
  label,
  description,
  descriptionMode = "tooltip",
  grouped = false,
  tooltipPosition = "top",
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const isLight = settings?.theme === "light";

  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      tooltipPosition={tooltipPosition}
    >
      <div className="flex items-center gap-3 select-none">
        <span
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
            checked
              ? isLight
                ? "text-blue-600 font-mono"
                : "text-blue-400 font-mono"
              : isLight
                ? "text-slate-400 font-mono"
                : "text-slate-500 font-mono opacity-60"
          }`}
        >
          {checked ? t("common.enabled", "ON") : t("common.disabled", "OFF")}
        </span>
        <label
          className={`relative inline-flex items-center ${disabled || isUpdating ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            className="sr-only peer"
            checked={checked}
            disabled={disabled || isUpdating}
            onChange={(e) => onChange(e.target.checked)}
          />
          <div
            className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${
              isLight
                ? "bg-slate-200 border border-slate-300 peer-checked:border-blue-600 shadow-inner"
                : "bg-slate-800/80 border border-white/10 peer-checked:shadow-[0_0_12px_rgba(59,130,246,0.5)]"
            }`}
          ></div>
        </label>
      </div>
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </SettingContainer>
  );
};

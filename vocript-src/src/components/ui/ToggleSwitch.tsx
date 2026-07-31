import React from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer } from "./SettingContainer";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  label: React.ReactNode;
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
  const isLight = useResolvedTheme() === "light";

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
        {/* In the row, to the left of the label. It used to be an overlay
            covering the whole setting, which printed the spinner on top of the
            ON/OFF text. */}
        {isUpdating && (
          <div className="w-3.5 h-3.5 shrink-0 border-2 border-logo-primary border-t-transparent rounded-full animate-spin" />
        )}
        <span
          className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
            checked
              ? isLight
                ? "text-logo-primary font-mono"
                : "text-logo-primary font-mono"
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
            className={`w-11 h-6 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-logo-primary ${
              isLight
                ? "bg-slate-200 border border-slate-300 peer-checked:border-logo-primary shadow-inner"
                : "bg-slate-800/80 border border-white/10 peer-checked:shadow-[0_0_12px_var(--color-logo-glow)]"
            }`}
          ></div>
        </label>
      </div>
    </SettingContainer>
  );
};

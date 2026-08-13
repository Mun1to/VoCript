import React, { useEffect, useId } from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer } from "./SettingContainer";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";
import { useSettingsGroup } from "./SettingsGroup";

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
  descriptionMode,
  grouped = false,
  tooltipPosition = "top",
}) => {
  const isLight = useResolvedTheme() === "light";

  // Tell the enclosing block whether we're on, so its header can summarise
  // "1 of 2 on". Does nothing when there's no group around us.
  const grupo = useSettingsGroup();
  const idInterruptor = useId();
  useEffect(() => {
    if (!grupo) return;
    grupo.informar(idInterruptor, checked);
    return () => grupo.olvidar(idInterruptor);
  }, [grupo, idInterruptor, checked]);

  return (
    <SettingContainer
      title={label}
      description={description}
      descriptionMode={descriptionMode}
      grouped={grouped}
      disabled={disabled}
      tooltipPosition={tooltipPosition}
    >
      {/* No ON/OFF caption next to it any more: the switch already says which
          way it is, and printing the word again put a second, louder label on
          every single row. */}
      <div className="flex items-center gap-2.5 select-none">
        {isUpdating && (
          <div className="w-3.5 h-3.5 shrink-0 border-2 border-logo-primary border-t-transparent rounded-full animate-spin" />
        )}
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
            className={`h-[19px] w-[34px] rounded-full transition-colors after:absolute after:top-[2px] after:left-[2px] after:h-[15px] after:w-[15px] after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:bg-logo-primary peer-checked:after:translate-x-[15px] ${
              isLight ? "bg-slate-900/[0.16]" : "bg-white/[0.16]"
            }`}
          ></div>
        </label>
      </div>
    </SettingContainer>
  );
};

import React from "react";
import { useTranslation } from "react-i18next";
import { Briefcase } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import { HeaderDropdown, HeaderDropdownOption } from "./ui/HeaderDropdown";

/**
 * Professional-profile selector shown in the header. Picking a profile writes
 * `work_profile` (null = "normal"). The profile adds a voice→symbol command
 * layer on top of the always-on personal dictionary:
 *   - normal  → nothing extra
 *   - coding  → built-in code symbols (arroba→@, punto y coma→;, …)
 *   - custom  → the user's own commands (`custom_profile_commands`)
 */
const PROFILES = [
  { value: "normal", labelKey: "header.profile.normal" },
  { value: "coding", labelKey: "header.profile.coding" },
  { value: "custom", labelKey: "header.profile.custom" },
] as const;

export const ProfileSelect: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const isLight = useResolvedTheme() === "light";
  const current = settings?.work_profile ?? "normal";

  const currentLabel = t(
    PROFILES.find((p) => p.value === current)?.labelKey ??
      "header.profile.normal",
  );

  return (
    <HeaderDropdown
      dataTour="header-profile"
      tooltip={t("header.profile.label")}
      icon={
        <Briefcase
          className={`w-3.5 h-3.5 shrink-0 ${
            isLight ? "text-slate-500" : "text-slate-400"
          }`}
        />
      }
      label={currentLabel}
    >
      {PROFILES.map((p) => (
        <HeaderDropdownOption
          key={p.value}
          active={p.value === current}
          onClick={() =>
            updateSetting("work_profile", p.value === "normal" ? null : p.value)
          }
        >
          {t(p.labelKey)}
        </HeaderDropdownOption>
      ))}
    </HeaderDropdown>
  );
};

export default ProfileSelect;

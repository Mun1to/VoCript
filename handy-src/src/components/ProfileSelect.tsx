import React from "react";
import { useTranslation } from "react-i18next";
import { Briefcase } from "lucide-react";
import { useSettings } from "../hooks/useSettings";

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
  const isLight = settings?.theme === "light";
  const current = settings?.work_profile ?? "normal";

  const handleChange = (value: string) => {
    updateSetting("work_profile", value === "normal" ? null : value);
  };

  return (
    <div
      className="flex items-center gap-1.5"
      title={t("header.profile.label")}
    >
      <Briefcase
        className={`w-3.5 h-3.5 shrink-0 ${
          isLight ? "text-slate-500" : "text-slate-400"
        }`}
      />
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        className={`bg-transparent text-xs font-bold focus:outline-none cursor-pointer py-1 px-1.5 rounded-lg transition-colors ${
          isLight
            ? "text-blue-600 hover:bg-slate-100"
            : "text-blue-400 hover:bg-white/[0.06]"
        }`}
      >
        {PROFILES.map((p) => (
          <option
            key={p.value}
            value={p.value}
            className={
              isLight
                ? "bg-white text-slate-900"
                : "bg-[#141620] text-slate-200"
            }
          >
            {t(p.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
};

export default ProfileSelect;

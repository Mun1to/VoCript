import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@/bindings";
import HandyTextLogo from "../icons/HandyTextLogo";
import { useSettings } from "../../hooks/useSettings";
import { WORK_PROFILES } from "../../lib/constants/workProfiles";

interface ProfileSelectionProps {
  onComplete: () => void;
}

/**
 * Onboarding step shown right after model download: pick a "work profile" that
 * configures VoCript for your use case with one tap. "Custom" applies nothing.
 */
const ProfileSelection: React.FC<ProfileSelectionProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const { updateSetting } = useSettings();
  const [applying, setApplying] = useState<string | null>(null);

  const applyProfile = async (id: string, settings: Partial<AppSettings>) => {
    if (applying) return;
    setApplying(id);
    try {
      for (const [key, value] of Object.entries(settings)) {
        await updateSetting(key as keyof AppSettings, value as never);
      }
      await updateSetting("work_profile", id === "custom" ? null : id);
    } catch (error) {
      console.error("Failed to apply work profile:", error);
    }
    // App handles the cross-dissolve into the guided tour.
    onComplete();
  };

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header — fixed at the top. */}
      <div className="flex flex-col items-center gap-1.5 px-6 pt-6 pb-4 shrink-0">
        <HandyTextLogo width={148} />
        <h1 className="text-xl font-semibold mt-1">
          {t("onboarding.profiles.title")}
        </h1>
        <p className="text-text/70 max-w-md text-center text-sm">
          {t("onboarding.profiles.subtitle")}
        </p>
      </div>

      {/* Profile cards — scroll here if they don't all fit. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6">
        <div className="max-w-2xl w-full mx-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
          {WORK_PROFILES.map((profile, i) => (
            <button
              key={profile.id}
              type="button"
              disabled={applying !== null}
              onClick={() => applyProfile(profile.id, profile.settings)}
              style={{ animationDelay: `${i * 55}ms` }}
              className={`group vc-rise-in flex flex-col items-start gap-1.5 text-start rounded-xl border bg-mid-gray/5 p-4 transition-colors duration-200 hover:border-logo-primary/60 hover:bg-mid-gray/10 disabled:opacity-50 ${
                applying === profile.id
                  ? "border-logo-primary"
                  : "border-mid-gray/20"
              }`}
            >
              <span className="flex items-center gap-2.5 text-lg font-semibold">
                <span className="text-2xl leading-none">{profile.emoji}</span>
                {t(`onboarding.profiles.${profile.id}.label`)}
              </span>
              <span className="text-sm text-text/70">
                {t(`onboarding.profiles.${profile.id}.description`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* "I'll set it up myself" — pinned at the bottom, always visible. */}
      <div className="shrink-0 px-6 pt-3 pb-6 border-t border-mid-gray/10">
        <div className="max-w-2xl w-full mx-auto">
          <button
            type="button"
            disabled={applying !== null}
            onClick={() => applyProfile("custom", {})}
            className="w-full rounded-xl border border-dashed border-mid-gray/30 p-3 text-sm text-text/70 transition-colors hover:bg-mid-gray/10 disabled:opacity-50"
          >
            {t("onboarding.profiles.custom.label")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileSelection;

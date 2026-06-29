import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Coffee, Heart } from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { AppDataDirectory } from "../AppDataDirectory";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { LogDirectory } from "../debug";

const BMC_URL = "https://buymeacoffee.com/munito";
const HANDY_DONATE_URL = "https://handy.computer/donate";
const VOCRIPT_REPO_URL = "https://github.com/Mun1to/VoCript";

export const AboutSettings: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.about.title")}>
        <AppLanguageSelector descriptionMode="tooltip" grouped={true} />
        <SettingContainer
          title={t("settings.about.version.title")}
          description={t("settings.about.version.description")}
          grouped={true}
        >
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span className="text-sm font-mono">v{version}</span>
        </SettingContainer>

        <SettingContainer
          title={t("settings.about.supportDevelopment.title")}
          description={t("settings.about.supportDevelopment.description")}
          grouped={true}
          layout="stacked"
          descriptionMode="inline"
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => openUrl(BMC_URL)}
              className="flex items-center gap-2"
            >
              <Coffee className="w-4 h-4" />
              {t("settings.about.supportDevelopment.coffee")}
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => openUrl(HANDY_DONATE_URL)}
              className="flex items-center gap-2"
            >
              <Heart className="w-4 h-4" />
              {t("settings.about.supportDevelopment.handy")}
            </Button>
          </div>
        </SettingContainer>

        <SettingContainer
          title={t("settings.about.sourceCode.title")}
          description={t("settings.about.sourceCode.description")}
          grouped={true}
        >
          <Button
            variant="secondary"
            size="md"
            onClick={() => openUrl(VOCRIPT_REPO_URL)}
          >
            {t("settings.about.sourceCode.button")}
          </Button>
        </SettingContainer>

        <AppDataDirectory descriptionMode="tooltip" grouped={true} />
        <LogDirectory grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.about.acknowledgments.title")}>
        <SettingContainer
          title={t("settings.about.acknowledgments.whisper.title")}
          description={t("settings.about.acknowledgments.whisper.description")}
          grouped={true}
          layout="stacked"
        >
          <div className="text-sm text-mid-gray">
            {t("settings.about.acknowledgments.whisper.details")}
          </div>
        </SettingContainer>

        <SettingContainer
          title={t("settings.about.acknowledgments.handy.title")}
          description={t("settings.about.acknowledgments.handy.description")}
          grouped={true}
          layout="stacked"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openUrl("https://github.com/cjpais/Handy")}
            className="flex items-center gap-2"
          >
            <Heart className="w-3.5 h-3.5" />
            {t("settings.about.acknowledgments.handy.button")}
          </Button>
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};

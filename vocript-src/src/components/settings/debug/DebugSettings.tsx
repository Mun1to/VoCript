import React from "react";
import { useTranslation } from "react-i18next";
import { WordCorrectionThreshold } from "./WordCorrectionThreshold";
import { LogLevelSelector } from "./LogLevelSelector";
import { PasteDelay } from "./PasteDelay";
import { RecordingBuffer } from "./RecordingBuffer";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { AlwaysOnMicrophone } from "../AlwaysOnMicrophone";
import { SoundPicker } from "../SoundPicker";
import { ClamshellMicrophoneSelector } from "../ClamshellMicrophoneSelector";
import { UpdateChecksToggle } from "../UpdateChecksToggle";

export const DebugSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="vc-settings-column space-y-6">
      <SettingsGroup title={t("settings.debug.title")}>
        <LogLevelSelector grouped={true} />
        <UpdateChecksToggle descriptionMode="tooltip" grouped={true} />
        <SoundPicker
          label={t("settings.debug.soundTheme.label")}
          description={t("settings.debug.soundTheme.description")}
        />
        <WordCorrectionThreshold descriptionMode="tooltip" grouped={true} />
        <PasteDelay descriptionMode="tooltip" grouped={true} />
        <RecordingBuffer descriptionMode="tooltip" grouped={true} />
        <AlwaysOnMicrophone descriptionMode="tooltip" grouped={true} />
        <ClamshellMicrophoneSelector descriptionMode="tooltip" grouped={true} />

        {/* Seeing the first run again means pretending to be a fresh install,
            which otherwise takes deleting a key by hand from the webview's
            storage. Useful for us, and for anyone we're walking through a
            problem over a chat window. */}
        <SettingContainer
          title={t("settings.debug.replayFirstRun.title")}
          description={t("settings.debug.replayFirstRun.description")}
          grouped={true}
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              try {
                localStorage.removeItem("vocript_onboarded");
              } catch {
                /* private mode: nothing to remove */
              }
              window.location.reload();
            }}
          >
            {t("settings.debug.replayFirstRun.action")}
          </Button>
        </SettingContainer>
      </SettingsGroup>
    </div>
  );
};

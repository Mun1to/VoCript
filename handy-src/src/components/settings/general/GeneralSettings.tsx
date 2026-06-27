import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { ClipboardOnlyToggle } from "../ClipboardOnlyToggle";
import { LiveModeToggle } from "../LiveModeToggle";
import { LiveCopyToggle } from "../LiveCopyToggle";
import { SourceAttribution } from "../SourceAttribution";
import { SystemAudioAppSelector } from "../SystemAudioAppSelector";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { MuteWhileRecording } from "../MuteWhileRecording";
import { ModelSettingsCard } from "./ModelSettingsCard";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  let isLinux = false;
  let isWindows = true;
  try {
    isLinux = type() === "linux";
    isWindows = type() === "windows";
  } catch {
    // browser fallback
  }
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.general.title")}>
        <div data-tour="shortcut-transcribe">
          <ShortcutInput shortcutId="transcribe" grouped={true} />
        </div>
        <div data-tour="shortcut-system">
          <ShortcutInput shortcutId="transcribe_system" grouped={true} />
        </div>
        {isWindows && (
          <SystemAudioAppSelector descriptionMode="tooltip" grouped={true} />
        )}
        {isWindows && (
          <SourceAttribution descriptionMode="tooltip" grouped={true} />
        )}
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        <ClipboardOnlyToggle descriptionMode="tooltip" grouped={true} />
        <div data-tour="live-mode">
          <LiveModeToggle
            variant="voice"
            descriptionMode="tooltip"
            grouped={true}
          />
        </div>
        {isWindows && (
          <LiveModeToggle
            variant="system"
            descriptionMode="tooltip"
            grouped={true}
          />
        )}
        <LiveCopyToggle descriptionMode="tooltip" grouped={true} />
        {/* Cancel shortcut is hidden with push-to-talk (release key cancels) and on Linux (dynamic shortcut instability) */}
        {!isLinux && !pushToTalk && (
          <ShortcutInput shortcutId="cancel" grouped={true} />
        )}
      </SettingsGroup>
      <ModelSettingsCard />
      <SettingsGroup title={t("settings.sound.title")}>
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <MuteWhileRecording descriptionMode="tooltip" grouped={true} />
        <AudioFeedback descriptionMode="tooltip" grouped={true} />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          grouped={true}
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>
    </div>
  );
};

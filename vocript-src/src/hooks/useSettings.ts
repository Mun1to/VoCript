import { useEffect, useMemo } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { AppSettings as Settings, AudioDevice } from "@/bindings";

interface UseSettingsReturn {
  // State
  settings: Settings | null;
  isLoading: boolean;
  isUpdating: (key: string) => boolean;
  audioDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  audioFeedbackEnabled: boolean;
  postProcessModelOptions: Record<string, string[]>;

  // Actions
  updateSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>;
  resetSetting: (key: keyof Settings) => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshAudioDevices: () => Promise<void>;
  refreshOutputDevices: () => Promise<void>;

  // Binding-specific actions
  updateBinding: (id: string, binding: string) => Promise<void>;
  resetBinding: (id: string) => Promise<void>;

  // Convenience getters
  getSetting: <K extends keyof Settings>(key: K) => Settings[K] | undefined;

  // Post-processing helpers
  setPostProcessProvider: (providerId: string) => Promise<void>;
  updatePostProcessBaseUrl: (
    providerId: string,
    baseUrl: string,
  ) => Promise<void>;
  updatePostProcessApiKey: (
    providerId: string,
    apiKey: string,
  ) => Promise<void>;
  updatePostProcessModel: (providerId: string, model: string) => Promise<void>;
  fetchPostProcessModels: (providerId: string) => Promise<string[]>;
}

export const useSettings = (): UseSettingsReturn => {
  // Deliberately one selector per slice rather than `useSettingsStore()`.
  // Subscribing to the whole store re-rendered every consumer — and there are
  // ~66 of them — on any change at all, including slices they never read.
  //
  // The actions are stable references, so selecting them adds no subscription
  // cost; only the five state slices below can actually trigger a re-render.
  const settings = useSettingsStore((s) => s.settings);
  const isLoading = useSettingsStore((s) => s.isLoading);
  const audioDevices = useSettingsStore((s) => s.audioDevices);
  const outputDevices = useSettingsStore((s) => s.outputDevices);
  const postProcessModelOptions = useSettingsStore(
    (s) => s.postProcessModelOptions,
  );
  // isUpdatingKey reads the isUpdating record at call time, so consumers only
  // see fresh values if we also subscribe to the record itself.
  useSettingsStore((s) => s.isUpdating);

  const initialize = useSettingsStore((s) => s.initialize);
  const isUpdatingKey = useSettingsStore((s) => s.isUpdatingKey);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const resetSetting = useSettingsStore((s) => s.resetSetting);
  const refreshSettings = useSettingsStore((s) => s.refreshSettings);
  const refreshAudioDevices = useSettingsStore((s) => s.refreshAudioDevices);
  const refreshOutputDevices = useSettingsStore((s) => s.refreshOutputDevices);
  const updateBinding = useSettingsStore((s) => s.updateBinding);
  const resetBinding = useSettingsStore((s) => s.resetBinding);
  const getSetting = useSettingsStore((s) => s.getSetting);
  const setPostProcessProvider = useSettingsStore(
    (s) => s.setPostProcessProvider,
  );
  const updatePostProcessBaseUrl = useSettingsStore(
    (s) => s.updatePostProcessBaseUrl,
  );
  const updatePostProcessApiKey = useSettingsStore(
    (s) => s.updatePostProcessApiKey,
  );
  const updatePostProcessModel = useSettingsStore(
    (s) => s.updatePostProcessModel,
  );
  const fetchPostProcessModels = useSettingsStore(
    (s) => s.fetchPostProcessModels,
  );

  // Initialize on first mount
  useEffect(() => {
    if (isLoading) {
      initialize();
    }
  }, [initialize, isLoading]);

  // Memoised so consumers that put this object (or anything off it) in a
  // dependency array are not re-triggered on every render.
  return useMemo(
    () => ({
      settings,
      isLoading,
      isUpdating: isUpdatingKey,
      audioDevices,
      outputDevices,
      audioFeedbackEnabled: settings?.audio_feedback || false,
      postProcessModelOptions,
      updateSetting,
      resetSetting,
      refreshSettings,
      refreshAudioDevices,
      refreshOutputDevices,
      updateBinding,
      resetBinding,
      getSetting,
      setPostProcessProvider,
      updatePostProcessBaseUrl,
      updatePostProcessApiKey,
      updatePostProcessModel,
      fetchPostProcessModels,
    }),
    [
      settings,
      isLoading,
      isUpdatingKey,
      audioDevices,
      outputDevices,
      postProcessModelOptions,
      updateSetting,
      resetSetting,
      refreshSettings,
      refreshAudioDevices,
      refreshOutputDevices,
      updateBinding,
      resetBinding,
      getSetting,
      setPostProcessProvider,
      updatePostProcessBaseUrl,
      updatePostProcessApiKey,
      updatePostProcessModel,
      fetchPostProcessModels,
    ],
  );
};

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Info, Loader2, Mic, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { Button } from "../ui/Button";
import { useSettings } from "../../hooks/useSettings";

interface WakeWordProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

/**
 * Hands-free activation, plus the way to make it actually work.
 *
 * Speech models have never seen "VoCript" and write it differently every time —
 * captured for real: "Ball Crypto", "All crypt", "Bocrypt", sometimes nothing at
 * all. Guessing every spelling is a losing game, so the user says the word a few
 * times and the app stores whatever *their* model produces. That sample is then
 * what it listens for, tuned to their voice, accent, microphone and model.
 */
export const WakeWord: React.FC<WakeWordProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const [capturing, setCapturing] = useState(false);
    const [recordings, setRecordings] = useState(0);

    const enabled = getSetting("wake_word_enabled") ?? false;

    useEffect(() => {
      void commands.countWakeWordRecordings().then(setRecordings);
    }, []);

    const teach = async () => {
      setCapturing(true);
      try {
        const result = await commands.captureWakeWordSample();
        if (result.status === "ok") {
          setRecordings(Number(result.data));
          toast.success(t("settings.general.wakeWord.captured"));
        } else {
          // The backend returns a key for the errors a user can act on, and a
          // plain message for the ones only a developer can (device failures).
          toast.error(
            result.error.startsWith("wakeWord.errors.")
              ? t(`settings.general.${result.error}`)
              : result.error,
          );
        }
      } finally {
        setCapturing(false);
      }
    };

    const forget = async () => {
      const result = await commands.clearWakeWordRecordings();
      if (result.status === "ok") {
        setRecordings(0);
        // The backend clears the taught text with the recordings; this keeps
        // the local settings store in step without waiting for its event.
        updateSetting("wake_word_samples", []);
        toast.success(t("settings.general.wakeWord.forgotten"));
      } else {
        toast.error(result.error);
      }
    };

    return (
      <>
        <ToggleSwitch
          checked={enabled}
          onChange={(value) => updateSetting("wake_word_enabled", value)}
          isUpdating={isUpdating("wake_word_enabled")}
          label={
            <span className="inline-flex items-center gap-2">
              {t("settings.general.wakeWord.label")}
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                {t("settings.general.wakeWord.beta")}
              </span>
            </span>
          }
          description={t("settings.general.wakeWord.description")}
          descriptionMode={descriptionMode}
          grouped={grouped}
        />

        {enabled && (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <div className="flex flex-col gap-3 rounded-lg border border-mid-gray/20 bg-mid-gray/5 px-3 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-logo-primary" />
                  <p className="text-xs leading-relaxed text-text/60">
                    {recordings === 0
                      ? t("settings.general.wakeWord.teachPrompt")
                      : t("settings.general.wakeWord.taught", {
                          count: recordings,
                        })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {recordings > 0 && (
                    <Button variant="ghost" size="sm" onClick={forget}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={teach}
                    disabled={capturing}
                    className="flex items-center gap-1.5"
                  >
                    {capturing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                    {capturing
                      ? t("settings.general.wakeWord.listening")
                      : t("settings.general.wakeWord.teach")}
                  </Button>
                </div>
              </div>

              {/* One dot per recording. There is no text to show: the app keeps
                  the sound, not what the model made of it. */}
              {recordings > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 ps-6">
                  {Array.from({ length: recordings }, (_, index) => (
                    <span
                      key={index}
                      className="flex items-center gap-1 rounded-md bg-logo-primary/10 px-2 py-0.5 text-[11px] text-text/70"
                    >
                      <Check className="h-3 w-3 text-logo-primary" />
                      {index + 1}
                    </span>
                  ))}
                  {recordings < 3 && (
                    <span className="text-[11px] text-amber-500/80">
                      {t("settings.general.wakeWord.needMore")}
                    </span>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs leading-relaxed text-text/45">
              {t("settings.general.wakeWord.hint")}
            </p>
          </div>
        )}
      </>
    );
  },
);

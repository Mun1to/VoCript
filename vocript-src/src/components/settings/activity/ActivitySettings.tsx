import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flame, Gauge, Timer, Type } from "lucide-react";
import { toast } from "sonner";
import { commands, type DictationStats } from "@/bindings";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";
import { ActivityHeatmap } from "./ActivityHeatmap";

interface SummaryCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  icon,
  value,
  label,
  hint,
}) => (
  <div className="flex flex-col gap-1 rounded-xl border-2 border-mid-gray/20 px-4 py-3">
    <span className="flex items-center gap-1.5 text-xs font-medium text-text/60">
      <span className="text-logo-primary">{icon}</span>
      {label}
    </span>
    <span className="text-xl font-bold text-text tabular-nums">{value}</span>
    {hint && <span className="text-[11px] text-text/45">{hint}</span>}
  </div>
);

/**
 * "Activity" section: how much the user has actually dictated, as a calendar
 * heatmap plus the four numbers that make the habit visible. Everything is
 * computed from local counters — see src-tauri/src/managers/stats.rs.
 */
export const ActivitySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();
  const [stats, setStats] = useState<DictationStats | null>(null);
  const [typingWpm, setTypingWpm] = useState(40);

  const trackingEnabled = getSetting("track_dictation_stats") ?? true;

  const load = useCallback(async () => {
    setStats(await commands.getDictationStats());
  }, []);

  useEffect(() => {
    void load();
    void commands.getTypingWpmBaseline().then(setTypingWpm);
  }, [load]);

  const handleReset = async () => {
    const result = await commands.resetDictationStats();
    if (result.status === "ok") {
      await load();
      toast.success(t("activity.reset.done"));
    } else {
      toast.error(result.error);
    }
  };

  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(Math.round(value));

  /** "3 h 24 min", dropping the hours when there are none. */
  const duration = (seconds: number): string => {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return t("activity.minutesShort", { count: minutes });
    return `${t("activity.hoursShort", { count: hours })} ${t(
      "activity.minutesShort",
      { count: minutes },
    )}`;
  };

  const totalWords = stats?.total_words ?? 0;
  const totalSeconds = stats?.total_seconds ?? 0;
  // Time saved = what typing those words would have cost, minus what dictating
  // them actually cost. Never negative: dictation slower than typing is a
  // measurement artefact of very short clips, not a loss worth showing.
  const savedSeconds = Math.max(
    0,
    (totalWords / typingWpm) * 60 - totalSeconds,
  );
  const averageWpm = totalSeconds > 0 ? totalWords / (totalSeconds / 60) : 0;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("activity.title")}>
        <div className="flex flex-col gap-5 p-5">
          <p className="text-sm text-text/70">{t("activity.subtitle")}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              icon={<Type className="h-3.5 w-3.5" />}
              value={number(totalWords)}
              label={t("activity.cards.words")}
            />
            <SummaryCard
              icon={<Timer className="h-3.5 w-3.5" />}
              value={duration(savedSeconds)}
              label={t("activity.cards.timeSaved")}
              hint={t("activity.cards.timeSavedHint", { wpm: typingWpm })}
            />
            <SummaryCard
              icon={<Gauge className="h-3.5 w-3.5" />}
              value={number(averageWpm)}
              label={t("activity.cards.speed")}
              hint={t("activity.cards.speedHint")}
            />
            <SummaryCard
              icon={<Flame className="h-3.5 w-3.5" />}
              value={t("activity.dayCount", {
                count: stats?.current_streak ?? 0,
              })}
              label={t("activity.cards.streak")}
              hint={
                stats?.longest_streak
                  ? t("activity.cards.streakHint", {
                      count: stats.longest_streak,
                    })
                  : undefined
              }
            />
          </div>

          {totalWords === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-mid-gray/20 px-4 py-6 text-center text-sm text-text/50">
              {trackingEnabled
                ? t("activity.empty")
                : t("activity.emptyDisabled")}
            </p>
          ) : (
            <ActivityHeatmap days={stats?.days ?? []} />
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("activity.privacy.title")}>
        <div className="flex flex-col">
          <ToggleSwitch
            checked={trackingEnabled}
            onChange={(enabled) =>
              updateSetting("track_dictation_stats", enabled)
            }
            isUpdating={isUpdating("track_dictation_stats")}
            label={t("activity.privacy.label")}
            description={t("activity.privacy.description")}
            descriptionMode="inline"
            grouped
          />
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-text">
                {t("activity.reset.label")}
              </span>
              <span className="text-xs text-text/60">
                {t("activity.reset.description")}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              disabled={totalWords === 0}
            >
              {t("activity.reset.action")}
            </Button>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};

export default ActivitySettings;

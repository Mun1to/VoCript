import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flame, Mic } from "lucide-react";
import {
  commands,
  events,
  type DictationStats,
  type HistoryEntry,
  type ModelInfo,
} from "@/bindings";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";
import {
  useDictationState,
  METER_BARS,
  type DictationState,
} from "../../hooks/useDictationState";
import { formatKeyCombination } from "../../lib/utils/keyboard";
import { formatRelativeTime } from "../../utils/dateFormat";
import { countWords } from "../../lib/utils/text";
import { ActivityHeatmap } from "../settings/activity/ActivityHeatmap";
import type { SidebarSection } from "../Sidebar";

/** How many past dictations the "last thing you dictated" panel lists. */
const RECENT_COUNT = 3;

/** The lowest a meter bar goes, so the row reads as a meter even in silence. */
const BAR_FLOOR = 12;

/**
 * Which of the four state colours applies. Live and recording are the same
 * thing as far as the ring is concerned: the microphone is open.
 */
const COLOUR_OF: Record<DictationState, string> = {
  idle: "var(--vc-state-idle)",
  recording: "var(--vc-state-listening)",
  live: "var(--vc-state-listening)",
  transcribing: "var(--vc-state-working)",
  processing: "var(--vc-state-working)",
  copied: "var(--vc-state-done)",
};

interface TodayScreenProps {
  /** Optional so the screen can also be mounted from SECTIONS_CONFIG, which
   *  renders components with no props. App.tsx always passes it. */
  onNavigate?: (section: SidebarSection) => void;
}

/**
 * The home screen: what the app is doing right now, how much you've dictated,
 * what the engine is up to, and the last few things you said. Every number
 * here already existed somewhere in the app — the point is that you see them
 * without having to go looking through four sections.
 */
export const TodayScreen: React.FC<TodayScreenProps> = ({ onNavigate }) => {
  const { t, i18n } = useTranslation();
  const { settings, getSetting } = useSettings();
  const osType = useOsType();
  const { state, levels } = useDictationState();

  const [stats, setStats] = useState<DictationStats | null>(null);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [engine, setEngine] = useState<{
    loaded: boolean;
    modelId: string | null;
    lastMs: number | null;
  } | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await commands.getDictationStats());
    } catch (e) {
      console.warn("Today: failed to load dictation stats", e);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    try {
      const result = await commands.getHistoryEntries(null, RECENT_COUNT);
      if (result.status === "ok") setRecent(result.data.entries);
    } catch (e) {
      console.warn("Today: failed to load recent dictations", e);
    }
  }, []);

  const loadEngine = useCallback(async () => {
    try {
      const result = await commands.getModelLoadStatus();
      if (result.status === "ok") {
        setEngine({
          loaded: result.data.is_loaded,
          modelId: result.data.current_model,
          lastMs: result.data.last_transcription_ms,
        });
      }
    } catch (e) {
      console.warn("Today: failed to read engine status", e);
    }
  }, []);

  useEffect(() => {
    void loadStats();
    void loadRecent();
    void loadEngine();
    void commands.getAvailableModels().then((result) => {
      if (result.status === "ok") setModels(result.data);
    });
  }, [loadStats, loadRecent, loadEngine]);

  // A finished dictation changes all three panels at once, so refresh when the
  // state falls back to idle rather than polling on a timer: the screen is
  // stale for exactly as long as nothing is happening, which is never.
  useEffect(() => {
    if (state !== "idle") return;
    void loadStats();
    void loadEngine();
  }, [state, loadStats, loadEngine]);

  // The history list has its own event, which also covers entries deleted or
  // renamed from the History section while this screen is open.
  useEffect(() => {
    const pending = events.historyUpdatePayload.listen(() => void loadRecent());
    return () => {
      pending.then((off) => off()).catch(() => {});
    };
  }, [loadRecent]);

  const modelName = useMemo(() => {
    const id = engine?.modelId ?? getSetting("selected_model");
    if (!id) return null;
    return models.find((m) => m.id === id)?.name ?? id;
  }, [engine?.modelId, getSetting, models]);

  const modelSize = useMemo(() => {
    const id = engine?.modelId;
    if (!id) return null;
    return models.find((m) => m.id === id)?.size_mb ?? null;
  }, [engine?.modelId, models]);

  const shortcut = formatKeyCombination(
    settings?.bindings?.transcribe?.current_binding ?? "",
    osType,
  );
  const cancelKey = formatKeyCombination(
    settings?.bindings?.cancel?.current_binding ?? "",
    osType,
  );
  const pushToTalk = getSetting("push_to_talk") ?? false;

  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(Math.round(value));

  /** Headline and hint for the ring, in the user's own terms. */
  const statusText = (): { title: string; hint: string } => {
    switch (state) {
      case "recording":
        return {
          title: t("today.status.listening.title"),
          hint: pushToTalk
            ? t("today.status.listening.hintHold", { cancel: cancelKey })
            : t("today.status.listening.hintToggle", {
                shortcut,
                cancel: cancelKey,
              }),
        };
      case "live":
        return {
          title: t("today.status.live.title"),
          hint: t("today.status.live.hint"),
        };
      case "transcribing":
      case "processing":
        return {
          title: t("today.status.working.title"),
          hint: modelName
            ? t("today.status.working.hint", { model: modelName })
            : t("today.status.working.hintNoModel"),
        };
      case "copied":
        return {
          title:
            (getSetting("clipboard_only") ?? false)
              ? t("today.status.done.titleCopied")
              : t("today.status.done.title"),
          hint: t("today.status.done.hint"),
        };
      default:
        return {
          title: t("today.status.idle.title"),
          hint: pushToTalk
            ? t("today.status.idle.hintHold", { shortcut })
            : t("today.status.idle.hintToggle", { shortcut }),
        };
    }
  };

  const { title, hint } = statusText();
  const totalWords = stats?.total_words ?? 0;
  const streak = stats?.current_streak ?? 0;

  /** The month the counting started, for "…since March". */
  const firstMonth = useMemo(() => {
    const first = stats?.days?.[0]?.day;
    if (!first) return null;
    // `day` is YYYY-MM-DD; parsed as-is it would be read as UTC midnight and
    // could land on the previous month for anyone behind UTC.
    const [y, m, d] = first.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d).toLocaleDateString(i18n.language, {
      month: "long",
    });
  }, [stats?.days, i18n.language]);

  const unloadLabel = useMemo(() => {
    // The stored value has no underscore ("min5"); the generated type spells it
    // "min_5". Strip them so the label is right whichever one arrives.
    const raw = String(getSetting("model_unload_timeout") ?? "min5").replace(
      /_/g,
      "",
    );
    return t(`settings.advanced.modelUnload.options.${raw}`, {
      defaultValue: raw,
    });
  }, [getSetting, t]);

  return (
    <div className="vc-today">
      <div
        className="vc-today-grid"
        style={{ ["--vc-state" as string]: COLOUR_OF[state] }}
      >
        {/* What's happening right now */}
        <div className="vc-panel vc-panel-wide flex items-center gap-5 p-5">
          <div className="vc-state-ring">
            <Mic width={27} height={27} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-semibold tracking-tight text-[var(--vc-text-main)]">
              {title}
            </div>
            <div className="text-[13.5px] text-[var(--vc-text-muted)]">
              {hint}
            </div>
          </div>
          <div className="vc-meter" aria-hidden="true">
            {Array.from({ length: METER_BARS }, (_, i) => (
              <i
                key={i}
                style={{
                  height: `${Math.max(BAR_FLOOR, Math.min(100, (levels[i] ?? 0) * 100))}%`,
                }}
              />
            ))}
          </div>
        </div>

        {/* How much you've dictated. Full width: a year of squares in half a
            column comes out at 6px a cell, more gap than square. */}
        <div className="vc-panel vc-panel-wide">
          <h3 className="vc-panel-title">{t("today.dictated.title")}</h3>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums text-[var(--vc-text-main)]">
                {number(totalWords)}
              </div>
              <div className="text-[12.5px] text-[var(--vc-text-muted)]">
                {firstMonth
                  ? t("today.dictated.wordsSince", { month: firstMonth })
                  : t("today.dictated.words")}
              </div>
            </div>
            <div className="text-end">
              <div className="inline-flex items-center gap-2.5 text-[28px] font-semibold leading-tight tracking-tight tabular-nums text-[var(--vc-text-main)]">
                <Flame
                  width={24}
                  height={24}
                  className="shrink-0 text-accent"
                />
                {t("activity.dayCount", { count: streak })}
              </div>
              <div className="text-[12.5px] text-[var(--vc-text-muted)]">
                {/* "your best streak, 0" is a strange thing to tell someone who
                    hasn't dictated yet, so the tail only shows once there is
                    a streak to brag about. */}
                {stats?.longest_streak
                  ? t("today.dictated.streakHint", {
                      count: stats.longest_streak,
                    })
                  : t("today.dictated.streakHintNone")}
              </div>
            </div>
          </div>
          <div className="mt-3">
            {totalWords === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-mid-gray/20 px-4 py-6 text-center text-sm text-[var(--vc-text-muted)]">
                {t("activity.empty")}
              </p>
            ) : (
              <ActivityHeatmap days={stats?.days ?? []} />
            )}
          </div>
        </div>

        {/* The engine */}
        <div className="vc-panel">
          <h3 className="vc-panel-title">{t("today.engine.title")}</h3>
          <dl className="vc-panel-list text-[13px]">
            <Row
              label={t("today.engine.model")}
              value={modelName ?? t("today.engine.noModel")}
            />
            <Row
              label={t("today.engine.memory")}
              value={
                engine?.loaded
                  ? modelSize
                    ? t("today.engine.loadedSize", { mb: number(modelSize) })
                    : t("today.engine.loaded")
                  : t("today.engine.unloaded")
              }
            />
            <Row label={t("today.engine.unloadsAfter")} value={unloadLabel} />
            <Row
              label={t("today.engine.lastRun")}
              value={
                engine?.lastMs
                  ? t("today.engine.seconds", {
                      seconds: new Intl.NumberFormat(i18n.language, {
                        maximumFractionDigits: 1,
                      }).format(engine.lastMs / 1000),
                    })
                  : t("today.engine.noneYet")
              }
            />
          </dl>
        </div>

        {/* The last few things you said */}
        <div className="vc-panel">
          <h3 className="vc-panel-title">{t("today.latest.title")}</h3>
          {recent.length === 0 ? (
            <p className="py-4 text-[13px] text-[var(--vc-text-muted)]">
              {t("today.latest.empty")}
            </p>
          ) : (
            <>
              <ul className="vc-panel-list">
                {recent.map((entry) => {
                  const text =
                    entry.post_processed_text ?? entry.transcription_text;
                  return (
                    <li key={entry.id} className="min-w-0">
                      <div className="line-clamp-2 text-[13px] text-[var(--vc-text-main)]">
                        {text}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-[var(--vc-text-muted)]">
                        {formatRelativeTime(
                          String(entry.timestamp),
                          i18n.language,
                        )}
                        {" · "}
                        {t("activity.wordsOnDay", { count: countWords(text) })}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => onNavigate?.("history")}
                className="mt-3 text-[12px] font-medium text-accent hover:underline"
              >
                {t("today.latest.seeAll")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className="text-[var(--vc-text-muted)]">{label}</dt>
    <dd className="truncate text-end font-medium text-[var(--vc-text-main)]">
      {value}
    </dd>
  </div>
);

export default TodayScreen;

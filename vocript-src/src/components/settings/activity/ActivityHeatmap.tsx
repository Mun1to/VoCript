import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DayStat } from "@/bindings";

interface ActivityHeatmapProps {
  days: DayStat[];
  /** How many days back the grid goes. A year by default. */
  span?: number;
}

const WEEKS_GAP = 3;
/** Width of the weekday initials on the left. */
const RAIL_WIDTH = 14;
/** The legend is outside the fluid grid, so its swatches keep a fixed size. */
const LEGEND_CELL = 10;

/** `YYYY-MM-DD` in local time. `toISOString()` would shift the day in any
 *  timezone behind UTC, landing dictations on the wrong square. */
const localKey = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Calendar heatmap of dictated words, one square per day, newest column on the
 * right. Intensity is relative to the user's own best day: an absolute scale
 * would leave a light dictator's whole year looking empty.
 */
export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  days,
  span = 364,
}) => {
  const { t, i18n } = useTranslation();

  const { columns, monthLabels, max } = useMemo(() => {
    const byDay = new Map(days.map((d) => [d.day, d]));

    const today = new Date();
    today.setHours(12, 0, 0, 0); // Midday: immune to DST shifts.

    // Start on the Monday of the week containing the oldest day shown, so every
    // column is a full week and the weekday rows line up.
    const start = new Date(today);
    start.setDate(start.getDate() - span);
    const weekdayFromMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekdayFromMonday);

    const cols: { key: string; stat: DayStat | undefined; date: Date }[][] = [];
    const labels: { column: number; label: string }[] = [];
    const cursor = new Date(start);
    let peak = 0;
    let lastMonth = -1;

    while (cursor <= today) {
      const week: { key: string; stat: DayStat | undefined; date: Date }[] = [];
      for (let weekday = 0; weekday < 7; weekday++) {
        const date = new Date(cursor);
        const key = localKey(date);
        const stat = date <= today ? byDay.get(key) : undefined;
        if (stat) peak = Math.max(peak, stat.words);
        week.push({ key, stat, date });
        cursor.setDate(cursor.getDate() + 1);
      }
      // Label a column when its first day starts a new month.
      const first = week[0].date;
      if (first.getMonth() !== lastMonth) {
        lastMonth = first.getMonth();
        labels.push({
          column: cols.length,
          label: first.toLocaleDateString(i18n.language, { month: "short" }),
        });
      }
      cols.push(week);
    }

    // A month with only a week or two visible — the first and last of the range
    // — would print its name on top of the next one. Drop those instead.
    const spaced = labels.filter((label, index) => {
      const next = labels[index + 1];
      return !next || next.column - label.column >= 3;
    });

    return { columns: cols, monthLabels: spaced, max: peak };
  }, [days, span, i18n.language]);

  // Five steps: empty, then quartiles of the best day.
  const levelOf = (words: number): number => {
    if (words <= 0 || max <= 0) return 0;
    const ratio = words / max;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  // Level 0 leans on the Tailwind token; the rest tint the accent color so the
  // heatmap follows whatever theme the user picked.
  const classOf = (level: number) =>
    `rounded-[2px] ${level === 0 ? "bg-mid-gray/15" : ""}`;

  const styleOf = (level: number): React.CSSProperties =>
    level === 0
      ? {}
      : {
          backgroundColor: "var(--color-logo-primary)",
          opacity: 0.25 + level * 0.1875,
        };

  const today = localKey(new Date());
  // Comma-separated rather than an array: the translation checker compares
  // plain keys, and a JSON array would slip past it unvalidated.
  const weekdayInitials = t("activity.weekdayInitials").split(",");

  const gridColumns = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
    gap: WEEKS_GAP,
  } as const;

  // One delegated tooltip for the whole grid: a `title` attribute would show the
  // OS tooltip, which is slow to appear and looks like a browser, and 371 React
  // tooltips with their own refs would be wasteful.
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(
    null,
  );

  const handleHover = (event: React.MouseEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-tip]",
    );
    if (!cell) {
      setTip(null);
      return;
    }
    const rect = cell.getBoundingClientRect();
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text: cell.dataset.tip ?? "",
    });
  };

  return (
    <div className="flex w-full flex-col gap-1">
      {/* Month ruler. Positioned in percentages so it tracks the fluid columns. */}
      <div
        className="relative h-4 text-[10px] text-text/45"
        style={{ marginInlineStart: RAIL_WIDTH + WEEKS_GAP }}
      >
        {monthLabels.map(({ column, label }) => (
          <span
            key={`${column}-${label}`}
            className="absolute top-0 whitespace-nowrap"
            style={{ insetInlineStart: `${(column / columns.length) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="flex w-full" style={{ gap: WEEKS_GAP }}>
        {/* Weekday rail: a 7-row grid too, so it lines up with the squares
            however tall they end up. Alternate rows only, like GitHub. */}
        <div
          className="grid shrink-0 text-[10px] text-text/45"
          style={{
            gridTemplateRows: "repeat(7, 1fr)",
            gap: WEEKS_GAP,
            width: RAIL_WIDTH,
          }}
        >
          {weekdayInitials.map((initial, index) => (
            <span
              key={index}
              className="flex items-center justify-end leading-none"
            >
              {index % 2 === 1 ? initial : ""}
            </span>
          ))}
        </div>

        <div
          className="min-w-0 flex-1"
          style={gridColumns}
          onMouseOver={handleHover}
          onMouseLeave={() => setTip(null)}
        >
          {columns.map((week, columnIndex) => (
            <div
              key={columnIndex}
              className="grid"
              style={{ gridTemplateRows: "repeat(7, 1fr)", gap: WEEKS_GAP }}
            >
              {week.map(({ key, stat, date }) => {
                const words = stat?.words ?? 0;
                const isFuture = key > today;
                return (
                  <div
                    key={key}
                    data-tip={
                      isFuture
                        ? undefined
                        : `${date.toLocaleDateString(i18n.language, {
                            day: "numeric",
                            month: "long",
                          })} · ${t("activity.wordsOnDay", { count: words })}`
                    }
                    className={classOf(levelOf(words))}
                    style={{
                      // Square by ratio, not by pixels: the columns stretch
                      // to fill whatever width the window gives us, so a
                      // fixed size is what forced a scrollbar before.
                      aspectRatio: "1",
                      visibility: isFuture ? "hidden" : "visible",
                      ...styleOf(levelOf(words)),
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 self-end text-[10px] text-text/45">
        <span>{t("activity.less")}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={classOf(level)}
            style={{
              width: LEGEND_CELL,
              height: LEGEND_CELL,
              ...styleOf(level),
            }}
          />
        ))}
        <span>{t("activity.more")}</span>
      </div>

      {tip && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border border-mid-gray/40 bg-background px-2.5 py-1.5 text-xs font-medium text-text shadow-xl"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
};

export default ActivityHeatmap;

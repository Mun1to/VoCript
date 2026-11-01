import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Copy, Download, ImagePlus, X } from "lucide-react";
import { commands, type DictationStats } from "@/bindings";
import { Button } from "../ui/Button";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  drawCardBase,
  drawCardLight,
  exportCard,
  heatLevels,
  rarityOf,
  toHex,
  type CardContent,
  type CardLight,
} from "../../lib/shareCard";

/** What the user chose last time, kept in this computer's web storage. */
const STORAGE_KEY = "vocript_share_card";
/** Offered after the app's own accent. */
const OTHER_COLORS = ["#8b5cf6", "#ec4899", "#f97316", "#10b981", "#eab308"];
/** The photo is shrunk to this before it is kept: the card draws it at 40px. */
const PHOTO_SIZE = 160;
/** Anything bigger is not a profile photo, and would only slow the page. */
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
/** How far the card leans towards the pointer, in degrees. */
const TILT = 22;
/** Brand and file name: not UI text, so not translated. */
const SITE = "vocript.app";
const FILE_NAME = "vocript-streak.png";

type Part = "words" | "time" | "best" | "activity";
const PARTS: Part[] = ["words", "time", "best", "activity"];

interface Choices {
  name: string;
  /** `null` follows the app's accent. */
  color: string | null;
  photo: string | null;
  show: Record<Part, boolean>;
}

const DEFAULTS: Choices = {
  name: "",
  color: null,
  photo: null,
  show: { words: true, time: true, best: true, activity: true },
};

const loadChoices = (): Choices => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Choices>;
    return {
      name: typeof saved.name === "string" ? saved.name : "",
      color: typeof saved.color === "string" ? saved.color : null,
      photo:
        typeof saved.photo === "string" && saved.photo.startsWith("data:image/")
          ? saved.photo
          : null,
      show: { ...DEFAULTS.show, ...(saved.show ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
};

const storeChoices = (choices: Choices) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
  } catch {
    // Full or blocked storage only means the card forgets; nothing breaks.
  }
};

/**
 * Picks `_one` or `_other` by hand. The translation files only have those two,
 * and with `count` alone i18next asks Russian, Polish or Arabic for "few" or
 * "many", finds nothing and falls back to English. Here `_other` is written to
 * fit every count that is not "one" in that language.
 */
const usePlural = () => {
  const { t, i18n } = useTranslation();
  return useCallback(
    (key: string, count: number, vars: Record<string, unknown> = {}) => {
      let category = "other";
      try {
        category = new Intl.PluralRules(i18n.language).select(count);
      } catch {
        // An unknown locale code: "other" reads fine for any number.
      }
      return t(`${key}_${category === "one" ? "one" : "other"}`, {
        ...vars,
        count,
      });
    },
    [t, i18n.language],
  );
};

/** Crops the chosen file to a centred square and shrinks it. */
const readPhoto = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (file.size > PHOTO_MAX_BYTES) {
      reject(new Error("too big"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = PHOTO_SIZE;
        canvas.height = PHOTO_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx || side === 0) throw new Error("unreadable");
        ctx.drawImage(
          img,
          (img.naturalWidth - side) / 2,
          (img.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          PHOTO_SIZE,
          PHOTO_SIZE,
        );
        // PNG and not JPEG: a transparent avatar would come out on black.
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        // An SVG that taints the canvas throws here; without this the
        // promise would hang and nobody would hear about it.
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    img.src = url;
  });

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

interface ShareCardDialogProps {
  stats: DictationStats;
  onClose: () => void;
}

/**
 * Your streak as a card to show off: drawn here, customised here, and saved or
 * copied as an image. Nothing is uploaded; the only thing that leaves the
 * computer is the image, and only when the user takes it.
 */
export const ShareCardDialog: React.FC<ShareCardDialogProps> = ({
  stats,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const plural = usePlural();
  const [choices, setChoices] = useState<Choices>(loadChoices);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lightRef = useRef<CardLight>({ x: 0.5, y: 0.3 });
  const hoverRef = useRef(false);
  const frameRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => storeChoices(choices), [choices]);

  const appAccent = useMemo(
    () =>
      toHex(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--color-logo-primary",
        ),
      ),
    [],
  );
  const accent = choices.color ?? appAccent;
  const colors = useMemo(
    () => [
      appAccent,
      ...OTHER_COLORS.filter((c) => c.toLowerCase() !== appAccent),
    ],
    [appAccent],
  );

  useEffect(() => {
    if (!choices.photo) {
      setPhoto(null);
      return;
    }
    // A photo removed before it finished decoding must not come back.
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setPhoto(img);
    img.src = choices.photo;
    return () => {
      alive = false;
    };
  }, [choices.photo]);

  const content = useMemo<CardContent>(() => {
    const lang = i18n.language;
    const upper = (s: string) => s.toLocaleUpperCase(lang);
    const number = (n: number) =>
      new Intl.NumberFormat(lang).format(Math.round(n));
    const streak = stats.current_streak;

    const first = stats.days[0]?.day;
    let since = "";
    if (first) {
      const [y, m, d] = first.split("-").map(Number);
      if (y && m && d) {
        since = t("today.share.card.since", {
          date: new Date(y, m - 1, d).toLocaleDateString(lang, {
            month: "long",
            year: "numeric",
          }),
        });
      }
    }

    const hours = stats.total_seconds / 3600;
    const cards: CardContent["stats"] = [];
    if (choices.show.words) {
      cards.push({
        label: upper(t("today.share.card.words")),
        value: number(stats.total_words),
      });
    }
    if (choices.show.time) {
      cards.push({
        label: upper(t("today.share.card.time")),
        value:
          hours >= 1
            ? t("activity.hoursShort", { count: Math.round(hours) })
            : t("activity.minutesShort", {
                count: Math.max(1, Math.round(stats.total_seconds / 60)),
              }),
      });
    }
    if (choices.show.best) {
      cards.push({
        label: upper(t("today.share.card.best")),
        value: plural("activity.dayCount", stats.longest_streak),
      });
    }

    return {
      name: choices.name,
      photo,
      since,
      badge: upper(
        `${t(`today.share.card.rarity.${rarityOf(streak)}`)} · ${t(
          "today.share.card.level",
          { level: number(streak) },
        )}`,
      ),
      streak: number(streak),
      streakLabel: plural("today.share.card.streak", streak),
      stats: cards,
      heat: choices.show.activity ? heatLevels(stats.days) : null,
      footerHint: t("today.share.card.footer"),
      footerLink: SITE,
      rtl: i18n.dir(lang) === "rtl",
      font: getComputedStyle(document.body).fontFamily || "sans-serif",
    };
  }, [stats, choices, photo, t, i18n, plural]);

  /** The card without its light, redrawn only when what it shows changes. */
  const baseRef = useRef<HTMLCanvasElement | null>(null);

  // Stable on purpose: the sway loop below depends on it, and a new `paint`
  // on every keystroke would restart the loop and make the light jump.
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !base || !ctx) return;
    if (canvas.width !== base.width) {
      canvas.width = base.width;
      canvas.height = base.height;
    }
    const dpr = base.width / CARD_WIDTH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCardLight(ctx, lightRef.current);
    const { x, y } = lightRef.current;
    canvas.style.transform = `rotateX(${(0.5 - y) * TILT}deg) rotateY(${(x - 0.5) * TILT}deg)`;
  }, []);

  // Fonts can land after the first draw; draw again once they have.
  useEffect(() => {
    let alive = true;
    const build = () => {
      if (!alive) return;
      const dpr = window.devicePixelRatio || 1;
      const base = document.createElement("canvas");
      base.width = Math.round(CARD_WIDTH * dpr);
      base.height = Math.round(CARD_HEIGHT * dpr);
      const ctx = base.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCardBase(ctx, content, accent, dpr);
      baseRef.current = base;
      paint();
    };
    build();
    void document.fonts?.ready.then(build);
    return () => {
      alive = false;
    };
  }, [content, accent, paint]);

  // With nobody touching it, the card sways a little so the light moves. It
  // stops while the window is not in front: a hidden Tauri window keeps
  // running animation frames, and this would burn a core in the tray.
  useEffect(() => {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const amount = reduced ? 0.4 : 1;
    const t0 = performance.now();
    const step = (now: number) => {
      // Belt and braces for the tray: WebView2 never reports the window as
      // hidden, so a lost focus is the signal to stop until it comes back.
      if (!document.hasFocus()) return;
      if (!hoverRef.current) {
        const s = (now - t0) / 1000;
        lightRef.current = {
          x: 0.5 + Math.sin(s * 0.9) * 0.28 * amount,
          y: 0.5 + Math.cos(s * 0.7) * 0.2 * amount,
        };
        paint();
      }
      frameRef.current = requestAnimationFrame(step);
    };
    const run = () => {
      cancelAnimationFrame(frameRef.current);
      if (document.hasFocus() && !document.hidden) {
        frameRef.current = requestAnimationFrame(step);
      }
    };
    const stop = () => cancelAnimationFrame(frameRef.current);
    run();
    window.addEventListener("focus", run);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", run);
    return () => {
      stop();
      window.removeEventListener("focus", run);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", run);
    };
  }, [paint]);

  useEffect(() => {
    dialogRef.current?.focus();
    // Only an Escape from this dialog (or from nowhere in particular) closes
    // it: one pressed in the command palette opened on top closes the palette.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as Node | null;
      if (target === document.body || dialogRef.current?.contains(target)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    hoverRef.current = true;
    lightRef.current = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
    paint();
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = await readPhoto(file);
      setChoices((c) => ({ ...c, photo: data }));
    } catch {
      toast.error(t("today.share.photoError"));
    }
  };

  const onSave = async () => {
    setBusy(true);
    try {
      let path = await save({
        defaultPath: FILE_NAME,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      if (!path.toLowerCase().endsWith(".png")) path += ".png";
      const blob = await exportCard(content, accent);
      const result = await commands.savePngFile(path, await blobToBase64(blob));
      if (result.status === "ok") toast.success(t("today.share.saved"));
      else toast.error(t("today.share.saveError", { error: result.error }));
    } catch (err) {
      toast.error(t("today.share.saveError", { error: String(err) }));
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    setBusy(true);
    try {
      // The promise goes in unawaited: WebKit (macOS) only lets the clipboard
      // be written inside the click itself, and drawing the PNG takes longer.
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": exportCard(content, accent) }),
      ]);
      toast.success(t("today.share.copied"));
    } catch {
      toast.error(t("today.share.copyError"));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (part: Part) =>
    setChoices((c) => ({ ...c, show: { ...c.show, [part]: !c.show[part] } }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-title"
        tabIndex={-1}
        className="relative flex w-full max-w-[720px] flex-wrap items-center justify-center gap-8 rounded-2xl border border-mid-gray/20 bg-background p-6 outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("today.share.close")}
          className="absolute end-3 top-3 rounded-lg p-1.5 text-[var(--vc-text-muted)] transition-colors hover:bg-mid-gray/10 hover:text-[var(--vc-text-main)]"
        >
          <X width={18} height={18} />
        </button>

        <div style={{ perspective: "900px" }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${content.streak} ${content.streakLabel}`}
            onPointerMove={onPointerMove}
            onPointerLeave={() => {
              hoverRef.current = false;
            }}
            className="block cursor-grab touch-none rounded-[18px] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.55)] transition-transform duration-75 ease-linear"
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
          />
        </div>

        <div className="flex min-w-[240px] max-w-[300px] flex-1 flex-col gap-4">
          <div>
            <h2
              id="share-card-title"
              className="text-lg font-semibold tracking-tight text-[var(--vc-text-main)]"
            >
              {t("today.share.title")}
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--vc-text-muted)]">
              {t("today.share.subtitle")}
            </p>
          </div>

          <label className="flex flex-col gap-1.5 text-[12.5px] text-[var(--vc-text-muted)]">
            {t("today.share.name")}
            <input
              type="text"
              value={choices.name}
              maxLength={24}
              placeholder={t("today.share.namePlaceholder")}
              onChange={(e) =>
                setChoices((c) => ({ ...c, name: e.target.value }))
              }
              className="rounded-lg border border-mid-gray/20 bg-transparent px-3 py-1.5 text-sm text-[var(--vc-text-main)] outline-none focus:border-logo-primary"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-[12.5px] text-[var(--vc-text-muted)]">
            {t("today.share.photo")}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5"
              >
                <ImagePlus width={14} height={14} />
                {t("today.share.photoChoose")}
              </Button>
              {choices.photo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setChoices((c) => ({ ...c, photo: null }))}
                >
                  {t("today.share.photoRemove")}
                </Button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={onPhoto}
            />
          </div>

          <div className="flex flex-col gap-1.5 text-[12.5px] text-[var(--vc-text-muted)]">
            {t("today.share.color")}
            <div className="flex gap-2">
              {colors.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setChoices((prev) => ({
                      ...prev,
                      color: i === 0 ? null : c,
                    }))
                  }
                  aria-label={
                    i === 0
                      ? t("today.share.colorApp")
                      : t("today.share.colorN", { n: i + 1 })
                  }
                  aria-pressed={accent === c}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    accent === c
                      ? "border-[var(--vc-text-main)]"
                      : "border-transparent"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-[12.5px] text-[var(--vc-text-muted)]">
            {t("today.share.show")}
            <div className="flex flex-wrap gap-1.5">
              {PARTS.map((part) => (
                <button
                  key={part}
                  type="button"
                  aria-pressed={choices.show[part]}
                  onClick={() => toggle(part)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    choices.show[part]
                      ? "border-logo-primary bg-logo-primary/15 text-[var(--vc-text-main)]"
                      : "border-mid-gray/20 text-[var(--vc-text-muted)] hover:border-logo-primary/60"
                  }`}
                >
                  {t(`today.share.parts.${part}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-1 flex flex-wrap gap-2">
            <Button
              onClick={onSave}
              disabled={busy}
              className="inline-flex items-center gap-1.5"
            >
              <Download width={15} height={15} />
              {t("today.share.save")}
            </Button>
            <Button
              variant="secondary"
              onClick={onCopy}
              disabled={busy}
              className="inline-flex items-center gap-1.5"
            >
              <Copy width={15} height={15} />
              {t("today.share.copy")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

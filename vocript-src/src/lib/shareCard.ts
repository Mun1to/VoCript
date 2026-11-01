/**
 * The shareable streak card, drawn on a canvas.
 *
 * One drawing serves both the live preview (redrawn as the pointer moves the
 * light) and the exported PNG, so what gets shared is exactly what was on
 * screen. A DOM card plus a separate exporter would drift apart the first time
 * someone touched one of them.
 *
 * Everything happens on this computer: the canvas never leaves the page unless
 * the user saves or copies the image.
 */

export const CARD_WIDTH = 290;
export const CARD_HEIGHT = 406;
/** Space around the card in the exported image, for its shadow. */
export const EXPORT_MARGIN = 40;
/** The exported PNG is drawn at this multiple of the on-screen size. */
export const EXPORT_SCALE = 3;
/** Days in the activity strip: 14 columns by 4 rows, oldest first. */
export const HEAT_DAYS = 56;

const PAD = 20;
const INNER = CARD_WIDTH - PAD * 2;
const RADIUS = 18;
const INK = "#f8fafc";
/** The wave engraved across the card (a 290 by 120 box). */
const WAVE =
  "M0 60 Q 12 20 24 60 T 48 60 T 72 60 Q 84 5 96 60 T 120 60 T 144 60 Q 156 30 168 60 T 192 60 Q 204 0 216 60 T 240 60 T 264 60 Q 276 40 290 60";

export type Rarity = "common" | "rare" | "epic" | "legendary";

/** The card goes up a rarity as the streak grows. */
export const rarityOf = (streak: number): Rarity =>
  streak >= 100
    ? "legendary"
    : streak >= 30
      ? "epic"
      : streak >= 7
        ? "rare"
        : "common";

export interface CardContent {
  /** May be empty: the name line is then left out. */
  name: string;
  photo: CanvasImageSource | null;
  since: string;
  badge: string;
  streak: string;
  streakLabel: string;
  stats: { label: string; value: string }[];
  /** `HEAT_DAYS` levels from 0 to 3, or `null` to leave the strip out. */
  heat: number[] | null;
  footerHint: string;
  footerLink: string;
  rtl: boolean;
  font: string;
}

/** Where the light hits, each from 0 to 1 across the card. */
export interface CardLight {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.padEnd(6, "0");
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [
    number,
    number,
    number,
  ];
};

/** `color-mix(in srgb, a share%, b)`, as the CSS mock-up did it. */
const mix = (a: string, b: string, share: number, alpha = 1): string => {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const c = (x: number, y: number) => Math.round(x * share + y * (1 - share));
  return `rgba(${c(ar, br)}, ${c(ag, bg)}, ${c(ab, bb)}, ${alpha})`;
};

const withAlpha = (hex: string, alpha: number) => mix(hex, hex, 1, alpha);

/**
 * Any CSS color the browser understands, as `#rrggbb`. The accent comes from a
 * CSS variable, which could in principle hold `rgb()` or a name.
 */
export const toHex = (color: string, fallback = "#3b82f6"): string => {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return fallback;
  probe.fillStyle = fallback;
  probe.fillStyle = color.trim() || fallback;
  const out = String(probe.fillStyle);
  return /^#[0-9a-f]{6}$/i.test(out) ? out : fallback;
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/**
 * Shrinks the font down to `min` to fit `max` pixels, then trims with an
 * ellipsis. Translations run long (a Russian label is half again the English),
 * and a label that spills into the next column looks broken on a card meant
 * to be shown off.
 */
const fitText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  size: number,
  min: number,
  weight: number,
  font: string,
): string => {
  let s = size;
  ctx.font = `${weight} ${s}px ${font}`;
  while (ctx.measureText(text).width > max && s > min) {
    s -= 0.5;
    ctx.font = `${weight} ${s}px ${font}`;
  }
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  // By characters, not UTF-16 units: slicing a unit would split an emoji in
  // half and leave a box on the card.
  let chars = Array.from(cut);
  while (chars.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    chars = chars.slice(0, -1);
    cut = chars.join("");
  }
  return `${cut.trimEnd()}…`;
};

/**
 * Draws the whole card with its top-left corner at the current origin, at 1:1
 * in card units (the caller scales the context for sharper output).
 * `pixelScale` is only for shadow blur, which the canvas measures in real
 * pixels and not in the units of the current transform.
 */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  content: CardContent,
  accent: string,
  light: CardLight,
  pixelScale: number,
): void {
  drawCardBase(ctx, content, accent, pixelScale);
  drawCardLight(ctx, light);
}

/**
 * Everything that does not move with the light. The live preview draws this
 * once into a canvas of its own and then only repaints the light on top, so a
 * swaying card costs one image copy and one gradient a frame, not the lot.
 */
export function drawCardBase(
  ctx: CanvasRenderingContext2D,
  content: CardContent,
  accent: string,
  pixelScale: number,
): void {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const { rtl, font } = content;
  // Right-to-left languages get the whole card mirrored: the logo, the name
  // and the oldest day of the strip all start from the right.
  const X = (x: number, w = 0) => (rtl ? W - x - w : x);
  const start = rtl ? "right" : "left";

  ctx.save();
  roundRect(ctx, 0, 0, W, H, RADIUS);
  ctx.clip();
  ctx.direction = rtl ? "rtl" : "ltr";

  // Background: the accent at the top fading into near black, with a little of
  // it back at the bottom (170deg, like the mock-up's CSS).
  const angle = (170 * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  const bg = ctx.createLinearGradient(
    W / 2 - dx * half,
    H / 2 - dy * half,
    W / 2 + dx * half,
    H / 2 + dy * half,
  );
  bg.addColorStop(0, mix(accent, "#05060a", 0.6));
  bg.addColorStop(0.6, "#07080d");
  bg.addColorStop(1, mix(accent, "#05060a", 0.25));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The engraved sound wave, faint.
  ctx.save();
  ctx.translate(0, (H - 120) * 0.58);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
  ctx.lineWidth = 1.5;
  ctx.stroke(new Path2D(WAVE));
  ctx.restore();

  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";

  // Top row: logo on one side, rarity on the other.
  const topMid = PAD + 11;
  ctx.save();
  ctx.globalAlpha = 0.85;
  const bars = [6, 14, 9, 12];
  const logoBars = bars.length * 3 + (bars.length - 1) * 2;
  bars.forEach((h, i) => {
    roundRect(ctx, X(PAD + i * 5, 3), topMid - h / 2, 3, h, 1.5);
    ctx.fill();
  });
  ctx.font = `800 14px ${font}`;
  // The brand reads left to right in every language; only its place mirrors.
  ctx.direction = "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText("VoCript", X(PAD + logoBars + 6), topMid);
  ctx.direction = rtl ? "rtl" : "ltr";
  const logoWidth = logoBars + 6 + ctx.measureText("VoCript").width;
  ctx.restore();

  ctx.save();
  ctx.letterSpacing = "1px";
  const badge = fitText(
    ctx,
    content.badge,
    INNER - logoWidth - 30,
    10,
    7.5,
    800,
    font,
  );
  const badgeW = ctx.measureText(badge).width + 18;
  const pill = ctx.createLinearGradient(
    X(PAD + INNER - badgeW),
    0,
    X(PAD + INNER),
    0,
  );
  pill.addColorStop(0, "#ffd166");
  pill.addColorStop(0.5, "#ff9ecb");
  pill.addColorStop(1, "#9bf6ff");
  ctx.fillStyle = pill;
  roundRect(ctx, X(PAD + INNER - badgeW, badgeW), topMid - 10, badgeW, 20, 10);
  ctx.fill();
  ctx.fillStyle = "#1a1030";
  ctx.textAlign = "center";
  ctx.fillText(badge, X(PAD + INNER - badgeW / 2), topMid + 0.5);
  ctx.restore();

  // Who: photo or initial, name and since when.
  const whoTop = PAD + 22 + 18;
  const hasName = content.name.trim().length > 0;
  if (hasName || content.photo) {
    const cx = X(PAD + 20);
    const cy = whoTop + 20;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    if (content.photo) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(content.photo, cx - 20, cy - 20, 40, 40);
      ctx.restore();
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 17px ${font}`;
      ctx.textAlign = "center";
      ctx.fillText(
        Array.from(content.name.trim())[0]?.toLocaleUpperCase() ?? "",
        cx,
        cy + 1,
      );
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 21, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = start;
    const textX = X(PAD + 50);
    const name = fitText(ctx, content.name.trim(), 196, 17, 13, 700, font);
    ctx.fillText(name, textX, whoTop + 12);
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillText(
      fitText(ctx, content.since, 196, 11, 9, 400, font),
      textX,
      whoTop + 29,
    );
    ctx.restore();
  } else if (content.since) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.textAlign = start;
    ctx.fillText(
      fitText(ctx, content.since, INNER, 11, 9, 400, font),
      X(PAD),
      whoTop + 12,
    );
    ctx.restore();
  }

  // From the bottom up, so that whatever is switched off lets the streak sink
  // instead of leaving a hole (the mock-up's `margin-top: auto`).
  let y = H - PAD;

  const refH = 36;
  y -= refH;
  ctx.save();
  roundRect(ctx, PAD + 0.5, y + 0.5, INNER - 1, refH - 1, 10);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = `700 12px ${font}`;
  const linkW = ctx.measureText(content.footerLink).width;
  ctx.direction = "ltr";
  ctx.textAlign = rtl ? "left" : "right";
  ctx.fillText(content.footerLink, X(PAD + INNER - 10), y + refH / 2);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.globalAlpha = 0.75;
  ctx.textAlign = start;
  ctx.fillText(
    fitText(ctx, content.footerHint, INNER - 30 - linkW, 11, 9, 400, font),
    X(PAD + 10),
    y + refH / 2,
  );
  ctx.restore();

  if (content.heat) {
    const gap = 3;
    const cols = 14;
    const cell = (INNER - (cols - 1) * gap) / cols;
    const rows = Math.ceil(HEAT_DAYS / cols);
    y -= 14 + rows * cell + (rows - 1) * gap;
    content.heat.forEach((level, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      ctx.save();
      if (level >= 3) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * pixelScale;
      }
      ctx.fillStyle =
        level >= 3
          ? accent
          : level === 2
            ? withAlpha(accent, 0.7)
            : level === 1
              ? withAlpha(accent, 0.4)
              : "rgba(255, 255, 255, 0.1)";
      roundRect(
        ctx,
        X(PAD + col * (cell + gap), cell),
        y + row * (cell + gap),
        cell,
        cell,
        2,
      );
      ctx.fill();
      ctx.restore();
    });
  }

  if (content.stats.length > 0) {
    y -= 14 + 40;
    const colW = (INNER - 16) / 3;
    content.stats.forEach((stat, i) => {
      const x = X(PAD + i * (colW + 8), colW);
      const at = rtl ? x + colW : x;
      ctx.save();
      ctx.textAlign = start;
      ctx.globalAlpha = 0.8;
      ctx.letterSpacing = "0.6px";
      ctx.fillText(
        fitText(ctx, stat.label, colW, 10, 7.5, 400, font),
        at,
        y + 8,
      );
      ctx.restore();
      ctx.save();
      ctx.textAlign = start;
      ctx.fillText(
        fitText(ctx, stat.value, colW, 16, 11, 700, font),
        at,
        y + 27,
      );
      ctx.restore();
    });
  }

  // The streak, big, with the accent glowing behind it.
  y -= 14 + 20;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.textAlign = start;
  ctx.fillText(
    fitText(ctx, content.streakLabel, INNER, 13, 10, 400, font),
    X(PAD),
    y + 10,
  );
  ctx.restore();
  y -= 4;
  ctx.save();
  ctx.textAlign = start;
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "-3px";
  ctx.shadowColor = withAlpha(accent, 0.7);
  ctx.shadowBlur = 24 * pixelScale;
  ctx.fillText(
    fitText(ctx, content.streak, INNER, 76, 40, 900, font),
    X(PAD - 2),
    y - 3,
  );
  ctx.restore();

  ctx.restore();
}

/**
 * The glare where the light is, blended over the card like the mock-up's
 * `mix-blend-mode: overlay`, and the hairline edge on top.
 */
export function drawCardLight(
  ctx: CanvasRenderingContext2D,
  light: CardLight,
): void {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  ctx.save();
  roundRect(ctx, 0, 0, W, H, RADIUS);
  ctx.clip();

  const gx = clamp(light.x, 0, 1) * W;
  const gy = clamp(light.y, 0, 1) * H;
  const reach = Math.hypot(Math.max(gx, W - gx), Math.max(gy, H - gy));
  const glare = ctx.createRadialGradient(gx, gy, 0, gx, gy, reach);
  glare.addColorStop(0, "rgba(255, 255, 255, 0.5)");
  glare.addColorStop(0.32, "rgba(255, 255, 255, 0.08)");
  glare.addColorStop(0.55, "rgba(255, 255, 255, 0)");
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";

  // Hairline edge.
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS - 0.5);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

/** The light the exported image is frozen with: high on the right. */
const EXPORT_LIGHT: CardLight = { x: 0.7, y: 0.22 };

/**
 * The PNG that gets saved or copied: the card on the app's dark background,
 * with the soft shadow it has on screen.
 */
export async function exportCard(
  content: CardContent,
  accent: string,
): Promise<Blob> {
  const W = CARD_WIDTH + EXPORT_MARGIN * 2;
  const H = CARD_HEIGHT + EXPORT_MARGIN * 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * EXPORT_SCALE;
  canvas.height = H * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.fillStyle = "#090a0f";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
  ctx.shadowBlur = 40 * EXPORT_SCALE;
  ctx.shadowOffsetY = 18 * EXPORT_SCALE;
  roundRect(ctx, EXPORT_MARGIN, EXPORT_MARGIN, CARD_WIDTH, CARD_HEIGHT, RADIUS);
  ctx.fillStyle = "#07080d";
  ctx.fill();
  ctx.restore();

  ctx.translate(EXPORT_MARGIN, EXPORT_MARGIN);
  drawCard(ctx, content, accent, EXPORT_LIGHT, EXPORT_SCALE);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    ),
  );
}

/**
 * The last `HEAT_DAYS` days, oldest first, as levels 0 to 3 relative to the
 * busiest of them (the same idea as the activity heatmap, in fewer steps).
 */
export function heatLevels(
  days: { day: string; words: number }[],
  today = new Date(),
): number[] {
  const byDay = new Map(days.map((d) => [d.day, d.words]));
  const words: number[] = [];
  const cursor = new Date(today);
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() - (HEAT_DAYS - 1));
  for (let i = 0; i < HEAT_DAYS; i++) {
    const key = `${cursor.getFullYear()}-${`${cursor.getMonth() + 1}`.padStart(2, "0")}-${`${cursor.getDate()}`.padStart(2, "0")}`;
    words.push(byDay.get(key) ?? 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  const peak = Math.max(0, ...words);
  return words.map((w) => {
    if (w <= 0 || peak <= 0) return 0;
    const ratio = w / peak;
    return ratio <= 1 / 3 ? 1 : ratio <= 2 / 3 ? 2 : 3;
  });
}

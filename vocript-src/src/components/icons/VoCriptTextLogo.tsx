/* eslint-disable i18next/no-literal-string -- SVG del logotipo (nombre de marca) */
import React from "react";

/**
 * VoCript wordmark logo.
 *
 * A clean, rounded "voice-AI" wordmark: a small rounded sound-wave mark plus the
 * word "VoCript" filled with a smooth light-blue gradient. No sharp/pointy
 * strokes — soft rounded letterforms and bars to match the app's calm, clean
 * feel. The gradient is self-contained so it renders correctly inside the
 * separate overlay window too.
 */
const VoCriptTextLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  const h = height ?? (width ? Math.round(width * 0.3) : 120);
  const w = width ?? 400;

  return (
    <svg
      width={w}
      height={h}
      className={className}
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="VoCript"
      style={{ direction: "ltr" }}
    >
      <defs>
        <linearGradient
          id="vocript-logo-gradient"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="55%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>

      {/* Rounded sound-wave mark — the "voice" accent */}
      <g fill="url(#vocript-logo-gradient)">
        <rect x="8" y="50" width="11" height="20" rx="5.5" />
        <rect x="27" y="36" width="11" height="48" rx="5.5" />
        <rect x="46" y="20" width="11" height="80" rx="5.5" />
        <rect x="65" y="40" width="11" height="40" rx="5.5" />
        <rect x="84" y="52" width="11" height="16" rx="5.5" />
      </g>

      {/* Wordmark — rounded, soft, smooth */}
      <text
        x="108"
        y="83"
        fontSize="70"
        fontWeight="800"
        fontFamily="'Arial Rounded MT Bold', 'Quicksand', 'Nunito', 'Varela Round', system-ui, -apple-system, 'Segoe UI', sans-serif"
        letterSpacing="-1.5"
        fill="url(#vocript-logo-gradient)"
      >
        VoCript
      </text>
    </svg>
  );
};

export default VoCriptTextLogo;

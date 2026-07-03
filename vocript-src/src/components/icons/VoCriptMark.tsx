import React from "react";

interface VoCriptMarkProps {
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Marca de onda de VoCript (sin el texto), versión compacta para usos como el
 * overlay de grabación. El gradiente es autocontenido para que renderice bien
 * dentro de la ventana separada del overlay.
 */
const VoCriptMark: React.FC<VoCriptMarkProps> = ({
  width = 24,
  height = 24,
  className = "",
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="VoCript"
    >
      <defs>
        <linearGradient id="vocript-mark-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-logo-primary, #3b82f6)" />
          <stop offset="55%" stopColor="var(--color-logo-primary, #3b82f6)" />
          <stop offset="100%" stopColor="var(--color-logo-stroke, #1d4ed8)" />
        </linearGradient>
      </defs>

      <g fill="url(#vocript-mark-gradient)">
        <rect x="2" y="9" width="3" height="6" rx="1.5" />
        <rect x="6.5" y="6" width="3" height="12" rx="1.5" />
        <rect x="11" y="2.5" width="3" height="19" rx="1.5" />
        <rect x="15.5" y="6.5" width="3" height="11" rx="1.5" />
        <rect x="20" y="9.5" width="3" height="5" rx="1.5" />
      </g>
    </svg>
  );
};

export default VoCriptMark;

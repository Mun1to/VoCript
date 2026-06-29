import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";
import { useSettings } from "../../hooks/useSettings";

interface SettingContainerProps {
  title: string;
  description: string;
  children: React.ReactNode;
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  tooltipPosition?: "top" | "bottom";
}

export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  descriptionMode = "tooltip",
  grouped = false,
  layout = "horizontal",
  disabled = false,
  tooltipPosition = "top",
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettings();
  const isLight = settings?.theme === "light";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showTooltip]);

  const toggleTooltip = () => {
    setShowTooltip(!showTooltip);
  };

  const containerClasses = grouped
    ? `px-4 py-3 transition-colors ${
        isLight ? "hover:bg-slate-50" : "hover:bg-white/[0.02]"
      }`
    : `px-4 py-3 rounded-xl border transition-all ${
        isLight
          ? "bg-white border-slate-200 hover:border-blue-300 shadow-sm"
          : "bg-white/[0.01] border-white/10 hover:border-blue-500/30"
      }`;

  const titleColor = isLight
    ? "text-slate-900 font-semibold"
    : "text-slate-200 font-semibold";
  const descColor = isLight ? "text-slate-500" : "text-slate-400";
  const iconColor = isLight
    ? "text-slate-400 hover:text-blue-600"
    : "text-slate-500 hover:text-blue-400";

  if (layout === "stacked") {
    return (
      <div className={containerClasses}>
        <div className="flex items-center gap-2 mb-2">
          <h3
            className={`text-xs tracking-wide ${titleColor} ${disabled ? "opacity-50" : ""}`}
          >
            {title}
          </h3>
          {description && (
            <div
              ref={tooltipRef}
              className="relative"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={toggleTooltip}
            >
              <svg
                className={`w-3.5 h-3.5 cursor-help transition-colors select-none ${iconColor}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {showTooltip && (
                <Tooltip targetRef={tooltipRef} position={tooltipPosition}>
                  <p className="text-xs text-center leading-relaxed">
                    {description}
                  </p>
                </Tooltip>
              )}
            </div>
          )}
        </div>
        <div className="w-full">{children}</div>
      </div>
    );
  }

  // Horizontal layout (default)
  const horizontalContainerClasses = `${containerClasses} flex items-center justify-between`;

  return (
    <div className={horizontalContainerClasses}>
      <div className="max-w-[70%] space-y-0.5">
        <div className="flex items-center gap-2">
          <h3
            className={`text-xs tracking-wide ${titleColor} ${disabled ? "opacity-50" : ""}`}
          >
            {title}
          </h3>
          {descriptionMode === "tooltip" && description && (
            <div
              ref={tooltipRef}
              className="relative inline-block"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={toggleTooltip}
            >
              <svg
                className={`w-3.5 h-3.5 cursor-help transition-colors select-none ${iconColor}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {showTooltip && (
                <Tooltip targetRef={tooltipRef} position={tooltipPosition}>
                  <p className="text-xs text-center leading-relaxed">
                    {description}
                  </p>
                </Tooltip>
              )}
            </div>
          )}
        </div>
        {descriptionMode === "inline" && description && (
          <p
            className={`text-[11px] leading-normal ${descColor} ${disabled ? "opacity-50" : ""}`}
          >
            {description}
          </p>
        )}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
};

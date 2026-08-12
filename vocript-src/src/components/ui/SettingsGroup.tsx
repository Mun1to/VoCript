import React from "react";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => {
  const isLight = useResolvedTheme() === "light";

  return (
    <div className="space-y-2 w-full">
      {title && (
        <div className="px-1.5 mb-2.5">
          <h2
            className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${
              isLight ? "text-logo-primary" : "text-logo-primary"
            }`}
          >
            <span className="h-3.5 w-1 rounded-full bg-logo-primary" />
            {title}
          </h2>
          {description && (
            <p
              className={`text-xs mt-1 ms-3.5 ${
                isLight ? "text-slate-500" : "text-slate-400"
              }`}
            >
              {description}
            </p>
          )}
        </div>
      )}
      <div
        className={`vc-card-glow ${
          isLight
            ? "bg-white border-slate-200 shadow-sm"
            : "bg-[#12131a] border-white/10"
        }`}
      >
        <div
          className={`divide-y [&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl ${
            isLight ? "divide-slate-100" : "divide-white/5"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

import React from "react";
import { useSettings } from "../../hooks/useSettings";

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
  const { settings } = useSettings();
  const isLight = settings?.theme === "light";

  return (
    <div className="space-y-2 w-full max-w-3xl">
      {title && (
        <div className="px-1.5 mb-2.5">
          <h2
            className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${
              isLight ? "text-blue-600" : "text-blue-400"
            }`}
          >
            <span className="h-3.5 w-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
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
        className={`vc-card-glow overflow-hidden ${
          isLight
            ? "bg-white border-slate-200 shadow-sm"
            : "bg-[#12131a] border-white/10"
        }`}
      >
        <div
          className={`divide-y ${
            isLight ? "divide-slate-100" : "divide-white/5"
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

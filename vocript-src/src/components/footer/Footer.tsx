/* eslint-disable i18next/no-literal-string -- solo muestra el número de versión y elementos decorativos */
import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";

import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";
import { useTourStore } from "../../stores/tourStore";
import { useSettings } from "../../hooks/useSettings";

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const isLight = settings?.theme === "light";
  const startTour = useTourStore((state) => state.start);
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        setVersion("3.1.0");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div
      className={`w-full border-t py-2.5 px-4 select-none shrink-0 transition-colors duration-200 ${
        isLight
          ? "bg-slate-100 border-slate-200 text-slate-700"
          : "bg-[#0a0b0f] border-white/10 text-slate-400"
      }`}
    >
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-4">
          <ModelSelector />
        </div>

        {/* Update Status & Guide Links */}
        <div className="flex items-center gap-3 font-semibold">
          <button
            type="button"
            onClick={startTour}
            title={t("onboarding.tour.replay")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
              isLight
                ? "bg-white hover:bg-slate-200/60 border-slate-300 text-slate-800"
                : "bg-white/[0.05] hover:text-white border-white/5 text-slate-300"
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
            <span>{t("onboarding.tour.guide")}</span>
          </button>
          <span className="opacity-40">•</span>
          <UpdateChecker />
          <span className="opacity-40">•</span>
          <span
            className={`font-mono text-[11px] px-2 py-0.5 rounded-md border ${
              isLight
                ? "bg-slate-200/60 border-slate-300 text-slate-700"
                : "bg-black/40 border-white/5 text-slate-400"
            }`}
          >
            v{version || "—"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Footer;

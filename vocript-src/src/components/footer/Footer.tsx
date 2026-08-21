/* eslint-disable i18next/no-literal-string -- solo muestra el número de versión y elementos decorativos */
import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { Flag, HelpCircle } from "lucide-react";

import { commands } from "@/bindings";
import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";
import { useTourStore } from "../../stores/tourStore";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";
import { HoverTooltip } from "../ui/HoverTooltip";
import { reportAiOutput } from "@/lib/utils/reportAiOutput";

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const isLight = useResolvedTheme() === "light";
  const startTour = useTourStore((state) => state.start);
  const [version, setVersion] = useState("");
  // A Store install is updated by the Store, so it must not offer a check of
  // its own; the whole control goes away rather than sitting there greyed out.
  const [packaged, setPackaged] = useState(false);

  useEffect(() => {
    commands
      .isPackaged()
      .then(setPackaged)
      .catch(() => setPackaged(false));
  }, []);

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
          <HoverTooltip label={t("onboarding.tour.replay")} position="top">
            <button
              type="button"
              onClick={startTour}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-colors ${
                isLight
                  ? "bg-white hover:bg-slate-200/60 border-slate-300 text-slate-800"
                  : "bg-white/[0.05] hover:text-white border-white/5 text-slate-300"
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-accent" />
              <span>{t("onboarding.tour.guide")}</span>
            </button>
          </HoverTooltip>
          <span className="opacity-40">•</span>
          {/* Reporting what a model wrote has to be reachable from a fresh
              install, before anything has been dictated (Microsoft Store policy
              11.16). The two places next to the generated text are the ones
              that make sense while using the app, but both only exist once
              there is text to report, so a reviewer opening the app for the
              first time found nothing. This one is always here. */}
          <HoverTooltip label={t("footer.reportIssueTooltip")} position="top">
            <button
              type="button"
              onClick={reportAiOutput}
              className={`flex items-center gap-1.5 transition-colors ${
                isLight ? "hover:text-slate-900" : "hover:text-white"
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{t("footer.reportIssue")}</span>
            </button>
          </HoverTooltip>
          <span className="opacity-40">•</span>
          {!packaged && (
            <>
              <UpdateChecker />
              <span className="opacity-40">•</span>
            </>
          )}
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

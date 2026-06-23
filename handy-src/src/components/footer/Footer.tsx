import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";

import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";
import { useTourStore } from "../../stores/tourStore";

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const startTour = useTourStore((state) => state.start);
  const [version, setVersion] = useState("");

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  return (
    <div className="w-full border-t border-mid-gray/20 pt-3">
      <div className="flex justify-between items-center text-xs px-4 pb-3 text-text/60">
        <div className="flex items-center gap-4">
          <ModelSelector />
        </div>

        {/* Update Status */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startTour}
            title={t("onboarding.tour.replay")}
            className="flex items-center gap-1 hover:text-text transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {t("onboarding.tour.guide")}
          </button>
          <span>•</span>
          <UpdateChecker />
          <span>•</span>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span>v{version}</span>
        </div>
      </div>
    </div>
  );
};

export default Footer;

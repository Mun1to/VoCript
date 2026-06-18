import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CancelIcon, VoCriptMark } from "../components/icons";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState = "recording" | "transcribing" | "processing";

const BAR_COUNT = 9;
const ZERO_LEVELS = Array(BAR_COUNT).fill(0);

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>(ZERO_LEVELS);
  const smoothedLevelsRef = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setupEventListeners = async () => {
      // Listen for show-overlay event from Rust
      const unlistenShow = await listen("show-overlay", async (event) => {
        // Sync language from settings each time overlay is shown
        await syncLanguageFromSettings();
        const overlayState = event.payload as OverlayState;
        setState(overlayState);
        setIsVisible(true);
      });

      // Listen for hide-overlay event from Rust
      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        // Reiniciar las barras para que no se queden "congeladas" en el último
        // valor cuando el overlay vuelve a aparecer.
        smoothedLevelsRef.current = Array(BAR_COUNT).fill(0);
        setLevels(ZERO_LEVELS);
      });

      // Listen for mic-level updates
      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];

        // Suavizado asimétrico: ataque rápido (sube casi al instante con la voz)
        // y caída suave (baja con elegancia). Así la animación se nota mucho más
        // y reacciona de inmediato, sin el "retardo" que la hacía parecer floja.
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          const factor = target > prev ? 0.6 : 0.22;
          return prev + (target - prev) * factor;
        });

        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, BAR_COUNT));
      });

      // Cleanup function
      return () => {
        unlistenShow();
        unlistenHide();
        unlistenLevel();
      };
    };

    setupEventListeners();
  }, []);

  const openApp = () => {
    commands.showMainWindowCommand();
  };

  return (
    <div
      dir={direction}
      className={`recording-overlay ${isVisible ? "fade-in" : ""}`}
    >
      <div
        className="overlay-left overlay-logo"
        onClick={openApp}
        title="VoCript"
        role="button"
        tabIndex={0}
        aria-label="VoCript"
      >
        <VoCriptMark />
      </div>

      <div className="overlay-middle">
        {state === "recording" && (
          <div className="bars-container">
            {levels.map((v, i) => {
              // Ganancia extra para que los picos de voz lleguen bien arriba.
              const gained = Math.min(1, Math.pow(v, 0.6) * 1.4);
              return (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${4 + gained * 16}px`,
                    transition: "height 70ms ease-out, opacity 100ms ease-out",
                    opacity: Math.max(0.35, gained),
                  }}
                />
              );
            })}
          </div>
        )}
        {state === "transcribing" && (
          <div className="transcribing-text">{t("overlay.transcribing")}</div>
        )}
        {state === "processing" && (
          <div className="transcribing-text">{t("overlay.processing")}</div>
        )}
      </div>

      <div className="overlay-right">
        {state === "recording" && (
          <div
            className="cancel-button"
            onClick={() => {
              commands.cancelOperation();
            }}
          >
            <CancelIcon />
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingOverlay;

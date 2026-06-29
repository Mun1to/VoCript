import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Coffee, X } from "lucide-react";
import { useTourStore } from "../../stores/tourStore";
import { useSettings } from "../../hooks/useSettings";
import { TOUR_STEPS } from "../../lib/constants/tourSteps";
import { ShortcutInput } from "../settings/ShortcutInput";
import type { SidebarSection } from "../Sidebar";

const BMC_URL = "https://buymeacoffee.com/munito";

interface GuidedTourProps {
  /** Switch the sidebar to a section so the spotlighted element is visible. */
  onNavigate: (section: SidebarSection) => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 400;
const GAP = 12;

const CARD_CLASS =
  "bg-background border border-mid-gray/20 rounded-xl shadow-2xl p-4 max-h-[82vh] overflow-y-auto";

export const GuidedTour: React.FC<GuidedTourProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const { isActive, stepIndex, setStep, stop } = useTourStore();
  const { updateSetting } = useSettings();
  const [rect, setRect] = useState<Rect | null>(null);
  const [practiced, setPracticed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(260);

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  // Switch sidebar section + reset per-step practice state when the step changes.
  useEffect(() => {
    if (!isActive || !step) return;
    if (step.section) onNavigate(step.section);
    setPracticed(false);
  }, [isActive, stepIndex, step, onNavigate]);

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${step.target}"]`,
    );
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Locate the target after the section has had a chance to render. Retry a few
  // frames in case the element mounts late, then scroll it into view (the
  // smooth scroll fires scroll events that keep the spotlight tracking).
  useLayoutEffect(() => {
    if (!isActive) return;
    let raf = 0;
    let tries = 0;
    let scrolled = false;
    const attempt = () => {
      const el = step?.target
        ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
        : null;
      if (step?.target && !el && tries < 30) {
        tries += 1;
        raf = requestAnimationFrame(attempt);
        return;
      }
      if (el && !scrolled) {
        scrolled = true;
        // Align the target near the top so there's room for the card below it
        // (works even for tall elements like the dictionary).
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
      measure();
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [isActive, stepIndex, step, measure]);

  // Keep the spotlight glued to the target on resize/scroll.
  useEffect(() => {
    if (!isActive) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [isActive, measure]);

  // Keep the measured card height in sync so we can place it without overlap.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  });

  const finish = useCallback(() => {
    updateSetting("tour_completed", true);
    stop();
  }, [updateSetting, stop]);

  if (!isActive || !step) return null;

  const next = () => {
    if (isLast) finish();
    else setStep(stepIndex + 1);
  };
  const prev = () => {
    if (stepIndex > 0) setStep(stepIndex - 1);
  };

  // Anchored card position: below the target if it fits, else above, else the
  // larger gap — using the *measured* card height so it never covers the target.
  let anchoredStyle: React.CSSProperties | null = null;
  if (rect) {
    const spaceBelow = window.innerHeight - (rect.top + rect.height) - GAP;
    const spaceAbove = rect.top - GAP;
    let top: number;
    if (spaceBelow >= cardH || spaceBelow >= spaceAbove) {
      top = rect.top + rect.height + GAP;
    } else {
      top = rect.top - GAP - cardH;
    }
    top = Math.max(GAP, Math.min(top, window.innerHeight - cardH - GAP));
    let left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    left = Math.max(GAP, Math.min(left, window.innerWidth - CARD_WIDTH - GAP));
    anchoredStyle = { position: "fixed", top, left, width: CARD_WIDTH };
  }

  // Card content re-animates on every step (keyed by step index).
  const cardBody = (
    <div key={stepIndex} className="vc-step-in flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-lg">
          {t(`onboarding.tour.${step.id}.title`)}
        </h3>
        <button
          type="button"
          onClick={finish}
          title={t("onboarding.tour.skip")}
          className="text-text/50 hover:text-text shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-[15px] leading-relaxed text-text/85 whitespace-pre-line">
        {t(`onboarding.tour.${step.id}.body`)}
      </p>

      {step.practice === "shortcut" && (
        <div className="rounded-lg border border-mid-gray/20 bg-mid-gray/5">
          <ShortcutInput
            shortcutId="transcribe"
            grouped
            descriptionMode="tooltip"
          />
        </div>
      )}

      {step.practice === "dictation" && (
        <div className="flex flex-col gap-1">
          <textarea
            rows={2}
            autoFocus
            placeholder={t("onboarding.tour.dictation.placeholder")}
            onChange={(e) => setPracticed(e.target.value.trim().length > 0)}
            className="w-full text-sm rounded-lg border border-mid-gray/30 bg-mid-gray/5 p-2 resize-none focus:outline-none focus:border-logo-primary"
          />
          {practiced && (
            <span className="text-xs text-green-500 vc-fade-in">
              {t("onboarding.tour.dictation.success")}
            </span>
          )}
        </div>
      )}

      {step.donate && (
        <button
          type="button"
          onClick={() => openUrl(BMC_URL)}
          className="flex items-center justify-center gap-2 rounded-lg bg-background-ui text-white py-2 text-sm font-medium transition-opacity hover:opacity-90"
        >
          <Coffee className="w-4 h-4" />
          {t("onboarding.tour.donate.button")}
        </button>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1">
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex ? "w-4 bg-logo-primary" : "w-1.5 bg-mid-gray/30"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={prev}
              className="text-sm px-2 py-1 text-text/70 hover:text-text"
            >
              {t("onboarding.tour.back")}
            </button>
          )}
          <button
            type="button"
            onClick={next}
            className="text-sm px-3 py-1.5 rounded-lg bg-logo-primary text-white font-medium transition-opacity hover:opacity-90"
          >
            {isLast ? t("onboarding.tour.finish") : t("onboarding.tour.next")}
          </button>
        </div>
      </div>

      {!isLast && (
        <button
          type="button"
          onClick={finish}
          className="text-xs text-text/50 hover:text-text self-center"
        >
          {t("onboarding.tour.skip")}
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Dim everything except the spotlighted target (or the whole screen). */}
      {rect ? (
        <div
          className="vc-spotlight ring-2 ring-logo-primary"
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/55 vc-fade-in" />
      )}

      {/* Tooltip card: anchored next to the target, or centered when there's none. */}
      {anchoredStyle ? (
        <div
          ref={cardRef}
          style={anchoredStyle}
          className={`vc-tour-card ${CARD_CLASS}`}
        >
          {cardBody}
        </div>
      ) : (
        <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none">
          <div
            className={`vc-pop-in pointer-events-auto ${CARD_CLASS}`}
            style={{ width: CARD_WIDTH, maxWidth: "100%" }}
          >
            {cardBody}
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Sparkles,
  CheckCircle2,
  Bug,
  Lightbulb,
  HeartHandshake,
} from "lucide-react";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { useSettings } from "../../../hooks/useSettings";
import { openUrl } from "@tauri-apps/plugin-opener";

const REPO_ISSUES_URL = "https://github.com/Mun1to/Vocript/issues/new";

export const FeedbackSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const isLight = settings?.theme === "light";

  const [category, setCategory] = useState<"idea" | "bug" | "general">("idea");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;

    const prefix =
      category === "bug"
        ? "[Bug] "
        : category === "idea"
          ? "[Idea] "
          : "[Feedback] ";
    const firstLine = trimmed.split("\n")[0].slice(0, 80);
    const params = new URLSearchParams({
      title: prefix + firstLine,
      body: `${trimmed}\n\n— VoCript`,
    });
    const label =
      category === "bug" ? "bug" : category === "idea" ? "enhancement" : "";
    if (label) params.set("labels", label);

    try {
      await openUrl(`${REPO_ISSUES_URL}?${params.toString()}`);
    } catch (err) {
      console.error("No se pudo abrir el formulario de feedback:", err);
    }

    setSubmitted(true);
    setTimeout(() => {
      setMessage("");
      setSubmitted(false);
    }, 3000);
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6 vc-fade-in">
      <SettingsGroup
        title={t("settings.feedback.title", { defaultValue: "Feedback" })}
        description={t("settings.feedback.description", {
          defaultValue:
            "Tus comentarios ayudan a dar forma a las próximas versiones de VoCript y futuras aplicaciones.",
        })}
      >
        <div className="p-5 space-y-5">
          {/* Category Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setCategory("idea")}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-start transition-all ${
                category === "idea"
                  ? "bg-blue-500/10 border-blue-500 text-blue-400 font-semibold shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                  : isLight
                    ? "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    : "bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.05]"
              }`}
            >
              <Lightbulb className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-bold">
                  {t("settings.feedback.categories.idea", {
                    defaultValue: "Sugerencia",
                  })}
                </div>
                <div className="text-[11px] opacity-60 font-normal">
                  {t("settings.feedback.categories.ideaDesc", {
                    defaultValue: "Nuevas funciones",
                  })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCategory("bug")}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-start transition-all ${
                category === "bug"
                  ? "bg-blue-500/10 border-blue-500 text-blue-400 font-semibold shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                  : isLight
                    ? "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    : "bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.05]"
              }`}
            >
              <Bug className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <div className="text-xs font-bold">
                  {t("settings.feedback.categories.bug", {
                    defaultValue: "Reportar Problema",
                  })}
                </div>
                <div className="text-[11px] opacity-60 font-normal">
                  {t("settings.feedback.categories.bugDesc", {
                    defaultValue: "Errores o fallos",
                  })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCategory("general")}
              className={`flex items-center gap-3 p-3.5 rounded-xl border text-start transition-all ${
                category === "general"
                  ? "bg-blue-500/10 border-blue-500 text-blue-400 font-semibold shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                  : isLight
                    ? "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    : "bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.05]"
              }`}
            >
              <HeartHandshake className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-bold">
                  {t("settings.feedback.categories.general", {
                    defaultValue: "Opinión General",
                  })}
                </div>
                <div className="text-[11px] opacity-60 font-normal">
                  {t("settings.feedback.categories.generalDesc", {
                    defaultValue: "Experiencia de uso",
                  })}
                </div>
              </div>
            </button>
          </div>

          {/* Feedback Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className={`block text-xs font-semibold mb-1.5 ${isLight ? "text-slate-700" : "text-slate-300"}`}
              >
                {t("settings.feedback.formLabel", {
                  defaultValue: "Detalla tu mensaje o idea para el futuro:",
                })}
              </label>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("settings.feedback.placeholder", {
                  defaultValue:
                    "Escribe aquí tu opinión, sugerencia de función o problema encontrado...",
                })}
                className={`w-full p-3 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                  isLight
                    ? "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400"
                    : "bg-[#090a0f] border-white/10 text-slate-200 placeholder-slate-500"
                }`}
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span
                className={`text-[11px] flex items-center gap-1.5 ${isLight ? "text-slate-500" : "text-slate-400"}`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                {t("settings.feedback.note", {
                  defaultValue:
                    "Revisamos cada mensaje para mejorar la suite de apps.",
                })}
              </span>

              <button
                type="submit"
                disabled={!message.trim() || submitted}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all ${
                  submitted
                    ? "bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                    : message.trim()
                      ? "bg-blue-600 hover:bg-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.4)] active:scale-95"
                      : "bg-slate-700 opacity-50 cursor-not-allowed"
                }`}
              >
                {submitted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {t("settings.feedback.sent", {
                        defaultValue: "¡Enviado con éxito!",
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>
                      {t("settings.feedback.sendBtn", {
                        defaultValue: "Enviar Feedback",
                      })}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </SettingsGroup>
    </div>
  );
};

export default FeedbackSettings;

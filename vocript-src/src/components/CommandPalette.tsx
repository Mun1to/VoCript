import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { SECTIONS_CONFIG, SidebarSection } from "./Sidebar";
import { useSettings } from "../hooks/useSettings";
import { useResolvedTheme } from "../hooks/useResolvedTheme";

/**
 * The magnifier in the header: jump to any section from the keyboard.
 *
 * It searches SECTIONS, not individual settings, and that's on purpose. Only
 * the open section is mounted, so the rows of the other eleven simply don't
 * exist to be searched; the alternative would be a hand-written catalogue of
 * every setting in the app, which drifts out of date the first time someone
 * adds one. Narrowing down to a single setting is what the "Filter within X"
 * box does once you're inside a section.
 */
/** Nombre de la tecla física, no texto de interfaz: no se traduce. */
const TECLA_SALIR = "Esc";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (section: SidebarSection) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const isLight = useResolvedTheme() === "light";
  const [consulta, setConsulta] = useState("");
  const [resaltado, setResaltado] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  const disponibles = useMemo(
    () =>
      Object.entries(SECTIONS_CONFIG)
        .filter(([, config]) => config.enabled(settings))
        .map(([id, config]) => ({ id: id as SidebarSection, ...config })),
    [settings],
  );

  const resultados = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return disponibles;
    return disponibles.filter((s) => t(s.labelKey).toLowerCase().includes(q));
  }, [consulta, disponibles, t]);

  useEffect(() => {
    if (!open) return;
    setConsulta("");
    setResaltado(0);
    // The input mounts with the dialog, so focusing has to wait a tick.
    const id = window.setTimeout(() => campo.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => setResaltado(0), [consulta]);

  if (!open) return null;

  const elegir = (section: SidebarSection) => {
    onNavigate(section);
    onClose();
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => (resultados.length ? (i + 1) % resultados.length : 0));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) =>
        resultados.length ? (i - 1 + resultados.length) % resultados.length : 0,
      );
    }
    if (e.key === "Enter" && resultados[resaltado]) {
      e.preventDefault();
      elegir(resultados[resaltado].id);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={alTeclear}
        className={`w-[min(520px,92vw)] rounded-2xl overflow-hidden shadow-2xl border ${
          isLight ? "bg-white border-slate-200" : "bg-[var(--vc-card-bg)] border-white/10"
        }`}
      >
        <div
          className={`flex items-center gap-2.5 px-4 py-3 border-b ${
            isLight ? "border-slate-200" : "border-white/10"
          }`}
        >
          <Search size={16} className="shrink-0 text-[var(--vc-text-muted)]" />
          <input
            ref={campo}
            type="text"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder={t("palette.placeholder")}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[var(--vc-text-main)] placeholder:text-[var(--vc-text-muted)]"
          />
          <kbd
            className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              isLight
                ? "border-slate-200 text-slate-400"
                : "border-white/10 text-slate-500"
            }`}
          >
            {TECLA_SALIR}
          </kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {resultados.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-[var(--vc-text-muted)]">
              {t("palette.empty")}
            </p>
          )}
          {resultados.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => elegir(s.id)}
                onMouseEnter={() => setResaltado(i)}
                className={`flex items-center gap-3 w-full px-4 py-2.5 text-start text-sm transition-colors ${
                  i === resaltado
                    ? isLight
                      ? "bg-slate-100 text-slate-900"
                      : "bg-white/[0.06] text-slate-100"
                    : "text-[var(--vc-text-muted)]"
                }`}
              >
                <Icon width={16} height={16} className="shrink-0 text-accent" />
                <span className="truncate">{t(s.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

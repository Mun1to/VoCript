import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";
import { useSettingsPage } from "./SettingsLayout";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Toggles inside a group report their state here so the group header can say
 * "1 of 2 on" without every settings section having to count its own switches
 * and keep that count in sync by hand.
 */
type GroupCtx = { informar: (id: string, encendido: boolean) => void; olvidar: (id: string) => void };
const SettingsGroupContext = createContext<GroupCtx | null>(null);

/** Used by ToggleSwitch. Returns null outside a group, which is fine. */
export const useSettingsGroup = () => useContext(SettingsGroupContext);

/** Cheap stable id from the title, so the index can link to the block. */
const slug = (t: string) =>
  "b-" +
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

let contadorOrden = 0;

export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => {
  const { t } = useTranslation();
  const isLight = useResolvedTheme() === "light";
  const pagina = useSettingsPage();
  const idAuto = useId();
  const id = title ? slug(title) : idAuto;

  const [abierto, setAbierto] = useState(true);
  const [interruptores, setInterruptores] = useState<Record<string, boolean>>({});

  const informar = useCallback((sid: string, encendido: boolean) => {
    setInterruptores((prev) =>
      prev[sid] === encendido ? prev : { ...prev, [sid]: encendido },
    );
  }, []);
  const olvidarInterruptor = useCallback((sid: string) => {
    setInterruptores((prev) => {
      if (!(sid in prev)) return prev;
      const { [sid]: _, ...resto } = prev;
      return resto;
    });
  }, []);
  const ctx = useMemo(
    () => ({ informar, olvidar: olvidarInterruptor }),
    [informar, olvidarInterruptor],
  );

  // DOM order, captured once on mount: React mounts siblings in order, so a
  // simple counter matches what the eye sees down the page.
  const orden = useRef<number>(0);
  if (orden.current === 0) orden.current = ++contadorOrden;

  const numAjustes = React.Children.count(children);
  useEffect(() => {
    if (!pagina || !title) return;
    pagina.registrar({ id, titulo: title, ajustes: numAjustes, orden: orden.current });
    return () => pagina.olvidar(id);
  }, [pagina, id, title, numAjustes]);

  const total = Object.keys(interruptores).length;
  const encendidos = Object.values(interruptores).filter(Boolean).length;
  const resumen = total
    ? t("settings.summary.active", { on: encendidos, total })
    : null;

  return (
    <SettingsGroupContext.Provider value={ctx}>
      <div className="space-y-2 w-full" id={id} style={{ scrollMarginTop: "0.5rem" }}>
        {title && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="w-full px-1.5 mb-2.5 flex items-center gap-2 text-start"
          >
            <span className="h-3.5 w-1 rounded-full bg-logo-primary shrink-0" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-accent shrink-0">
              {title}
            </h2>
            {resumen && (
              <span
                className={`text-[11px] truncate ${isLight ? "text-slate-500" : "text-slate-400"}`}
              >
                {resumen}
              </span>
            )}
            <ChevronDown
              size={15}
              className={`ms-auto shrink-0 transition-transform ${
                abierto ? "" : "-rotate-90 rtl:rotate-90"
              } ${isLight ? "text-slate-400" : "text-slate-500"}`}
            />
          </button>
        )}
        {title && description && abierto && (
          <p
            className={`text-xs -mt-1 mb-2 ms-3.5 px-1.5 ${
              isLight ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {description}
          </p>
        )}
        {/* Kept mounted while collapsed: the switches inside are what feed the
            "1 of 2 on" summary, and unmounting them would blank it out. */}
        <div className={abierto ? "" : "hidden"}>
          {/* Surfaces come from the themed tokens, not fixed white/#12131a, or
              the accent tint would stop at the card edge. */}
          <div
            className={`vc-card-glow bg-[var(--vc-card-bg)] border-[var(--vc-border)] ${
              isLight ? "shadow-sm" : ""
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
      </div>
    </SettingsGroupContext.Provider>
  );
};

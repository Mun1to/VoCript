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
type GroupCtx = {
  informar: (id: string, encendido: boolean) => void;
  olvidar: (id: string) => void;
};
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
  const [interruptores, setInterruptores] = useState<Record<string, boolean>>(
    {},
  );

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
    pagina.registrar({
      id,
      titulo: title,
      ajustes: numAjustes,
      orden: orden.current,
    });
    return () => pagina.olvidar(id);
  }, [pagina, id, title, numAjustes]);

  const total = Object.keys(interruptores).length;
  const encendidos = Object.values(interruptores).filter(Boolean).length;
  const resumen = total
    ? t("settings.summary.active", { on: encendidos, total })
    : null;

  // The header is part of the card, not a caption floating above it: the name
  // in the accent colour, the summary next to it, and a hairline under the
  // whole thing. No uppercase and no accent bar down the side — both were
  // shouting a heading that the block's own frame already announces.
  return (
    <SettingsGroupContext.Provider value={ctx}>
      <div
        className={`vc-block w-full ${isLight ? "shadow-sm" : ""}`}
        id={id}
        data-abierto={abierto ? "1" : "0"}
      >
        {title && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="vc-block-head"
          >
            <h2>{title}</h2>
            {resumen && (
              <span className="flex-1 truncate text-[12.5px] text-[var(--vc-text-muted)]">
                {resumen}
              </span>
            )}
            <ChevronDown
              size={15}
              className={`ms-auto shrink-0 text-[var(--vc-text-muted)] transition-transform ${
                abierto ? "" : "-rotate-90 rtl:rotate-90"
              }`}
            />
          </button>
        )}
        {title && description && abierto && (
          <p className="px-4 pt-3 text-[12.5px] text-[var(--vc-text-muted)]">
            {description}
          </p>
        )}
        {/* Kept mounted while collapsed: the switches inside are what feed the
            "1 of 2 on" summary, and unmounting them would blank it out. */}
        <div className={`vc-block-body ${abierto ? "" : "hidden"}`}>
          {children}
        </div>
      </div>
    </SettingsGroupContext.Provider>
  );
};

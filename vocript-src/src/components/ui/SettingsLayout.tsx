import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

/**
 * Every settings block on the page announces itself here, so the index on the
 * right can list them without any section having to hand-maintain a table of
 * contents. Blocks report their DOM order too, because they mount in whatever
 * order React feels like and the index has to read top to bottom.
 */
type BloqueRegistrado = {
  id: string;
  titulo: string;
  ajustes: number;
  orden: number;
};

type PageCtx = {
  registrar: (b: BloqueRegistrado) => void;
  olvidar: (id: string) => void;
};

const SettingsPageContext = createContext<PageCtx | null>(null);

/** Called by SettingsGroup; no-op when a group is rendered outside a page. */
export const useSettingsPage = () => useContext(SettingsPageContext);

export const SettingsLayout: React.FC<{
  children: React.ReactNode;
  /** i18n key of the section name, for the "Filter within Models" placeholder. */
  sectionKey?: string;
  /** i18n key of the one line under the heading saying what the page is for. */
  subtitleKey?: string;
}> = ({ children, sectionKey, subtitleKey }) => {
  const { t } = useTranslation();
  const [bloques, setBloques] = useState<BloqueRegistrado[]>([]);
  const [filtro, setFiltro] = useState("");
  const contenido = useRef<HTMLDivElement>(null);
  const [sinResultados, setSinResultados] = useState(false);
  const [bloquesOcultos, setBloquesOcultos] = useState<string[]>([]);

  const registrar = useCallback((b: BloqueRegistrado) => {
    setBloques((prev) => {
      const resto = prev.filter((x) => x.id !== b.id);
      return [...resto, b].sort((x, y) => x.orden - y.orden);
    });
  }, []);

  const olvidar = useCallback((id: string) => {
    setBloques((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const ctx = useMemo(() => ({ registrar, olvidar }), [registrar, olvidar]);

  const irA = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  /**
   * Filtering happens over the rendered DOM, not over React state, and that is
   * deliberate: the twelve settings sections are hand-written JSX with no
   * common data model to filter, so the only thing they all share is the rows
   * they end up producing. Each row carries `data-vc-setting` with its own
   * text (see SettingContainer); rows that don't match get hidden, and a block
   * left with nothing visible hides too.
   */
  useEffect(() => {
    const raiz = contenido.current;
    if (!raiz) return;
    const q = filtro.trim().toLowerCase();
    const filas = Array.from(
      raiz.querySelectorAll<HTMLElement>("[data-vc-setting]"),
    );
    let visibles = 0;

    filas.forEach((fila) => {
      const coincide = !q || (fila.dataset.vcSetting ?? "").includes(q);
      fila.style.display = coincide ? "" : "none";
      if (coincide) visibles++;
    });

    // A block whose rows are all filtered out is just a floating heading.
    const ocultos: string[] = [];
    raiz.querySelectorAll<HTMLElement>("[id^='b-']").forEach((bloque) => {
      const suyas = bloque.querySelectorAll<HTMLElement>("[data-vc-setting]");
      const algunaVisible =
        !q ||
        Array.from(suyas).some((f) => f.style.display !== "none") ||
        suyas.length === 0;
      bloque.style.display = algunaVisible ? "" : "none";
      if (!algunaVisible) ocultos.push(bloque.id);
    });

    // The index has to follow the filter, or it offers to jump to a block that
    // isn't on screen and the click appears to do nothing.
    setBloquesOcultos(ocultos);
    setSinResultados(Boolean(q) && visibles === 0 && filas.length > 0);
  }, [filtro, children]);

  return (
    <SettingsPageContext.Provider value={ctx}>
      <div className="vc-settings-grid">
        <div className="min-w-0">
          <div className="vc-settings-column">
            {/* The section name as a heading. The sidebar says where you are
                too, but it stops saying it the moment it's collapsed. */}
            {sectionKey && (
              <div className="mb-4">
                <h1 className="vc-page-title !mb-[3px]">{t(sectionKey)}</h1>
                {subtitleKey && (
                  <p className="text-[13.5px] text-[var(--vc-text-muted)]">
                    {t(subtitleKey)}
                  </p>
                )}
              </div>
            )}
            <label className="vc-filter mb-[18px]">
              <Search size={14} className="shrink-0 opacity-60" />
              <input
                type="text"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder={
                  sectionKey
                    ? t("settings.filter.inSection", { section: t(sectionKey) })
                    : t("settings.filter.generic")
                }
              />
            </label>
          </div>
          <div ref={contenido}>{children}</div>
          {sinResultados && (
            <p className="vc-settings-column text-xs text-center py-6 text-[var(--vc-text-muted)]">
              {t("settings.filter.empty")}
            </p>
          )}
        </div>
        {/* The index only earns its space once there's more than one block to
            jump between, and only on windows wide enough (see App.css). */}
        {bloques.filter((b) => !bloquesOcultos.includes(b.id)).length > 1 && (
          <nav
            className="vc-settings-index"
            aria-label={t("settings.index.title")}
          >
            <div className="vc-settings-index-title">
              {t("settings.index.title")}
            </div>
            {bloques
              .filter((b) => !bloquesOcultos.includes(b.id))
              .map((b) => (
                <button key={b.id} type="button" onClick={() => irA(b.id)}>
                  <span className="truncate">{b.titulo}</span>
                  <em>{b.ajustes}</em>
                </button>
              ))}
          </nav>
        )}
      </div>
    </SettingsPageContext.Provider>
  );
};

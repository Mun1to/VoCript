import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  requestAccessibilityPermission,
  checkMicrophonePermission,
  requestMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { Check, Download, Globe, Keyboard, Mic } from "lucide-react";
import { toast } from "sonner";
import { commands } from "@/bindings";
import VoCriptTextLogo from "../icons/VoCriptTextLogo";
import { Dropdown } from "../ui/Dropdown";
import { useModelStore } from "../../stores/modelStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { LANGUAGES } from "../../lib/constants/languages";
import { languageName } from "../../lib/utils/languageNames";
import { getRecommendedModelId } from "../../lib/utils/modelRecommendation";

/** Intl gives back "español"; as the label of an answer card it wants a capital. */
const conMayuscula = (texto: string, idioma: string) =>
  texto ? texto.charAt(0).toLocaleUpperCase(idioma) + texto.slice(1) : texto;

/**
 * First run: three questions, one per screen.
 *
 * The old flow asked for a permission, then showed a wall of model cards and
 * a language picker, and then dropped an eighteen-step tour on top. This asks
 * what you speak and what you'll use it for — two things anyone can answer
 * without knowing what a model is — and picks the model from that. The
 * download starts as soon as the language is known, so by the time the
 * permission screen arrives it's already most of the way there. The tour is
 * offered at the end rather than launched at you.
 */

interface FirstRunProps {
  /** Straight into the app. */
  onDone: () => void;
  /** Into the app with the guided tour running. */
  onDoneWithTour: () => void;
}

type Uso = "daily" | "coding" | "custom" | "unsure";

/** What each answer to "what will you use it for" actually changes. */
const PERFIL_DE_USO: Record<Uso, string | null> = {
  daily: null,
  coding: "coding",
  custom: "custom",
  unsure: null,
};

const Paso: React.FC<{
  numero: number;
  total: number;
  children: React.ReactNode;
}> = ({ numero, total, children }) => (
  <div className="flex h-screen w-screen flex-col overflow-hidden">
    {/* The accent bleeds in from the top corner. The screen is mostly empty by
        design — one question at a time — and a flat wall of background read as
        an unfinished page rather than a calm one. */}
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(680px 320px at 78% -8%, color-mix(in srgb, var(--color-logo-primary) 20%, transparent), transparent 72%)",
      }}
    />
    <div className="relative flex shrink-0 items-center gap-4 px-8 pt-6">
      <VoCriptTextLogo width={116} />
      <div className="ms-auto flex items-center gap-[7px]">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className="h-[3px] w-[22px] rounded-sm"
            style={{
              background:
                i < numero
                  ? "color-mix(in srgb, var(--color-logo-primary) 45%, transparent)"
                  : i === numero
                    ? "var(--vc-accent-text)"
                    : "var(--vc-border)",
            }}
          />
        ))}
      </div>
    </div>
    {children}
  </div>
);

/** One answer card. */
const Opcion: React.FC<{
  activa?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  titulo: string;
  pie?: string;
}> = ({ activa = false, onClick, icon, titulo, pie }) => (
  <button
    type="button"
    aria-pressed={activa}
    onClick={onClick}
    className="flex flex-col gap-[3px] rounded-xl border p-[15px_17px] text-start transition-colors"
    style={{
      background: activa
        ? "color-mix(in srgb, var(--color-logo-primary) 20%, transparent)"
        : "var(--vc-card-bg)",
      borderColor: activa ? "var(--color-logo-primary)" : "var(--vc-border)",
    }}
  >
    {icon && <span className="text-[var(--vc-text-muted)]">{icon}</span>}
    <b className="text-[14.5px] font-semibold text-[var(--vc-text-main)]">
      {titulo}
    </b>
    {pie && (
      <span className="text-[12.5px] text-[var(--vc-text-muted)]">{pie}</span>
    )}
  </button>
);

export const FirstRun: React.FC<FirstRunProps> = ({
  onDone,
  onDoneWithTour,
}) => {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.language;

  const models = useModelStore((s) => s.models);
  const downloadModel = useModelStore((s) => s.downloadModel);
  const selectModel = useModelStore((s) => s.selectModel);
  const downloadingModels = useModelStore((s) => s.downloadingModels);
  const verifyingModels = useModelStore((s) => s.verifyingModels);
  const extractingModels = useModelStore((s) => s.extractingModels);
  const downloadProgress = useModelStore((s) => s.downloadProgress);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const idiomaSistema =
    useSettingsStore((s) => s.settings?.selected_language) ?? "en";

  const [paso, setPaso] = useState(0);
  /** So the "Another language" card can open the list under it. */
  const selectorIdiomas = useRef<HTMLDivElement>(null);
  const [idioma, setIdioma] = useState<string>(idiomaSistema);
  const [uso, setUso] = useState<Uso | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  // The download didn't start or came back empty-handed (no connection is
  // the usual reason). Without this the last screen has two dead buttons
  // and no way out.
  const [fallo, setFallo] = useState(false);
  const [esMac, setEsMac] = useState(false);
  const [permisos, setPermisos] = useState({
    microphone: false,
    accessibility: false,
  });

  // A reinstall usually keeps the models. Downloading half a gigabyte again
  // because the app forgot to look is the kind of thing people notice.
  const yaDescargados = useMemo(
    () => models.filter((m) => m.is_downloaded),
    [models],
  );
  const recomendadoId = useMemo(
    () => getRecommendedModelId(models, idioma),
    [models, idioma],
  );
  const recomendado = models.find((m) => m.id === recomendadoId) ?? null;

  const idiomasTodos = useMemo(
    () =>
      LANGUAGES.filter((l) => l.value !== "auto")
        .map((l) => ({
          value: l.value,
          label: languageName(l.value, uiLanguage) ?? l.label,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, uiLanguage)),
    [uiLanguage],
  );

  useEffect(() => {
    try {
      setEsMac(platform() === "macos");
    } catch {
      setEsMac(false);
    }
  }, []);

  /** Poll the permissions while the last screen is up. */
  const revisarPermisos = useCallback(async () => {
    try {
      if (esMac) {
        const [acc, mic] = await Promise.all([
          checkAccessibilityPermission(),
          checkMicrophonePermission(),
        ]);
        setPermisos({ accessibility: acc, microphone: mic });
      } else {
        const estado = await commands.getWindowsMicrophonePermissionStatus();
        setPermisos({
          accessibility: true,
          microphone: !estado.supported || estado.overall_access !== "denied",
        });
      }
    } catch (e) {
      console.warn("First run: could not read the permissions", e);
    }
  }, [esMac]);

  useEffect(() => {
    if (paso !== 2) return;
    void revisarPermisos();
    const id = window.setInterval(revisarPermisos, 1500);
    return () => window.clearInterval(id);
  }, [paso, revisarPermisos]);

  const elegirIdioma = (code: string) => {
    setIdioma(code);
    updateSetting("selected_language", code);
  };

  /**
   * Start the download the moment the language is settled, not on the screen
   * that shows the bar: the whole point is that the wait happens while you are
   * answering the next question instead of afterwards.
   */
  const empezarDescarga = useCallback(() => {
    if (descargando || yaDescargados.length > 0 || !recomendadoId) return;
    setDescargando(recomendadoId);
    setFallo(false);
    void downloadModel(recomendadoId).then((ok) => {
      if (!ok) {
        setDescargando(null);
        setFallo(true);
      }
    });
  }, [descargando, yaDescargados.length, recomendadoId, downloadModel]);

  // Model ready (downloaded, verified and extracted): make it the active one.
  useEffect(() => {
    if (!descargando) return;
    const m = models.find((x) => x.id === descargando);
    const enCurso =
      descargando in downloadingModels ||
      descargando in verifyingModels ||
      descargando in extractingModels;
    if (m?.is_downloaded && !enCurso) {
      void selectModel(descargando).then((ok) => {
        if (ok) setListo(true);
        else toast.error(t("onboarding.errors.selectModel"));
      });
    }
  }, [
    descargando,
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
    t,
  ]);

  // Nothing to download: whatever is already on disk becomes the active model.
  useEffect(() => {
    if (paso !== 2 || descargando || listo || yaDescargados.length === 0)
      return;
    const mejor =
      yaDescargados.find((m) => m.id === recomendadoId) ?? yaDescargados[0];
    void selectModel(mejor.id).then((ok) => setListo(ok));
  }, [paso, descargando, listo, yaDescargados, recomendadoId, selectModel]);

  const progreso = descargando
    ? (downloadProgress[descargando]?.percentage ?? 0)
    : 0;
  const permisosOk = permisos.microphone && permisos.accessibility;
  // With a model in place you need the permission too; with the download
  // broken, the permission alone is enough to get in — the app's own footer
  // says there is no model and Models is one click away.
  const puedeEmpezar = permisosOk && (listo || fallo);

  const pedirPermiso = async (cual: "mic" | "acc") => {
    try {
      if (esMac) {
        if (cual === "mic") await requestMicrophonePermission();
        else await requestAccessibilityPermission();
      } else {
        await commands.openMicrophonePrivacySettings();
      }
      void revisarPermisos();
    } catch (e) {
      console.error("First run: the permission could not be requested", e);
      toast.error(t("onboarding.permissions.errors.requestFailed"));
    }
  };

  const Pie: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="relative flex shrink-0 items-center gap-2 px-8 pb-6 pt-4">
      {paso > 0 && (
        <button
          type="button"
          onClick={() => setPaso((p) => p - 1)}
          className="rounded-lg px-2 py-2 text-[13.5px] text-[var(--vc-text-muted)] transition-colors hover:text-[var(--vc-text-main)]"
        >
          {t("onboarding.first.back")}
        </button>
      )}
      <div className="ms-auto flex items-center gap-2">{children}</div>
    </div>
  );

  const Pregunta: React.FC<{
    texto: string;
    ayuda?: string;
    children: React.ReactNode;
  }> = ({ texto, ayuda, children }) => (
    <div className="relative grid flex-1 place-items-center overflow-y-auto px-8">
      <div className="flex w-full max-w-[600px] flex-col gap-5 py-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-[30px] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--vc-text-main)]">
            {texto}
          </h1>
          {ayuda && (
            <p className="text-sm leading-relaxed text-[var(--vc-text-muted)]">
              {ayuda}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );

  // ---- 1. Language ----
  if (paso === 0) {
    const nombreSistema = languageName(idiomaSistema, uiLanguage);
    const esOtro =
      idioma !== idiomaSistema && idioma !== "en" && idioma !== "auto";

    /**
     * Built rather than hard-coded, because the obvious four cards collide:
     * an English system printed "English" twice, both of them selected, and
     * a system set to "auto" would have done the same against "Several".
     */
    const tarjetas: React.ReactNode[] = [];
    if (idiomaSistema !== "auto") {
      tarjetas.push(
        <Opcion
          key="sistema"
          activa={idioma === idiomaSistema}
          onClick={() => elegirIdioma(idiomaSistema)}
          icon={<Globe size={18} />}
          titulo={conMayuscula(nombreSistema ?? idiomaSistema, uiLanguage)}
          pie={t("onboarding.first.language.fromSystem")}
        />,
      );
    }
    if (idiomaSistema !== "en") {
      tarjetas.push(
        <Opcion
          key="en"
          activa={idioma === "en"}
          onClick={() => elegirIdioma("en")}
          icon={<Globe size={18} />}
          titulo={conMayuscula(
            languageName("en", uiLanguage) ?? "English",
            uiLanguage,
          )}
          pie="English"
        />,
      );
    }
    tarjetas.push(
      <Opcion
        key="otro"
        activa={esOtro}
        // Nothing of its own to set: it hands over to the list below, which is
        // where the other hundred languages are. A card that looked pressable
        // and did nothing was worse than no card at all.
        onClick={() =>
          selectorIdiomas.current?.querySelector("button")?.click()
        }
        titulo={
          esOtro
            ? conMayuscula(
                languageName(idioma, uiLanguage) ?? idioma,
                uiLanguage,
              )
            : t("onboarding.first.language.other")
        }
        pie={t("onboarding.first.language.otherHint", {
          count: idiomasTodos.length,
        })}
      />,
    );
    tarjetas.push(
      <Opcion
        key="varios"
        activa={idioma === "auto"}
        onClick={() => elegirIdioma("auto")}
        titulo={t("onboarding.first.language.mixed")}
        pie={t("onboarding.first.language.mixedHint")}
      />,
    );

    return (
      <Paso numero={0} total={3}>
        <Pregunta texto={t("onboarding.first.language.question")}>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {tarjetas}
          </div>
          {/* The way out of the four cards. Full width so it reads as part of
              the answer grid rather than as a stray control under it. */}
          <div className="[&_button]:w-full" ref={selectorIdiomas}>
            <Dropdown
              options={idiomasTodos}
              selectedValue={esOtro ? idioma : null}
              onSelect={elegirIdioma}
              placeholder={t("onboarding.otherLanguage")}
            />
          </div>
        </Pregunta>
        <Pie>
          <button
            type="button"
            onClick={() => {
              empezarDescarga();
              setPaso(1);
            }}
            className="rounded-lg bg-logo-primary px-[18px] py-[9px] text-[13.5px] font-semibold text-white transition hover:brightness-110"
          >
            {t("onboarding.first.next")}
          </button>
        </Pie>
      </Paso>
    );
  }

  // ---- 2. What for ----
  if (paso === 1) {
    const elegir = (v: Uso) => {
      setUso(v);
      updateSetting("work_profile", PERFIL_DE_USO[v]);
    };
    return (
      <Paso numero={1} total={3}>
        <Pregunta
          texto={t("onboarding.first.use.question")}
          ayuda={t("onboarding.first.use.hint")}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Opcion
              activa={uso === "daily"}
              onClick={() => elegir("daily")}
              titulo={t("onboarding.first.use.daily")}
              pie={t("onboarding.first.use.dailyHint")}
            />
            <Opcion
              activa={uso === "coding"}
              onClick={() => elegir("coding")}
              titulo={t("onboarding.first.use.coding")}
              pie={t("onboarding.first.use.codingHint")}
            />
            <Opcion
              activa={uso === "custom"}
              onClick={() => elegir("custom")}
              titulo={t("onboarding.first.use.custom")}
              pie={t("onboarding.first.use.customHint")}
            />
            <Opcion
              activa={uso === "unsure"}
              onClick={() => elegir("unsure")}
              titulo={t("onboarding.first.use.unsure")}
              pie={t("onboarding.first.use.unsureHint")}
            />
          </div>
        </Pregunta>
        <Pie>
          <button
            type="button"
            onClick={() => setPaso(2)}
            className="rounded-lg bg-logo-primary px-[18px] py-[9px] text-[13.5px] font-semibold text-white transition hover:brightness-110"
          >
            {t("onboarding.first.next")}
          </button>
        </Pie>
      </Paso>
    );
  }

  // ---- 3. Permission, with the download running behind it ----
  const filaPermiso = (
    cual: "mic" | "acc",
    icono: React.ReactNode,
    titulo: string,
    ayuda: string,
    concedido: boolean,
  ) => (
    <div className="flex items-center gap-3.5 rounded-xl border border-[var(--vc-border)] bg-[var(--vc-card-bg)] p-[16px_18px]">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-accent"
        style={{
          background:
            "color-mix(in srgb, var(--color-logo-primary) 20%, transparent)",
        }}
      >
        {icono}
      </span>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-[var(--vc-text-main)]">
          {titulo}
        </div>
        <div className="text-[12.5px] text-[var(--vc-text-muted)]">{ayuda}</div>
      </div>
      <div className="ms-auto shrink-0">
        {concedido ? (
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--vc-state-done)]">
            <Check size={14} strokeWidth={2.6} />
            {t("onboarding.permissions.granted")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => pedirPermiso(cual)}
            className="rounded-lg border border-[var(--vc-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--vc-text-main)] transition-colors hover:border-[var(--vc-text-muted)]"
          >
            {t("onboarding.first.permission.grant")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Paso numero={2} total={3}>
      <Pregunta
        texto={t("onboarding.first.permission.question")}
        ayuda={
          descargando
            ? t("onboarding.first.permission.hintDownloading")
            : t("onboarding.first.permission.hint")
        }
      >
        {filaPermiso(
          "mic",
          <Mic size={20} />,
          t("onboarding.permissions.microphone.title"),
          t("onboarding.first.permission.micHint"),
          permisos.microphone,
        )}
        {esMac &&
          filaPermiso(
            "acc",
            <Keyboard size={20} />,
            t("onboarding.permissions.accessibility.title"),
            t("onboarding.first.permission.accHint"),
            permisos.accessibility,
          )}

        {/* The model. Downloading, already here, or nothing to do. */}
        <div className="flex items-center gap-3 rounded-xl border border-[var(--vc-border)] bg-[var(--vc-card-bg)] p-[13px_16px]">
          <span className="shrink-0 text-accent">
            {listo ? (
              <Check size={18} strokeWidth={2.6} />
            ) : (
              <Download size={18} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="truncate text-[var(--vc-text-main)]">
                {recomendado?.name ?? yaDescargados[0]?.name ?? "—"}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--vc-text-muted)]">
                {listo
                  ? t("onboarding.first.model.ready")
                  : fallo
                    ? t("onboarding.first.model.failed")
                    : descargando
                      ? `${Math.round(progreso)}%`
                      : ""}
              </span>
            </div>
            {fallo && (
              <button
                type="button"
                onClick={empezarDescarga}
                className="mt-1 text-[12.5px] font-semibold text-accent hover:underline"
              >
                {t("onboarding.first.model.retry")}
              </button>
            )}
            {!listo && descargando && (
              <div className="mt-[7px] h-[5px] overflow-hidden rounded-sm bg-[var(--vc-border)]">
                <span
                  className="block h-full rounded-sm bg-logo-primary transition-[width]"
                  style={{ width: `${Math.max(2, progreso)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </Pregunta>
      <Pie>
        <button
          type="button"
          onClick={onDoneWithTour}
          disabled={!puedeEmpezar}
          className="rounded-lg border border-[var(--vc-border)] px-[18px] py-[9px] text-[13.5px] font-semibold text-[var(--vc-text-muted)] transition-colors hover:text-[var(--vc-text-main)] disabled:opacity-40"
        >
          {t("onboarding.first.seeGuide")}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={!puedeEmpezar}
          className="rounded-lg bg-logo-primary px-[18px] py-[9px] text-[13.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {t("onboarding.first.start")}
        </button>
      </Pie>
    </Paso>
  );
};

export default FirstRun;

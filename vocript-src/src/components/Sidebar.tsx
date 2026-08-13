import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ChevronLeft,
  Cog,
  FlaskConical,
  History,
  Info,
  Languages,
  Sparkles,
  Cpu,
  AudioLines,
  FileAudio,
  MessageSquare,
  Palette,
  Home,
} from "lucide-react";
import VoCriptTextLogo from "./icons/VoCriptTextLogo";
import VoCriptMark from "./icons/VoCriptMark";
import { useSettings } from "../hooks/useSettings";
import { useResolvedTheme } from "../hooks/useResolvedTheme";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  ActivitySettings,
  TranslationSettings,
  DebugSettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
  FileTranscription,
  FeedbackSettings,
  ThemesSettings,
} from "./settings";
import { TodayScreen } from "./today/TodayScreen";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  today: {
    labelKey: "sidebar.today",
    icon: Home,
    component: TodayScreen,
    enabled: () => true,
  },
  general: {
    labelKey: "sidebar.general",
    icon: AudioLines,
    component: GeneralSettings,
    enabled: () => true,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
    enabled: () => true,
  },
  file: {
    labelKey: "sidebar.fileTranscription",
    icon: FileAudio,
    component: FileTranscription,
    enabled: () => true,
  },
  history: {
    labelKey: "sidebar.history",
    icon: History,
    component: HistorySettings,
    enabled: () => true,
  },
  translation: {
    labelKey: "sidebar.translation",
    icon: Languages,
    component: TranslationSettings,
    enabled: () => true,
  },
  activity: {
    labelKey: "sidebar.activity",
    icon: Activity,
    component: ActivitySettings,
    enabled: () => true,
  },
  themes: {
    labelKey: "sidebar.themes",
    icon: Palette,
    component: ThemesSettings,
    enabled: () => true,
  },
  postprocessing: {
    labelKey: "sidebar.postProcessing",
    icon: Sparkles,
    component: PostProcessingSettings,
    enabled: (settings) => settings?.post_process_enabled ?? false,
  },
  debug: {
    labelKey: "sidebar.debug",
    icon: FlaskConical,
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
  about: {
    labelKey: "sidebar.about",
    icon: Info,
    component: AboutSettings,
    enabled: () => true,
  },
  feedback: {
    labelKey: "sidebar.feedback",
    icon: MessageSquare,
    component: FeedbackSettings,
    enabled: () => true,
  },
  advanced: {
    labelKey: "sidebar.advanced",
    icon: Cog,
    component: AdvancedSettings,
    enabled: () => true,
  },
} as const satisfies Record<string, SectionConfig>;

/**
 * The sidebar in groups, as agreed in the redesign. Nothing is split, merged
 * or renamed here: these are the same sections as before, sorted into the
 * four headings so a list of twelve reads as three short ones.
 *
 * A section missing from this map still shows up, under "System", so adding a
 * section later can't make it silently disappear from the menu.
 */
const SECTION_GROUPS = [
  // "Today" is on its own above the headings: it's the home screen, not one of
  // the settings sections, and giving it a heading of its own would say it is.
  { rotulo: null, ids: ["today"] as SidebarSection[] },
  { rotulo: "sidebar.groups.dictation", ids: ["general"] as SidebarSection[] },
  {
    rotulo: "sidebar.groups.content",
    ids: ["file", "history", "translation", "activity"] as SidebarSection[],
  },
  {
    rotulo: "sidebar.groups.system",
    ids: [
      "models",
      "themes",
      "postprocessing",
      "debug",
      "about",
      "feedback",
      "advanced",
    ] as SidebarSection[],
  },
];

/** Collapsed state is pure UI, so it lives in localStorage, not in settings. */
const CLAVE_PLEGADO = "vocript_sidebar_collapsed";

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const isLight = useResolvedTheme() === "light";

  const [plegado, setPlegado] = useState<boolean>(() => {
    try {
      return localStorage.getItem(CLAVE_PLEGADO) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_PLEGADO, plegado ? "1" : "0");
    } catch {
      /* modo privado: se queda sin recordar, no es motivo para romper nada */
    }
  }, [plegado]);

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  const porId = new Map(availableSections.map((s) => [s.id, s]));
  const agrupadas = SECTION_GROUPS.map((g) => ({
    rotulo: g.rotulo,
    secciones: g.ids
      .map((id) => porId.get(id))
      .filter(Boolean) as typeof availableSections,
  }));
  // Anything not listed in SECTION_GROUPS lands in the last group rather than
  // vanishing from the menu.
  const colocadas = new Set(SECTION_GROUPS.flatMap((g) => g.ids));
  const sueltas = availableSections.filter((s) => !colocadas.has(s.id));
  if (sueltas.length)
    agrupadas[agrupadas.length - 1].secciones.push(...sueltas);

  const renderSectionButton = (section: (typeof availableSections)[number]) => {
    const Icon = section.icon;
    const isActive = activeSection === section.id;

    return (
      <button
        key={section.id}
        type="button"
        onClick={() => onSectionChange(section.id)}
        title={t(section.labelKey)}
        aria-current={isActive ? "page" : undefined}
        className={`group relative flex items-center rounded-xl py-2.5 text-start transition-all duration-200 font-semibold text-xs ${
          plegado ? "justify-center px-0 w-full" : "gap-3 w-full ps-3.5 pe-3"
        } ${
          isActive
            ? "bg-logo-primary text-white"
            : isLight
              ? "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
        }`}
      >
        <Icon
          width={18}
          height={18}
          className={`shrink-0 transition-colors ${
            isActive ? "text-white" : "text-accent"
          }`}
        />
        {!plegado && <span className="truncate">{t(section.labelKey)}</span>}
      </button>
    );
  };

  return (
    <div
      className={`flex flex-col h-full shrink-0 border-e select-none transition-[width,background-color] duration-200 ${
        plegado ? "w-14" : "w-52"
      } ${isLight ? "bg-slate-100 border-slate-200" : "bg-[var(--vc-sidebar-bg)] border-white/10"}`}
    >
      <div
        className={`flex flex-col items-center pt-5 pb-3 ${plegado ? "px-2" : "px-4"}`}
      >
        {plegado ? <VoCriptMark width={24} /> : <VoCriptTextLogo width={136} />}
      </div>
      <div className="mx-4 mb-3 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />

      <nav
        className={`flex flex-col gap-1.5 py-1 overflow-y-auto overflow-x-hidden flex-1 min-h-0 ${
          plegado ? "px-2" : "px-3"
        }`}
      >
        {agrupadas.map((grupo, i) =>
          grupo.secciones.length === 0 ? null : (
            <React.Fragment key={grupo.rotulo ?? `g${i}`}>
              {grupo.rotulo &&
                (plegado ? (
                  // Collapsed there's no room for a heading, so the group
                  // becomes a hairline: the grouping survives, the clipped
                  // half-word doesn't.
                  <div
                    className={`mx-2 my-1.5 h-px ${isLight ? "bg-slate-300" : "bg-white/10"}`}
                  />
                ) : (
                  <div
                    className={`px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      isLight ? "text-slate-400" : "text-slate-500"
                    }`}
                  >
                    {t(grupo.rotulo)}
                  </div>
                ))}
              {grupo.secciones.map((section) => renderSectionButton(section))}
            </React.Fragment>
          ),
        )}
      </nav>

      <div
        className={`border-t transition-colors ${plegado ? "px-2 py-2" : "px-3 py-2.5"} ${
          isLight ? "border-slate-200" : "border-white/10"
        }`}
      >
        <button
          type="button"
          onClick={() => setPlegado((v) => !v)}
          title={t(plegado ? "sidebar.expand" : "sidebar.collapse")}
          aria-expanded={!plegado}
          className={`flex items-center rounded-xl py-2 text-xs font-medium transition-colors ${
            plegado ? "justify-center w-full" : "gap-2.5 w-full ps-3.5 pe-3"
          } ${
            isLight
              ? "text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
              : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-300"
          }`}
        >
          <ChevronLeft
            size={16}
            className={`shrink-0 transition-transform ${plegado ? "rotate-180" : ""} rtl:-scale-x-100`}
          />
          {!plegado && (
            <span className="truncate">{t("sidebar.collapse")}</span>
          )}
        </button>
      </div>
    </div>
  );
};

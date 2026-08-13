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
  Palette,
  Home,
} from "lucide-react";
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
      "advanced",
    ] as SidebarSection[],
  },
];

/**
 * The line under each page heading. Models and Activity already had one of
 * their own inside the section, so those two reuse their existing text rather
 * than getting a second, near-identical sentence written for them.
 */
export const SECTION_SUBTITLE: Partial<Record<SidebarSection, string>> = {
  general: "settings.pageSubtitle.general",
  models: "settings.models.description",
  file: "settings.pageSubtitle.file",
  history: "settings.pageSubtitle.history",
  translation: "settings.pageSubtitle.translation",
  activity: "activity.subtitle",
  themes: "settings.pageSubtitle.themes",
  postprocessing: "settings.pageSubtitle.postProcessing",
  debug: "settings.pageSubtitle.debug",
  about: "settings.pageSubtitle.about",
  advanced: "settings.pageSubtitle.advanced",
};

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
        // The selected item is a tint of the accent with normal text, not a
        // solid accent pill with white on top: with a bold accent the solid
        // version was the loudest thing on screen, louder than the content.
        className={`group relative flex items-center rounded-lg py-[7px] text-start text-[13.5px] transition-colors ${
          plegado
            ? "justify-center px-0 w-full"
            : "gap-2.5 w-full ps-2.5 pe-2.5"
        } ${
          isActive
            ? "font-semibold text-[var(--vc-text-main)]"
            : isLight
              ? "text-slate-600 hover:bg-slate-900/[0.05] hover:text-slate-900"
              : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
        }`}
        style={
          isActive
            ? {
                background:
                  "color-mix(in srgb, var(--color-logo-primary) 20%, transparent)",
              }
            : undefined
        }
      >
        <Icon
          width={17}
          height={17}
          className={`shrink-0 transition-colors ${
            isActive ? "text-accent" : "opacity-85"
          }`}
        />
        {!plegado && <span className="truncate">{t(section.labelKey)}</span>}
      </button>
    );
  };

  return (
    <div
      className={`flex flex-col h-full shrink-0 select-none border-e border-[var(--vc-border)] bg-[var(--vc-sidebar-bg)] transition-[width] duration-200 ${
        plegado ? "w-14" : "w-[206px]"
      }`}
    >
      {/* No brand here: it lives in the bar across the top now, so the menu
          starts at the first section instead of a logo and a divider. */}
      <nav
        className={`flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 p-2 ${
          plegado ? "px-1.5" : ""
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
                  <div className="mx-3 my-2 h-px bg-[var(--vc-border)]" />
                ) : (
                  <div className="px-2.5 pt-3.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-[var(--vc-text-muted)] opacity-80">
                    {t(grupo.rotulo)}
                  </div>
                ))}
              {grupo.secciones.map((section) => renderSectionButton(section))}
            </React.Fragment>
          ),
        )}
      </nav>

      <div className="border-t border-[var(--vc-border)] p-2">
        <button
          type="button"
          onClick={() => setPlegado((v) => !v)}
          title={t(plegado ? "sidebar.expand" : "sidebar.collapse")}
          aria-expanded={!plegado}
          className={`flex items-center rounded-lg py-1.5 text-[12.5px] text-[var(--vc-text-muted)] transition-colors ${
            plegado ? "justify-center w-full" : "gap-2.5 w-full ps-2.5 pe-2.5"
          } ${isLight ? "hover:bg-slate-900/[0.05]" : "hover:bg-white/[0.06]"}`}
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

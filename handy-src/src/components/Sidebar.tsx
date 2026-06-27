import React from "react";
import { useTranslation } from "react-i18next";
import {
  Cog,
  FlaskConical,
  History,
  Info,
  Sparkles,
  Cpu,
  AudioLines,
  FileAudio,
} from "lucide-react";
import HandyTextLogo from "./icons/HandyTextLogo";
import { useSettings } from "../hooks/useSettings";
import {
  GeneralSettings,
  AdvancedSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  PostProcessingSettings,
  ModelsSettings,
  FileTranscription,
} from "./settings";

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
  const isLight = settings?.theme === "light";

  const availableSections = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id, config]) => ({ id: id as SidebarSection, ...config }));

  const renderSectionButton = (section: (typeof availableSections)[number]) => {
    const Icon = section.icon;
    const isActive = activeSection === section.id;

    return (
      <button
        key={section.id}
        type="button"
        onClick={() => onSectionChange(section.id)}
        title={t(section.labelKey)}
        className={`group relative flex items-center gap-3 w-full rounded-xl ps-3.5 pe-3 py-2.5 text-start transition-all duration-200 font-semibold text-xs ${
          isActive
            ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]"
            : isLight
              ? "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
        }`}
      >
        <Icon
          width={18}
          height={18}
          className={`shrink-0 transition-colors ${
            isActive
              ? "text-white"
              : isLight
                ? "text-blue-600 group-hover:text-blue-700"
                : "text-blue-400 group-hover:text-blue-300"
          }`}
        />
        <span className="truncate">{t(section.labelKey)}</span>
      </button>
    );
  };

  const topSections = availableSections.filter((s) => s.id !== "advanced");
  const advancedSection = availableSections.find((s) => s.id === "advanced");

  return (
    <div
      className={`flex flex-col w-52 h-full shrink-0 border-e select-none transition-colors duration-200 ${
        isLight
          ? "bg-slate-100 border-slate-200"
          : "bg-[#0c0d12] border-white/10"
      }`}
    >
      <div className="flex flex-col items-center px-4 pt-5 pb-3">
        <HandyTextLogo width={136} />
      </div>
      <div className="mx-4 mb-3 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
      <nav className="flex flex-col gap-1.5 px-3 py-1 overflow-y-auto flex-1 min-h-0">
        {topSections.map((section) => renderSectionButton(section))}
      </nav>
      {advancedSection && (
        <nav
          className={`flex flex-col gap-1 px-3 pt-2.5 pb-3 border-t transition-colors ${
            isLight
              ? "border-slate-200 bg-slate-200/40"
              : "border-white/10 bg-[#0a0b0f]"
          }`}
        >
          {renderSectionButton(advancedSection)}
        </nav>
      )}
    </div>
  );
};

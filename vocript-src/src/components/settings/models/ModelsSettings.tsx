import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask, open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  Globe,
  Search,
  FileUp,
  FolderSearch,
  Download,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { ModelCardStatus } from "@/components/onboarding";
import { ModelCard } from "@/components/onboarding";
import { useModelStore } from "@/stores/modelStore";
import { useSettings } from "@/hooks/useSettings";
import { LANGUAGES } from "@/lib/constants/languages.ts";
import { getRecommendedModelId } from "@/lib/utils/modelRecommendation";
import type { ModelInfo, FoundModel } from "@/bindings";

// check if model supports a language based on its supported_languages list
const modelSupportsLanguage = (model: ModelInfo, langCode: string): boolean => {
  return model.supported_languages.includes(langCode);
};

export const ModelsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const [languageFilter, setLanguageFilter] = useState("all");
  const [languageDropdownOpen, setLanguageDropdownOpen] = useState(false);
  const [languageSearch, setLanguageSearch] = useState("");
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const languageSearchInputRef = useRef<HTMLInputElement>(null);
  // Import / reuse existing models
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<FoundModel[] | null>(null);
  const [importingPath, setImportingPath] = useState<string | null>(null);
  const {
    models,
    currentModel,
    downloadingModels,
    downloadProgress,
    downloadStats,
    verifyingModels,
    extractingModels,
    loading,
    downloadModel,
    cancelDownload,
    selectModel,
    deleteModel,
    importModel,
    scanForModels,
  } = useModelStore();
  const { settings } = useSettings();

  // Model recommended for the user's currently selected dictation language.
  const selectedLanguage = settings?.selected_language ?? "auto";
  const recommendedModelId = useMemo(
    () => getRecommendedModelId(models, selectedLanguage),
    [models, selectedLanguage],
  );
  const recommendedBadgeText = useMemo(() => {
    if (selectedLanguage && selectedLanguage !== "auto") {
      const langLabel = LANGUAGES.find(
        (l) => l.value === selectedLanguage,
      )?.label;
      if (langLabel) {
        return t("settings.models.recommendedForLanguage", {
          language: langLabel,
        });
      }
    }
    return t("onboarding.recommended");
  }, [selectedLanguage, t]);

  // click outside handler for language dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(event.target as Node)
      ) {
        setLanguageDropdownOpen(false);
        setLanguageSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // focus search input when dropdown opens
  useEffect(() => {
    if (languageDropdownOpen && languageSearchInputRef.current) {
      languageSearchInputRef.current.focus();
    }
  }, [languageDropdownOpen]);

  // filtered languages for dropdown (exclude "auto")
  const filteredLanguages = useMemo(() => {
    return LANGUAGES.filter(
      (lang) =>
        lang.value !== "auto" &&
        lang.label.toLowerCase().includes(languageSearch.toLowerCase()),
    );
  }, [languageSearch]);

  // Get selected language label
  const selectedLanguageLabel = useMemo(() => {
    if (languageFilter === "all") {
      return t("settings.models.filters.allLanguages");
    }
    return LANGUAGES.find((lang) => lang.value === languageFilter)?.label || "";
  }, [languageFilter, t]);

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) {
      return "extracting";
    }
    if (modelId in verifyingModels) {
      return "verifying";
    }
    if (modelId in downloadingModels) {
      return "downloading";
    }
    if (switchingModelId === modelId) {
      return "switching";
    }
    if (modelId === currentModel) {
      return "active";
    }
    const model = models.find((m: ModelInfo) => m.id === modelId);
    if (model?.is_downloaded) {
      return "available";
    }
    return "downloadable";
  };

  const getDownloadProgress = (modelId: string): number | undefined => {
    const progress = downloadProgress[modelId];
    return progress?.percentage;
  };

  const getDownloadSpeed = (modelId: string): number | undefined => {
    const stats = downloadStats[modelId];
    return stats?.speed;
  };

  const handleModelSelect = async (modelId: string) => {
    setSwitchingModelId(modelId);
    try {
      await selectModel(modelId);
    } finally {
      setSwitchingModelId(null);
    }
  };

  const handleModelDownload = async (modelId: string) => {
    await downloadModel(modelId);
  };

  const handleModelDelete = async (modelId: string) => {
    const model = models.find((m: ModelInfo) => m.id === modelId);
    const modelName = model?.name || modelId;
    const isActive = modelId === currentModel;

    const confirmed = await ask(
      isActive
        ? t("settings.models.deleteActiveConfirm", { modelName })
        : t("settings.models.deleteConfirm", { modelName }),
      {
        title: t("settings.models.deleteTitle"),
        kind: "warning",
      },
    );

    if (confirmed) {
      try {
        await deleteModel(modelId);
      } catch (err) {
        console.error(`Failed to delete model ${modelId}:`, err);
      }
    }
  };

  const handleModelCancel = async (modelId: string) => {
    try {
      await cancelDownload(modelId);
    } catch (err) {
      console.error(`Failed to cancel download for ${modelId}:`, err);
    }
  };

  const doImport = async (path: string) => {
    setImportingPath(path);
    try {
      const id = await importModel(path);
      if (id) {
        toast.success(t("settings.models.import.imported"));
        setScanResults((prev) =>
          prev ? prev.filter((f) => f.path !== path) : prev,
        );
      } else {
        toast.error(t("settings.models.import.failed"));
      }
    } finally {
      setImportingPath(null);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const found = await scanForModels();
      setScanResults(found);
      if (found.length === 0) {
        toast.info(t("settings.models.import.noneFound"));
      }
    } finally {
      setScanning(false);
    }
  };

  const handleImportFile = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Whisper model", extensions: ["bin"] }],
    });
    if (typeof selected === "string") {
      await doImport(selected);
    }
  };

  const handleImportFolder = async () => {
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected === "string") {
      await doImport(selected);
    }
  };

  const formatSize = (sizeMb: number): string =>
    sizeMb >= 1024 ? `${(sizeMb / 1024).toFixed(1)} GB` : `${sizeMb} MB`;

  // Filter models based on language filter
  const filteredModels = useMemo(() => {
    return models.filter((model: ModelInfo) => {
      if (languageFilter !== "all") {
        if (!modelSupportsLanguage(model, languageFilter)) return false;
      }
      return true;
    });
  }, [models, languageFilter]);

  // Split filtered models into downloaded (including custom) and available sections
  const { downloadedModels, availableModels } = useMemo(() => {
    const downloaded: ModelInfo[] = [];
    const available: ModelInfo[] = [];

    for (const model of filteredModels) {
      if (
        model.is_custom ||
        model.is_downloaded ||
        model.id in downloadingModels ||
        model.id in extractingModels
      ) {
        downloaded.push(model);
      } else {
        available.push(model);
      }
    }

    // Sort: active model first, then non-custom, then custom at the bottom
    downloaded.sort((a, b) => {
      if (a.id === currentModel) return -1;
      if (b.id === currentModel) return 1;
      if (a.is_custom !== b.is_custom) return a.is_custom ? 1 : -1;
      return 0;
    });

    return {
      downloadedModels: downloaded,
      availableModels: available,
    };
  }, [filteredModels, downloadingModels, extractingModels, currentModel]);

  if (loading) {
    return (
      <div className="max-w-3xl w-full mx-auto">
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-logo-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl w-full mx-auto space-y-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold mb-2">
          {t("settings.models.title")}
        </h1>
        <p className="text-sm text-text/60">
          {t("settings.models.description")}
        </p>
      </div>

      {/* Reuse existing models: scan the computer or import manually */}
      <div className="rounded-lg border border-mid-gray/30 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-medium">
            {t("settings.models.import.title")}
          </h2>
          <p className="text-xs text-text/60 mt-0.5">
            {t("settings.models.import.description")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-logo-primary/20 text-logo-primary hover:bg-logo-primary/30 transition-colors disabled:opacity-50"
          >
            {scanning ? (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            {t("settings.models.import.scan")}
          </button>
          <button
            type="button"
            onClick={handleImportFile}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-mid-gray/10 text-text/70 hover:bg-mid-gray/20 transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" />
            {t("settings.models.import.file")}
          </button>
          <button
            type="button"
            onClick={handleImportFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-mid-gray/10 text-text/70 hover:bg-mid-gray/20 transition-colors"
          >
            <FolderSearch className="w-3.5 h-3.5" />
            {t("settings.models.import.folder")}
          </button>
        </div>

        {scanResults && scanResults.length > 0 && (
          <div className="space-y-2 pt-1">
            {scanResults.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-3 rounded-md bg-mid-gray/5 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div
                    className="text-xs text-text/50 truncate"
                    title={f.path}
                  >
                    {f.path}
                  </div>
                </div>
                <span className="text-xs text-text/50 shrink-0">
                  {formatSize(f.size_mb)}
                </span>
                {f.already_imported ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 shrink-0">
                    <Check className="w-3.5 h-3.5" />
                    {t("settings.models.import.already")}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => doImport(f.path)}
                    disabled={importingPath === f.path}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-logo-primary/20 text-logo-primary hover:bg-logo-primary/30 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {importingPath === f.path ? (
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {t("settings.models.import.use")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {scanResults && scanResults.length === 0 && (
          <p className="text-xs text-text/50">
            {t("settings.models.import.noneFound")}
          </p>
        )}
      </div>

      {filteredModels.length > 0 ? (
        <div className="space-y-6">
          {/* Downloaded Models Section — header always visible so filter stays accessible */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text/60">
                {t("settings.models.yourModels")}
              </h2>
              {/* Language filter dropdown */}
              <div className="relative" ref={languageDropdownRef}>
                <button
                  type="button"
                  onClick={() => setLanguageDropdownOpen(!languageDropdownOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    languageFilter !== "all"
                      ? "bg-logo-primary/20 text-logo-primary"
                      : "bg-mid-gray/10 text-text/60 hover:bg-mid-gray/20"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="max-w-[120px] truncate">
                    {selectedLanguageLabel}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      languageDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {languageDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-background border border-mid-gray/80 rounded-lg shadow-lg z-50 overflow-hidden">
                    <div className="p-2 border-b border-mid-gray/40">
                      <input
                        ref={languageSearchInputRef}
                        type="text"
                        value={languageSearch}
                        onChange={(e) => setLanguageSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            filteredLanguages.length > 0
                          ) {
                            setLanguageFilter(filteredLanguages[0].value);
                            setLanguageDropdownOpen(false);
                            setLanguageSearch("");
                          } else if (e.key === "Escape") {
                            setLanguageDropdownOpen(false);
                            setLanguageSearch("");
                          }
                        }}
                        placeholder={t(
                          "settings.general.language.searchPlaceholder",
                        )}
                        className="w-full px-2 py-1 text-sm bg-mid-gray/10 border border-mid-gray/40 rounded-md focus:outline-none focus:ring-1 focus:ring-logo-primary"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setLanguageFilter("all");
                          setLanguageDropdownOpen(false);
                          setLanguageSearch("");
                        }}
                        className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${
                          languageFilter === "all"
                            ? "bg-logo-primary/20 text-logo-primary font-semibold"
                            : "hover:bg-mid-gray/10"
                        }`}
                      >
                        {t("settings.models.filters.allLanguages")}
                      </button>
                      {filteredLanguages.map((lang) => (
                        <button
                          key={lang.value}
                          type="button"
                          onClick={() => {
                            setLanguageFilter(lang.value);
                            setLanguageDropdownOpen(false);
                            setLanguageSearch("");
                          }}
                          className={`w-full px-3 py-1.5 text-sm text-left transition-colors ${
                            languageFilter === lang.value
                              ? "bg-logo-primary/20 text-logo-primary font-semibold"
                              : "hover:bg-mid-gray/10"
                          }`}
                        >
                          {lang.label}
                        </button>
                      ))}
                      {filteredLanguages.length === 0 && (
                        <div className="px-3 py-2 text-sm text-text/50 text-center">
                          {t("settings.general.language.noResults")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {downloadedModels.map((model: ModelInfo) => (
              <ModelCard
                key={model.id}
                model={model}
                status={getModelStatus(model.id)}
                onSelect={handleModelSelect}
                onDownload={handleModelDownload}
                onDelete={handleModelDelete}
                onCancel={handleModelCancel}
                downloadProgress={getDownloadProgress(model.id)}
                downloadSpeed={getDownloadSpeed(model.id)}
                showRecommended={false}
                recommendedLabel={
                  model.id === recommendedModelId
                    ? recommendedBadgeText
                    : undefined
                }
              />
            ))}
          </div>

          {/* Available Models Section */}
          {availableModels.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-text/60">
                {t("settings.models.availableModels")}
              </h2>
              {availableModels.map((model: ModelInfo) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  status={getModelStatus(model.id)}
                  onSelect={handleModelSelect}
                  onDownload={handleModelDownload}
                  onDelete={handleModelDelete}
                  onCancel={handleModelCancel}
                  downloadProgress={getDownloadProgress(model.id)}
                  downloadSpeed={getDownloadSpeed(model.id)}
                  showRecommended={false}
                  recommendedLabel={
                    model.id === recommendedModelId
                      ? recommendedBadgeText
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8 text-text/50">
          {t("settings.models.noModelsMatch")}
        </div>
      )}
    </div>
  );
};

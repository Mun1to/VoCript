import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  FileAudio,
  Upload,
  Copy,
  Check,
  Save,
  Loader2,
  Captions,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { commands, type FileTranscriptionResult } from "@/bindings";
import { Button } from "../../ui/Button";
import { SettingsGroup } from "../../ui/SettingsGroup";

// Container/codec coverage of the Symphonia decoder used in the backend.
// Opus is intentionally excluded (Symphonia has no Opus decoder yet).
const AUDIO_VIDEO_EXTENSIONS = [
  "mp3",
  "wav",
  "flac",
  "ogg",
  "oga",
  "m4a",
  "mp4",
  "m4v",
  "aac",
  "mkv",
  "webm",
  "mov",
];

type OutputFormat = "text" | "srt";

const getFileName = (path: string): string => {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
};

const hasSupportedExtension = (path: string): boolean => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_VIDEO_EXTENSIONS.includes(ext);
};

const stripExtension = (name: string): string => name.replace(/\.[^.]+$/, "");

export const FileTranscription: React.FC = () => {
  const { t } = useTranslation();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [format, setFormat] = useState<OutputFormat>("text");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [result, setResult] = useState<FileTranscriptionResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  // Avoid a stale closure inside the long-lived drag-drop listener.
  const isTranscribingRef = useRef(isTranscribing);
  isTranscribingRef.current = isTranscribing;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setIsDragging(true);
        } else if (payload.type === "leave") {
          setIsDragging(false);
        } else if (payload.type === "drop") {
          setIsDragging(false);
          if (isTranscribingRef.current) return;
          const dropped = payload.paths?.[0];
          if (!dropped) return;
          if (!hasSupportedExtension(dropped)) {
            toast.error(t("settings.fileTranscription.errors.unsupported"));
            return;
          }
          setFilePath(dropped);
          setResult(null);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, [t]);

  const pickFile = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        {
          name: t("settings.fileTranscription.fileFilter"),
          extensions: AUDIO_VIDEO_EXTENSIONS,
        },
      ],
    });
    if (typeof selected === "string") {
      setFilePath(selected);
      setResult(null);
    }
  };

  const transcribe = async () => {
    if (!filePath) return;
    setIsTranscribing(true);
    setResult(null);
    try {
      const res = await commands.transcribeFile(filePath);
      if (res.status === "ok") {
        setResult(res.data);
      } else {
        toast.error(t("settings.fileTranscription.errors.failed"), {
          description: res.error,
        });
      }
    } catch (e) {
      toast.error(t("settings.fileTranscription.errors.failed"), {
        description: String(e),
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const outputText = result
    ? format === "srt"
      ? result.srt
      : result.text
    : "";

  const copyOutput = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("settings.fileTranscription.errors.copy"));
    }
  };

  const saveOutput = async () => {
    if (!outputText || !filePath) return;
    const base = stripExtension(getFileName(filePath));
    const ext = format === "srt" ? "srt" : "txt";
    const target = await save({
      defaultPath: `${base}.${ext}`,
      filters: [
        format === "srt"
          ? { name: "SubRip", extensions: ["srt"] }
          : { name: "Text", extensions: ["txt"] },
      ],
    });
    if (typeof target !== "string") return;
    const res = await commands.saveTextFile(target, outputText);
    if (res.status === "ok") {
      toast.success(t("settings.fileTranscription.saved"));
    } else {
      toast.error(t("settings.fileTranscription.errors.save"), {
        description: res.error,
      });
    }
  };

  const formatDuration = (secs: number): string => {
    const total = Math.round(secs);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup
        title={t("settings.fileTranscription.title")}
        description={t("settings.fileTranscription.description")}
      >
        <div className="p-4 space-y-4">
          {/* File picker / drop target */}
          <button
            type="button"
            onClick={pickFile}
            className={`w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors ${
              isDragging
                ? "border-logo-primary bg-logo-primary/10"
                : "border-mid-gray/30 hover:border-logo-primary/60 hover:bg-mid-gray/5"
            }`}
          >
            {filePath ? (
              <>
                <FileAudio className="w-7 h-7 text-logo-primary" />
                <span className="text-sm font-medium break-all text-center">
                  {getFileName(filePath)}
                </span>
                <span className="text-xs text-mid-gray">
                  {t("settings.fileTranscription.changeFile")}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-7 h-7 text-mid-gray" />
                <span className="text-sm font-medium">
                  {t("settings.fileTranscription.dropzone")}
                </span>
                <span className="text-xs text-mid-gray">
                  {t("settings.fileTranscription.selectFile")}
                </span>
              </>
            )}
          </button>
          <p className="text-xs text-mid-gray">
            {t("settings.fileTranscription.supportedFormats")}
          </p>

          {/* Output format toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-text/70">
              {t("settings.fileTranscription.format")}
            </span>
            <div className="flex rounded-lg border border-mid-gray/20 overflow-hidden">
              <button
                type="button"
                onClick={() => setFormat("text")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                  format === "text"
                    ? "bg-logo-primary/80 text-white"
                    : "hover:bg-mid-gray/10"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {t("settings.fileTranscription.formatText")}
              </button>
              <button
                type="button"
                onClick={() => setFormat("srt")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                  format === "srt"
                    ? "bg-logo-primary/80 text-white"
                    : "hover:bg-mid-gray/10"
                }`}
              >
                <Captions className="w-3.5 h-3.5" />
                {t("settings.fileTranscription.formatSrt")}
              </button>
            </div>
          </div>

          {/* Run transcription */}
          <Button
            variant="primary"
            onClick={transcribe}
            disabled={!filePath || isTranscribing}
            className="w-full flex items-center justify-center gap-2"
          >
            {isTranscribing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("settings.fileTranscription.transcribing")}
              </>
            ) : (
              t("settings.fileTranscription.transcribe")
            )}
          </Button>

          {/* Result */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-mid-gray">
                  {t("settings.fileTranscription.duration", {
                    duration: formatDuration(result.duration_secs),
                  })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyOutput}
                    className="flex items-center gap-1.5"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied
                      ? t("settings.fileTranscription.copied")
                      : t("settings.fileTranscription.copy")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={saveOutput}
                    className="flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {t("settings.fileTranscription.save")}
                  </Button>
                </div>
              </div>
              <textarea
                readOnly
                value={outputText}
                className="w-full h-64 rounded-lg border border-mid-gray/20 bg-background p-3 text-sm font-mono resize-y focus:outline-none"
              />
            </div>
          )}
        </div>
      </SettingsGroup>
    </div>
  );
};

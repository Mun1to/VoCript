import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useSettings } from "../../hooks/useSettings";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { SettingContainer } from "../ui/SettingContainer";
import { commands } from "@/bindings";
import type { WordReplacement } from "@/bindings";

interface WordReplacementsProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  /** Which settings list to manage. Defaults to the personal dictionary;
   *  pass "custom_profile_commands" for the custom professional profile. */
  settingKey?: "word_replacements" | "custom_profile_commands";
  titleKey?: string;
  descriptionKey?: string;
  exportFileName?: string;
}

// Words a CSV header row might use, so we can skip it on import.
const HEADER_FROM = ["de", "from", "desde", "original", "palabra", "word"];
const HEADER_TO = ["a", "to", "hasta", "nuevo", "reemplazo", "replacement"];

// Example shown in the CSV help (language-neutral: brand/tech names).
const CSV_EXAMPLE = `de,a
chatgpt,ChatGPT
github,GitHub
javascript,JavaScript`;

/** Parse one CSV line honoring double-quoted cells. */
function parseCsvLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/** Parse a CSV/TSV string into {from,to} pairs. Comma or semicolon separated. */
function parseCsv(content: string): WordReplacement[] {
  const out: WordReplacement[] = [];
  const lines = content.split(/\r?\n/);
  let first = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.includes("\t")
      ? "\t"
      : line.includes(";") && !line.includes(",")
        ? ";"
        : ",";
    const cells = parseCsvLine(line, sep);
    if (cells.length < 2) continue;
    const from = cells[0].trim();
    const to = cells[1].trim();
    if (!from || !to) continue;
    // Skip a header row if present (only the first non-empty line).
    if (
      first &&
      HEADER_FROM.includes(from.toLowerCase()) &&
      HEADER_TO.includes(to.toLowerCase())
    ) {
      first = false;
      continue;
    }
    first = false;
    out.push({ from, to });
  }
  return out;
}

function escapeCsv(v: string): string {
  return /[",;\n\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function generateCsv(reps: WordReplacement[]): string {
  const rows = reps.map((r) => `${escapeCsv(r.from)},${escapeCsv(r.to)}`);
  return ["de,a", ...rows].join("\r\n") + "\r\n";
}

/**
 * Diccionario personal: reemplazos EXACTOS (de → a) que se aplican siempre tras
 * transcribir, en todos los modos. Determinista, a diferencia de
 * `custom_words` (que adivina por parecido fonético). Soporta importar/exportar
 * CSV para traer términos de otras herramientas.
 */
export const WordReplacements: React.FC<WordReplacementsProps> = React.memo(
  ({
    grouped = false,
    settingKey = "word_replacements",
    titleKey = "settings.advanced.wordReplacements.title",
    descriptionKey = "settings.advanced.wordReplacements.description",
    exportFileName = "diccionario-vocript.csv",
  }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const [newFrom, setNewFrom] = useState("");
    const [newTo, setNewTo] = useState("");
    const replacements: WordReplacement[] = getSetting(settingKey) || [];
    const updating = isUpdating(settingKey);

    const handleAdd = () => {
      const from = newFrom.trim();
      const to = newTo.trim();
      if (!from || !to || updating) return;
      if (
        replacements.some((r) => r.from.toLowerCase() === from.toLowerCase())
      ) {
        toast.error(
          t("settings.advanced.wordReplacements.duplicate", { word: from }),
        );
        return;
      }
      updateSetting(settingKey, [...replacements, { from, to }]);
      setNewFrom("");
      setNewTo("");
    };

    const handleRemove = (index: number) => {
      updateSetting(
        settingKey,
        replacements.filter((_, i) => i !== index),
      );
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    };

    const handleImport = async () => {
      if (updating) return;
      try {
        const selected = await open({
          multiple: false,
          filters: [{ name: "CSV", extensions: ["csv", "txt", "tsv"] }],
        });
        if (!selected || typeof selected !== "string") return;
        const result = await commands.readTextFile(selected);
        if (result.status !== "ok") {
          toast.error(t("settings.advanced.wordReplacements.importError"));
          return;
        }
        const parsed = parseCsv(result.data);
        if (parsed.length === 0) {
          toast.error(t("settings.advanced.wordReplacements.importEmpty"));
          return;
        }
        // Merge: imported entries overwrite existing ones with the same `from`.
        const map = new Map<string, WordReplacement>();
        for (const r of replacements) map.set(r.from.toLowerCase(), r);
        for (const r of parsed)
          map.set(r.from.toLowerCase(), { from: r.from, to: r.to });
        await updateSetting(settingKey, Array.from(map.values()));
        toast.success(
          t("settings.advanced.wordReplacements.imported", {
            count: parsed.length,
          }),
        );
      } catch (e) {
        console.error("Import failed:", e);
        toast.error(t("settings.advanced.wordReplacements.importError"));
      }
    };

    const handleExport = async () => {
      if (replacements.length === 0) {
        toast.error(t("settings.advanced.wordReplacements.exportEmpty"));
        return;
      }
      try {
        const path = await save({
          defaultPath: exportFileName,
          filters: [{ name: "CSV", extensions: ["csv"] }],
        });
        if (!path) return;
        const result = await commands.saveTextFile(
          path,
          generateCsv(replacements),
        );
        if (result.status !== "ok") {
          toast.error(t("settings.advanced.wordReplacements.exportError"));
          return;
        }
        toast.success(t("settings.advanced.wordReplacements.exported"));
      } catch (e) {
        console.error("Export failed:", e);
        toast.error(t("settings.advanced.wordReplacements.exportError"));
      }
    };

    return (
      <>
        <SettingContainer
          title={t(titleKey)}
          description={t(descriptionKey)}
          descriptionMode="inline"
          layout="stacked"
          grouped={grouped}
        >
          <div className="flex items-center gap-2">
            <Input
              type="text"
              className="max-w-32"
              value={newFrom}
              onChange={(e) => setNewFrom(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={t(
                "settings.advanced.wordReplacements.fromPlaceholder",
              )}
              variant="compact"
              disabled={updating}
            />
            <span className="text-mid-gray select-none">→</span>
            <Input
              type="text"
              className="max-w-32"
              value={newTo}
              onChange={(e) => setNewTo(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={t(
                "settings.advanced.wordReplacements.toPlaceholder",
              )}
              variant="compact"
              disabled={updating}
            />
            <Button
              onClick={handleAdd}
              disabled={!newFrom.trim() || !newTo.trim() || updating}
              variant="primary"
              size="md"
            >
              {t("settings.advanced.wordReplacements.add")}
            </Button>
          </div>
          <p className="text-xs text-amber-500/90 mt-2 leading-snug">
            {t("settings.advanced.wordReplacements.hint")}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button
              onClick={handleImport}
              disabled={updating}
              variant="secondary"
              size="sm"
            >
              {t("settings.advanced.wordReplacements.import")}
            </Button>
            <Button
              onClick={handleExport}
              disabled={updating || replacements.length === 0}
              variant="secondary"
              size="sm"
            >
              {t("settings.advanced.wordReplacements.export")}
            </Button>
          </div>
          <details className="mt-2 text-xs text-mid-gray">
            <summary className="cursor-pointer select-none w-fit font-medium hover:text-logo-primary transition-colors">
              {t("settings.advanced.wordReplacements.csvHelp.title")}
            </summary>
            <div className="mt-2 space-y-1.5">
              <p>{t("settings.advanced.wordReplacements.csvHelp.cols")}</p>
              <p>{t("settings.advanced.wordReplacements.csvHelp.header")}</p>
              <p className="font-medium">
                {t("settings.advanced.wordReplacements.csvHelp.exampleLabel")}
              </p>
              <pre className="bg-mid-gray/10 rounded-md p-2 text-[11px] leading-relaxed overflow-x-auto whitespace-pre font-mono">
                {CSV_EXAMPLE}
              </pre>
              <p>{t("settings.advanced.wordReplacements.csvHelp.quotes")}</p>
              <p>{t("settings.advanced.wordReplacements.csvHelp.encoding")}</p>
              <p className="italic">
                {t("settings.advanced.wordReplacements.csvHelp.tip")}
              </p>
            </div>
          </details>
        </SettingContainer>
        {replacements.length > 0 && (
          <div
            className={`px-4 p-2 ${grouped ? "" : "rounded-lg border border-mid-gray/20"} flex flex-col gap-1`}
          >
            {replacements.map((r, index) => (
              <div
                key={`${r.from}-${index}`}
                className="flex items-center justify-between gap-2 text-sm py-0.5"
              >
                <span className="truncate">
                  <span className="text-mid-gray">{r.from}</span>
                  <span className="mx-2 select-none">→</span>
                  <span className="font-medium">{r.to}</span>
                </span>
                <Button
                  onClick={() => handleRemove(index)}
                  disabled={updating}
                  variant="secondary"
                  size="sm"
                  className="inline-flex items-center cursor-pointer flex-shrink-0"
                  aria-label={t("settings.advanced.wordReplacements.remove", {
                    word: r.from,
                  })}
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </div>
            ))}
          </div>
        )}
      </>
    );
  },
);

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingContainer } from "../../ui/SettingContainer";
import { commands, InstallMismatch } from "../../../bindings";

interface DebugPathsProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

/// Every path is asked for at runtime. This panel used to print three constants
/// that said `%APPDATA%/handy`, the name of the project VoCript was forked
/// from, so the one screen meant for finding your files was pointing at a
/// folder that does not exist on any machine.
export const DebugPaths: React.FC<DebugPathsProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const [appData, setAppData] = useState<string | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [runningFrom, setRunningFrom] = useState<string | null>(null);
  const [updatesGoTo, setUpdatesGoTo] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<InstallMismatch | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [dir, logDir, install, drift] = await Promise.all([
        commands.getAppDirPath(),
        commands.getLogDirPath(),
        commands.installPaths(),
        commands.installLocationMismatch(),
      ]);
      if (cancelled) return;
      if (dir.status === "ok") setAppData(dir.data);
      if (logDir.status === "ok") setLogs(logDir.data);
      setRunningFrom(install.running_from || null);
      setUpdatesGoTo(install.updates_go_to);
      setMismatch(drift);
    };

    load().catch((e) => console.error("Could not read the debug paths:", e));
    return () => {
      cancelled = true;
    };
  }, []);

  const Row = ({ label, value }: { label: string; value: string | null }) => (
    <div>
      <span className="font-medium">{label}</span>{" "}
      <span className="font-mono text-xs select-text break-all">
        {value ?? t("common.loading")}
      </span>
    </div>
  );

  return (
    <SettingContainer
      title={t("settings.debug.paths.title")}
      description={t("settings.debug.paths.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
    >
      <div className="text-sm text-gray-600 space-y-2">
        <Row label={t("settings.debug.paths.appData")} value={appData} />
        <Row
          label={t("settings.debug.paths.models")}
          value={appData ? `${appData}/models` : null}
        />
        <Row
          label={t("settings.debug.paths.settings")}
          value={appData ? `${appData}/settings_store.json` : null}
        />
        <Row label={t("settings.debug.paths.logs")} value={logs} />
        <Row
          label={t("settings.debug.paths.runningFrom")}
          value={runningFrom}
        />
        {/* Nothing claims an install location on a portable copy, in a dev
            build or outside Windows, and an empty line there would read as a
            bug rather than as the normal case. */}
        {updatesGoTo !== null && (
          <Row
            label={t("settings.debug.paths.updatesGoTo")}
            value={updatesGoTo}
          />
        )}
        {mismatch && (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs">
            {t("settings.debug.paths.mismatch")}
          </div>
        )}
      </div>
    </SettingContainer>
  );
};

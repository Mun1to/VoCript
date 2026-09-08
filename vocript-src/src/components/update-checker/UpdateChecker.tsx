import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ProgressBar } from "../shared";
import { useSettings } from "../../hooks/useSettings";
import { commands, InstallMismatch } from "../../bindings";
import { cabecerasDeActualizacion } from "@/extension";

const RELEASES_URL = "https://github.com/Mun1to/VoCript/releases/latest";

interface UpdateCheckerProps {
  className?: string;
}

const UpdateChecker: React.FC<UpdateCheckerProps> = ({ className = "" }) => {
  const { t } = useTranslation();
  // Update checking state
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showUpToDate, setShowUpToDate] = useState(false);
  const [showPortableUpdateDialog, setShowPortableUpdateDialog] =
    useState(false);
  // Set when this copy runs from a different folder than the one the installer
  // would update. Holds the two paths so the dialog can name them.
  const [installMismatch, setInstallMismatch] = useState<InstallMismatch | null>(
    null,
  );

  const { settings, isLoading } = useSettings();
  const settingsLoaded = !isLoading && settings !== null;
  const updateChecksEnabled = settings?.update_checks_enabled ?? false;

  const upToDateTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isManualCheckRef = useRef(false);
  const downloadedBytesRef = useRef(0);
  const contentLengthRef = useRef(0);

  useEffect(() => {
    // Wait for settings to load before doing anything
    if (!settingsLoaded) return;

    if (!updateChecksEnabled) {
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current);
      }
      setIsChecking(false);
      setUpdateAvailable(false);
      setShowUpToDate(false);
      return;
    }

    checkForUpdates();

    // Listen for update check events
    const updateUnlisten = listen("check-for-updates", () => {
      handleManualUpdateCheck();
    });

    return () => {
      if (upToDateTimeoutRef.current) {
        clearTimeout(upToDateTimeoutRef.current);
      }
      updateUnlisten.then((fn) => fn());
    };
  }, [settingsLoaded, updateChecksEnabled]);

  // Update checking functions
  const checkForUpdates = async () => {
    if (!updateChecksEnabled || isChecking) return;

    try {
      setIsChecking(true);
      // An extension may serve its own updates from somewhere that needs credentials.
      // This edition answers with no headers and GitHub serves it as always.
      const update = await check({ headers: await cabecerasDeActualizacion() });

      if (update) {
        setUpdateAvailable(true);
        setShowUpToDate(false);

        if (!isManualCheckRef.current) {
          toast.info(
            t("footer.updateAvailable", { version: update.version }),
            {
              description: t("footer.updateAvailableDescription"),
              duration: 15000,
              action: {
                label: t("footer.updateNow"),
                onClick: () => installUpdate(),
              },
            },
          );
        }
      } else {
        setUpdateAvailable(false);

        if (isManualCheckRef.current) {
          setShowUpToDate(true);
          if (upToDateTimeoutRef.current) {
            clearTimeout(upToDateTimeoutRef.current);
          }
          upToDateTimeoutRef.current = setTimeout(() => {
            setShowUpToDate(false);
          }, 3000);
        }
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    } finally {
      setIsChecking(false);
      isManualCheckRef.current = false;
    }
  };

  const handleManualUpdateCheck = () => {
    if (!updateChecksEnabled) return;
    isManualCheckRef.current = true;
    checkForUpdates();
  };

  // `ignoreMismatch` is only ever true when the user has already been shown the
  // warning below and chose to go ahead anyway.
  const installUpdate = async (ignoreMismatch = false) => {
    if (!updateChecksEnabled) return;

    const portable = await commands.isPortable();
    if (portable) {
      setShowPortableUpdateDialog(true);
      return;
    }

    // Updating a copy whose installer points at another folder looks like it
    // worked and changes nothing: the new version lands where nobody opens it
    // and the next launch offers the same update again. Stop and explain
    // instead of letting the user loop. See src-tauri/src/install_check.rs.
    if (!ignoreMismatch) {
      const mismatch = await commands.installLocationMismatch();
      if (mismatch) {
        setInstallMismatch(mismatch);
        return;
      }
    }

    try {
      setIsInstalling(true);
      setDownloadProgress(0);
      downloadedBytesRef.current = 0;
      contentLengthRef.current = 0;
      const update = await check({ headers: await cabecerasDeActualizacion() });

      if (!update) {
        console.log("No update available during install attempt");
        return;
      }

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            downloadedBytesRef.current = 0;
            contentLengthRef.current = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloadedBytesRef.current += event.data.chunkLength;
            const progress =
              contentLengthRef.current > 0
                ? Math.round(
                    (downloadedBytesRef.current / contentLengthRef.current) *
                      100,
                  )
                : 0;
            setDownloadProgress(Math.min(progress, 100));
            break;
        }
      });
      await relaunch();
    } catch (error) {
      console.error("Failed to install update:", error);
    } finally {
      setIsInstalling(false);
      setDownloadProgress(0);
      downloadedBytesRef.current = 0;
      contentLengthRef.current = 0;
    }
  };

  // Update status functions
  const getUpdateStatusText = () => {
    if (!updateChecksEnabled) {
      return t("footer.updateCheckingDisabled");
    }
    if (isInstalling) {
      return downloadProgress > 0 && downloadProgress < 100
        ? t("footer.downloading", {
            progress: downloadProgress.toString().padStart(3),
          })
        : downloadProgress === 100
          ? t("footer.installing")
          : t("footer.preparing");
    }
    if (isChecking) return t("footer.checkingUpdates");
    if (showUpToDate) return t("footer.upToDate");
    if (updateAvailable) return t("footer.updateAvailableShort");
    return t("footer.checkForUpdates");
  };

  const getUpdateStatusAction = () => {
    if (!updateChecksEnabled) return undefined;
    // Wrapped rather than passed straight through: as an onClick handler it
    // would receive the mouse event as its first argument, and a truthy event
    // is exactly what tells installUpdate to skip the mismatch warning.
    if (updateAvailable && !isInstalling) return () => installUpdate();
    if (!isChecking && !isInstalling && !updateAvailable)
      return handleManualUpdateCheck;
    return undefined;
  };

  const isUpdateDisabled = !updateChecksEnabled || isChecking || isInstalling;
  const isUpdateClickable =
    !isUpdateDisabled && (updateAvailable || (!isChecking && !showUpToDate));

  return (
    <>
      {showPortableUpdateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-bg border border-border rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h2 className="text-base font-semibold">
              {t("footer.portableUpdateTitle")}
            </h2>
            <p className="text-sm text-text/70">
              {t("footer.portableUpdateMessage")}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-sm rounded border border-border hover:bg-border/50 transition-colors"
                onClick={() => setShowPortableUpdateDialog(false)}
              >
                {t("common.close")}
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded bg-logo-primary text-white hover:bg-logo-primary/80 transition-colors"
                onClick={() => {
                  openUrl(RELEASES_URL);
                  setShowPortableUpdateDialog(false);
                }}
              >
                {t("footer.portableUpdateButton")}
              </button>
            </div>
          </div>
        </div>
      )}
      {installMismatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-bg border border-border rounded-lg p-6 max-w-lg w-full mx-4 space-y-4">
            <h2 className="text-base font-semibold">
              {t("footer.installMismatchTitle")}
            </h2>
            <p className="text-sm text-text/70">
              {t("footer.installMismatchMessage")}
            </p>
            <div className="space-y-2 rounded border border-border bg-mid-gray/20 p-3 text-xs">
              <div className="space-y-0.5">
                <div className="text-text/50">
                  {t("footer.installMismatchRunningFrom")}
                </div>
                <div className="break-all font-mono">
                  {installMismatch.running_from}
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-text/50">
                  {t("footer.installMismatchUpdatesGoTo")}
                </div>
                <div className="break-all font-mono">
                  {installMismatch.updates_go_to}
                </div>
              </div>
            </div>
            <p className="text-sm text-text/70">
              {t("footer.installMismatchFix")}
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                className="px-3 py-1.5 text-sm rounded border border-border hover:bg-border/50 transition-colors"
                onClick={() => setInstallMismatch(null)}
              >
                {t("common.close")}
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded border border-border hover:bg-border/50 transition-colors"
                onClick={() => {
                  setInstallMismatch(null);
                  installUpdate(true);
                }}
              >
                {t("footer.installMismatchUpdateAnyway")}
              </button>
              <button
                className="px-3 py-1.5 text-sm rounded bg-logo-primary text-white hover:bg-logo-primary/80 transition-colors"
                onClick={() => {
                  openUrl(RELEASES_URL);
                  setInstallMismatch(null);
                }}
              >
                {t("footer.installMismatchDownload")}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`flex items-center gap-3 ${className}`}>
        {isUpdateClickable ? (
          <button
            onClick={getUpdateStatusAction()}
            disabled={isUpdateDisabled}
            className={`transition-colors disabled:opacity-50 tabular-nums ${
              updateAvailable
                ? "text-accent hover:text-accent/80 font-medium"
                : "text-text/60 hover:text-text/80"
            }`}
          >
            {getUpdateStatusText()}
          </button>
        ) : (
          <span className="text-text/60 tabular-nums">
            {getUpdateStatusText()}
          </span>
        )}

        {isInstalling && downloadProgress > 0 && downloadProgress < 100 && (
          <ProgressBar
            progress={[
              {
                id: "update",
                percentage: downloadProgress,
              },
            ]}
            size="large"
          />
        )}
      </div>
    </>
  );
};

export default UpdateChecker;

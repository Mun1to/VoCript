import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Globe,
  MonitorSpeaker,
  Power,
  RefreshCw,
  Settings as SettingsIcon,
  Square,
  Cpu,
} from "lucide-react";
import {
  DEFAULT_ACCENT,
  darkenHex,
  hexToRgba,
} from "../lib/constants/accentColors";

/**
 * Custom tray menu, shown instead of the native OS menu (which cannot be
 * themed). Uses invoke() directly rather than the generated bindings so this
 * window does not depend on bindings.ts having been regenerated yet.
 */

interface TrayMenuModel {
  id: string;
  name: string;
  is_active: boolean;
}

interface TrayMenuLanguage {
  code: string;
  native_name: string;
  is_active: boolean;
}

interface TrayMenuState {
  version_label: string;
  live_voice: boolean;
  live_system: boolean;
  model_loaded: boolean;
  is_busy: boolean;
  update_checks_enabled: boolean;
  models: TrayMenuModel[];
  active_model_name: string | null;
  languages: TrayMenuLanguage[];
  active_language_native: string;
}

type View = "main" | "models" | "languages";

const Row: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value?: string;
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  chevron?: boolean;
  onClick: () => void;
}> = ({
  icon,
  label,
  value,
  hint,
  checked,
  disabled,
  danger,
  chevron,
  onClick,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors ${
      disabled
        ? "cursor-default opacity-40"
        : "hover:bg-[var(--vc-pill-bg)] active:bg-[var(--vc-pill-bg)]"
    }`}
  >
    {icon && (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center"
        style={{ color: danger ? "#f87171" : "var(--vc-text-muted)" }}
      >
        {icon}
      </span>
    )}
    <span className="min-w-0 flex-1">
      <span
        className="block truncate text-[13.5px] font-semibold leading-tight"
        style={{ color: danger ? "#f87171" : "var(--vc-text-main)" }}
      >
        {label}
      </span>
      {value && (
        <span
          className="mt-0.5 block truncate text-[11.5px] font-medium leading-tight"
          style={{ color: "var(--color-logo-primary)" }}
        >
          {value}
        </span>
      )}
    </span>
    {hint && (
      <span
        className="shrink-0 text-[11px] font-medium tabular-nums"
        style={{ color: "var(--vc-text-muted)" }}
      >
        {hint}
      </span>
    )}
    {checked && (
      <Check
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: "var(--color-logo-primary)" }}
      />
    )}
    {chevron && (
      <ChevronRight
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: "var(--vc-text-muted)" }}
      />
    )}
  </button>
);

const Toggle: React.FC<{
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onClick: () => void;
}> = ({ icon, label, on, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-[var(--vc-pill-bg)]"
  >
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center"
      style={{ color: on ? "var(--color-logo-primary)" : "var(--vc-text-muted)" }}
    >
      {icon}
    </span>
    <span
      className="flex-1 truncate text-[13.5px] font-semibold"
      style={{ color: "var(--vc-text-main)" }}
    >
      {label}
    </span>
    <span
      className="relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors"
      style={{
        backgroundColor: on
          ? "var(--color-logo-primary)"
          : "var(--vc-pill-bg)",
        border: on ? "none" : "1px solid var(--vc-border)",
      }}
    >
      <span
        className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all"
        style={{ left: on ? "16px" : "2px", opacity: on ? 1 : 0.55 }}
      />
    </span>
  </button>
);

const Divider = () => (
  <div
    className="mx-2.5 my-1 h-px"
    style={{ backgroundColor: "var(--vc-border)" }}
  />
);

export const TrayMenu: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<TrayMenuState | null>(null);
  const [view, setView] = useState<View>("main");
  const cardRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setState(await invoke<TrayMenuState>("get_tray_menu_state"));
    } catch {
      /* keep the previous state; the window will refresh on next open */
    }
  }, []);

  // Theme + accent must be applied here too: a separate window does not inherit
  // what App.tsx sets on the main window's <html>.
  const applyAppearance = useCallback(async () => {
    try {
      const s = await invoke<Record<string, unknown>>("get_app_settings");
      const themeSetting = (s.theme as string) ?? "system";
      const resolved =
        themeSetting === "system"
          ? ((await invoke<string>("get_system_theme").catch(() => "dark")) ===
            "light"
              ? "light"
              : "dark")
          : themeSetting === "light"
            ? "light"
            : "dark";
      const root = document.documentElement;
      root.setAttribute("data-theme", resolved);

      const accent = (s.accent_color as string) || DEFAULT_ACCENT;
      root.style.setProperty("--color-logo-primary", accent);
      root.style.setProperty("--color-logo-stroke", darkenHex(accent));
      root.style.setProperty("--color-logo-glow", hexToRgba(accent, 0.5));
      root.style.setProperty("--color-logo-glow-soft", hexToRgba(accent, 0.16));
      root.style.setProperty("--color-background-ui", darkenHex(accent, 0.12));
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  useEffect(() => {
    load();
    applyAppearance();
    // Rust emits this every time the window is shown; the window is reused, so
    // without it we would render stale state and a leftover submenu.
    const un = listen("tray-menu-opened", () => {
      setView("main");
      load();
      applyAppearance();
    });
    return () => {
      un.then((f) => f());
    };
  }, [load, applyAppearance]);

  // Size the window to the content: a fixed height would leave dead space
  // below short menus. The wrapper's 8px padding (for the shadow) is added on
  // top, and Rust re-anchors to the tray after resizing.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const apply = () => {
      const height = Math.ceil(el.getBoundingClientRect().height) + 16;
      void invoke("resize_tray_menu", { height });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [state, view]);

  // Escape backs out of a submenu, or closes the menu — like a real one.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view === "main") void getCurrentWindow().hide();
      else setView("main");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const act = (action: string) => {
    void invoke("tray_menu_action", { action });
  };

  if (!state) {
    // No filler card: an opaque placeholder would flash as a black rectangle
    // before the real content measures itself.
    return <div ref={cardRef} />;
  }

  return (
    // Height is intentionally not forced — the card measures itself and the
    // window shrinks to fit (see the ResizeObserver above).
    <div className="w-full p-2">
      <div
        ref={cardRef}
        className="flex flex-col overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: "var(--vc-card-bg)",
          borderColor: "var(--vc-border)",
          boxShadow:
            "0 12px 32px rgba(0,0,0,0.38), 0 2px 8px rgba(0,0,0,0.24)",
        }}
      >
        {/* Header: makes it unmistakably VoCript and not a generic OS menu */}
        <div
          className="flex shrink-0 items-center gap-2 px-3 py-2.5"
          style={{ borderBottom: "1px solid var(--vc-border)" }}
        >
          {view === "main" ? (
            <>
              <AudioLines
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--color-logo-primary)" }}
              />
              <span
                className="flex-1 truncate text-[13px] font-bold tracking-tight"
                style={{ color: "var(--vc-text-main)" }}
              >
                VoCript
              </span>
              <span
                className="shrink-0 text-[10.5px] font-semibold"
                style={{ color: "var(--vc-text-muted)" }}
              >
                {state.version_label.replace(/^VoCript\s*/, "")}
              </span>
            </>
          ) : (
            // The whole header row is the back button: a 20px chevron was too
            // small a target to hit comfortably.
            <button
              type="button"
              onClick={() => setView("main")}
              className="-mx-1.5 flex flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--vc-pill-bg)]"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                style={{
                  backgroundColor: "var(--vc-pill-bg)",
                  border: "1px solid var(--vc-border)",
                }}
              >
                <ChevronLeft
                  className="h-[18px] w-[18px]"
                  style={{ color: "var(--color-logo-primary)" }}
                />
              </span>
              <span
                className="flex-1 truncate text-start text-[13px] font-bold tracking-tight"
                style={{ color: "var(--vc-text-main)" }}
              >
                {view === "models" ? t("tray.model") : t("tray.language")}
              </span>
            </button>
          )}
        </div>

        {/* Caps at the language list length; shorter menus keep no dead space. */}
        <div className="overflow-y-auto p-1" style={{ maxHeight: 460 }}>
          {view === "main" && (
            <>
              {state.is_busy && (
                <>
                  <Row
                    icon={<Square className="h-3.5 w-3.5" />}
                    label={t("tray.cancel")}
                    danger
                    onClick={() => act("cancel")}
                  />
                  <Divider />
                </>
              )}

              <Toggle
                icon={<AudioLines className="h-4 w-4" />}
                label={t("tray.liveTranscriptionVoice")}
                on={state.live_voice}
                onClick={() => act("live_transcription_voice")}
              />
              <Toggle
                icon={<MonitorSpeaker className="h-4 w-4" />}
                label={t("tray.liveTranscriptionSystem")}
                on={state.live_system}
                onClick={() => act("live_transcription_system")}
              />

              <Divider />

              <Row
                icon={<ClipboardCopy className="h-4 w-4" />}
                label={t("tray.copyLastTranscript")}
                onClick={() => act("copy_last_transcript")}
              />

              <Divider />

              <Row
                icon={<Cpu className="h-4 w-4" />}
                label={t("tray.model")}
                value={state.active_model_name ?? undefined}
                chevron
                onClick={() => setView("models")}
              />
              <Row
                icon={<Globe className="h-4 w-4" />}
                label={t("tray.language")}
                value={state.active_language_native}
                chevron
                onClick={() => setView("languages")}
              />

              <Divider />

              <Row
                icon={<SettingsIcon className="h-4 w-4" />}
                label={t("tray.settings")}
                hint="Ctrl+,"
                onClick={() => act("settings")}
              />
              <Row
                icon={<RefreshCw className="h-4 w-4" />}
                label={t("tray.checkUpdates")}
                disabled={!state.update_checks_enabled}
                onClick={() => act("check_updates")}
              />

              <Divider />

              <Row
                icon={<Power className="h-4 w-4" />}
                label={t("tray.quit")}
                hint="Ctrl+Q"
                onClick={() => act("quit")}
              />
            </>
          )}

          {view === "models" && (
            <>
              {state.models.map((m) => (
                <Row
                  key={m.id}
                  label={m.name}
                  checked={m.is_active}
                  onClick={() => act(`model_select:${m.id}`)}
                />
              ))}
              <Divider />
              <Row
                label={t("tray.unloadModel")}
                disabled={!state.model_loaded}
                onClick={() => act("unload_model")}
              />
            </>
          )}

          {view === "languages" &&
            state.languages.map((l) => (
              <Row
                key={l.code}
                label={l.native_name}
                checked={l.is_active}
                onClick={() => act(`language_select:${l.code}`)}
              />
            ))}
        </div>
      </div>
    </div>
  );
};

export default TrayMenu;

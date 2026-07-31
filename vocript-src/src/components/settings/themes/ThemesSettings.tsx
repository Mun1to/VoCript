import React from "react";
import { useTranslation } from "react-i18next";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { AccentColorPicker } from "../../AccentColorPicker";
import { SystemFontPicker } from "./SystemFontPicker";
import { useSettings } from "../../../hooks/useSettings";
import {
  DEFAULT_UI_FONT,
  DEFAULT_UI_FONT_SIZE,
  UI_FONTS,
  UI_FONT_SIZES,
  fontStackFor,
} from "../../../lib/constants/fonts";

/**
 * "Custom themes" section: accent color (presets or any color at all) and the
 * interface typography.
 */
export const ThemesSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();

  const currentFont = getSetting("ui_font") ?? DEFAULT_UI_FONT;
  const currentSize = getSetting("ui_font_size") ?? DEFAULT_UI_FONT_SIZE;

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("themes.title")}>
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-text/70">{t("themes.subtitle")}</p>
          <AccentColorPicker size="md" allowCustom />
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("themes.typography.title")}>
        <div className="flex flex-col gap-5 p-5">
          <p className="text-sm text-text/70">
            {t("themes.typography.subtitle")}
          </p>

          {/* Font family: each option previews itself. */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-text/50">
              {t("themes.typography.family")}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {UI_FONTS.map((font) => {
                const active = font.id === currentFont;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => updateSetting("ui_font", font.id)}
                    style={{ fontFamily: font.stack }}
                    className={`flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2 text-start transition-colors ${
                      active
                        ? "border-logo-primary/60 bg-logo-primary/10"
                        : "border-mid-gray/20 hover:border-logo-primary/40"
                    }`}
                  >
                    <span className="text-sm font-semibold text-text">
                      {t(`themes.typography.fonts.${font.id}`)}
                    </span>
                    <span className="text-xs text-text/50">
                      {t("themes.typography.sample")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <SystemFontPicker />

          {/* Size: the label of each option is rendered at its own size. */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-text/50">
              {t("themes.typography.size")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {UI_FONT_SIZES.map((option) => {
                const active = option.size === currentSize;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updateSetting("ui_font_size", option.size)}
                    style={{
                      fontSize: `${option.size}px`,
                      fontFamily: fontStackFor(currentFont),
                    }}
                    className={`rounded-lg border-2 px-3 py-1.5 font-medium transition-colors ${
                      active
                        ? "border-logo-primary/60 bg-logo-primary/10 text-text"
                        : "border-mid-gray/20 text-text/70 hover:border-logo-primary/40"
                    }`}
                  >
                    {t(`themes.typography.sizes.${option.id}`)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-text/45">
              {t("themes.typography.sizeHint")}
            </p>
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};

export default ThemesSettings;

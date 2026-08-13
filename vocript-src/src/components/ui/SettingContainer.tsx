import React from "react";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";

interface SettingContainerProps {
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
  /** Kept for the callers that still pass it; the description is always
   *  shown under the name now, which is what the mockup does. */
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  /** No longer read: there is no tooltip to position. Kept so the callers that
   *  pass it still typecheck. */
  tooltipPosition?: "top" | "bottom";
}

export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  grouped = false,
  layout = "horizontal",
  disabled = false,
}) => {
  const isLight = useResolvedTheme() === "light";

  // A row inside a block, or a standalone card when there is no block around
  // it. Sizes come from the approved mockup: 11px/16px padding, a hairline
  // between rows, and the description under the name rather than hidden
  // behind an info icon.
  const containerClasses = grouped
    ? `vc-row transition-colors ${
        isLight ? "hover:bg-slate-900/[0.02]" : "hover:bg-white/[0.02]"
      }`
    : `vc-row rounded-xl border border-[var(--vc-border)] bg-[var(--vc-card-bg)] transition-colors ${
        isLight ? "shadow-sm" : ""
      }`;

  // Plain-text version of the row, for the in-section filter to match against
  // (see SettingsLayout). Titles can be JSX — a label plus a BETA badge, say —
  // so the text has to be dug out of the tree rather than assumed to be a string.
  const textoPlano = (nodo: React.ReactNode): string => {
    if (nodo === null || nodo === undefined || typeof nodo === "boolean")
      return "";
    if (typeof nodo === "string" || typeof nodo === "number")
      return String(nodo);
    if (Array.isArray(nodo)) return nodo.map(textoPlano).join(" ");
    if (React.isValidElement(nodo)) {
      return textoPlano(
        (nodo.props as { children?: React.ReactNode }).children,
      );
    }
    return "";
  };
  const textoBuscable = `${textoPlano(title)} ${description}`.toLowerCase();

  if (layout === "stacked") {
    return (
      <div
        className={`${containerClasses} !flex-col !items-stretch !gap-2`}
        data-vc-setting={textoBuscable}
      >
        <div className={`vc-row-label ${disabled ? "opacity-50" : ""}`}>
          <b>{title}</b>
          {description && <i>{description}</i>}
        </div>
        <div className="w-full">{children}</div>
      </div>
    );
  }

  // Horizontal layout (default): name and description on the left, the control
  // on the right.
  return (
    <div className={containerClasses} data-vc-setting={textoBuscable}>
      <div
        className={`vc-row-label min-w-0 flex-1 ${disabled ? "opacity-50" : ""}`}
      >
        <b>{title}</b>
        {description && <i>{description}</i>}
      </div>
      <div className="relative shrink-0">{children}</div>
    </div>
  );
};

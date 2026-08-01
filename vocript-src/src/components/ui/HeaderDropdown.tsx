import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";
import { HoverTooltip } from "./HoverTooltip";

/** Lets a `HeaderDropdownOption` close its panel after selection without
 *  `HeaderDropdown` needing to know what its children are. Custom content
 *  (the accent-color swatches) never reads this, so it keeps its own
 *  "stays open so you can compare colors" behavior for free. */
const ClosePanelContext = createContext<() => void>(() => {});

interface HeaderDropdownProps {
  /** Icon shown before the label, already sized and colored by the caller. */
  icon: React.ReactNode;
  /** Current value, shown on the trigger. */
  label: React.ReactNode;
  /** Tooltip explaining what the chip controls. */
  tooltip: string;
  /** Small heading above the panel, for chips whose label alone ("Normal")
   *  does not say which setting it belongs to. */
  title?: string;
  /** Which side the panel hangs from. */
  align?: "start" | "end";
  showChevron?: boolean;
  /** Option lists want a slim `py-1`; custom content brings its own padding. */
  panelClassName?: string;
  dataTour?: string;
  children: React.ReactNode;
}

/**
 * One visual language for every "current value, click for options" chip in
 * the header: profile, language, voice/system mode, output, activation and
 * the accent-color swatch.
 *
 * They used to be four separate hand-rolled implementations that had drifted
 * apart: one opened on hover instead of a click (with a CSS "bridge" hack to
 * stop the panel closing while the pointer crossed the gap to it), one filled
 * itself solid with the accent color while the rest stayed plain text — so
 * picking a bold accent like red turned half the header into a wall of solid
 * blocks instead of a row of subtle pills. This is the one place that decides
 * how a header chip opens, closes and looks, so all of them move together.
 */
export const HeaderDropdown: React.FC<HeaderDropdownProps> = ({
  icon,
  label,
  tooltip,
  title,
  align = "start",
  showChevron = true,
  panelClassName = "py-1",
  dataTour,
  children,
}) => {
  const isLight = useResolvedTheme() === "light";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative" ref={ref} data-tour={dataTour}>
      <HoverTooltip label={tooltip}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1.5 py-1 px-1.5 rounded-lg text-xs font-bold text-logo-primary transition-colors ${
            isLight ? "hover:bg-slate-100" : "hover:bg-white/[0.06]"
          }`}
        >
          {icon}
          <span>{label}</span>
          {showChevron && (
            <ChevronDown
              className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>
      </HoverTooltip>
      {open && (
        <div
          className={`absolute top-full ${align === "end" ? "end-0" : "start-0"} mt-1 min-w-full rounded-lg border shadow-lg z-50 ${panelClassName} ${
            isLight
              ? "bg-white border-slate-200"
              : "bg-[#141620] border-white/10"
          }`}
        >
          {title && (
            <div
              className={`text-[9px] uppercase tracking-wider px-3 pt-0.5 pb-1.5 ${
                isLight ? "text-slate-400" : "text-slate-500"
              }`}
            >
              {title}
            </div>
          )}
          <ClosePanelContext.Provider value={() => setOpen(false)}>
            {children}
          </ClosePanelContext.Provider>
        </div>
      )}
    </div>
  );
};

interface HeaderDropdownOptionProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

/** One row of a `HeaderDropdown` option list, styled the same way everywhere. */
export const HeaderDropdownOption: React.FC<HeaderDropdownOptionProps> = ({
  active,
  onClick,
  disabled = false,
  children,
}) => {
  const isLight = useResolvedTheme() === "light";
  const closePanel = useContext(ClosePanelContext);
  const handleClick = () => {
    onClick();
    closePanel();
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={`block w-full text-start px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
        active
          ? "text-logo-primary"
          : isLight
            ? "text-slate-700 hover:bg-slate-100"
            : "text-slate-300 hover:bg-white/[0.06]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
};

export default HeaderDropdown;

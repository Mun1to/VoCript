import React, { useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

interface HoverTooltipProps {
  /** Text to show. Nothing renders when empty. */
  label: string;
  position?: "top" | "bottom";
  /** Applied to the wrapper, which is inline-flex by default. */
  className?: string;
  children: React.ReactNode;
}

/** The OS shows its own tooltip after roughly a second; matching that keeps the
 *  hint from flashing at every pointer that crosses the control. */
const DELAY_MS = 400;

/**
 * Shows VoCript's tooltip instead of the operating system's.
 *
 * A plain `title` attribute is rendered by Windows: it appears late, ignores the
 * app's theme and font, and looks like a browser. This wraps any control and
 * reuses the themed `Tooltip`, which already handles flipping and staying inside
 * the window.
 */
export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  label,
  position = "bottom",
  className = "inline-flex",
  children,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancel, []);

  const show = () => {
    cancel();
    timer.current = setTimeout(() => setVisible(true), DELAY_MS);
  };

  const hide = () => {
    cancel();
    setVisible(false);
  };

  return (
    <span
      ref={ref}
      className={className}
      onMouseEnter={show}
      onMouseLeave={hide}
      // Hidden on click: the tooltip for a control you just used is noise, and
      // it would otherwise hang over whatever the click opened.
      onMouseDown={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && label && (
        <Tooltip targetRef={ref} position={position}>
          <p className="text-xs text-text/80">{label}</p>
        </Tooltip>
      )}
    </span>
  );
};

export default HoverTooltip;

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder = "Select an option...",
  disabled = false,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [consulta, setConsulta] = useState("");
  // Which way the list unfolds, and how tall it can be. Measured when it
  // opens: a hundred languages hanging off a control near the bottom of the
  // window used to be cut off by the window edge.
  const [panel, setPanel] = useState({ arriba: false, alto: 240 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  /** Past a dozen entries, scrolling is not a way to find anything. */
  const conBuscador = options.length > 12;

  const visibles = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, consulta]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
    setConsulta("");
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && onRefresh) onRefresh();
    if (!isOpen) {
      const r = dropdownRef.current?.getBoundingClientRect();
      if (r) {
        const MARGEN = 16;
        const ALTO_BUSCADOR = conBuscador ? 38 : 0;
        const debajo = window.innerHeight - r.bottom - MARGEN;
        const encima = r.top - MARGEN;
        // What the list would like, so the decision is about this list and not
        // about a number picked in the abstract.
        const quiere = Math.min(300, options.length * 28) + ALTO_BUSCADOR;
        const arriba = debajo < Math.min(quiere, 220) && encima > debajo;
        // The cap is for the SCROLLING part only: the search box sits above it
        // and its height has to come off, or the box as a whole overshoots the
        // window edge by exactly that much.
        const hueco = (arriba ? encima : debajo) - ALTO_BUSCADOR;
        setPanel({ arriba, alto: Math.max(120, Math.min(300, hueco)) });
      }
      setConsulta("");
      window.setTimeout(() => campo.current?.focus(), 20);
    }
    setIsOpen(!isOpen);
  };

  return (
    // Open, the list is joined to the control: the button drops its bottom
    // corners and its bottom border, the list picks up where it left off. A
    // detached card floating a few pixels below read as a second, unrelated
    // thing rather than as this control showing you its options.
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`flex min-w-[200px] items-center justify-between border border-[var(--vc-border)] bg-[var(--vc-card-bg)] px-2.5 py-1.5 text-start text-[13px] font-medium text-[var(--vc-text-main)] transition-colors ${
          isOpen
            ? panel.arriba
              ? "rounded-b-lg border-t-transparent"
              : "rounded-t-lg border-b-transparent"
            : "rounded-lg"
        } ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-[var(--vc-text-muted)]"
        }`}
        onClick={handleToggle}
        disabled={disabled}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg
          className={`ms-2 h-4 w-4 shrink-0 text-[var(--vc-text-muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && !disabled && (
        <div
          className={`absolute start-0 end-0 z-50 flex flex-col overflow-hidden border border-[var(--vc-border)] bg-[var(--vc-card-bg)] shadow-lg ${
            panel.arriba
              ? "bottom-full rounded-t-lg border-b-0"
              : "top-full rounded-b-lg border-t-0"
          }`}
        >
          {conBuscador && (
            <label className="flex shrink-0 items-center gap-2 border-b border-[var(--vc-border)] px-2.5 py-2">
              <Search
                size={13}
                className="shrink-0 text-[var(--vc-text-muted)]"
              />
              <input
                ref={campo}
                type="text"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder={t("common.search")}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--vc-text-main)] outline-none placeholder:text-[var(--vc-text-muted)]"
              />
            </label>
          )}
          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: panel.alto }}
          >
            {visibles.length === 0 ? (
              <div className="px-2.5 py-1.5 text-[13px] text-[var(--vc-text-muted)]">
                {t("common.noOptionsFound")}
              </div>
            ) : (
              visibles.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full px-2.5 py-1.5 text-start text-[13px] transition-colors hover:bg-[color-mix(in_srgb,var(--color-logo-primary)_12%,transparent)] ${
                    selectedValue === option.value
                      ? "font-semibold text-accent"
                      : "text-[var(--vc-text-main)]"
                  } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  onClick={() => handleSelect(option.value)}
                  disabled={option.disabled}
                >
                  <span className="block truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

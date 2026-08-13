import React, { useEffect, useRef, useState } from "react";
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
  const dropdownRef = useRef<HTMLDivElement>(null);

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
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && onRefresh) onRefresh();
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
          isOpen ? "rounded-t-lg border-b-transparent" : "rounded-lg"
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
        <div className="absolute top-full start-0 end-0 z-50 max-h-60 overflow-y-auto rounded-b-lg border border-t-0 border-[var(--vc-border)] bg-[var(--vc-card-bg)] py-1 shadow-lg">
          {options.length === 0 ? (
            <div className="px-2.5 py-1.5 text-[13px] text-[var(--vc-text-muted)]">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option) => (
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
      )}
    </div>
  );
};

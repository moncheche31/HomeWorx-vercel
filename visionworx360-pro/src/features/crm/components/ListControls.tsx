import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Check, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Shared CRM list-page controls.
 * The visible buttons are always labeled "Filter" and "Sort" — never the
 * current selection. The selected sort is shown with a check inside the menu.
 */

interface FilterMenuProps {
  activeCount: number;
  onReset: () => void;
  children: ReactNode;
}

export function FilterMenu({ activeCount, onReset, children }: FilterMenuProps) {
  const { t } = useTranslation("crm");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-h-(--control-min-h-sm) flex-1 sm:flex-none">
          <SlidersHorizontal className="size-4" aria-hidden />
          {t("actions.filter")}
          {activeCount > 0 && (
            <span
              className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
              aria-label={t("filters.active", { count: activeCount })}
            >
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("actions.filter")}</p>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              {t("filters.reset")}
            </Button>
          )}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface SortMenuProps<T extends string> {
  value: T;
  options: SortOption<T>[];
  onChange: (value: T) => void;
}

export function SortMenu<T extends string>({ value, options, onChange }: SortMenuProps<T>) {
  const { t } = useTranslation("crm");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-h-(--control-min-h-sm) flex-1 sm:flex-none">
          <ArrowUpDown className="size-4" aria-hidden />
          {t("actions.sort")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto space-y-2"
      >
        <p className="text-sm font-semibold">{t("actions.sort")}</p>
        <div role="menu" aria-label={t("actions.sort")} className="grid gap-1">
          {options.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className="flex min-h-(--control-min-h-sm) items-center justify-between rounded-md px-3 text-left text-sm transition hover:bg-accent hover:text-accent-foreground"
                onClick={() => onChange(option.value)}
              >
                <span>{option.label}</span>
                {selected && <Check className="size-4" aria-hidden />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FilterFieldProps {
  id: string;
  label: string;
  children: ReactNode;
}

export function FilterField({ id, label, children }: FilterFieldProps) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

export const filterSelectClass =
  "min-h-(--control-min-h-sm) w-full rounded-md border border-input bg-transparent px-3 text-sm";

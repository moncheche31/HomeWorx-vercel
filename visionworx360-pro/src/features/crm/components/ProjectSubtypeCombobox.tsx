import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSubtypesForType } from "../catalog/projectSubtypes";

interface Props {
  /** Currently selected project type key — subtype list is filtered by this. */
  projectTypeKey: string | null;
  /** Currently selected subtype key (stable, language-neutral) or null. */
  value: string | null;
  onChange: (subtypeKey: string | null) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function ProjectSubtypeCombobox({
  projectTypeKey,
  value,
  onChange,
  id,
  disabled,
  className,
  ariaLabel,
}: Props) {
  const { t } = useTranslation("crm");
  const [open, setOpen] = useState(false);

  const subtypes = useMemo(() => getSubtypesForType(projectTypeKey), [projectTypeKey]);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    return t(`projectSubtypes.${value}`, { defaultValue: value });
  }, [value, t]);

  if (subtypes.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? t("project.fields.projectSubtype")}
          disabled={disabled}
          className={cn("w-full justify-between min-h-(--control-min-h-sm) font-normal", className)}
        >
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel || t("projectSubtypePicker.placeholder")}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        sideOffset={4}
      >
        <Command
          filter={(itemValue, search) => {
            const q = search.trim().toLowerCase();
            if (!q) return 1;
            const label = t(`projectSubtypes.${itemValue}`, {
              defaultValue: itemValue,
            }).toLowerCase();
            return label.includes(q) || itemValue.toLowerCase().includes(q) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder={t("projectSubtypePicker.searchPlaceholder")}
            aria-label={t("projectSubtypePicker.searchPlaceholder")}
          />
          <CommandList
            className="max-h-[360px] overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <CommandEmpty>{t("projectSubtypePicker.noResults")}</CommandEmpty>
            <CommandGroup>
              {value ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="min-h-(--control-min-h-sm) text-muted-foreground"
                >
                  <span className="mr-2 inline-block size-4" aria-hidden />
                  {t("projectSubtypePicker.clear")}
                </CommandItem>
              ) : null}
              {subtypes.map((key) => {
                const selected = value === key;
                return (
                  <CommandItem
                    key={key}
                    value={key}
                    onSelect={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                    className="min-h-(--control-min-h-sm)"
                  >
                    <Check
                      className={cn("mr-2 size-4", selected ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    {t(`projectSubtypes.${key}`, { defaultValue: key })}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

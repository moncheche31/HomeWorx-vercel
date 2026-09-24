import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronsUpDown,
  Home,
  Building2,
  Hammer,
  HardHat,
  Paintbrush,
  Wrench,
  Zap,
  Wind,
  Droplets,
  Accessibility,
  Settings,
  CookingPot,
  Bath,
  House,
  PanelsTopLeft,
  Warehouse,
  Layers,
  Grid2X2,
  Ruler,
  Square,
  Layers3,
  PanelTop,
  BetweenHorizontalStart,
  PackageOpen,
  Trees,
  Utensils,
  Umbrella,
  Columns,
  TentTree,
  Tent,
  Rows3,
  DoorOpen,
  Sun,
  Waves,
  Wine,
  GlassWater,
  Flame,
  BrickWall,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
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
import {
  PROJECT_TYPES_BY_CATEGORY,
  CATEGORY_OF_TYPE,
  type ProjectCategoryKey,
} from "../catalog/projectTypes";
import {
  getAdaptiveCategoryOrder,
  getAdaptiveTypeOrder,
  getRecommendedTypes,
  type OrganizationBusinessProfile,
} from "../catalog/adaptiveOrdering";

interface Props {
  /** Selected project type key (stable, language-neutral). */
  value: string | null;
  onChange: (typeKey: string | null, categoryKey: ProjectCategoryKey | null) => void;
  /** Optional trigger id (for <Label htmlFor>). */
  id?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Organization business profile — drives adaptive ordering and Recommended section. */
  profile?: OrganizationBusinessProfile | null;
}

const CATEGORY_ICONS: Record<ProjectCategoryKey, LucideIcon> = {
  INTERIOR_REMODELING: Home,
  EXTERIOR: Building2,
  OUTDOOR_LIVING: Trees,
  ADDITIONS_CONSTRUCTION: HardHat,
  ROOFING: Hammer,
  PAINTING: Paintbrush,
  PLUMBING: Droplets,
  ELECTRICAL: Zap,
  HVAC: Wind,
  RESTORATION: Wrench,
  ACCESSIBILITY: Accessibility,
  GENERAL: Settings,
};

export const CATEGORY_ICON_COLOR: Record<ProjectCategoryKey, string> = {
  INTERIOR_REMODELING: "text-amber-500",
  PAINTING: "text-violet-500",
  EXTERIOR: "text-emerald-600 dark:text-emerald-400",
  OUTDOOR_LIVING: "text-lime-600 dark:text-lime-400",
  ROOFING: "text-red-700 dark:text-red-500",
  ADDITIONS_CONSTRUCTION: "text-orange-500",
  RESTORATION: "text-teal-500",
  ACCESSIBILITY: "text-blue-500",
  PLUMBING: "text-cyan-500",
  ELECTRICAL: "text-amber-400",
  HVAC: "text-sky-500",
  GENERAL: "text-slate-500",
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  KITCHEN_REMODEL: CookingPot,
  BATHROOM_REMODEL: Bath,
  WHOLE_HOUSE_REMODEL: House,
  INTERIOR_RENOVATION: PanelsTopLeft,
  GARAGE_CONVERSION: Warehouse,
  BASEMENT_FINISH: Layers,
  FLOORING: Grid2X2,
  CABINETS_MILLWORK: PanelsTopLeft,
  TRIM_FINISH_CARPENTRY: Ruler,
  DRYWALL_PLASTER: Square,
  INSULATION: Layers3,
  CEILING: PanelTop,
  STAIRS: BetweenHorizontalStart,
  CLOSET_SYSTEMS: PackageOpen,
  HOME_BAR: Wine,
  WET_BAR: GlassWater,
  WINE_ROOM: Wine,
  OUTDOOR_KITCHEN: Utensils,
  COVERED_PATIO: Umbrella,
  PERGOLA: Columns,
  GAZEBO: TentTree,
  PAVILION: Tent,
  DECK: Rows3,
  SCREENED_PORCH: DoorOpen,
  THREE_SEASON_ROOM: Sun,
  POOL_HOUSE: Waves,
  OUTDOOR_BAR: Wine,
  FIRE_PIT_FIREPLACE: Flame,
  RETAINING_WALL: BrickWall,
  LANDSCAPE_STRUCTURE: Trees,
};

export function ProjectTypeCombobox({
  value,
  onChange,
  id,
  disabled,
  className,
  ariaLabel,
  profile,
}: Props) {
  const { t } = useTranslation("crm");
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    if (value in CATEGORY_OF_TYPE) return t(`projectTypes.${value}`);
    return value;
  }, [value, t]);

  const categoryOrder = useMemo(
    () => getAdaptiveCategoryOrder(profile ?? null),
    [profile],
  );
  const recommended = useMemo(() => getRecommendedTypes(profile ?? null, 6), [profile]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? t("project.fields.projectType")}
          disabled={disabled}
          className={cn("w-full justify-between min-h-(--control-min-h-sm) font-normal", className)}
        >
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel || t("projectTypePicker.placeholder")}
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
            const [typeKey, categoryKey] = itemValue.split("::");
            if (!typeKey) return 0;
            const typeLabel = t(`projectTypes.${typeKey}`, { defaultValue: typeKey }).toLowerCase();
            const categoryLabel = categoryKey
              ? t(`projectCategories.${categoryKey}`, { defaultValue: categoryKey }).toLowerCase()
              : "";
            return typeLabel.includes(q) ||
              categoryLabel.includes(q) ||
              typeKey.toLowerCase().includes(q)
              ? 1
              : 0;
          }}
        >
          <CommandInput
            placeholder={t("projectTypePicker.searchPlaceholder")}
            aria-label={t("projectTypePicker.searchPlaceholder")}
          />
          <CommandList
            className="max-h-[500px] overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            <CommandEmpty>{t("projectTypePicker.noResults")}</CommandEmpty>
            {recommended.length > 0 ? (
              <CommandGroup
                heading={
                  <span
                    role="presentation"
                    aria-hidden="true"
                    className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-wide text-foreground"
                  >
                    <Sparkles className="size-4 shrink-0 text-amber-500" aria-hidden />
                    {t("projectTypePicker.recommendedHeading")}
                  </span>
                }
                className="[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-muted/90 [&_[cmdk-group-heading]]:backdrop-blur [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2.5 [&_[cmdk-group-heading]]:border-b [&_[cmdk-group-heading]]:border-border/60 [&_[cmdk-group-heading]]:pointer-events-none [&_[cmdk-group-heading]]:select-none"
              >
                {recommended.map((typeKey) => {
                  const cat = CATEGORY_OF_TYPE[typeKey];
                  if (!cat) return null;
                  const selected = value === typeKey;
                  const TypeIcon = TYPE_ICONS[typeKey];
                  return (
                    <CommandItem
                      key={`rec-${typeKey}`}
                      value={`${typeKey}::${cat}::rec`}
                      onSelect={() => {
                        onChange(typeKey, cat);
                        setOpen(false);
                      }}
                      className="min-h-(--control-min-h-sm) pl-8"
                    >
                      <Check
                        className={cn("mr-2 size-4", selected ? "opacity-100" : "opacity-0")}
                        aria-hidden
                      />
                      {TypeIcon ? (
                        <TypeIcon
                          className={cn(
                            "mr-2 size-3.5 shrink-0",
                            selected ? "text-accent-foreground" : "text-muted-foreground",
                          )}
                          aria-hidden
                        />
                      ) : null}
                      <span className="flex-1">{t(`projectTypes.${typeKey}`)}</span>
                      <span className="ml-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t(`projectCategories.${cat}`)}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
            {categoryOrder.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              const iconColor = CATEGORY_ICON_COLOR[cat];
              const types = getAdaptiveTypeOrder(cat, profile ?? null);
              // Fallback if adaptive ordering ever returns empty.
              const list = types.length ? types : PROJECT_TYPES_BY_CATEGORY[cat];
              return (
                <CommandGroup
                  key={cat}
                  heading={
                    <span
                      role="presentation"
                      aria-hidden="true"
                      className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-wide text-foreground"
                    >
                      <Icon className={cn("size-4 shrink-0", iconColor)} aria-hidden />
                      {t(`projectCategories.${cat}`)}
                    </span>
                  }
                  className="[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-muted/90 [&_[cmdk-group-heading]]:backdrop-blur [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2.5 [&_[cmdk-group-heading]]:border-b [&_[cmdk-group-heading]]:border-border/60 [&_[cmdk-group-heading]]:pointer-events-none [&_[cmdk-group-heading]]:select-none"
                >
                  {list.map((typeKey) => {
                    const selected = value === typeKey;
                    const TypeIcon = TYPE_ICONS[typeKey];
                    return (
                      <CommandItem
                        key={typeKey}
                        value={`${typeKey}::${cat}`}
                        onSelect={() => {
                          onChange(typeKey, cat);
                          setOpen(false);
                        }}
                        className="min-h-(--control-min-h-sm) pl-8"
                      >
                        <Check
                          className={cn("mr-2 size-4", selected ? "opacity-100" : "opacity-0")}
                          aria-hidden
                        />
                        {TypeIcon ? (
                          <TypeIcon
                            className={cn(
                              "mr-2 size-3.5 shrink-0",
                              selected ? "text-accent-foreground" : "text-muted-foreground",
                            )}
                            aria-hidden
                          />
                        ) : null}
                        {t(`projectTypes.${typeKey}`)}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, CircleAlert, CircleCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import {
  defaultPricingSources,
  resolveTaskRate,
  searchHandymanTasks,
  suggestedCategoriesFor,
  type HandymanLocale,
  type TaskCategory,
} from "@/domains/handyman";

/**
 * Search-first browser for small-service / handyman tasks.
 *
 * Hundreds of tasks are unusable as a menu, so search leads and categories
 * narrow. Every row states whether the task prices from the library or needs
 * the contractor's own number — never a silent zero.
 */
export function ServiceTaskBrowser() {
  const { t, i18n } = useTranslation("knowledge-base");
  const { organization } = useWorkspace();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TaskCategory | "all">("all");

  const locale: HandymanLocale = i18n.language?.startsWith("es") ? "es-US" : "en-US";
  const categories = useMemo(
    () => suggestedCategoriesFor(organization?.primaryBusinessType ?? null),
    [organization?.primaryBusinessType],
  );
  const sources = useMemo(() => defaultPricingSources(), []);
  const results = useMemo(
    () => searchHandymanTasks(query, { category, limit: 40 }),
    [query, category],
  );

  return (
    <section className="space-y-3" aria-label={t("serviceTasks.title")}>
      <p className="text-sm text-foreground-muted">{t("serviceTasks.subtitle")}</p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("serviceTasks.searchPlaceholder")}
          aria-label={t("serviceTasks.searchPlaceholder")}
          className="min-h-11 pl-9"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
          {t("serviceTasks.allCategories")}
        </CategoryChip>
        {categories.map((key) => (
          <CategoryChip key={key} active={category === key} onClick={() => setCategory(key)}>
            {t(`serviceTasks.categories.${key}`, { defaultValue: key.replace(/_/g, " ") })}
          </CategoryChip>
        ))}
      </div>

      <ul className="space-y-2">
        {results.map(({ task }) => {
          const resolution = resolveTaskRate(task.id, sources);
          const priced = !resolution.pricingNeeded;
          return (
            <li
              key={task.id}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{task.label[locale]}</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {t(`serviceTasks.categories.${task.category}`, {
                      defaultValue: task.category.replace(/_/g, " "),
                    })}
                    {" · "}
                    {t(`serviceTasks.units.${task.unit}`, { defaultValue: task.unit })}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 gap-1 text-[10px] uppercase",
                    priced ? "text-success" : "text-warning",
                  )}
                >
                  {priced ? <CircleCheck className="size-3" aria-hidden /> : <CircleAlert className="size-3" aria-hidden />}
                  {priced ? t("serviceTasks.priced") : t("serviceTasks.pricingNeeded")}
                </Badge>
              </div>
            </li>
          );
        })}
        {results.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-foreground-muted">
            {t("serviceTasks.empty")}
          </li>
        )}
      </ul>
    </section>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="min-h-11 shrink-0 whitespace-nowrap capitalize"
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

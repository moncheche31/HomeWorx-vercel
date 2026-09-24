import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { AssemblyCard } from "./AssemblyCard";
import { AssemblyDetailSheet } from "./AssemblyDetailSheet";
import { useAssembliesQuery, useKnowledgeBaseMutations } from "../hooks/useKnowledgeBase";
import type { AssemblyDTO } from "../types";

export type BrowserScope = "library" | "favorites" | "mine";

/**
 * Searchable assembly browser. Reused by the Knowledge Base page and by the
 * project Scope workspace when inserting library items.
 */
export function KnowledgeBaseBrowser({
  scope = "library",
  onSelect,
  selectLabel,
}: {
  scope?: BrowserScope;
  onSelect?: (assembly: AssemblyDTO) => void;
  selectLabel?: string;
}) {
  const { t } = useTranslation("knowledge-base");
  const [search, setSearch] = useState("");
  const [tradeKey, setTradeKey] = useState<string>("all");
  const [categoryKey, setCategoryKey] = useState<string>("all");
  const [active, setActive] = useState<AssemblyDTO | null>(null);

  const mutations = useKnowledgeBaseMutations();
  const query = useAssembliesQuery({
    search,
    tradeKey: tradeKey === "all" ? null : tradeKey,
    categoryKey: categoryKey === "all" ? null : categoryKey,
    includeDisabled: scope === "mine",
  });

  const all = useMemo(() => query.data ?? [], [query.data]);

  const trades = useMemo(
    () => Array.from(new Set(all.map((a) => a.tradeKey))).sort(),
    [all],
  );
  const categories = useMemo(
    () => Array.from(new Set(all.map((a) => a.categoryKey))).sort(),
    [all],
  );

  const rows = useMemo(() => {
    if (scope === "favorites") return all.filter((a) => a.isFavorite);
    if (scope === "mine") return all.filter((a) => a.origin === "organization");
    return all;
  }, [all, scope]);

  const favorite = async (a: AssemblyDTO) => {
    try {
      await mutations.toggleFavorite.mutateAsync({
        assemblyKey: a.assemblyKey,
        isFavorite: !a.isFavorite,
      });
    } catch (e) { toast.error((e as Error).message || t("toast.error")); }
  };

  const emptyKey =
    scope === "favorites" ? "search.emptyFavorites"
      : scope === "mine" ? "search.emptyMine"
        : "search.empty";

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
          <Input
            className="min-h-11 pl-9"
            placeholder={t("search.placeholder")}
            aria-label={t("search.placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-foreground-muted">{t("search.trade")}</Label>
            <Select value={tradeKey} onValueChange={setTradeKey}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.all")}</SelectItem>
                {trades.map((v) => (
                  <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-foreground-muted">{t("search.category")}</Label>
            <Select value={categoryKey} onValueChange={setCategoryKey}>
              <SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.all")}</SelectItem>
                {categories.map((v) => (
                  <SelectItem key={v} value={v}>{v.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-10"><LoadingSpinner /></div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground-muted">{t(emptyKey)}</p>
      ) : (
        <>
          <p className="text-xs text-foreground-muted">
            {t("page.count", { count: rows.length })}
          </p>
          <ul className="space-y-2">
            {rows.map((a) => (
              <li key={`${a.origin}:${a.assemblyKey}`} className="space-y-1">
                <AssemblyCard
                  assembly={a}
                  onOpen={() => (onSelect ? onSelect(a) : setActive(a))}
                  onToggleFavorite={() => favorite(a)}
                />
                {onSelect && selectLabel && (
                  <button
                    type="button"
                    className="min-h-11 w-full rounded-md border border-border text-sm font-medium text-primary"
                    onClick={() => onSelect(a)}
                  >
                    {selectLabel}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!onSelect && (
        <AssemblyDetailSheet
          assembly={active}
          open={!!active}
          onOpenChange={(v) => !v && setActive(null)}
          mutations={mutations}
        />
      )}
    </div>
  );
}

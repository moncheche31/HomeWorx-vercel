import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, EyeOff, Eye } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { AssemblyDTO, AssemblyOverrideInput } from "../types";
import type { useKnowledgeBaseMutations } from "../hooks/useKnowledgeBase";

type Draft = Record<string, string>;

const NUMBER_FIELDS = [
  "productionRate", "defaultLaborHours", "crewSize", "materialAllowance",
  "wasteFactor", "suggestedMarkupPct", "defaultOverheadPct", "suggestedProfitPct",
  "estimatedDurationHours",
] as const;

const TEXT_FIELDS = [
  "measurementMethod", "equipmentRequirements", "skillLevel",
] as const;

const LONG_FIELDS = [
  "defaultScopeDescription", "clientDescription", "internalNotes",
  "safetyNotes", "codeReference", "inspectionNotes",
] as const;

function toDraft(a: AssemblyDTO): Draft {
  const d: Draft = { workItem: a.workItem };
  for (const f of NUMBER_FIELDS) d[f] = a[f] == null ? "" : String(a[f]);
  for (const f of TEXT_FIELDS) d[f] = a[f] ?? "";
  for (const f of LONG_FIELDS) d[f] = a[f] ?? "";
  return d;
}

function toPatch(draft: Draft): AssemblyOverrideInput {
  const patch: Record<string, unknown> = { workItem: draft.workItem.trim() || null };
  for (const f of NUMBER_FIELDS) {
    const raw = draft[f]?.trim();
    patch[f] = raw ? Number(raw) : null;
  }
  for (const f of [...TEXT_FIELDS, ...LONG_FIELDS]) patch[f] = draft[f]?.trim() || null;
  return patch as AssemblyOverrideInput;
}

/**
 * Editing surface for a single work item. Library records are never mutated —
 * saving writes a per-organization override (copy-on-write).
 */
export function AssemblyDetailSheet({
  assembly, open, onOpenChange, mutations,
}: {
  assembly: AssemblyDTO | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mutations: ReturnType<typeof useKnowledgeBaseMutations>;
}) {
  const { t } = useTranslation("knowledge-base");
  const [draft, setDraft] = useState<Draft>({});

  useEffect(() => {
    if (assembly) setDraft(toDraft(assembly));
  }, [assembly]);

  if (!assembly) return null;
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    try {
      await mutations.saveEdit.mutateAsync({
        assemblyKey: assembly.assemblyKey,
        origin: assembly.origin,
        patch: toPatch(draft),
      });
      toast.success(t("toast.saved"));
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message || t("toast.error")); }
  };

  const duplicate = async () => {
    try {
      await mutations.duplicate.mutateAsync({ assemblyKey: assembly.assemblyKey });
      toast.success(t("toast.duplicated"));
    } catch (e) { toast.error((e as Error).message || t("toast.error")); }
  };

  const toggleDisabled = async () => {
    try {
      await mutations.setState.mutateAsync({
        assemblyKey: assembly.assemblyKey,
        origin: assembly.origin,
        isDisabled: !assembly.isDisabled,
      });
      toast.success(t("toast.stateUpdated"));
    } catch (e) { toast.error((e as Error).message || t("toast.error")); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-2 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] uppercase">
              {assembly.origin === "organization" ? t("badge.custom") : t("badge.library")}
            </Badge>
            <span className="text-[11px] uppercase tracking-wide text-foreground-muted">
              {assembly.tradeKey.replace(/_/g, " ")} · {assembly.categoryKey.replace(/_/g, " ")}
            </span>
          </div>
          <SheetTitle>{assembly.workItem}</SheetTitle>
          <SheetDescription>{t("detail.editHint")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="kb-workItem">{t("create.workItem")}</Label>
            <Input
              id="kb-workItem"
              className="min-h-11"
              value={draft.workItem ?? ""}
              onChange={(e) => set("workItem", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {NUMBER_FIELDS.map((f) => (
              <div key={f} className="space-y-1.5">
                <Label htmlFor={`kb-${f}`}>{t(`fields.${fieldKey(f)}`)}</Label>
                <Input
                  id={`kb-${f}`}
                  className="min-h-11"
                  inputMode="decimal"
                  value={draft[f] ?? ""}
                  onChange={(e) => set(f, e.target.value)}
                />
              </div>
            ))}
          </div>

          {TEXT_FIELDS.map((f) => (
            <div key={f} className="space-y-1.5">
              <Label htmlFor={`kb-${f}`}>{t(`fields.${fieldKey(f)}`)}</Label>
              <Input
                id={`kb-${f}`}
                className="min-h-11"
                value={draft[f] ?? ""}
                onChange={(e) => set(f, e.target.value)}
              />
            </div>
          ))}

          {LONG_FIELDS.map((f) => (
            <div key={f} className="space-y-1.5">
              <Label htmlFor={`kb-${f}`}>{t(`fields.${fieldKey(f)}`)}</Label>
              <Textarea
                id={`kb-${f}`}
                rows={3}
                value={draft[f] ?? ""}
                onChange={(e) => set(f, e.target.value)}
              />
            </div>
          ))}

          {assembly.keywords.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("fields.keywords")}</Label>
              <div className="flex flex-wrap gap-1">
                {assembly.keywords.map((k) => (
                  <Badge key={k} variant="secondary" className="text-[11px]">{k}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="sticky bottom-0 flex flex-col gap-2 bg-background py-3">
          <Button className="min-h-11" onClick={save} disabled={mutations.saveEdit.isPending}>
            {t("actions.save")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11 flex-1" onClick={duplicate}>
              <Copy className="mr-2 size-4" aria-hidden />
              {t("actions.duplicate")}
            </Button>
            <Button variant="outline" className="min-h-11 flex-1" onClick={toggleDisabled}>
              {assembly.isDisabled
                ? <><Eye className="mr-2 size-4" aria-hidden />{t("actions.enable")}</>
                : <><EyeOff className="mr-2 size-4" aria-hidden />{t("actions.disable")}</>}
            </Button>
          </div>
          <p className="text-xs text-foreground-muted">{t("detail.resetHint")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function fieldKey(f: string): string {
  const map: Record<string, string> = {
    defaultLaborHours: "laborHours",
    suggestedMarkupPct: "markup",
    defaultOverheadPct: "overhead",
    suggestedProfitPct: "profit",
    estimatedDurationHours: "duration",
    measurementMethod: "measurement",
    equipmentRequirements: "equipment",
  };
  return map[f] ?? f;
}

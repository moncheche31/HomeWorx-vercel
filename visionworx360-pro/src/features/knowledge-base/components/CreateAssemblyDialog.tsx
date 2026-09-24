import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useKnowledgeBaseMutations } from "../hooks/useKnowledgeBase";

/** Creates a company-owned work item that lives alongside the master library. */
export function CreateAssemblyDialog({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation("knowledge-base");
  const { create } = useKnowledgeBaseMutations();
  const [form, setForm] = useState({
    workItem: "", tradeKey: "", categoryKey: "", unitKey: "each",
    defaultScopeDescription: "", keywords: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    try {
      await create.mutateAsync({
        workItem: form.workItem.trim(),
        tradeKey: form.tradeKey.trim(),
        categoryKey: form.categoryKey.trim(),
        unitKey: form.unitKey.trim(),
        defaultScopeDescription: form.defaultScopeDescription.trim(),
        keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      });
      toast.success(t("toast.created"));
      onOpenChange(false);
      setForm({
        workItem: "", tradeKey: "", categoryKey: "", unitKey: "each",
        defaultScopeDescription: "", keywords: "",
      });
    } catch (e) { toast.error((e as Error).message || t("toast.error")); }
  };

  const disabled =
    !form.workItem.trim() || !form.tradeKey.trim() || !form.categoryKey.trim() ||
    !form.unitKey.trim() || !form.defaultScopeDescription.trim() || create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field id="workItem" label={t("create.workItem")} value={form.workItem} onChange={(v) => set("workItem", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="tradeKey" label={t("create.trade")} value={form.tradeKey} onChange={(v) => set("tradeKey", v)} />
            <Field id="categoryKey" label={t("create.category")} value={form.categoryKey} onChange={(v) => set("categoryKey", v)} />
          </div>
          <Field id="unitKey" label={t("create.unit")} value={form.unitKey} onChange={(v) => set("unitKey", v)} />
          <div className="space-y-1.5">
            <Label htmlFor="kb-scope">{t("create.scope")}</Label>
            <Textarea
              id="kb-scope"
              rows={3}
              value={form.defaultScopeDescription}
              onChange={(e) => set("defaultScopeDescription", e.target.value)}
            />
          </div>
          <Field id="keywords" label={t("create.keywords")} value={form.keywords} onChange={(v) => set("keywords", v)} />
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button className="min-h-11" onClick={submit} disabled={disabled}>
            {t("actions.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id, label, value, onChange,
}: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`kb-${id}`}>{label}</Label>
      <Input id={`kb-${id}`} className="min-h-11" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

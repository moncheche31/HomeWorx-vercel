import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClientsQuery, usePropertiesQuery, useProjectMutations } from "../hooks/useCrm";
import type { ProjectDTO, ProjectPriority, ProjectStatus } from "../services/types";
import { clientDisplayName } from "../utils/format";
import { ProjectTypeCombobox } from "./ProjectTypeCombobox";
import { ProjectSubtypeCombobox } from "./ProjectSubtypeCombobox";
import {
  CATEGORY_OF_TYPE,
  mapLegacyProjectType,
  type ProjectCategoryKey,
} from "../catalog/projectTypes";
import { hasSubtypes, isValidSubtypeForType } from "../catalog/projectSubtypes";
import { PROJECT_SCALES, isPrimaryBusinessType } from "../catalog/businessProfile";
import {
  getRecommendedScale,
  type OrganizationBusinessProfile,
} from "../catalog/adaptiveOrdering";
import { useWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import { QuickClientSheet } from "./QuickClientSheet";
import { PropertyFormDialog } from "./PropertyFormDialog";
import type { ClientDTO } from "../services/types";

const STATUSES: ProjectStatus[] = [
  "lead",
  "site_visit_scheduled",
  "site_visit_complete",
  "estimate_in_progress",
  "estimate_sent",
  "customer_reviewing",
  "approved",
  "scheduled",
  "construction",
  "completed",
];
const PRIORITIES: ProjectPriority[] = ["low", "normal", "high", "urgent"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultClientId?: string;
  defaultPropertyId?: string;
  project?: ProjectDTO | null;
  onSaved?: (p: ProjectDTO) => void;
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  defaultClientId,
  defaultPropertyId,
  project,
  onSaved,
}: Props) {
  const { t } = useTranslation("crm");
  const { create, update, orgId } = useProjectMutations();
  const { organization } = useWorkspace();
  const orgProfile = useMemo<OrganizationBusinessProfile | null>(() => {
    if (!organization) return null;
    return {
      primaryBusinessType: isPrimaryBusinessType(organization.primaryBusinessType)
        ? organization.primaryBusinessType
        : null,
      secondaryBusinessTypes: organization.secondaryBusinessTypes ?? [],
      serviceSpecialties: organization.serviceSpecialties ?? [],
      preferredProjectScale: organization.preferredProjectScale,
    };
  }, [organization]);
  const [clientId, setClientId] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string>("");
  const [form, setForm] = useState({
    name: "",
    projectCategoryKey: null as ProjectCategoryKey | null,
    projectTypeKey: null as string | null,
    projectTypeCustom: "",
    projectSubtypeKey: null as string | null,
    projectSubtypeCustom: "",
    projectScaleKey: "" as string,
    legacyProjectType: "" as string, // preserved unrecognized free-text
    status: "lead" as ProjectStatus,
    priority: "normal" as ProjectPriority,
    budget: "",
    targetGrossMargin: "",
    targetCompletion: "",
    description: "",
    internalNotes: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);
  // Newly created client may not be in the paged list yet; keep it selectable.
  const [inlineClient, setInlineClient] = useState<ClientDTO | null>(null);
  // Guards against duplicate projects on double submit / retry.
  const savedProjectRef = useRef<ProjectDTO | null>(null);
  const submittingRef = useRef(false);
  const editing = !!project;

  const clientsQ = useClientsQuery({
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 100,
    sort: "alpha",
  });
  const propertiesQ = usePropertiesQuery(clientId || undefined, false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setQuickClientOpen(false);
    setPropertyOpen(false);
    setInlineClient(null);
    savedProjectRef.current = null;
    submittingRef.current = false;
    if (project) {
      setClientId(project.clientId);
      setPropertyId(project.propertyId);
      // Prefer explicit new keys; else attempt to map legacy free-text.
      let catKey = project.projectCategoryKey as ProjectCategoryKey | null;
      let typeKey = project.projectTypeKey;
      let legacy = "";
      if (!typeKey) {
        const mapped = mapLegacyProjectType(project.projectType);
        if (mapped) {
          catKey = mapped.categoryKey;
          typeKey = mapped.typeKey;
        } else if (project.projectType) {
          legacy = project.projectType;
        }
      } else if (!catKey && typeKey in CATEGORY_OF_TYPE) {
        catKey = CATEGORY_OF_TYPE[typeKey]!;
      }
      setForm({
        name: project.name,
        projectCategoryKey: catKey ?? null,
        projectTypeKey: typeKey ?? null,
        projectTypeCustom: project.projectTypeCustom ?? "",
        projectSubtypeKey: project.projectSubtypeKey ?? null,
        projectSubtypeCustom: project.projectSubtypeCustom ?? "",
        projectScaleKey: project.projectScaleKey ?? "",
        legacyProjectType: legacy,
        status: project.status === "archived" ? "lead" : project.status,
        priority: project.priority,
        budget: project.budget?.toString() ?? "",
        targetGrossMargin: project.targetGrossMargin?.toString() ?? "",
        targetCompletion: project.targetCompletion ?? "",
        description: project.description ?? "",
        internalNotes: project.internalNotes ?? "",
      });
    } else {
      setClientId(defaultClientId ?? "");
      setPropertyId(defaultPropertyId ?? "");
      setForm({
        name: "",
        projectCategoryKey: null,
        projectTypeKey: null,
        projectTypeCustom: "",
        projectSubtypeKey: null,
        projectSubtypeCustom: "",
        projectScaleKey: "",
        legacyProjectType: "",
        status: "lead",
        priority: "normal",
        budget: "",
        targetGrossMargin: "",
        targetCompletion: "",
        description: "",
        internalNotes: "",
      });
    }
  }, [open, project, defaultClientId, defaultPropertyId]);

  const clientOptions = useMemo(() => {
    const items = clientsQ.data?.items ?? [];
    if (inlineClient && !items.some((c) => c.id === inlineClient.id)) {
      return [inlineClient, ...items];
    }
    return items;
  }, [clientsQ.data, inlineClient]);
  const propertyOptions = useMemo(() => propertiesQ.data ?? [], [propertiesQ.data]);

  const bind =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savedProjectRef.current) {
      onSaved?.(savedProjectRef.current);
      onOpenChange(false);
      return;
    }
    if (submittingRef.current) return;
    if (!orgId) {
      setErr(t("errors.noActiveOrg"));
      return;
    }
    if (!clientId || !propertyId) {
      setErr(t("errors.parentMismatch"));
      return;
    }
    const isOther = form.projectTypeKey === "OTHER";
    if (isOther && !form.projectTypeCustom.trim()) {
      setErr(t("projectTypePicker.customRequired"));
      return;
    }
    const isSubtypeOther = form.projectSubtypeKey === "OTHER";
    if (isSubtypeOther && !form.projectSubtypeCustom.trim()) {
      setErr(t("projectSubtypePicker.customRequired"));
      return;
    }
    // Legacy free-text is preserved in `projectType` only when no new key was picked.
    const legacyProjectType = form.projectTypeKey ? null : form.legacyProjectType || null;
    // Only send subtype when the current type actually configures subtypes and the
    // selected subtype is valid for that type. Otherwise clear both fields.
    const subtypeValid =
      hasSubtypes(form.projectTypeKey) &&
      isValidSubtypeForType(form.projectTypeKey, form.projectSubtypeKey);
    const payload = {
      activeOrganizationId: orgId,
      clientId,
      propertyId,
      name: form.name,
      projectType: legacyProjectType,
      projectCategoryKey: form.projectCategoryKey,
      projectTypeKey: form.projectTypeKey,
      projectTypeCustom: isOther ? form.projectTypeCustom.trim() : null,
      projectSubtypeKey: subtypeValid ? form.projectSubtypeKey : null,
      projectSubtypeCustom:
        subtypeValid && isSubtypeOther ? form.projectSubtypeCustom.trim() : null,
      projectScaleKey: (PROJECT_SCALES as readonly string[]).includes(form.projectScaleKey)
        ? (form.projectScaleKey as (typeof PROJECT_SCALES)[number])
        : null,
      status: form.status,
      priority: form.priority,
      budget: form.budget ? Number(form.budget) : null,
      targetGrossMargin: form.targetGrossMargin ? Number(form.targetGrossMargin) : null,
      targetCompletion: form.targetCompletion || null,
      description: form.description,
      internalNotes: form.internalNotes,
    };
    submittingRef.current = true;
    try {
      const saved =
        editing && project
          ? await update.mutateAsync({ ...payload, id: project.id })
          : await create.mutateAsync(payload);
      if (!editing) savedProjectRef.current = saved;
      toast.success(t(editing ? "project.toast.updated" : "project.toast.created"));
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errors.loadFailed"));
    } finally {
      submittingRef.current = false;
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("actions.edit") : t("actions.newProject")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="pname">{t("project.fields.name")}</Label>
            <Input id="pname" required value={form.name} onChange={bind("name")} />
          </div>
          <div>
            <Label htmlFor="pclient">{t("project.fields.client")}</Label>
            <div className="flex gap-2">
              <Select
                value={clientId}
                onValueChange={(v) => {
                setClientId(v);
                setPropertyId("");
                }}
                disabled={!!defaultClientId}
              >
                <SelectTrigger id="pclient" className="min-h-(--control-min-h) flex-1">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                {clientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {clientDisplayName(c)}
                  </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!defaultClientId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-(--control-min-h) shrink-0"
                  onClick={() => setQuickClientOpen(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  <span className="sr-only sm:not-sr-only sm:ml-1">
                    {t("quickClient.trigger")}
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
          <div>
            <Label htmlFor="pprop">{t("project.fields.property")}</Label>
            <div className="flex gap-2">
              <Select
                value={propertyId}
                onValueChange={setPropertyId}
                disabled={!clientId || !!defaultPropertyId}
              >
                <SelectTrigger id="pprop" className="min-h-(--control-min-h) flex-1">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                {propertyOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nickname || p.street || p.city || p.id.slice(0, 6)}
                  </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!defaultPropertyId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-(--control-min-h) shrink-0"
                  disabled={!clientId}
                  onClick={() => setPropertyOpen(true)}
                >
                  <Plus className="size-4" aria-hidden />
                  <span className="sr-only sm:not-sr-only sm:ml-1">
                    {t("actions.newProperty")}
                  </span>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="ptype">{t("project.fields.projectType")}</Label>
            <ProjectTypeCombobox
              id="ptype"
              value={form.projectTypeKey}
              profile={orgProfile}
              onChange={(typeKey, categoryKey) =>
                setForm((f) => {
                  const suggested = getRecommendedScale(typeKey, orgProfile);
                  return {
                    ...f,
                    projectTypeKey: typeKey,
                    projectCategoryKey: categoryKey,
                    // Selecting a real key retires any legacy free-text.
                    legacyProjectType: "",
                    projectTypeCustom: typeKey === "OTHER" ? f.projectTypeCustom : "",
                    // Reset subtype whenever the parent type changes.
                    projectSubtypeKey: null,
                    projectSubtypeCustom: "",
                    // Suggest a scale when the user hasn't picked one.
                    projectScaleKey: f.projectScaleKey || (suggested ?? ""),
                  };
                })
              }
            />

            {form.projectCategoryKey ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("projectTypePicker.categoryLabel")}:{" "}
                {t(`projectCategories.${form.projectCategoryKey}`)}
              </p>
            ) : null}
            {form.legacyProjectType && !form.projectTypeKey ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("projectTypePicker.legacyValue", { value: form.legacyProjectType })}
              </p>
            ) : null}
            {form.projectTypeKey === "OTHER" ? (
              <div className="mt-2">
                <Label htmlFor="ptypecustom">
                  {t("projectTypePicker.customLabel")}{" "}
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
                <Input
                  id="ptypecustom"
                  required
                  value={form.projectTypeCustom}
                  onChange={bind("projectTypeCustom")}
                  aria-required="true"
                  aria-label={t("projectTypePicker.customLabel")}
                />
              </div>
            ) : null}
          </div>
          {hasSubtypes(form.projectTypeKey) ? (
            <div className="sm:col-span-2">
              <Label htmlFor="psubtype">{t("project.fields.projectSubtype")}</Label>
              <ProjectSubtypeCombobox
                id="psubtype"
                projectTypeKey={form.projectTypeKey}
                value={form.projectSubtypeKey}
                onChange={(subtypeKey) =>
                  setForm((f) => ({
                    ...f,
                    projectSubtypeKey: subtypeKey,
                    projectSubtypeCustom:
                      subtypeKey === "OTHER" ? f.projectSubtypeCustom : "",
                  }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("projectSubtypePicker.helper")}
              </p>
              {form.projectSubtypeKey === "OTHER" ? (
                <div className="mt-2">
                  <Label htmlFor="psubtypecustom">
                    {t("projectSubtypePicker.customLabel")}{" "}
                    <span className="text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
                  <Input
                    id="psubtypecustom"
                    required
                    value={form.projectSubtypeCustom}
                    onChange={bind("projectSubtypeCustom")}
                    aria-required="true"
                    aria-label={t("projectSubtypePicker.customLabel")}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="pscale">{t("project.fields.projectScale")}</Label>
            <Select
              value={form.projectScaleKey || "__none__"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, projectScaleKey: v === "__none__" ? "" : v }))
              }
            >
              <SelectTrigger id="pscale">
                <SelectValue placeholder={t("projectScalePicker.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("projectScalePicker.none")}</SelectItem>
                {PROJECT_SCALES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`projectScales.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pstatus">{t("project.fields.status")}</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as ProjectStatus }))}
            >
              <SelectTrigger id="pstatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ppri">{t("project.fields.priority")}</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm((f) => ({ ...f, priority: v as ProjectPriority }))}
            >
              <SelectTrigger id="ppri">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`priority.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pbudget">{t("project.fields.budget")}</Label>
            <CurrencyInput
              id="pbudget"
              value={form.budget === "" ? null : Number(form.budget)}
              onValueChange={(v) => setForm((f) => ({ ...f, budget: v == null ? "" : String(v) }))}
            />
          </div>
          <div>
            <Label htmlFor="pmargin">{t("project.fields.targetGrossMargin")}</Label>
            <Input
              id="pmargin"
              inputMode="decimal"
              value={form.targetGrossMargin}
              onChange={bind("targetGrossMargin")}
            />
          </div>
          <div>
            <Label htmlFor="ptarget">{t("project.fields.targetCompletion")}</Label>
            <Input
              id="ptarget"
              type="date"
              value={form.targetCompletion}
              onChange={bind("targetCompletion")}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pdesc">{t("project.fields.description")}</Label>
            <Textarea id="pdesc" value={form.description} onChange={bind("description")} rows={3} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pnotes2">{t("project.fields.internalNotes")}</Label>
            <Textarea
              id="pnotes2"
              value={form.internalNotes}
              onChange={bind("internalNotes")}
              rows={2}
            />
          </div>
          {err && (
            <p className="sm:col-span-2 text-sm text-destructive" role="alert">
              {err}
            </p>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>

        <QuickClientSheet
          open={quickClientOpen}
          onOpenChange={setQuickClientOpen}
          onCreated={(c) => {
            setInlineClient(c);
            setClientId(c.id);
            setPropertyId("");
            void clientsQ.refetch();
          }}
        />
        {clientId ? (
          <PropertyFormDialog
            open={propertyOpen}
            onOpenChange={setPropertyOpen}
            clientId={clientId}
            onSaved={async (p) => {
              await propertiesQ.refetch();
              setPropertyId(p.id);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

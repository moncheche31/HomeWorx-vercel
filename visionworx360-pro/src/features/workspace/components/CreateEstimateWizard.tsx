import { useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Home,
  Mic,
  Plus,
  Route as RouteIcon,
  Search,
  UserPlus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { ClientFormDialog } from "@/features/crm/components/ClientFormDialog";
import { PropertyFormDialog } from "@/features/crm/components/PropertyFormDialog";
import {
  useClientsQuery,
  usePropertiesQuery,
  useProjectMutations,
  useProjectsQuery,
} from "@/features/crm/hooks/useCrm";
import type { ClientDTO, PropertyDTO } from "@/features/crm/services/types";
import { cn } from "@/lib/utils";

type StepKey = "client" | "property" | "project" | "method";
const STEPS: StepKey[] = ["client", "property", "project", "method"];

type MethodKey = "onsite" | "photos" | "describe";
const METHODS: {
  key: MethodKey;
  to: "/app/walkthrough" | "/app/remote-vision" | "/app/capture";
  icon: typeof Mic;
}[] = [
  { key: "onsite", to: "/app/walkthrough", icon: RouteIcon },
  { key: "photos", to: "/app/remote-vision", icon: Camera },
  { key: "describe", to: "/app/capture", icon: Mic },
];

export function clientLabel(c: ClientDTO): string {
  const person = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return person || c.company?.trim() || c.email?.trim() || c.phone?.trim() || "—";
}

export function propertyLabel(p: PropertyDTO): string {
  const parts = [p.nickname, p.street, p.city].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * Unified Create Estimate wizard: client → property → project → estimate
 * method. Reuses the CRM dialogs/mutations so no business rules are
 * duplicated, then routes into the existing estimating workflow with the
 * project already selected.
 */
export function CreateEstimateWizard({ className }: { className?: string }) {
  const { t } = useTranslation("workspace");
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepKey>("client");
  const [mode, setMode] = useState<"new" | "existing" | null>(null);
  const [search, setSearch] = useState("");
  const [client, setClient] = useState<ClientDTO | null>(null);
  const [property, setProperty] = useState<PropertyDTO | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projectNotes, setProjectNotes] = useState("");
  const [createdProject, setCreatedProject] = useState<{ id: string; name: string } | null>(null);
  const [clientDialog, setClientDialog] = useState(false);
  const [propertyDialog, setPropertyDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const clientsQuery = useClientsQuery({
    q: search,
    includeArchived: false,
    page: 1,
    pageSize: 20,
    sort: "recent",
  });
  const propertiesQuery = usePropertiesQuery(client?.id, false);
  const historyQuery = useProjectsQuery({
    q: "",
    includeArchived: true,
    page: 1,
    pageSize: 100,
    sort: "recent",
  });
  const { create: createProject, orgId } = useProjectMutations();

  const clients = clientsQuery.data?.items ?? [];
  const properties = useMemo(
    () => (propertiesQuery.data ?? []).filter((p) => !p.archivedAt),
    [propertiesQuery.data],
  );
  const hasHistory = useMemo(() => {
    if (!client || !property) return false;
    return (historyQuery.data?.items ?? []).some(
      (p) => p.clientId === client.id && p.propertyId === property.id,
    );
  }, [client, property, historyQuery.data]);

  const stepIndex = STEPS.indexOf(step);

  const reset = () => {
    setStep("client");
    setMode(null);
    setSearch("");
    setClient(null);
    setProperty(null);
    setProjectName("");
    setProjectNotes("");
    setCreatedProject(null);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const goBack = () => {
    setError(null);
    if (step === "method") setStep("project");
    else if (step === "project") setStep("property");
    else if (step === "property") setStep("client");
  };

  const ensureProject = async (): Promise<{ id: string; name: string } | null> => {
    if (createdProject) return createdProject;
    if (!orgId || !client || !property) return null;
    const name = projectName.trim();
    if (!name) return null;
    // Guard against repeated taps: a second call while the first is in flight
    // must never create a duplicate project record.
    if (submittingRef.current) return null;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await createProject.mutateAsync({
        activeOrganizationId: orgId,
        clientId: client.id,
        propertyId: property.id,
        name,
        description: projectNotes.trim() || null,
        status: "lead",
        priority: "normal",
      });
      const value = { id: saved.id, name: saved.name };
      setCreatedProject(value);
      return value;
    } catch {
      setError(t("createEstimate.wizard.errors.projectCreate"));
      return null;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleProjectContinue = async () => {
    setError(null);
    const project = await ensureProject();
    if (project) setStep("method");
  };


  const handleMethod = (to: (typeof METHODS)[number]["to"]) => {
    if (!createdProject) return;
    setOpen(false);
    const target = createdProject;
    reset();
    void navigate({
      to,
      search: { projectId: target.id, projectName: target.name },
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button className={cn("min-h-14 w-full text-base sm:w-auto sm:min-w-64", className)}>
          <Plus className="mr-2 size-5" aria-hidden />
          {t("cards.createEstimate.cta")}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        data-testid="create-estimate-wizard"
        className={cn(
          // Mobile: full-width bottom sheet (unchanged behaviour).
          "max-h-[92vh] overflow-y-auto",
          // Tablet: centered modal.
          "sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[86vh] sm:w-[min(720px,92vw)] sm:max-w-none sm:rounded-2xl sm:border sm:p-8",
          // Laptop/desktop: substantial primary-workspace modal, body scrolls internally.
          "md:h-[82vh] md:max-h-[84vh] md:w-[min(960px,94vw)] md:p-10",
        )}

      >
        <SheetHeader className="text-left sm:pr-10">
          <SheetTitle className="sm:text-2xl">
            {t("cards.createEstimate.chooser.title")}
          </SheetTitle>
          <SheetDescription className="sm:text-base">
            {t(`createEstimate.wizard.steps.${step}.question`)}
          </SheetDescription>
        </SheetHeader>


        {/* Progress */}
        <ol
          className="mt-3 flex items-center gap-2"
          aria-label={t("createEstimate.wizard.progress", {
            current: stepIndex + 1,
            total: STEPS.length,
          })}
        >
          {STEPS.map((s, index) => (
            <li
              key={s}
              aria-current={s === step ? "step" : undefined}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                index <= stepIndex ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </ol>
        <p className="mt-2 text-xs text-foreground-muted">
          {t("createEstimate.wizard.progress", {
            current: stepIndex + 1,
            total: STEPS.length,
          })}
        </p>

        <div className="mt-4 space-y-3 pb-6">
          {/* STEP 1 — CLIENT */}
          {step === "client" ? (
            <div className="space-y-3">
              {mode === null ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("new");
                      setClientDialog(true);
                    }}
                    className="grid min-h-[4.5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <UserPlus className="size-5" aria-hidden />
                    </span>
                    <span className="text-base font-semibold text-foreground">
                      {t("createEstimate.wizard.steps.client.newClient")}
                    </span>
                    <ChevronRight className="size-5 text-foreground-muted" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("existing")}
                    className="grid min-h-[4.5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                      <Users className="size-5" aria-hidden />
                    </span>
                    <span className="text-base font-semibold text-foreground">
                      {t("createEstimate.wizard.steps.client.existingClient")}
                    </span>
                    <ChevronRight className="size-5 text-foreground-muted" aria-hidden />
                  </button>
                </div>
              ) : null}

              {mode === "existing" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="wizard-client-search">
                      {t("createEstimate.wizard.steps.client.searchLabel")}
                    </Label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
                        aria-hidden
                      />
                      <Input
                        id="wizard-client-search"
                        className="min-h-12 pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t("createEstimate.wizard.steps.client.searchPlaceholder")}
                      />
                    </div>
                  </div>
                  {clientsQuery.isLoading ? <LoadingSpinner label="…" /> : null}
                  {!clientsQuery.isLoading && clients.length === 0 ? (
                    <p className="text-sm text-foreground-muted">
                      {t("createEstimate.wizard.steps.client.noResults")}
                    </p>
                  ) : null}
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {clients.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setClient(c);
                            setProperty(null);
                            setStep("property");
                          }}
                          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0 truncate text-sm font-medium">
                            {clientLabel(c)}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-foreground-muted" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 w-full sm:w-auto"
                    onClick={() => setClientDialog(true)}
                  >
                    <Plus className="mr-2 size-4" aria-hidden />
                    {t("createEstimate.wizard.steps.client.newClient")}
                  </Button>
                </div>
              ) : null}

              {mode === "new" ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground-muted">
                    {t("createEstimate.wizard.steps.client.newHint")}
                  </p>
                  <Button
                    type="button"
                    className="min-h-12 w-full sm:w-auto"
                    onClick={() => setClientDialog(true)}
                  >
                    <UserPlus className="mr-2 size-4" aria-hidden />
                    {t("createEstimate.wizard.steps.client.newClient")}
                  </Button>
                </div>
              ) : null}

              {mode !== null ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 w-full sm:w-auto"
                  onClick={() => setMode(null)}
                >
                  <ArrowLeft className="mr-2 size-4" aria-hidden />
                  {t("createEstimate.wizard.back")}
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* STEP 2 — PROPERTY */}
          {step === "property" && client ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground-muted">
                {t("createEstimate.wizard.steps.property.forClient", {
                  name: clientLabel(client),
                })}
              </p>
              {propertiesQuery.isLoading ? <LoadingSpinner label="…" /> : null}
              <ul className="grid gap-2 sm:grid-cols-2">
                {properties.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setProperty(p);
                        setStep("project");
                      }}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Home className="size-4 shrink-0 text-foreground-muted" aria-hidden />
                        <span className="truncate text-sm font-medium">{propertyLabel(p)}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-foreground-muted" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {!propertiesQuery.isLoading && properties.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  {t("createEstimate.wizard.steps.property.empty")}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
                <Button
                  type="button"
                  variant={properties.length === 0 ? "default" : "outline"}
                  className="min-h-12 w-full sm:w-auto"
                  onClick={() => setPropertyDialog(true)}
                >
                  <Plus className="mr-2 size-4" aria-hidden />
                  {t("createEstimate.wizard.steps.property.add")}
                </Button>
                <Button type="button" variant="ghost" className="min-h-12 w-full sm:w-auto" onClick={goBack}>
                  <ArrowLeft className="mr-2 size-4" aria-hidden />
                  {t("createEstimate.wizard.back")}
                </Button>
              </div>

            </div>
          ) : null}

          {/* STEP 3 — PROJECT */}
          {step === "project" && client && property ? (
            <div className="space-y-3">
              {hasHistory ? (
                <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground-muted">
                  {t("createEstimate.wizard.steps.project.history")}
                </p>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="wizard-project-name">
                  {t("createEstimate.wizard.steps.project.nameLabel")}
                </Label>
                <Input
                  id="wizard-project-name"
                  className="min-h-12"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={t("createEstimate.wizard.steps.project.namePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wizard-project-notes">
                  {t("createEstimate.wizard.steps.project.notesLabel")}
                </Label>
                <Textarea
                  id="wizard-project-notes"
                  rows={3}
                  value={projectNotes}
                  onChange={(e) => setProjectNotes(e.target.value)}
                  placeholder={t("createEstimate.wizard.steps.project.notesPlaceholder")}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
                <Button
                  type="button"
                  className="min-h-12 w-full sm:w-auto sm:min-w-40"
                  disabled={projectName.trim().length === 0 || createProject.isPending || submitting}
                  onClick={() => void handleProjectContinue()}
                >
                  {createProject.isPending || submitting
                    ? t("createEstimate.wizard.working")
                    : t("createEstimate.wizard.continue")}
                </Button>
                <Button type="button" variant="ghost" className="min-h-12 w-full sm:w-auto" onClick={goBack}>
                  <ArrowLeft className="mr-2 size-4" aria-hidden />
                  {t("createEstimate.wizard.back")}
                </Button>
              </div>

            </div>
          ) : null}

          {/* STEP 4 — METHOD */}
          {step === "method" && createdProject ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-foreground-muted">
                <Check className="size-4 text-primary" aria-hidden />
                {t("createEstimate.wizard.steps.method.ready", { name: createdProject.name })}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {METHODS.map(({ key, to, icon: Icon }) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => handleMethod(to)}
                      className="grid min-h-[4.5rem] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-foreground">
                          {t(`cards.createEstimate.chooser.options.${key}.title`)}
                        </span>
                        <span className="block text-sm text-foreground-muted">
                          {t(`cards.createEstimate.chooser.options.${key}.description`)}
                        </span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-foreground-muted" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="ghost" className="min-h-12 w-full sm:w-auto" onClick={goBack}>
                <ArrowLeft className="mr-2 size-4" aria-hidden />
                {t("createEstimate.wizard.back")}
              </Button>
            </div>
          ) : null}
        </div>

        <ClientFormDialog
          open={clientDialog}
          onOpenChange={setClientDialog}
          onSaved={(saved) => {
            setClient(saved);
            setProperty(null);
            setClientDialog(false);
            setStep("property");
            setPropertyDialog(true);
          }}
        />
        {client ? (
          <PropertyFormDialog
            open={propertyDialog}
            onOpenChange={setPropertyDialog}
            clientId={client.id}
            onSaved={(saved) => {
              setProperty(saved);
              setPropertyDialog(false);
              setStep("project");
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

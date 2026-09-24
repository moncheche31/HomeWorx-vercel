import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectsQuery } from "../hooks/useCrm";
import { ProjectFormDialog } from "./ProjectFormDialog";

interface Props {
  id?: string;
  value: string | null;
  onChange: (id: string, name: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Shared project picker for the estimate entry flows (Onsite Walkthrough,
 * Estimate from Photos, Describe Your Project). Keeps the dropdown and adds a
 * "Create New Project" action that reuses the CRM ProjectFormDialog.
 */
export function ProjectSelectField({ id = "project-select", value, onChange, label, placeholder }: Props) {
  const { t } = useTranslation("crm");
  const [createOpen, setCreateOpen] = useState(false);
  const query = useProjectsQuery({
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 50,
    sort: "recent",
  });

  const projects = useMemo(() => query.data?.items ?? [], [query.data]);
  const empty = projects.length === 0 && !query.isLoading;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="sr-only">
        {label ?? t("projectSelect.label")}
      </Label>

      {empty ? (
        <p className="text-sm text-foreground-muted">{t("projectSelect.empty")}</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={value ?? ""}
            onValueChange={(v) => onChange(v, projects.find((p) => p.id === v)?.name ?? "")}
          >
            <SelectTrigger id={id} className="min-h-(--control-min-h) sm:flex-1">
              <SelectValue placeholder={placeholder ?? t("projectSelect.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="min-h-(--control-min-h) w-full sm:w-auto"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-2 size-4" aria-hidden />
            {t("projectSelect.create")}
          </Button>
        </div>
      )}

      {empty ? (
        <Button type="button" className="min-h-(--control-min-h) w-full" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" aria-hidden />
          {t("projectSelect.create")}
        </Button>
      ) : null}

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={async (project) => {
          await query.refetch();
          onChange(project.id, project.name);
        }}
      />
    </div>
  );
}

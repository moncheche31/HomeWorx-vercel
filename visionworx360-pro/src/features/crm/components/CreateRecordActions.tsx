import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, Home, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProjectFormDialog } from "./ProjectFormDialog";
import { ClientFormDialog } from "./ClientFormDialog";
import { PropertyFormDialog } from "./PropertyFormDialog";

interface Props {
  className?: string;
  /** Renders full-width on mobile, inline from sm up. */
  align?: "start" | "end";
  /** Which creation action to render. Pages show only their own action. */
  show: "project" | "client" | "property";
}

/**
 * A single plainly labeled, mobile-friendly creation action.
 * Replaces icon-only floating buttons so primary creation is always visible.
 * Each dialog owns its own duplicate-submit guards.
 */
export function CreateRecordActions({ className, align = "end", show }: Props) {
  const { t } = useTranslation("crm");
  const [projectOpen, setProjectOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [propertyOpen, setPropertyOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 sm:w-auto sm:flex-row",
        align === "end" ? "sm:justify-end" : "sm:justify-start",
        className,
      )}
    >
      {show === "project" && (
        <Button
          type="button"
          className="min-h-(--control-min-h) w-full sm:w-auto"
          onClick={() => setProjectOpen(true)}
        >
          <FolderPlus className="mr-2 size-4" aria-hidden />
          {t("actions.createNewProject")}
        </Button>
      )}
      {show === "client" && (
        <Button
          type="button"
          className="min-h-(--control-min-h) w-full sm:w-auto"
          onClick={() => setClientOpen(true)}
        >
          <UserPlus className="mr-2 size-4" aria-hidden />
          {t("actions.createNewClient")}
        </Button>
      )}
      {show === "property" && (
        <Button
          type="button"
          className="min-h-(--control-min-h) w-full sm:w-auto"
          onClick={() => setPropertyOpen(true)}
        >
          <Home className="mr-2 size-4" aria-hidden />
          {t("actions.createNewProperty")}
        </Button>
      )}

      {show === "project" && (
        <ProjectFormDialog open={projectOpen} onOpenChange={setProjectOpen} />
      )}
      {show === "client" && <ClientFormDialog open={clientOpen} onOpenChange={setClientOpen} />}
      {show === "property" && (
        <PropertyFormDialog open={propertyOpen} onOpenChange={setPropertyOpen} />
      )}
    </div>
  );
}

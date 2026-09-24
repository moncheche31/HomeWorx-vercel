import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectMutations, useProjectDeletionAudit } from "../hooks/useCrm";
import { useCanDeleteRecords } from "../hooks/useRecordPermissions";
import { ConfirmArchiveDialog } from "./ConfirmArchiveDialog";
import { PermanentDeleteDialog } from "./PermanentDeleteDialog";
import type { ProjectDeletionAudit } from "../services/types";

/**
 * Archive/Restore + Permanent Delete for a single project. Shared by the
 * project detail header and the projects list rows so both surfaces get the
 * same confirmation behaviour and the same authorization gate.
 */
export function ProjectRecordActions({
  projectId,
  projectName,
  archived,
  variant = "header",
  onDeleted,
}: {
  projectId: string;
  projectName: string;
  archived: boolean;
  variant?: "header" | "row";
  onDeleted?: () => void;
}) {
  const { t } = useTranslation("crm");
  const { archive, restore, deletePermanently, orgId } = useProjectMutations();
  const auditMutation = useProjectDeletionAudit();
  const canDelete = useCanDeleteRecords();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [audit, setAudit] = useState<ProjectDeletionAudit | null>(null);
  const iconOnly = variant === "row";

  const openDelete = () => {
    setAudit(null);
    setDeleteOpen(true);
    auditMutation.mutate(projectId, { onSuccess: (a) => setAudit(a) });
  };

  return (
    <>
      {!archived ? (
        <Button
          variant={iconOnly ? "ghost" : "outline"}
          size={iconOnly ? "icon" : "default"}
          aria-label={t("actions.archive")}
          onClick={(e) => {
            e.stopPropagation();
            setArchiveOpen(true);
          }}
        >
          <Archive className={iconOnly ? "size-4" : "mr-1 size-4"} aria-hidden />
          {!iconOnly && t("actions.archive")}
        </Button>
      ) : (
        <Button
          variant={iconOnly ? "ghost" : "outline"}
          size={iconOnly ? "icon" : "default"}
          aria-label={t("actions.restore")}
          onClick={async (e) => {
            e.stopPropagation();
            if (!orgId) return;
            await restore.mutateAsync({ id: projectId, activeOrganizationId: orgId });
            toast.success(t("project.toast.restored"));
          }}
        >
          <RotateCcw className={iconOnly ? "size-4" : "mr-1 size-4"} aria-hidden />
          {!iconOnly && t("actions.restore")}
        </Button>
      )}

      {canDelete && (
        <Button
          variant={iconOnly ? "ghost" : "destructive"}
          size={iconOnly ? "icon" : "default"}
          className={iconOnly ? "text-destructive hover:text-destructive" : undefined}
          aria-label={t("actions.deletePermanently")}
          onClick={(e) => {
            e.stopPropagation();
            openDelete();
          }}
        >
          <Trash2 className={iconOnly ? "size-4" : "mr-1 size-4"} aria-hidden />
          {!iconOnly && t("actions.deletePermanently")}
        </Button>
      )}

      <ConfirmArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        recordLabel={projectName}
        pending={archive.isPending}
        onConfirm={async () => {
          if (!orgId) return;
          await archive.mutateAsync({ id: projectId, activeOrganizationId: orgId });
          setArchiveOpen(false);
          toast.success(t("project.toast.archived"));
        }}
      />

      <PermanentDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        recordLabel={projectName}
        audit={audit}
        auditPending={auditMutation.isPending}
        auditError={auditMutation.isError ? t("deleteDialog.auditFailed") : null}
        pending={deletePermanently.isPending}
        onConfirm={async ({ confirmation }) => {
          if (!orgId) return;
          try {
            await deletePermanently.mutateAsync({
              id: projectId,
              activeOrganizationId: orgId,
              confirmation,
            });
            setDeleteOpen(false);
            toast.success(t("project.toast.deleted"));
            onDeleted?.();
          } catch {
            toast.error(t("errors.deleteFailed"));
          }
        }}
      />
    </>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClientMutations, useClientDeletionAudit } from "../hooks/useCrm";
import { useCanDeleteRecords } from "../hooks/useRecordPermissions";
import { ConfirmArchiveDialog } from "./ConfirmArchiveDialog";
import { PermanentDeleteDialog } from "./PermanentDeleteDialog";
import type { ClientDeletionAudit } from "../services/types";

/**
 * Archive/Restore + Permanent Delete for a single client. Deleting a client
 * never silently destroys its project history: the dialog surfaces the
 * dependency summary and requires an explicit delete-everything opt-in.
 */
export function ClientRecordActions({
  clientId,
  clientName,
  archived,
  variant = "header",
  onDeleted,
}: {
  clientId: string;
  clientName: string;
  archived: boolean;
  variant?: "header" | "row";
  onDeleted?: () => void;
}) {
  const { t } = useTranslation("crm");
  const { archive, restore, deletePermanently, orgId } = useClientMutations();
  const auditMutation = useClientDeletionAudit();
  const canDelete = useCanDeleteRecords();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [audit, setAudit] = useState<ClientDeletionAudit | null>(null);
  const iconOnly = variant === "row";

  const openDelete = () => {
    setAudit(null);
    setDeleteOpen(true);
    auditMutation.mutate(clientId, { onSuccess: (a) => setAudit(a) });
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
            await restore.mutateAsync({ id: clientId, activeOrganizationId: orgId });
            toast.success(t("client.toast.restored"));
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
        recordLabel={clientName}
        pending={archive.isPending}
        onConfirm={async () => {
          if (!orgId) return;
          await archive.mutateAsync({ id: clientId, activeOrganizationId: orgId });
          setArchiveOpen(false);
          toast.success(t("client.toast.archived"));
        }}
      />

      <PermanentDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        recordLabel={clientName}
        audit={audit}
        auditPending={auditMutation.isPending}
        auditError={auditMutation.isError ? t("deleteDialog.auditFailed") : null}
        pending={deletePermanently.isPending}
        onConfirm={async ({ confirmation, deleteDependents }) => {
          if (!orgId) return;
          try {
            await deletePermanently.mutateAsync({
              id: clientId,
              activeOrganizationId: orgId,
              confirmation,
              deleteDependents,
            });
            setDeleteOpen(false);
            toast.success(t("client.toast.deleted"));
            onDeleted?.();
          } catch (err) {
            const code = (err as { code?: string } | null)?.code;
            toast.error(
              code === "CLIENT_HAS_DEPENDENTS"
                ? t("errors.clientHasDependents")
                : code === "DELETE_BLOCKED"
                  ? t("errors.deleteBlocked")
                  : code === "NOT_AUTHORIZED_TO_DELETE"
                    ? t("errors.notAuthorizedToDelete")
                    : t("errors.deleteFailed"),
            );
          }
        }}
      />
    </>
  );
}

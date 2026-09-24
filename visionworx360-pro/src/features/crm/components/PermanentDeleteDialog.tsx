import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import type { ClientDeletionAudit, ProjectDeletionAudit } from "../services/types";

/** The word the contractor must type before the destructive button unlocks. */
export const DELETE_CONFIRMATION_WORD = "DELETE";

export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;
}

type Audit = ProjectDeletionAudit | ClientDeletionAudit;

function isClientAudit(a: Audit): a is ClientDeletionAudit {
  return a.kind === "client";
}

/** Only non-zero dependency counts are worth showing the contractor. */
export function dependencySummary(counts: Record<string, number>): [string, number][] {
  return Object.entries(counts).filter(([, n]) => Number(n) > 0) as [string, number][];
}

/**
 * Permanent delete is deliberately harder than archive: it audits dependent
 * records server-side first, refuses records that must be retained, and only
 * enables the destructive action once the contractor types DELETE.
 */
export function PermanentDeleteDialog({
  open,
  onOpenChange,
  recordLabel,
  audit,
  auditPending,
  auditError,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordLabel: string;
  audit: Audit | null;
  auditPending: boolean;
  auditError: string | null;
  pending?: boolean;
  onConfirm: (options: { deleteDependents: boolean; confirmation: string }) => void | Promise<void>;
}) {
  const { t } = useTranslation("crm");
  const [typed, setTyped] = useState("");
  const [deleteDependents, setDeleteDependents] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setDeleteDependents(false);
    }
  }, [open]);

  const clientAudit = audit && isClientAudit(audit) ? audit : null;
  const hasDependencies = clientAudit?.hasDependencies ?? false;
  const blockers = audit?.blockers ?? [];
  const retained = blockers.length > 0;
  const notAllowed = audit ? !audit.mayDelete : false;
  const needsDependentOptIn = hasDependencies && !deleteDependents;
  const canSubmit =
    !!audit && !retained && !notAllowed && !needsDependentOptIn && isDeleteConfirmed(typed) && !pending;

  const counts = audit
    ? dependencySummary(audit.counts as unknown as Record<string, number>)
    : [];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
            {t("deleteDialog.title", { name: recordLabel })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("deleteDialog.description")}</AlertDialogDescription>
        </AlertDialogHeader>

        {auditPending && <LoadingSpinner label={t("deleteDialog.checking")} />}

        {auditError && (
          <p role="alert" className="text-sm text-destructive">
            {t("deleteDialog.auditFailed")}
          </p>
        )}

        {audit && (
          <div className="space-y-3 text-sm">
            {counts.length > 0 ? (
              <div>
                <p className="font-medium">{t("deleteDialog.dependenciesTitle")}</p>
                <ul className="mt-1 list-disc pl-5 text-foreground-muted">
                  {counts.map(([key, n]) => (
                    <li key={key}>
                      {t(`deleteDialog.counts.${key}`, { defaultValue: key })}: {n}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-foreground-muted">{t("deleteDialog.noDependencies")}</p>
            )}

            {notAllowed && (
              <p role="alert" className="text-destructive">
                {t("deleteDialog.notAuthorized")}
              </p>
            )}

            {retained && (
              <div role="alert" className="rounded-md border border-destructive/40 p-3">
                <p className="font-medium text-destructive">{t("deleteDialog.blockedTitle")}</p>
                <ul className="mt-1 list-disc pl-5 text-foreground-muted">
                  {blockers.map((b) => (
                    <li key={b}>{t(`deleteDialog.blockers.${b}`, { defaultValue: b })}</li>
                  ))}
                </ul>
                <p className="mt-2 text-foreground-muted">{t("deleteDialog.blockedHint")}</p>
              </div>
            )}

            {hasDependencies && !retained && (
              <div className="rounded-md border border-border p-3">
                <p className="text-foreground-muted">{t("deleteDialog.clientDependencyHint")}</p>
                <label className="mt-2 flex items-start gap-2">
                  <Checkbox
                    checked={deleteDependents}
                    onCheckedChange={(v) => setDeleteDependents(v === true)}
                    aria-label={t("deleteDialog.deleteDependents")}
                  />
                  <span>{t("deleteDialog.deleteDependents")}</span>
                </label>
              </div>
            )}

            {!retained && !notAllowed && (
              <div className="grid gap-1">
                <Label htmlFor="delete-confirm">
                  {t("deleteDialog.typeToConfirm", { word: DELETE_CONFIRMATION_WORD })}
                </Label>
                <Input
                  id="delete-confirm"
                  value={typed}
                  autoComplete="off"
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={DELETE_CONFIRMATION_WORD}
                />
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit}
            onClick={() => void onConfirm({ deleteDependents, confirmation: typed.trim() })}
          >
            <Trash2 className="mr-1 size-4" aria-hidden />
            {t("actions.deletePermanently")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

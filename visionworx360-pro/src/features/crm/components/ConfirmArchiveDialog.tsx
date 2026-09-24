import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Archive is reversible, so a single clear confirmation is enough. The copy
 * always states that the record is only hidden and can be restored, which is
 * what separates it from the destructive permanent-delete flow.
 */
export function ConfirmArchiveDialog({
  open,
  onOpenChange,
  recordLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordLabel: string;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useTranslation("crm");
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("archiveDialog.title", { name: recordLabel })}</AlertDialogTitle>
          <AlertDialogDescription>{t("archiveDialog.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {t("actions.archive")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

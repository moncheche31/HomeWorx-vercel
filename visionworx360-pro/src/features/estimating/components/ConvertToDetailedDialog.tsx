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
 * Confirmation for Ballpark -> Detailed on the SAME estimate.
 *
 * The copy is explicit that nothing is recreated: this is a progression of the
 * existing document, not a new estimate.
 */
export function ConvertToDetailedDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("estimating");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("convert.title")}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-base sm:text-sm">
            <span className="block">{t("convert.body")}</span>
            <span className="block">{t("convert.bodyTools")}</span>
            <span className="block">{t("convert.bodyHistory")}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-12 w-full text-base sm:h-10 sm:w-auto sm:text-sm">
            {t("convert.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            className="h-12 w-full text-base sm:h-10 sm:w-auto sm:text-sm"
            disabled={!!pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {t("convert.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

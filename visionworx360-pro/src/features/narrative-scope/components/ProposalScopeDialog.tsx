import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useNarrativeScope } from "../hooks/useNarrativeScope";
import { NarrativeDocumentView } from "./NarrativeDocumentView";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

/**
 * The customer-facing Scope of Work. Generated directly from the approved
 * narrative — internal-only items and estimating terminology never appear.
 */
export function ProposalScopeDialog({ open, onOpenChange, projectId, projectName }: Props) {
  const { t } = useTranslation("narrative");
  const n = useNarrativeScope(projectId, projectName, "customer");
  const text = n.record.approvedText ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("proposal.title")}</DialogTitle>
          <DialogDescription>{t("proposal.subtitle")}</DialogDescription>
        </DialogHeader>
        {text ? (
          <NarrativeDocumentView text={text} />
        ) : (
          <p className="text-sm text-foreground-muted">{t("proposal.notApproved")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

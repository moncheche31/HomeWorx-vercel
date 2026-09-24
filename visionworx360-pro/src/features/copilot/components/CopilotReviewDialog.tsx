import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopilotReviewPanel } from "./CopilotReviewPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
}

export function CopilotReviewDialog({ open, onOpenChange, projectId, projectName }: Props) {
  const { t } = useTranslation("copilot");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>
        <CopilotReviewPanel projectId={projectId} projectName={projectName} />
      </DialogContent>
    </Dialog>
  );
}

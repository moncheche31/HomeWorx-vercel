import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { ProjectStatus, ProjectPriority, ClientStatus } from "../services/types";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ProjectStatus, string> = {
  lead: "bg-secondary text-foreground",
  site_visit_scheduled: "bg-secondary text-foreground",
  site_visit_complete: "bg-secondary text-foreground",
  estimate_in_progress: "bg-amber-100 text-amber-900 border-amber-200",
  estimate_sent: "bg-amber-100 text-amber-900 border-amber-200",
  customer_reviewing: "bg-amber-100 text-amber-900 border-amber-200",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-200",
  scheduled: "bg-sky-100 text-sky-900 border-sky-200",
  construction: "bg-sky-100 text-sky-900 border-sky-200",
  completed: "bg-emerald-100 text-emerald-900 border-emerald-200",
  archived: "bg-muted text-muted-foreground",
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const { t } = useTranslation("crm");
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_TONE[status], className)}>
      {t(`status.${status}`)}
    </Badge>
  );
}

const PRIORITY_TONE: Record<ProjectPriority, string> = {
  low: "text-foreground-muted",
  normal: "text-foreground",
  high: "text-amber-700",
  urgent: "text-red-700",
};

export function PriorityBadge({ priority }: { priority: ProjectPriority }) {
  const { t } = useTranslation("crm");
  return (
    <span className={cn("text-xs font-semibold uppercase tracking-wide", PRIORITY_TONE[priority])}>
      {t(`priority.${priority}`)}
    </span>
  );
}

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const { t } = useTranslation("crm");
  if (status === "active") return null;
  return (
    <Badge variant="outline" className="border-muted text-muted-foreground">
      {t(`status.${status}`)}
    </Badge>
  );
}

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type NoticeTone = "success" | "warning" | "danger" | "information";

interface BaseNoticeProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

const tones: Record<
  NoticeTone,
  { icon: typeof Info; wrapper: string; iconClass: string; labelKey: string }
> = {
  success: {
    icon: CheckCircle2,
    wrapper: "border-success/40 bg-success/10 text-foreground",
    iconClass: "text-success",
    labelKey: "notice.success",
  },
  warning: {
    icon: AlertTriangle,
    wrapper: "border-warning/50 bg-warning/15 text-foreground",
    iconClass: "text-[color:var(--warning-foreground)]",
    labelKey: "notice.warning",
  },
  danger: {
    icon: XCircle,
    wrapper: "border-danger/40 bg-danger/10 text-foreground",
    iconClass: "text-danger",
    labelKey: "notice.danger",
  },
  information: {
    icon: Info,
    wrapper: "border-information/40 bg-information/10 text-foreground",
    iconClass: "text-information",
    labelKey: "notice.information",
  },
};

function Notice({
  tone,
  title,
  description,
  action,
  className,
}: BaseNoticeProps & { tone: NoticeTone }) {
  const { t } = useTranslation("common");
  const cfg = tones[tone];
  const Icon = cfg.icon;
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn("flex items-start gap-3 rounded-md border p-3", cfg.wrapper, className)}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", cfg.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          <span className="sr-only">{t(cfg.labelKey)}: </span>
          {title}
        </p>
        {description && <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function SuccessNotice(props: BaseNoticeProps) {
  return <Notice {...props} tone="success" />;
}
export function WarningNotice(props: BaseNoticeProps) {
  return <Notice {...props} tone="warning" />;
}
export function DangerNotice(props: BaseNoticeProps) {
  return <Notice {...props} tone="danger" />;
}
export function InformationNotice(props: BaseNoticeProps) {
  return <Notice {...props} tone="information" />;
}

export function PermissionDeniedState({
  title,
  description,
  action,
  className,
}: Partial<BaseNoticeProps>) {
  const { t } = useTranslation("errors");
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-8 text-center",
        className,
      )}
    >
      <ShieldAlert className="size-8 text-warning" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">
        {title ?? t("permissionDenied.title")}
      </h3>
      <p className="max-w-sm text-sm text-foreground-muted">
        {description ?? t("permissionDenied.description")}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ConfigurationErrorState({
  title,
  description,
  action,
  className,
}: Partial<BaseNoticeProps>) {
  const { t } = useTranslation("errors");
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-6 py-8 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-8 text-[color:var(--warning-foreground)]" aria-hidden />
      <h3 className="text-base font-semibold text-foreground">
        {title ?? t("configuration.componentTitle")}
      </h3>
      <p className="max-w-md text-sm text-foreground-muted">
        {description ?? t("configuration.componentDescription")}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

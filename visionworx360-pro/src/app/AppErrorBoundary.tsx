import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FullPageError } from "@/components/feedback/FullPageError";
import { generateReferenceId } from "@/lib/errors/AppError";
import { logger } from "@/lib/logging/logger";
import { appConfig } from "@/lib/config/env";

interface State {
  error: Error | null;
  referenceId: string;
}

function BoundaryFallback({ referenceId, reset }: { referenceId: string; reset: () => void }) {
  const { t } = useTranslation(["errors", "common", "support"]);
  return (
    <FullPageError
      title={t("errors:boundary.title")}
      description={t("errors:boundary.description")}
      referenceId={referenceId}
      action={
        <div className="flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="inline-flex min-h-(--control-min-h) items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("common:actions.tryAgain")}
          </button>
          {/* Paid-pilot support path: the reference id travels with the report. */}
          <a
            href={`/app/support?ref=${encodeURIComponent(referenceId)}`}
            className="inline-flex min-h-(--control-min-h) items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            {t("support:actions.report")}
          </a>
          <a
            href="/"
            className="inline-flex min-h-(--control-min-h) items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
          >
            {t("common:actions.goHome")}
          </a>
        </div>
      }
    />
  );
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, referenceId: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, referenceId: generateReferenceId() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error("Unhandled render error", {
      name: error.name,
      referenceId: this.state.referenceId,
      componentStack: appConfig.env === "production" ? undefined : info.componentStack,
    });
  }

  reset = () => this.setState({ error: null, referenceId: "" });

  render() {
    if (this.state.error) {
      return <BoundaryFallback referenceId={this.state.referenceId} reset={this.reset} />;
    }
    return this.props.children;
  }
}

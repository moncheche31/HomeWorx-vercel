import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Mic, Camera, MessageSquareText, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  projectName: string;
  className?: string;
  /**
   * "section"/"inline" render the prominent chooser (blank projects only).
   * "menu" keeps the same three methods available as secondary actions.
   */
  variant?: "section" | "inline" | "menu";
}

/**
 * A project is never permanently tied to the method that created it: all three
 * estimating workflows stay available and attach to the SAME project via the
 * projectId/projectName search params (no duplicate project is created).
 */
export function ContinueEstimateActions({
  projectId,
  projectName,
  className,
  variant = "section",
}: Props) {
  const { t } = useTranslation("crm");
  const search = { projectId, projectName };

  const actions = [
    { to: "/app/walkthrough", icon: Mic, key: "walkthrough" },
    { to: "/app/remote-vision", icon: Camera, key: "photos" },
    { to: "/app/capture", icon: MessageSquareText, key: "describe" },
  ] as const;

  const buttons = (
    <div className="grid gap-2 sm:grid-cols-3">
      {actions.map(({ to, icon: Icon, key }) => (
        <Button
          key={key}
          asChild
          variant="outline"
          className="min-h-(--control-min-h) w-full justify-start text-base sm:justify-center"
        >


          <Link to={to} search={search}>
            <Icon className="mr-2 size-5 shrink-0" aria-hidden />
            <span className="truncate">{t(`continueEstimate.methods.${key}`)}</span>
          </Link>
        </Button>
      ))}
    </div>
  );

  if (variant === "menu") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            data-testid="add-more-information"
            className={cn("min-h-(--control-min-h) w-full text-base sm:w-auto", className)}
          >
            <MoreHorizontal className="mr-2 size-5" aria-hidden />
            {t("continueEstimate.addMore")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 text-base">
          {actions.map(({ to, icon: Icon, key }) => (
            <DropdownMenuItem key={key} data-testid={`add-more-${key}`} asChild>
              <span>
                <Link to={to} search={search} className="flex w-full items-center">
                  <Icon className="mr-2 size-5 shrink-0" aria-hidden />
                  {t(`continueEstimate.methods.${key}`)}
                </Link>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (variant === "inline") return <div className={cn("w-full", className)}>{buttons}</div>;

  return (
    <section
      aria-label={t("continueEstimate.title")}
      className={cn("rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5", className)}
    >
      <div className="mb-3 space-y-1">
        <h2 className="text-base font-semibold text-foreground">{t("continueEstimate.title")}</h2>
        <p className="text-sm text-foreground-muted">{t("continueEstimate.description")}</p>
      </div>
      {buttons}
    </section>
  );
}

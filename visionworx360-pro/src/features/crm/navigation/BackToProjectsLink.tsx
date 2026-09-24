import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  WorkspaceBackFooter,
  workspaceBackLinkClass,
} from "@/components/navigation/workspaceBack";
import { readListSearch } from "./listReturn";

type ProjectsListSearch = ReturnType<typeof readListSearch<"projects">>;

/**
 * The single "Back to Projects" control used everywhere inside a project
 * workspace. It exists as a shared component so the top and bottom placements
 * (and every tab that renders inside the workspace shell) stay identical in
 * wording, target size and return behaviour.
 *
 * Contractor-facing only: hidden from print output so it never lands on a
 * client proposal.
 */
export function BackToProjectsLink({
  placement = "top",
  className,
  listSearch,
}: {
  placement?: "top" | "bottom";
  className?: string;
  /** Pre-read list search, so the return lands on the exact filtered list. */
  listSearch?: ProjectsListSearch;
}) {
  const { t } = useTranslation("crm");
  const search = listSearch ?? readListSearch("projects");

  return (
    <Link
      to="/app/projects"
      search={search}
      aria-label={t("nav.backToProjects")}
      className={workspaceBackLinkClass(placement, className)}
    >
      <ArrowLeft className="size-5 shrink-0" aria-hidden />
      <span>{t("nav.backToProjects")}</span>
    </Link>
  );
}

/**
 * Bottom-of-page placement: a quiet separator plus the same control, so a
 * contractor who has scrolled through Scope/Estimate/Proposal can leave the
 * project without scrolling back up. Back-only by design — no tab stepping.
 */
export function BackToProjectsFooter({
  listSearch,
  className,
}: {
  listSearch?: ProjectsListSearch;
  className?: string;
}) {
  return (
    <WorkspaceBackFooter className={className}>
      <BackToProjectsLink placement="bottom" listSearch={listSearch} />
    </WorkspaceBackFooter>
  );
}


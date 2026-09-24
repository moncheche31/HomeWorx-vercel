import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * Shared post-approval next actions.
 *
 * Every intake mode (walkthrough, photos/video, described) ends here, so the
 * contractor always gets the same two doors after approving: the durable
 * estimate on the project, and the proposal.
 */
export function EstimateCommitActions({ projectId }: { projectId: string }) {
  const { t } = useTranslation("estimating");
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button asChild className="min-h-(--control-min-h) flex-1">
        <Link to="/app/projects/$projectId" params={{ projectId }}>
          {t("commit.viewEstimate", "View estimate")}
        </Link>
      </Button>
      <Button asChild variant="outline" className="min-h-(--control-min-h) flex-1">
        <Link to="/app/proposal/$projectId" params={{ projectId }}>
          {t("commit.viewProposal", "View proposal")}
        </Link>
      </Button>
    </div>
  );
}

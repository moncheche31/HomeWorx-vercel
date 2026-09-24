import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, Eye, Loader2, ScanSearch } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ProjectUnderstanding, VisualUnderstandingResult } from "@/domains/remoteVision";

/**
 * "How VisionWorx understood this" (Item J).
 *
 * Expandable/auditable, never a mandatory questionnaire: it shows each fact,
 * where the evidence came from, whether it was observed, design intent,
 * inferred or assumed, and its authority.
 */

const STATUS_LABEL: Record<VisualUnderstandingResult["status"], string> = {
  ok: "Photos, renderings and keyframes analyzed",
  analyzing: "Analyzing this project's media…",
  no_media: "No media analyzed yet — text and measurements only",
  provider_unavailable: "Visual analysis unavailable on this deployment",
  provider_error: "Visual analysis failed — text and measurements only",
};


const AUTHORITY_LABEL: Record<string, string> = {
  contractor_override: "Your correction",
  confirmed_measurement: "Confirmed measurement",
  contractor_statement: "You said it",
  drawing_dimension: "Drawing dimension",
  visual_observation: "Seen in media",
  catalog_assumption: "Catalog assumption",
};

const STATUS_TONE: Record<string, "default" | "secondary" | "outline"> = {
  confirmed: "default",
  inferred: "secondary",
  assumed: "outline",
  design_intent: "secondary",
};

export interface UnderstandingPanelProps {
  understanding: ProjectUnderstanding;
  visual: VisualUnderstandingResult;
  analyzing: boolean;
  canAnalyzeVisually: boolean;
  imageCount: number;
  /** Facts shown belong to an earlier media set while a new run finishes. */
  stale?: boolean;
  onAnalyze: () => void;
}

export function UnderstandingPanel({
  understanding,
  visual,
  analyzing,
  canAnalyzeVisually,
  imageCount,
  stale = false,
  onAnalyze,
}: UnderstandingPanelProps) {
  const facts = understanding.facts;

  /*
   * This panel is an AUDIT surface, not a questionnaire. It stays folded away
   * unless there is something the contractor can actually act on — an assumed
   * fact, a condition that cannot be confirmed from media, or a measurement
   * worth capturing.
   */
  const actionableCount =
    facts.filter((fact) => fact.provenance.status === "assumed").length +
    understanding.hiddenConditionWarnings.length +
    understanding.measurementTargets.length;
  const actionable = actionableCount > 0;

  return (
    <Collapsible defaultOpen={actionable}>
      <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 flex-1 items-center gap-2 text-left"
            aria-label="How VisionWorx understood this"
          >
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="size-4" aria-hidden />
          How VisionWorx understood this
          {actionable ? (
            <Badge variant="outline">{actionableCount} to review</Badge>
          ) : null}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </CardTitle>
          </button>
        </CollapsibleTrigger>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={!canAnalyzeVisually || analyzing}
          onClick={onAnalyze}
        >
          {analyzing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ScanSearch className="size-4" aria-hidden />
          )}
          {analyzing ? "Analyzing media…" : `Re-analyze ${imageCount || "0"} image(s)`}
        </Button>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {STATUS_LABEL[visual.status]}
          {visual.providerId ? ` · ${visual.providerId}` : ""}
        </p>
        {stale ? (
          <p className="text-sm text-muted-foreground">
            Showing what the previous photos supported until the new analysis finishes. Nothing has
            been discarded.
          </p>
        ) : null}


        {facts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing understood yet. Describe the work, add measurements, or analyze media.
          </p>
        ) : (
          <ul className="space-y-2">
            {facts.map((fact) => (
              <li key={fact.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{fact.label}</span>
                  <Badge variant={STATUS_TONE[fact.provenance.status] ?? "outline"}>
                    {fact.provenance.status.replace("_", " ")}
                  </Badge>
                  <Badge variant="outline">
                    {AUTHORITY_LABEL[fact.provenance.authority] ?? fact.provenance.authority}
                  </Badge>
                  {fact.isScope ? <Badge variant="outline">priced scope</Badge> : null}
                </div>
                <dl className="mt-1 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {fact.actionKey ? (
                    <div>
                      <dt className="inline">Action: </dt>
                      <dd className="inline">{fact.actionKey}</dd>
                    </div>
                  ) : null}
                  {fact.quantity != null ? (
                    <div>
                      <dt className="inline">Quantity: </dt>
                      <dd className="inline">
                        {fact.quantity} {fact.unitKey ?? ""}
                      </dd>
                    </div>
                  ) : null}
                  {fact.featureKey ? (
                    <div>
                      <dt className="inline">Assembly subject: </dt>
                      <dd className="inline">{fact.featureKey}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline">Evidence: </dt>
                    <dd className="inline">
                      {fact.provenance.evidence ?? fact.provenance.sourceType}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}

        {understanding.hiddenConditionWarnings.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">Cannot be confirmed from media</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {understanding.hiddenConditionWarnings.map((warning) => (
                <li key={`${warning.topic}:${warning.message}`}>
                  {warning.message}
                  {warning.priceSignificant ? " (affects price)" : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {understanding.measurementTargets.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium">Measurements worth capturing</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {understanding.measurementTargets.map((target) => (
                <li key={`${target.label}:${target.unitFamily}`}>
                  {target.label} ({target.unitFamily}) — {target.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
      </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

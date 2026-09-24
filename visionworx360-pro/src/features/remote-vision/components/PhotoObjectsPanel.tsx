/**
 * READ-ONLY object overlay (Phase 2).
 *
 * Draws what the vision model located in THIS project's media, and shows which
 * pointing phrases in the narration resolved to which object. Nothing here is
 * editable and nothing here prices anything — it exists so the contractor can
 * see, and mistrust, what the model claims to have found.
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ScanSearch } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { RemoteVisionMedia, VisualObservation } from "@/domains/remoteVision";
import {
  collectTaggedObjects,
  resolveDeicticReferences,
  type DeicticBinding,
} from "@/domains/remoteVision/deixis";

export interface PhotoObjectsPanelProps {
  media: RemoteVisionMedia[];
  observations: VisualObservation[];
  /** Contractor narration used to resolve "that door" style references. */
  narration: string;
}

function bindingLabel(binding: DeicticBinding): string {
  if (binding.status === "bound") return "matched to a tagged object";
  if (binding.status === "ambiguous")
    return `points at ${binding.candidateObjectIds.length} objects — not resolved`;
  return "no tagged object matched";
}

export function PhotoObjectsPanel({ media, observations, narration }: PhotoObjectsPanelProps) {
  const tagged = collectTaggedObjects(observations);
  if (tagged.length === 0) return null;

  const bindings = resolveDeicticReferences(narration, observations).filter(
    (binding) => binding.status !== "unresolved",
  );
  const boundObjectIds = new Set(
    bindings.filter((b) => b.status === "bound").map((b) => b.objectId),
  );

  const imagesWithObjects = media.filter((item) =>
    tagged.some((entry) => entry.region.mediaId === item.id),
  );

  /* Context only, never actionable — folded away until the contractor opens it. */
  return (
    <Collapsible defaultOpen={false}>
      <Card>
      <CardHeader>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex min-h-11 w-full items-center gap-2 text-left">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanSearch className="size-4" aria-hidden />
              What the model located in your photos ({tagged.length})
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
            </CardTitle>
          </button>
        </CollapsibleTrigger>
      </CardHeader>
      <CollapsibleContent>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          These tags are context only. They never add scope or set a price on their own — your
          words and measurements do that.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {imagesWithObjects.map((item) => (
            <figure key={item.id} className="space-y-2">
              <div className="relative overflow-hidden rounded-md border">
                <img
                  src={item.previewUrl ?? ""}
                  alt={`Analyzed project media: ${item.fileName}`}
                  className="block w-full"
                  loading="lazy"
                />
                {tagged
                  .filter((entry) => entry.region.mediaId === item.id)
                  .map(({ region }) => (
                    <div
                      key={region.objectId}
                      className={`pointer-events-none absolute rounded-sm border-2 ${
                        boundObjectIds.has(region.objectId) ? "border-primary" : "border-accent"
                      }`}
                      style={{
                        left: `${region.x * 100}%`,
                        top: `${region.y * 100}%`,
                        width: `${region.width * 100}%`,
                        height: `${region.height * 100}%`,
                      }}
                    >
                      <span className="absolute left-0 top-0 max-w-full truncate bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
                        {region.label}
                      </span>
                    </div>
                  ))}
              </div>
              <figcaption className="text-xs text-muted-foreground">{item.fileName}</figcaption>
            </figure>
          ))}
        </div>

        {bindings.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Phrases matched to what you showed</p>
            <ul className="space-y-1">
              {bindings.map((binding, index) => (
                <li
                  key={`${binding.phrase.index}-${index}`}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <Badge variant={binding.status === "bound" ? "default" : "secondary"}>
                    “{binding.phrase.phrase}”
                  </Badge>
                  <span className="text-muted-foreground">{bindingLabel(binding)}</span>
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

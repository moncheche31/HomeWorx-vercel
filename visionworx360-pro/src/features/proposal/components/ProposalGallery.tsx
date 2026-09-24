import { ProposalImage } from "./ProposalAssetProvider";
import { planProposalGallery, type ProposalGalleryGroup } from "@/domains/proposal";

function Figure({
  projectId,
  media,
  label,
  aspect,
  fit,
}: {
  projectId: string;
  media: ProposalGalleryGroup["media"][number];
  label: string;
  aspect: string;
  fit: "contain" | "cover";
}) {
  return (
    <figure
      className="proposal-surface-alt overflow-hidden"
      style={{ borderRadius: "var(--proposal-radius)" }}
    >
      <ProposalImage
        projectId={projectId}
        storagePath={media.storagePath}
        alt={media.altText ?? media.caption ?? label}
        className={`${aspect} w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
      />
      {media.caption ? (
        <figcaption className="proposal-muted-text px-2 py-1 text-xs">{media.caption}</figcaption>
      ) : null}
    </figure>
  );
}

/**
 * Before/after gallery with an intentional visual hierarchy: the after/design
 * imagery is dominant, before imagery is supporting. Same markup on screen and
 * in print/PDF — there is no print-only variant.
 */
export function ProposalGallery({
  projectId,
  groups,
}: {
  projectId: string;
  groups: ProposalGalleryGroup[];
}) {
  const plan = planProposalGallery(groups);

  return (
    <div className="space-y-6" data-testid="proposal-gallery">
      {plan.primary ? (
        <div className="space-y-2" data-testid="proposal-gallery-primary">
          <h3 className="proposal-heading proposal-accent-text text-sm">{plan.primary.label}</h3>
          <ul
            className={
              plan.primarySingle
                ? "grid grid-cols-1 gap-3"
                : "grid grid-cols-1 gap-3 sm:grid-cols-2"
            }
          >
            {plan.primary.media.map((m) => (
              <li key={m.id} className="min-w-0">
                <Figure
                  projectId={projectId}
                  media={m}
                  label={plan.primary!.label}
                  aspect={plan.primarySingle ? "aspect-[16/10]" : "aspect-[4/3]"}
                  fit="contain"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.supporting.map((group) => (
        <div
          key={group.kind}
          className="space-y-2"
          data-testid={plan.supportingOnly ? "proposal-gallery-primary" : "proposal-gallery-supporting"}
        >
          <h3 className="proposal-heading proposal-muted-text text-xs">{group.label}</h3>
          <ul
            className={
              plan.supportingOnly
                ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                : "grid grid-cols-2 gap-2 sm:grid-cols-3 md:max-w-[60%]"
            }
          >
            {group.media.map((m) => (
              <li key={m.id} className="min-w-0">
                <Figure
                  projectId={projectId}
                  media={m}
                  label={group.label}
                  aspect={plan.supportingOnly ? "aspect-[4/3]" : "aspect-[4/3]"}
                  fit="cover"
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

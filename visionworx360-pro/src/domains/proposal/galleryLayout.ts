/**
 * Pure layout planner for the proposal before/after gallery.
 *
 * The AFTER/design imagery is the focal point of a proposal; BEFORE (and
 * inspiration) imagery is supporting context. This module decides the
 * hierarchy only — it never filters or drops media, so screen and print
 * render exactly the same set of images.
 */
import type { ProposalGalleryGroup } from "./types";

export interface ProposalGalleryPlan {
  /** After/design imagery, rendered dominant. */
  primary: ProposalGalleryGroup | null;
  /** Before + inspiration imagery, rendered as supporting thumbnails. */
  supporting: ProposalGalleryGroup[];
  /** True when a single after image should span the full width. */
  primarySingle: boolean;
  /** True when there is no after imagery at all (before-only proposals). */
  supportingOnly: boolean;
}

export function planProposalGallery(groups: ProposalGalleryGroup[]): ProposalGalleryPlan {
  const primary = groups.find((g) => g.kind === "rendering" && g.media.length > 0) ?? null;
  const supporting = groups.filter((g) => g !== primary && g.media.length > 0);
  return {
    primary,
    supporting,
    primarySingle: primary ? primary.media.length === 1 : false,
    supportingOnly: primary === null,
  };
}

/**
 * Preliminary-estimate disclaimers.
 *
 * Template-driven and versioned on purpose: the wording below is a plain-language
 * placeholder, NOT legal advice. `requiresCounselReview` stays true until the
 * business has had counsel approve production language.
 */

import type { BallparkIntakeSource } from "./intake";

export interface BallparkDisclaimerTemplate {
  key: string;
  version: string;
  titleKey: string;
  bodyKey: string;
  /** Named factors that can move the final price. */
  bulletKeys: string[];
  /** Rendered in the app and carried into any exported preliminary PDF. */
  showInExport: boolean;
  /** Flag for the launch checklist. */
  requiresCounselReview: boolean;
}

export const PRELIMINARY_DISCLAIMER_TEMPLATE: BallparkDisclaimerTemplate = {
  key: "preliminary_estimate",
  version: "v1-draft",
  titleKey: "disclaimer.preliminary.title",
  bodyKey: "disclaimer.preliminary.body",
  bulletKeys: [
    "disclaimer.factor.siteVisit",
    "disclaimer.factor.measurements",
    "disclaimer.factor.contractorReview",
    "disclaimer.factor.selections",
    "disclaimer.factor.permits",
    "disclaimer.factor.structural",
    "disclaimer.factor.concealed",
    "disclaimer.factor.utilities",
    "disclaimer.factor.access",
    "disclaimer.factor.market",
  ],
  showInExport: true,
  requiresCounselReview: true,
};

export const RENDERING_DISCLAIMER_TEMPLATE: BallparkDisclaimerTemplate = {
  key: "rendering_conceptual",
  version: "v1-draft",
  titleKey: "disclaimer.rendering.title",
  bodyKey: "disclaimer.rendering.body",
  bulletKeys: [],
  showInExport: true,
  requiresCounselReview: true,
};

/** Every ballpark carries the preliminary notice; photo packages add the rendering notice. */
export function disclaimersFor(source: BallparkIntakeSource): BallparkDisclaimerTemplate[] {
  return source === "photos"
    ? [PRELIMINARY_DISCLAIMER_TEMPLATE, RENDERING_DISCLAIMER_TEMPLATE]
    : [PRELIMINARY_DISCLAIMER_TEMPLATE];
}

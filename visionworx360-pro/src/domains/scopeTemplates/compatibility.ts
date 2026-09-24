/**
 * TEMPLATE / PROJECT COMPATIBILITY (trade-agnostic).
 *
 * Pure mirror of the database rule `public.template_matches_project`, so the
 * UI can warn BEFORE the round trip and tests can assert the rule without a
 * database. Keep the two in lockstep: an unknown type on either side is not a
 * mismatch (we never block on missing metadata), and equality is compared on
 * trimmed, lower-cased keys.
 *
 * Applying a mismatched template is allowed, but only as a deliberate act:
 * the caller must pass an explicit confirmation, and every created row is
 * stamped `origin_type = 'template'` with the template id so the whole batch
 * stays reversible.
 */

const norm = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim().toLowerCase();
  return t.length > 0 ? t : null;
};

export function templateMatchesProject(
  projectTypeKey: string | null | undefined,
  templateTypeKey: string | null | undefined,
): boolean {
  const p = norm(projectTypeKey);
  const t = norm(templateTypeKey);
  if (p === null || t === null) return true;
  return p === t;
}

export interface TemplateApplyDecision {
  /** True when the write may proceed as-is. */
  allowed: boolean;
  /** True when the contractor must confirm a cross-type application first. */
  requiresConfirmation: boolean;
  projectTypeKey: string | null;
  templateTypeKey: string | null;
}

export function evaluateTemplateApply(args: {
  projectTypeKey: string | null | undefined;
  templateTypeKey: string | null | undefined;
  confirmMismatch?: boolean;
}): TemplateApplyDecision {
  const matches = templateMatchesProject(args.projectTypeKey, args.templateTypeKey);
  const confirmed = args.confirmMismatch === true;
  return {
    allowed: matches || confirmed,
    requiresConfirmation: !matches && !confirmed,
    projectTypeKey: norm(args.projectTypeKey),
    templateTypeKey: norm(args.templateTypeKey),
  };
}

/**
 * Module 014 — proposal assembly.
 *
 * Pure function: (project projection + contractor settings) -> document.
 * It reads nothing, writes nothing, and never runs estimating math.
 */
import {
  ACCEPTANCE_STATEMENT,
  DEFAULT_WARRANTY,
  GALLERY_LABELS,
  LEVEL_TEMPLATES,
  SCHEDULE_PHASES,
  pick,
} from "./content";
import { buildClientScopeSections, buildScopeIntro } from "./clientScope";
import { isInternalLine } from "./sanitize";
import { generateVision } from "./vision";
import { computeAsIllustrated } from "./asIllustrated";
import {
  normalizePricingMode,
  presentPricing,
  resolveDisclosure,
} from "@/domains/estimating/pricingModes";
import { isRealtorTemplate, resolveProposalTemplate, type ProposalTemplateKey } from "./templates";
import {
  PROPOSAL_SECTION_ORDER,
  type ProposalDocument,
  type ProposalGalleryGroup,
  type ProposalInput,
  type ProposalInvestmentOption,
  type ProposalLevelKey,
  type ProposalLocale,
  type ProposalScopeSection,
  type ProposalSectionKey,
  type ProposalUpgradeCard,
} from "./types";

export const defaultProposalSettings = (): ProposalInput["settings"] => ({
  version: 1,
  theme: "modern",
  template: "contractor",
  brandNameOverride: null,
  brandTaglineOverride: null,
  asIllustratedFinishOverride: null,
  asIllustratedAmountOverride: null,
  pricingDisclosure: null,
  visibleLevels: ["economy", "good", "premium"],
  hiddenSections: [],
  warrantyText: null,
  visionText: null,
  proposalNumber: null,
  acceptedAt: null,
  acceptedByName: null,
});

/** Stable, human-readable number derived from the project id and date. */
export function buildProposalNumber(projectId: string, issuedAt: string): string {
  const year = issuedAt.slice(0, 4);
  const suffix = projectId.replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase() || "00001";
  return `P-${year}-${suffix}`;
}

/**
 * Splits the approved narrative into collapsible sections. The narrative text
 * is never rewritten — only grouped for display.
 */
export function splitScopeSections(
  text: string | null,
  locale: ProposalLocale,
  audience: ProposalInput["audience"],
): ProposalScopeSection[] {
  if (!text || !text.trim()) return [];
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  const sections: ProposalScopeSection[] = [];

  for (const block of blocks) {
    const rawLines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (rawLines.length === 0) continue;
    const [head, ...rest] = rawLines;
    const body = rest.length > 0 ? rest : [];
    const lines = (body.length > 0 ? body : [head]).filter(
      (line) => audience === "contractor" || !isInternalLine(line, locale),
    );
    if (lines.length === 0) continue;
    sections.push({
      key: `scope-${sections.length}`,
      title: body.length > 0 ? head : (locale === "es-US" ? "Alcance de trabajo" : "Scope of Work"),
      lines,
    });
  }

  return sections;
}

function buildInvestment(
  input: ProposalInput,
): ProposalInvestmentOption[] {
  const { locale } = input;
  const visible = new Set<ProposalLevelKey>(input.settings.visibleLevels);
  const source = input.pricingSource;
  const base = source?.kind === "detailed_complete"
    ? source.total
    : typeof input.baseTotal === "number" && input.baseTotal > 0
      ? input.baseTotal
      : null;
  const ballparkAmounts: Record<ProposalLevelKey, number> | null = source?.kind === "ballpark"
    ? { economy: source.low, good: source.expected, premium: source.high }
    : null;
  const ballparkLabels: Record<ProposalLevelKey, string> = input.locale === "es-US"
    ? { economy: "Mínimo", good: "Esperado", premium: "Máximo" }
    : { economy: "Low", good: "Expected", premium: "High" };

  return LEVEL_TEMPLATES.filter((tpl) => visible.has(tpl.key)).map((tpl) => ({
    key: tpl.key,
    label: ballparkAmounts ? ballparkLabels[tpl.key] : pick(tpl.label, locale),
    summary: pick(tpl.summary, locale),
    amount: ballparkAmounts
      ? Math.round(ballparkAmounts[tpl.key])
      : source?.kind === "detailed_incomplete"
        ? null
        : base === null ? null : Math.round(base * tpl.multiplier),
    includes: tpl.includes.map((entry) => pick(entry, locale)),
    recommended: tpl.recommended,
  }));
}

function buildGallery(input: ProposalInput): ProposalGalleryGroup[] {
  const media = input.media ?? [];
  return (["before", "rendering", "inspiration"] as const)
    .map((kind) => ({
      kind,
      label: pick(GALLERY_LABELS[kind], input.locale),
      media: media.filter((m) => m.kind === kind),
    }))
    .filter((group) => group.media.length > 0);
}

function buildUpgrades(input: ProposalInput): ProposalUpgradeCard[] {
  const currency = input.currency ?? "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat(input.locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);

  return (input.upgrades ?? []).map((u) => ({
    id: u.id,
    label: u.label,
    description: u.description,
    priceLabel:
      typeof u.priceLow === "number" && typeof u.priceHigh === "number"
        ? `${fmt(u.priceLow)} – ${fmt(u.priceHigh)}`
        : null,
  }));
}

function buildSchedule(input: ProposalInput) {
  const corpus = (input.approvedScopeText ?? "").toLowerCase();
  return SCHEDULE_PHASES.filter(
    (phase) => !phase.patterns || phase.patterns.some((p) => p.test(corpus)),
  ).map((phase) => ({
    key: phase.key,
    label: pick(phase.label, input.locale),
    description: pick(phase.description, input.locale),
  }));
}

export function buildProposal(input: ProposalInput): ProposalDocument {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const settings = input.settings;
  const hidden = new Set<ProposalSectionKey>(settings.hiddenSections.filter((s) => s !== "cover"));

  /**
   * Two presentations over one canonical scope: the contractor preview keeps
   * the concise internal items, the customer document gets polished prose.
   */
  const scopeSections =
    input.audience === "customer"
      ? buildClientScopeSections(input.approvedScopeText, input.locale)
      : splitScopeSections(input.approvedScopeText, input.locale, input.audience);
  const gallery = buildGallery(input);
  const upgrades = buildUpgrades(input);
  const investment = buildInvestment(input);
  const pricingSource = input.pricingSource ??
    (typeof input.baseTotal === "number" && input.baseTotal > 0
      ? { kind: "detailed_complete" as const, total: input.baseTotal }
      : null);
  const canFinalize = pricingSource?.kind !== "detailed_incomplete";

  /**
   * The As Illustrated figure never invents pricing: it anchors a point inside
   * the authoritative ballpark band produced upstream.
   */
  const asIllustratedBand =
    pricingSource?.kind === "ballpark"
      ? {
          low: pricingSource.low,
          expected: pricingSource.expected,
          high: pricingSource.high,
          selected: pricingSource.selected,
        }
      : pricingSource?.kind === "detailed_incomplete"
        ? pricingSource.ballpark
        : null;
  const asIllustrated = computeAsIllustrated({
    band: asIllustratedBand,
    // Buyer / realtor renderings are attractive but value-conscious: default
    // toward builder-grade unless the project data shows upgraded selections.
    presentation: isRealtorTemplate(settings.template ?? "contractor") ? "buyer" : "contractor",
    scopeText: input.approvedScopeText,
    finishLabels: input.finishLabels,
    finishOverride: settings.asIllustratedFinishOverride ?? null,
    amountOverride: settings.asIllustratedAmountOverride ?? null,
  });

  /*
   * Customer-facing pricing detail is the contractor's call. The engine has
   * already calculated the complete job; this only decides how much of the
   * breakout the customer document shows, and never re-prices anything.
   */
  const pricingMode = normalizePricingMode(input.pricingMode);
  const disclosure = resolveDisclosure(pricingMode, settings.pricingDisclosure ?? null);
  const pricingPresentation =
    input.pricingComponents && disclosure !== "total_only"
      ? {
          ...presentPricing(input.pricingComponents, pricingMode, { disclosure }),
          currency: input.currency ?? "USD",
        }
      : null;

  const populated: Record<ProposalSectionKey, boolean> = {
    cover: true,
    vision: true,
    scope: scopeSections.length > 0,
    gallery: gallery.length > 0,
    investment: investment.length > 0,
    upgrades: upgrades.length > 0,
    schedule: true,
    warranty: true,
    acceptance: true,
  };

  const template: ProposalTemplateKey = settings.template ?? "contractor";
  const templateContent = template === "contractor" ? null : resolveProposalTemplate(template, input.locale);

  // Realtor templates present a different narrative surface. Contractor-only
  // sections (schedule / warranty / acceptance / detailed scope prose) are not
  // part of a visualization package, but nothing upstream changes.
  const realtorSections: ProposalSectionKey[] = ["cover", "gallery", "investment"];
  const sections = isRealtorTemplate(template)
    ? realtorSections.filter((key) => populated[key] && !hidden.has(key))
    : PROPOSAL_SECTION_ORDER.filter((key) => populated[key] && !hidden.has(key));

  const branding = {
    ...input.branding,
    companyName: settings.brandNameOverride?.trim() || input.branding.companyName,
    tagline: settings.brandTaglineOverride?.trim() || input.branding.tagline || null,
    // A brand-name override (e.g. the realtor/buyer Design Studio surface) is an
    // intentional non-contractor identity, so the contractor company logo is not
    // carried into it. Otherwise the canonical organization logo is used.
    logoUrl: settings.brandNameOverride?.trim() ? null : input.branding.logoUrl,
  };

  return {
    projectId: input.projectId,
    locale: input.locale,
    audience: input.audience,
    theme: settings.theme,
    proposalNumber:
      settings.proposalNumber ??
      input.proposalNumber ??
      buildProposalNumber(input.projectId, issuedAt),
    issuedAt,
    template,
    templateContent,
    branding,
    customer: input.customer,
    projectName: input.projectName,
    vision:
      settings.visionText ??
      generateVision({
        projectName: input.projectName,
        locale: input.locale,
        approvedScopeText: input.approvedScopeText,
        roomNames: input.roomNames,
        projectTypeLabel: input.projectTypeLabel,
      }),
    scopeSections,
    scopeIntro:
      input.audience === "customer"
        ? buildScopeIntro(input.projectName, input.locale, scopeSections.length > 0)
        : null,
    gallery,
    investment,
    upgrades,
    schedule: buildSchedule(input),
    warranty: settings.warrantyText ?? pick(DEFAULT_WARRANTY, input.locale),
    acceptance: {
      statement: pick(ACCEPTANCE_STATEMENT, input.locale),
      acceptedAt: settings.acceptedAt,
      acceptedByName: settings.acceptedByName,
    },
    sections,
    awaitingApproval: !(input.scopeApproved ?? Boolean(input.approvedScopeText)),
    pricingSource,
    canFinalize,
    asIllustrated,
    pricingPresentation,
  };
}

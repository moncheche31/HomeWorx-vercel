/**
 * Module 014 — theme tokens.
 *
 * Themes are declarative token sets, so a future theme (or a per-organization
 * brand theme) can be added without touching a single component.
 */
import type { ProposalTheme } from "./types";

export interface ProposalThemeTokens {
  key: ProposalTheme;
  /** CSS class applied to the proposal root. Tokens live in src/styles.css. */
  className: string;
  /** Cover treatment. */
  coverLayout: "centered" | "banner" | "split";
  headingCase: "normal" | "upper";
  radius: "sm" | "md" | "lg";
  rule: "solid" | "double" | "none";
}

export const PROPOSAL_THEME_TOKENS: Record<ProposalTheme, ProposalThemeTokens> = {
  classic: {
    key: "classic",
    className: "proposal-theme-classic",
    coverLayout: "centered",
    headingCase: "normal",
    radius: "sm",
    rule: "double",
  },
  modern: {
    key: "modern",
    className: "proposal-theme-modern",
    coverLayout: "banner",
    headingCase: "normal",
    radius: "lg",
    rule: "solid",
  },
  luxury: {
    key: "luxury",
    className: "proposal-theme-luxury",
    coverLayout: "split",
    headingCase: "upper",
    radius: "md",
    rule: "solid",
  },
  minimal: {
    key: "minimal",
    className: "proposal-theme-minimal",
    coverLayout: "centered",
    headingCase: "normal",
    radius: "sm",
    rule: "none",
  },
};

export function themeTokens(theme: ProposalTheme): ProposalThemeTokens {
  return PROPOSAL_THEME_TOKENS[theme] ?? PROPOSAL_THEME_TOKENS.modern;
}

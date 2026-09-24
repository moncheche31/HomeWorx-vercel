import type { TFunction } from "i18next";
import { CATEGORY_OF_TYPE, mapLegacyProjectType } from "../catalog/projectTypes";
import type { ProjectDTO } from "../services/types";

/**
 * Resolve the human-facing project type label for display.
 *
 * Priority:
 *   1. Explicit projectTypeKey → localized label (or projectTypeCustom for "OTHER")
 *   2. Legacy free-text projectType mapped to a known key → localized label
 *   3. Legacy free-text projectType kept verbatim (never erased)
 */
export function resolveProjectTypeLabel(
  project: Pick<
    ProjectDTO,
    "projectTypeKey" | "projectTypeCustom" | "projectType"
  >,
  t: TFunction,
): string | null {
  if (project.projectTypeKey) {
    if (project.projectTypeKey === "OTHER" && project.projectTypeCustom) {
      return project.projectTypeCustom;
    }
    if (project.projectTypeKey in CATEGORY_OF_TYPE) {
      return t(`projectTypes.${project.projectTypeKey}`, {
        ns: "crm",
        defaultValue: project.projectTypeKey,
      });
    }
    return project.projectTypeKey;
  }
  const mapped = mapLegacyProjectType(project.projectType);
  if (mapped) {
    return t(`projectTypes.${mapped.typeKey}`, {
      ns: "crm",
      defaultValue: mapped.typeKey,
    });
  }
  return project.projectType ?? null;
}

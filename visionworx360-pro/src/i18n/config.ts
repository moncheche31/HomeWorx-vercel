import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import commonEn from "./locales/en-US/common.json";
import navigationEn from "./locales/en-US/navigation.json";
import foundationEn from "./locales/en-US/foundation.json";
import designSystemEn from "./locales/en-US/design-system.json";
import errorsEn from "./locales/en-US/errors.json";
import statusEn from "./locales/en-US/status.json";
import voiceEn from "./locales/en-US/voice.json";
import confidenceEn from "./locales/en-US/confidence.json";
import authEn from "./locales/en-US/auth.json";
import workspaceEn from "./locales/en-US/workspace.json";
import crmEn from "./locales/en-US/crm.json";
import pwEn from "./locales/en-US/workspace-pw.json";
import scopeEn from "./locales/en-US/scope.json";
import estimatingEn from "./locales/en-US/estimating.json";
import kbEn from "./locales/en-US/knowledge-base.json";
import walkthroughEn from "./locales/en-US/walkthrough.json";
import narrativeEn from "./locales/en-US/narrative.json";
import remoteVisionEn from "./locales/en-US/remote-vision.json";
import copilotEn from "./locales/en-US/copilot.json";
import proposalEn from "./locales/en-US/proposal.json";
import knowledgeEn from "./locales/en-US/knowledge.json";
import ballparkEn from "./locales/en-US/ballpark.json";
import settingsEn from "./locales/en-US/settings.json";
import legalEn from "./locales/en-US/legal.json";
import billingEn from "./locales/en-US/billing.json";
import supportEn from "./locales/en-US/support.json";

import commonEs from "./locales/es-US/common.json";
import navigationEs from "./locales/es-US/navigation.json";
import foundationEs from "./locales/es-US/foundation.json";
import designSystemEs from "./locales/es-US/design-system.json";
import errorsEs from "./locales/es-US/errors.json";
import statusEs from "./locales/es-US/status.json";
import voiceEs from "./locales/es-US/voice.json";
import confidenceEs from "./locales/es-US/confidence.json";
import authEs from "./locales/es-US/auth.json";
import workspaceEs from "./locales/es-US/workspace.json";
import crmEs from "./locales/es-US/crm.json";
import pwEs from "./locales/es-US/workspace-pw.json";
import scopeEs from "./locales/es-US/scope.json";
import estimatingEs from "./locales/es-US/estimating.json";
import kbEs from "./locales/es-US/knowledge-base.json";
import walkthroughEs from "./locales/es-US/walkthrough.json";
import narrativeEs from "./locales/es-US/narrative.json";
import remoteVisionEs from "./locales/es-US/remote-vision.json";
import copilotEs from "./locales/es-US/copilot.json";
import proposalEs from "./locales/es-US/proposal.json";
import knowledgeEs from "./locales/es-US/knowledge.json";
import ballparkEs from "./locales/es-US/ballpark.json";
import settingsEs from "./locales/es-US/settings.json";
import legalEs from "./locales/es-US/legal.json";
import billingEs from "./locales/es-US/billing.json";
import supportEs from "./locales/es-US/support.json";

export const SUPPORTED_LOCALES = ["en-US", "es-US"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en-US";
export const STORAGE_KEY = "vwx.language";

export const NAMESPACES = [
  "common",
  "navigation",
  "foundation",
  "design-system",
  "errors",
  "status",
  "voice",
  "confidence",
  "auth",
  "workspace",
  "crm",
  "pw",
  "scope",
  "estimating",
  "knowledge-base",
  "walkthrough",
  "narrative",
  "remote-vision",
  "copilot",
  "proposal",
  "knowledge",
  "ballpark",
  "settings",
  "legal",
  "billing",
  "support",
] as const;

export const resources = {
  "en-US": {
    common: commonEn,
    navigation: navigationEn,
    foundation: foundationEn,
    "design-system": designSystemEn,
    errors: errorsEn,
    status: statusEn,
    voice: voiceEn,
    confidence: confidenceEn,
    auth: authEn,
    workspace: workspaceEn,
    crm: crmEn,
    pw: pwEn,
    scope: scopeEn,
    estimating: estimatingEn,
    "knowledge-base": kbEn,
    walkthrough: walkthroughEn,
    narrative: narrativeEn,
    "remote-vision": remoteVisionEn,
    copilot: copilotEn,
    proposal: proposalEn,
    knowledge: knowledgeEn,
    ballpark: ballparkEn,
    settings: settingsEn,
    legal: legalEn,
    billing: billingEn,
    support: supportEn,
  },
  "es-US": {
    common: commonEs,
    navigation: navigationEs,
    foundation: foundationEs,
    "design-system": designSystemEs,
    errors: errorsEs,
    status: statusEs,
    voice: voiceEs,
    confidence: confidenceEs,
    auth: authEs,
    workspace: workspaceEs,
    crm: crmEs,
    pw: pwEs,
    scope: scopeEs,
    estimating: estimatingEs,
    "knowledge-base": kbEs,
    walkthrough: walkthroughEs,
    narrative: narrativeEs,
    "remote-vision": remoteVisionEs,
    copilot: copilotEs,
    proposal: proposalEs,
    knowledge: knowledgeEs,
    ballpark: ballparkEs,
    settings: settingsEs,
    legal: legalEs,
    billing: billingEs,
    support: supportEs,
  },
} as const;

function normalize(lng: string | undefined): SupportedLocale {
  if (!lng) return DEFAULT_LOCALE;
  if (lng.toLowerCase().startsWith("es")) return "es-US";
  return "en-US";
}

let initialized = false;

export function initI18n() {
  if (initialized) return i18n;
  initialized = true;

  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: SUPPORTED_LOCALES as unknown as string[],
      load: "currentOnly",
      ns: NAMESPACES as unknown as string[],
      defaultNS: "common",
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        lookupLocalStorage: STORAGE_KEY,
        caches: ["localStorage"],
      },
      react: { useSuspense: false },
    });

  // Enforce supported locales after detection.
  const current = normalize(i18n.language);
  if (current !== i18n.language) {
    void i18n.changeLanguage(current);
  }

  return i18n;
}

export { i18n };
export default i18n;

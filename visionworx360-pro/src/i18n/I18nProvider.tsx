import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { DEFAULT_LOCALE, STORAGE_KEY, SUPPORTED_LOCALES, initI18n } from "./config";
import type { SupportedLocale } from "./config";
import i18n from "./config";

initI18n();

function updateHtmlLang(lang: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
  }
}

function detectInitialLocale(): SupportedLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as SupportedLocale;
    }
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : DEFAULT_LOCALE;
  if (nav?.toLowerCase().startsWith("es")) return "es-US";
  return "en-US";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const initial = detectInitialLocale();
    if (i18n.language !== initial) {
      void i18n.changeLanguage(initial);
    } else {
      updateHtmlLang(initial);
    }

    const onChange = (lng: string) => {
      updateHtmlLang(lng);
      try {
        localStorage.setItem(STORAGE_KEY, lng);
      } catch {
        /* ignore */
      }
    };
    i18n.on("languageChanged", onChange);
    return () => {
      i18n.off("languageChanged", onChange);
    };
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Language } from "@/types";
import { loadLanguage, saveLanguage } from "./storage";

interface LangCtx {
  lang: Language;
  setLang: (l: Language) => void;
}

const LangContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    setLangState(loadLanguage());
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    saveLanguage(l);
  };

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

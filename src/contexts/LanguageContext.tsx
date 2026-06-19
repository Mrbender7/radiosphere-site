import { createContext, useContext, useState, useCallback, useEffect, startTransition, type ReactNode } from "react";
import translations, { type Language } from "@/i18n/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const SUPPORTED_LANGUAGES: Language[] = ["fr", "en", "es", "de", "ja", "it", "nl", "sv", "pt-BR", "pt", "pl", "zh-TW", "zh", "tr", "ru", "uk", "id", "ms", "th", "ar", "hi"];

const RTL_LANGUAGES: Language[] = ["ar"];

export function detectInitialLanguage(): Language {
  try {
    const stored = localStorage.getItem("radiosphere_language");
    if (stored && SUPPORTED_LANGUAGES.includes(stored as Language)) return stored as Language;
    const nav = navigator.language?.toLowerCase();
    for (const lang of SUPPORTED_LANGUAGES) {
      if (nav?.startsWith(lang.toLowerCase())) return lang;
    }
    return "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Initialize to "en" to match SSG output and avoid React hydration mismatch
  // (#418/#423) which freezes the whole app. Real language is applied right
  // after hydration in the effect below.
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const detected = detectInitialLanguage();
    if (detected !== "en") {
      // startTransition prevents React error #421 ("Suspense boundary
      // received an update before it finished hydrating") on slow WebViews
      // where the post-hydration setState would otherwise race the Suspense
      // boundary still hydrating lazy chunks.
      startTransition(() => setLanguageState(detected));
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try { localStorage.setItem("radiosphere_language", lang); } catch {}
  }, []);

  // Update <html lang> and <dir> dynamically (RTL for Arabic)
  useEffect(() => {
    try {
      document.documentElement.lang = language;
      document.documentElement.dir = RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
    } catch {}
  }, [language]);

  const t = useCallback((key: string): string => {
    return translations[language][key] ?? key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}

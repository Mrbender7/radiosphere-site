import { Helmet } from "react-helmet-async";
import { useSEO } from "@/hooks/useSEO";

const SITE_URL = "https://radiosphere.be";

const HREFLANGS = [
  "fr", "en", "es", "de", "it", "nl", "pt", "pt-BR",
  "pl", "zh", "ja", "tr", "ru", "id", "ms", "th", "ar", "hi",
] as const;

/**
 * Injects canonical + hreflang alternates via react-helmet-async, and
 * keeps <title>/<meta> SEO tags in sync with the active language.
 *
 * Mounted once inside <LanguageProvider> in App.tsx.
 */
export function SEOLinks() {
  useSEO();
  return (
    <Helmet>
      <link rel="canonical" href={`${SITE_URL}/`} />
      {HREFLANGS.map((lang) => (
        <link
          key={lang}
          rel="alternate"
          hrefLang={lang}
          href={`${SITE_URL}/?lang=${lang}`}
        />
      ))}
      <link rel="alternate" hrefLang="x-default" href={`${SITE_URL}/`} />
    </Helmet>
  );
}

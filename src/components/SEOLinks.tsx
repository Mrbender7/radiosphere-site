import { Head } from "vite-react-ssg";
import { useSEO } from "@/hooks/useSEO";

const SITE_URL = "https://radiosphere.be";

const HREFLANGS = [
  "fr", "en", "es", "de", "it", "nl", "pt", "pt-BR",
  "pl", "zh", "ja", "tr", "ru", "id", "ms", "th", "ar", "hi",
] as const;

/**
 * Injects canonical + hreflang alternates via vite-react-ssg's <Head> (so they
 * land in the static HTML), and keeps <title>/<meta> SEO tags in sync with the
 * active language on the client via useSEO().
 *
 * NOTE: we deliberately do NOT use react-helmet-async's <Helmet> here — the
 * SSG boot path in main.tsx does not wrap the tree with <HelmetProvider>, so
 * rendering <Helmet> during pre-render crashes with
 * `Cannot read properties of undefined (reading 'add')`.
 *
 * Mounted once inside <LanguageProvider> in App.tsx.
 */
export function SEOLinks() {
  useSEO();
  return (
    <Head>
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
    </Head>
  );
}

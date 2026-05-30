import { useEffect } from "react";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * Dynamically updates <title> and SEO/OG/Twitter meta tags whenever
 * the active language changes. No external dependency — direct DOM
 * manipulation. Safe in SSR (guards on `document`).
 */
function setMeta(selector: string, attr: string, value: string, createTag?: { tag: "meta"; key: "name" | "property"; keyValue: string }) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el && createTag) {
    el = document.createElement(createTag.tag);
    el.setAttribute(createTag.key, createTag.keyValue);
    el.setAttribute("data-seo-managed", "true");
    document.head.appendChild(el);
  }
  if (el) el.setAttribute(attr, value);
}

export function useSEO() {
  const { t, language } = useTranslation();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const title = t("seo.title");
    const description = t("seo.description");

    document.title = title;

    setMeta('meta[name="description"]', "content", description, { tag: "meta", key: "name", keyValue: "description" });
    setMeta('meta[property="og:title"]', "content", title, { tag: "meta", key: "property", keyValue: "og:title" });
    setMeta('meta[property="og:description"]', "content", description, { tag: "meta", key: "property", keyValue: "og:description" });
    setMeta('meta[name="twitter:title"]', "content", title, { tag: "meta", key: "name", keyValue: "twitter:title" });
    setMeta('meta[name="twitter:description"]', "content", description, { tag: "meta", key: "name", keyValue: "twitter:description" });
  }, [t, language]);
}

# Refonte SEO complète RadioSphere.be

## Constat existant
- `LanguageContext.tsx` met déjà `lang` et `dir` (rtl pour `ar`) sur `<html>` à chaque changement → consigne #1 déjà couverte.
- `react-helmet-async` installé, `HelmetProvider` monté dans `main.tsx`.
- `index.html` contient un JSON-LD à remplacer + OG partiels, mais pas de `<title>` ni `<meta description>` en dur.
- `public/sitemap.xml` et `public/robots.txt` existent → à remplacer.
- `src/i18n/translations.ts` couvre les 18 langues.

## 1. `index.html` — fallback statique pour crawlers sociaux
GitHub Pages = pas de SSR, les bots Facebook/Bluesky/LinkedIn ne lisent pas le JS. On enrichit le `<head>` statique :
- `<title>RadioSphere — Radio gratuite sans pub | TimeBack Machine</title>`
- `<meta name="description" content="…">` (texte FR fourni)
- `<meta name="author" content="Franck Malherbe">`
- `<meta name="application-name" content="RadioSphere">`
- `<meta name="robots" content="index, follow">`
- `<meta property="og:locale" content="fr_FR">`
- `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:url" content="https://radiosphere.be/">`
- `<meta name="twitter:title">`, `<meta name="twitter:description">` (twitter:card/image déjà présents, conservés)
- Remplacement du `<script type="application/ld+json">` par le bloc `WebApplication` (operatingSystem "Web, Android", 18 `inLanguage`, 5 `sameAs`)
- Pas de canonical/hreflang statiques (Helmet les gère pour éviter les doublons).

## 2. Nouveau hook `src/hooks/useSEO.ts`
Sans dépendance supplémentaire. À chaque changement de `language` :
- `document.title = t("seo.title")`
- Met à jour via `querySelector` + fallback création : `meta[name=description]`, `meta[property="og:title"]`, `meta[property="og:description"]`, `meta[name="twitter:title"]`, `meta[name="twitter:description"]`
- Idempotent, marquage `data-seo-managed="true"`.

## 3. Nouveau composant `src/components/SEOLinks.tsx`
Utilise `<Helmet>` uniquement pour les `<link>` (qui ne dédupent pas naturellement) :
- `<link rel="canonical" href="https://radiosphere.be/">`
- 18 `<link rel="alternate" hreflang="…" href="https://radiosphere.be/?lang=…">` + `x-default`

Monté une fois dans `src/App.tsx` à l'intérieur du `LanguageProvider`, à côté de l'appel du hook `useSEO`.

## 4. `src/i18n/translations.ts`
Ajout des clés `seo.title` et `seo.description` dans les 18 langues (versions traduites des textes FR fournis). Pour `ms` et `th` (actuellement à fallback), ajout des 2 clés en propre.

## 5. `public/sitemap.xml` — remplacement intégral
Contenu exact fourni : 1 URL + 18 `xhtml:link` + `x-default`, `<lastmod>2026-05-30</lastmod>`.

## 6. `public/robots.txt` — remplacement intégral
```
User-agent: *
Allow: /
Disallow: /lite.html

Sitemap: https://radiosphere.be/sitemap.xml
```
(Disallow `/lite.html` conservé comme demandé.)

## Fichiers touchés
- ✏️ `index.html`
- ➕ `src/hooks/useSEO.ts`
- ➕ `src/components/SEOLinks.tsx`
- ✏️ `src/App.tsx`
- ✏️ `src/i18n/translations.ts`
- ✏️ `public/sitemap.xml`
- ✏️ `public/robots.txt`

## Hors scope
Routing, lecteur audio, API Radio Browser, Cast, redirect WebView, CSP, OG image existante, mécanique `lang`/`dir` (déjà OK).

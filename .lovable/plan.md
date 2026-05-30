# Diagnostic

L'erreur de build GitHub Pages :

```
TypeError: Cannot read properties of undefined (reading 'add')
```

…ne vient PAS d'un `Set.add()` métier ni d'un accès `window`. Elle vient de **`react-helmet-async`**.

Quand `<Helmet>` est rendu, il appelle `context.helmetInstances.add(this)`. Si aucun `<HelmetProvider>` n'enveloppe l'arbre, `context` est `undefined` → exactement le message d'erreur.

## Pourquoi ça plante maintenant

Dans `src/main.tsx`, `HelmetProvider` n'enveloppe `<RouterProvider>` **que dans la branche CSR fallback** (lignes 70-74). La branche normale SSG (`ViteReactSSG(...)`) ne wrappe **pas** l'app avec `HelmetProvider`.

Tant que `Index.tsx` utilisait seulement `<Head>` de `vite-react-ssg`, ça passait (Head a son propre mécanisme intégré au framework). Mais le nouveau composant `SEOLinks.tsx` introduit `<Helmet>` de `react-helmet-async` monté pendant le SSG → crash à la pré-render de `/`.

Copilot s'est trompé de piste : ce n'est ni un `Set` métier, ni du code non gardé `typeof window`.

## Fix

Remplacer `<Helmet>` par `<Head>` (de `vite-react-ssg`) dans `SEOLinks.tsx`. C'est exactement le même pattern que celui déjà utilisé dans `src/pages/Index.tsx`, donc :

- Pas d'ajout de `HelmetProvider` au chemin SSG (risqué, touche au boot critique).
- Cohérent avec le reste du code.
- Le SSG injecte bien les `<link rel="canonical">` + 18 `<link rel="alternate" hreflang>` dans le HTML statique → SEO préservé.
- `useSEO()` (DOM direct, déjà gardé pour SSR) reste tel quel.

## Fichier à modifier

**`src/components/SEOLinks.tsx`** — remplacer :

```tsx
import { Helmet } from "react-helmet-async";
// ...
return (
  <Helmet>
    <link rel="canonical" ... />
    {HREFLANGS.map(...)}
    <link rel="alternate" hrefLang="x-default" ... />
  </Helmet>
);
```

par :

```tsx
import { Head } from "vite-react-ssg";
// ...
return (
  <Head>
    <link rel="canonical" ... />
    {HREFLANGS.map(...)}
    <link rel="alternate" hrefLang="x-default" ... />
  </Head>
);
```

Rien d'autre à toucher. `useSEO()`, `App.tsx`, `index.html`, `sitemap.xml`, `robots.txt`, traductions : intacts.

## Hors scope

- Pas de modification de `main.tsx` ni du boot SSG/CSR.
- Pas de modification de `Index.tsx`, du routing, du player audio, ni de l'API Radio Browser.
- Les erreurs runtime #418/#423 visibles en preview sont indépendantes (déjà gérées par le mécanisme CSR fallback existant).

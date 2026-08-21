# 🌍 RadioSphere.be

> **The ultimate gateway to global radio waves.**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/Mrbender7/remix-of-radio-sphere)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android-green.svg)]()
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)]()

Discover **Radio Sphere**, the ultimate app to explore radio frequencies from all over the world. From the streets of **Liège** to the neon lights of **Tokyo** or the energy of **New York**, experience radio without borders.

🔗 **Live:** [radiosphere.be](https://radiosphere.be)

---

## ✨ Features

- **🌐 Global Access** — Listen to thousands of international stations via the [Radio Browser](https://www.radio-browser.info/) API, with smart mirror failover.
- **🎨 Modern Interface** — Dark-mode-first design with smooth animations (Framer Motion), responsive layout (mobile, tablet & desktop sidebar).
- **🗣️ Multilingual** — Available in 🇫🇷 French, 🇬🇧 English, 🇪🇸 Spanish, 🇩🇪 German & 🇯🇵 Japanese.
- **🔍 Advanced Search** — Filter by name, country, genre, language & codec with multi-select dropdowns.
- **⭐ Favorites** — Save & organize your go-to stations (persisted in `localStorage`).
- **📻 Weekly Discoveries** — Curated station suggestions refreshed every week.

---

## 💎 Pro Sphere (Premium Features)

- **🚗 Android Auto** — Fully optimized dashboard interface for safe in-car listening.
- **📺 Google Cast (Chromecast)** — Stream audio to smart speakers or TV with one tap.
- **⏳ Sleep Timer** — Auto-stop playback after a set duration.
- **⏪ TimeBack Machine** — Rewind & record live radio with our unique buffering technology.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18 + TypeScript |
| **Build** | Vite |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Animations** | Framer Motion |
| **Routing** | React Router v6 |
| **State** | React Context + TanStack Query |
| **Native bridge** | Capacitor (Android) |
| **Radio API** | Radio Browser (multi-mirror) |
| **Cast** | Google Cast SDK (Default Media Receiver) |

---

## 🔒 Security

- **Content Security Policy (CSP)** — Restricts script/style/frame sources to prevent XSS.
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **External links** — All `target="_blank"` links include `rel="noopener noreferrer"`.
- **No secrets in code** — No private API keys or tokens stored in the codebase.

---

## 🛡️ Modération de contenu (pare-feu de stations)

`src/services/contentFilter.ts` est un pare-feu **côté client** qui écarte
silencieusement les stations liées à l'extrémisme violent / au terrorisme
(politique Google Play). Il est identique à celui de l'application Android.

**Points d'application** (aucun chemin de données ne doit atteindre l'UI sans passer par le filtre) :

- Couche API : `src/services/RadioService.ts` (recherche, top, pays, tag, station par URL) et le fallback GitHub.
- Suggestions locales : `src/components/SuggestedLocalStations.tsx`.
- Garde de lecture : `src/contexts/PlayerContext.tsx` (une station bloquée n'est jamais jouée).
- Stockage local : favoris / récents (`src/hooks/useFavorites.ts`), découvertes hebdomadaires
  (`src/hooks/useWeeklyDiscoveries.ts`), export CSV (`src/pages/SettingsPage.tsx`).

**Ajouter une station** : privilégier **toujours** son UUID Radio Browser exact dans
`stationIds` (zéro faux positif). N'utiliser `names` / `keywords` que pour des libellés
sans ambiguïté, et `nameByCountry` pour les homonymes (ex. « Sam FM », bloqué uniquement en `YE`).

**Faux positifs à ne jamais bloquer** : « SAM FM Hampshire » (GB), « Sam FM » (NL/NG),
« Tamil_Murasam FM » (IN). Ne jamais bannir un pays entier.

**Règles** : filtrage silencieux (pas de toast/badge/log nommant une station, seulement un
compteur `console.debug`), tests dans `src/test/contentFilter.test.ts` (`bunx vitest run`),
audit périodique via `python3 scripts/scan-radiobrowser.py`.

---


## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/Mrbender7/remix-of-radio-sphere.git
cd remix-of-radio-sphere

# Install dependencies
npm install

# Start dev server
npm run dev
```

The app runs at `http://localhost:8080` by default.

### Build for production

```bash
npm run build
# Output in /dist
```

### Android (Capacitor)

See [`android-auto/README-SETUP.md`](android-auto/README-SETUP.md) for the full native integration guide.

---

## 📁 Project Structure

```
src/
├── components/     # UI components (Player, Sidebar, Cards…)
├── contexts/       # React contexts (Player, Favorites, Language…)
├── hooks/          # Custom hooks (useCast, useFavorites…)
├── i18n/           # Translation strings
├── pages/          # Route pages (Home, Search, Library, About…)
├── services/       # RadioService (API + mirror logic)
├── types/          # TypeScript interfaces
└── assets/         # Images & genre artwork
```

---

## 📄 License

This project is licensed under the **MIT License**.

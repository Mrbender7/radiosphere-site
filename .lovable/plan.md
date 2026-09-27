# Optimisation du manifest PWA (PWABuilder / Microsoft Store)

## État actuel (vérifié)
- `public/manifest.json` existe mais n'a ni `display_override`, ni `purpose` explicite, ni `screenshots`.
- Le service worker est bien généré par `vite-plugin-pwa` et enregistré via `virtual:pwa-register` dans `src/main.tsx` — rien à changer côté SW, seulement vérifier.
- Aucune capture d'écran n'existe encore dans `public/`.
- Déploiement : GitHub Pages via Actions sur push vers `main` (les modifications faites ici sont synchronisées automatiquement sur le dépôt GitHub connecté, ce qui déclenche le workflow de déploiement — aucun `git push` manuel n'est nécessaire).

## Modifications

### 1. `public/manifest.json`
- Ajouter `"display_override": ["window-controls-overlay", "standalone"]`.
- Ajouter `"purpose": "any"` sur les icônes standards `192x192` et `512x512` (le variant `maskable` 512 reste tel quel).
- Remplir la section `screenshots` avec deux entrées :
  - `"/screenshot-desktop.png"` — `form_factor: "wide"`, taille réelle de l'image (ex. 1920x1080).
  - `"/screenshot-mobile.png"` — `form_factor: "narrow"`, taille réelle (ex. 720x1280).
- Conserver tous les autres champs existants (name, id, start_url, icônes, etc.).

### 2. Captures d'écran (générées depuis le vrai site)
Prises avec Playwright sur la preview locale `http://localhost:8080`, enregistrées dans `public/` :
- `screenshot-desktop.png` : page d'accueil, viewport desktop large.
- `screenshot-mobile.png` : même page, viewport mobile étroit.

Les deux images seront compressées pour rester nettement sous la limite de pré-cache Workbox (5 Mo).

### 3. Vérifications
- Confirmer via le log de build que le build passe après les changements.
- Vérifier que `/manifest.json` et les deux captures sont bien servis, et que `sw.js` est généré dans le build.

## Publication
Une fois les changements validés, ils sont poussés automatiquement sur le dépôt GitHub, ce qui déclenche le déploiement GitHub Pages existant. Tu pourras ensuite relancer PWABuilder sur https://radiosphere.be pour valider le score et générer le package Microsoft Store.

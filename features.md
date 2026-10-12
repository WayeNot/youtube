# 🎵 Spécifications & Fonctionnalités — YouTube Music Clone

Application web moderne, progressive (PWA) et haute performance de streaming musical, inspirée de YouTube Music et Spotify, conçue pour offrir une lecture audio instantanée, continue en arrière-plan sur mobile, et enrichie d'un mode karaoké interactif.

---

## 📑 Sommaire

1. [Architecture Globale & Stack Technique](#1-architecture-globale--stack-technique)
2. [Moteur de Streaming Audio & Latence Ultra-Basse](#2-moteur-de-streaming-audio--latence-ultra-basse)
3. [Expérience Mobile & Lecture en Arrière-Plan](#3-expérience-mobile--lecture-en-arrière-plan)
4. [Système de Paroles Synchronisées & Mode Karaoké](#4-système-de-paroles-synchronisées--mode-karaoké)
5. [Recherche Avancée & Algorithme de Recommandation](#5-recherche-avancée--algorithme-de-recommandation)
6. [Gestion de Bibliothèque, Playlists & Synchronisation Cloud](#6-gestion-de-bibliothèque-playlists--synchronisation-cloud)
7. [Effets Audio, Égaliseur & Crossfade](#7-effets-audio-égaliseur--crossfade)
8. [Fonctionnalités Sociales, Profils & Partage](#8-fonctionnalités-sociales-profils--partage)
9. [Mode Hors-Ligne & Support PWA](#9-mode-hors-ligne--support-pwa)
10. [Base de Données & Modèle Relationnel (NeonDB)](#10-base-de-données--modèle-relationnel-neondb)

---

## 1. Architecture Globale & Stack Technique

L'application repose sur une séparation claire entre un backend léger et résilient, une base de données cloud serverless, et un frontend Single Page Application (SPA) ultra-rapide sans framework lourd :

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Navigateur Web / Mobile PWA                     │
│  (Vanilla JS modulaire, Service Worker, MediaSession API, HTML5 Audio)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Requêtes HTTP / Cache SW
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Serveur Node.js / Express (Vercel)                    │
│  - /api/search, /api/stream-url/:id, /api/stream/:id                   │
│  - /api/prefetch (Batch), /api/lyrics, /api/user/sync                  │
│  - File d'attente yt-dlp & Gestionnaire de sessions cookies Netscape   │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
    ┌───────────────▼──────────────┐  ┌──────────────▼───────────────────┐
    │  NeonDB PostgreSQL Serverless│  │         YouTube / CDN Google      │
    │  - Cache URLs (TTL 5h)       │  │  - Flux audio Opus/M4A WebM      │
    │  - Playlists, Likes, Écoutes │  │  - Extraction via yt-dlp         │
    │  - Settings & Profils        │  │  - CDN googlevideo.com           │
    └──────────────────────────────┘  └──────────────────────────────────┘
```

- **Backend** : Node.js avec Express, compression Gzip/Brotli, CORS sécurisé.
- **Extraction Audio** : Binaire `yt-dlp` optimisé avec options `--extractor-args "youtube:player_skip=configs"`, multi-clients (`web`, `android_music`, `tv_embedded`).
- **Base de données** : NeonDB (PostgreSQL Serverless) avec requêtes paramétrées SQL natives et connexion SSL.
- **Frontend** : Vanilla JavaScript ES6+ orienté modules (`App`, `Player`, `API`, `Storage`, `LyricsManager`), CSS3 avec variables, animations matérielles 60fps.
- **PWA** : Service Worker (`sw.js`) avec stratégie *Stale-While-Revalidate* pour les assets et *Network-First* avec cache pour l'API.

---

## 2. Moteur de Streaming Audio & Latence Ultra-Basse

### Pipeline d'optimisation (< 200 ms au clic)
1. **Préchargement Prédictif au Survol & Toucher (`Predictive Pre-warming`)** :
   - Sur ordinateur, le survol (`mouseover`) d'une carte musicale déclenche silencieusement la résolution de l'URL du flux sur le serveur 300 à 800 ms avant le clic.
   - Sur mobile, l'événement tactile `touchstart` amorce la requête dès la pose du doigt, devançant l'événement `click` de 150 à 300 ms.
2. **Double Niveau de Cache (In-Memory + NeonDB)** :
   - **Cache mémoire** : Map LRU locale Node.js avec expiration automatique.
   - **Cache persistant PostgreSQL** : Table `stream_cache` conservant les URLs de flux CDN Google valides pendant 5 heures.
   - Un morceau déjà résolu répond en **moins de 200 millisecondes**.
3. **Résolution yt-dlp Accélérée** :
   - Utilisation de `--extractor-args "youtube:player_skip=configs"` et `--no-check-certificates` réduisant le temps d'extraction à froid de 8s à moins de 3s.
   - Contournement des restrictions bot YouTube via un fichier de cookies Netscape injecté dynamiquement.
4. **Préchargement en File d'Attente (`Queue Lookahead`)** :
   - Dès que le morceau courant atteint 80% de sa lecture, les 2 morceaux suivants de la playlist sont automatiquement préchauffés en arrière-plan via `/api/prefetch`.
   - Transition entre pistes consécutives : **0 milliseconde de latence perçue**.

---

## 3. Expérience Mobile & Lecture en Arrière-Plan

L'application est conçue pour fonctionner comme une application native iOS/Android :

- **Élimination du bug "Double Clic / Pause-Play" sur Mobile** :
  - Un signal audio inaudible (`SILENT_WAV`) est déclenché sur la toute première interaction utilisateur (`pointerdown`/`touchstart`), déverrouillant de manière permanente le contexte audio du navigateur mobile (politique d'autoplay iOS Safari / Android Chrome).
  - Tout lancement ultérieur démarre immédiatement au premier clic sans nécessiter de pause/re-play.
- **Maintien de la Lecture en Arrière-Plan (Waze / Écran Verrouillé)** :
  - Utilisation exclusive d'une balise native HTML5 `<audio>` attachée au DOM avec attribut `playsinline`.
  - Pas d'interférence avec les contextes Web Audio (`AudioContext`) sur mobile pour éviter la mise en veille automatique par l'OS lors du passage sur une autre application (Waze, Maps, écran éteint).
- **Intégration Complète MediaSession API** :
  - Affichage de la pochette haute résolution, du titre, de l'artiste et de l'album sur le centre de contrôle iOS et les notifications multimédia Android.
  - Contrôles fonctionnels depuis l'écran de verrouillage, les casques Bluetooth et les commandes au volant : Lecture, Pause, Morceau suivant, Morceau précédent, Avance/Recul rapide.

---

## 4. Système de Paroles Synchronisées & Mode Karaoké

- **Extraction Automatique des Paroles** :
  - Endpoint `/api/lyrics` interrogeant les fournisseurs de paroles synchronisées (LRC) et texte brut avec normalisation des titres (suppression des mentions "Official Video", "Clip Officiel", "Remastered", etc.).
- **Style Visuel Moderne (Type Apple Music / Spotify)** :
  - **Soulignement lumineux animé** : La phrase en cours d'écoute affiche un soulignement néon dégradé animé en continu (`@keyframes lyricsGlowFlow`).
  - **Barre d'accentuation néon** : Bordure latérale lumineuse avec ombre projetée douce sur la phrase active.
  - **Profondeur de champ (Depth of Field)** : Les phrases inactives ont une légère transparence et un flou subtil (`filter: blur(0.5px)`), tandis que la phrase active ressort nette, agrandie (`scale(1.06)`), et lumineuse.
- **Karaoké Mot par Mot** :
  - Coloration progressive des mots au fur et à mesure de l'avancement de la voix avec effet de brillance textuelle.
- **Défilement Automatique Intelligent** :
  - Centrage doux (`scrollIntoView({ behavior: 'smooth', block: 'center' })`) sur la ligne chantée.
  - Détection du défilement manuel de l'utilisateur : mise en pause du centrage automatique pendant 4 secondes pour permettre la lecture libre, puis réactivation automatique.
- **Navigation Interactive** :
  - Clic sur n'importe quelle ligne des paroles pour sauter instantanément au passage correspondant dans le morceau.

---

## 5. Recherche Avancée & Algorithme de Recommandation

- **Autocomplétion & Suggestions en Temps Réel** :
  - Suggestions automatiques dès la saisie dans la barre de recherche.
  - Historique des recherches récentes stocké localement et accessible en un clic.
- **Filtrage Multidimensionnel** :
  - Filtres par catégorie : `Tous`, `Titres`, `Artistes`, `Albums`.
  - Fiche détaillée de l'artiste avec biographie Wikipédia (FR uniquement), top titres et albums associés.
- **Sections Dynamiques d'Accueil** :
  - **🔥 Hits du Moment & Tendances** : Morceaux les plus populaires du moment.
  - **🎲 Titres Aléatoires & Découvertes** : Bouton de régénération instantanée pour découvrir de nouveaux morceaux.
  - **🎤 Rap & Urbain** : Sélection dédiée aux sorties rap francophones et internationales.
  - **☕ Détente & Chill** : Morceaux calmes et d'ambiance.
  - **Dernières écoutes** : Carrousel reprenant l'historique récent de l'utilisateur.

---

## 6. Gestion de Bibliothèque, Playlists & Synchronisation Cloud

- **Playlists Personnalisées** :
  - Création, renommage et suppression de playlists.
  - Réorganisation des pistes et ajout en un clic depuis n'importe quelle carte ou menu contextuel.
  - Couverture personnalisée : upload d'image compressée ou génération automatique à partir de la première piste.
- **Statut Public / Privé & Partage** :
  - Bascule en un clic entre playlist privée et publique.
  - Lien de partage direct permettant à d'autres utilisateurs d'écouter la playlist.
- **Importation Externe Universelle** :
  - Module d'importation de playlists depuis YouTube, Spotify ou texte brut.
  - Analyse des titres et correspondance automatique avec le catalogue.
- **Synchronisation Cloud NeonDB** :
  - Synchronisation automatique en arrière-plan des playlists, favoris, historique et réglages lors de la connexion utilisateur.
  - Résolution des conflits et conservation locale en cas de navigation hors-ligne.

---

## 7. Effets Audio, Égaliseur & Crossfade

- **Égaliseur Paramétrique Multi-Bandes** :
  - Presets intégrés : Pop, Rock, Bass Boost, Électro, Vocal, Acoustique.
  - Réglage manuel fin des fréquences (basses, médiums, aigus) sur environnement Desktop.
- **Fondu Enchaîné (Crossfade Automatique)** :
  - Fondu sonore progressif configurable (1 à 6 secondes) entre la fin d'une piste et le début de la suivante pour une transition fluide sans silence.
- **Normalisation Audio** :
  - Égalisation du volume pour éviter les écarts sonores entre différents enregistrements.

---

## 8. Fonctionnalités Sociales, Profils & Partage

- **Profils Utilisateurs** :
  - Pages de profil avec avatar, pseudonyme, nombre d'écoutes et playlists publiques.
  - Système de suivi d'artistes favoris.
- **Partage Social & Stories** :
  - Génération d'une story visuelle dynamique prête à être partagée avec la pochette de l'album, le titre et l'extrait sonore.
  - Partage natif via l'API Web Share (`navigator.share`) ou copie rapide du lien direct.

---

## 9. Mode Hors-Ligne & Support PWA

- **Installation sur Écran d'Accueil** :
  - Manifeste PWA complet avec icônes adaptatives, écran de démarrage (splash screen) et thème sombre natif `#0f0f0f`.
- **Téléchargement & Cache Local (IndexedDB)** :
  - Possibilité de télécharger des morceaux dans le stockage local de l'appareil.
  - Onglet dédié "Musiques téléchargées" permettant la lecture complète sans connexion Internet.
- **Service Worker Résilient** :
  - Cache automatique des feuilles de style, scripts, icônes et polices pour un chargement instantané de l'interface en tout temps.

---

## 10. Base de Données & Modèle Relationnel (NeonDB)

Le schéma PostgreSQL repose sur des tables normalisées optimisées pour les requêtes asynchrones rapides :

| Table | Rôle |
|---|---|
| `users` | Comptes utilisateurs, mots de passe hashés, avatars, rôles. |
| `user_settings` | Préférences individuelles (égaliseur, crossfade, thème, volume). |
| `playlists` | Métadonnées des playlists (nom, visibilité, cover, propriétaire). |
| `playlist_tracks` | Pistes rattachées aux playlists avec ordre de lecture. |
| `liked_tracks` | Titres ajoutés aux favoris par chaque utilisateur. |
| `listen_history` | Historique chronologique des écoutes pour les recommandations. |
| `stream_cache` | Cache persistant des URLs de flux CDN Google (videoId, streamUrl, expiresAt). |
| `artist_subscriptions` | Abonnements des utilisateurs aux artistes. |

---

*Documentation mise à jour — Version 3.4*
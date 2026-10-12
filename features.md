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
11. [🚀 Roadmap & Fonctionnalités Futures à Développer](#11--roadmap--fonctionnalités-futures-à-développer)

---

## 1. Architecture Globale & Stack Technique

L'application repose sur une séparation claire entre un backend léger et résilient, une base de données cloud serverless, et un frontend Single Page Application (SPA) ultra-rapide sans framework lourd :

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Navigateur Web / Mobile PWA                     │
│  (Vanilla JS modulaire, Service Worker, MediaSession API, HTML5 Audio) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Requêtes HTTP / Cache SW
┌───────────────────────────────────▼────────────────────────────────────┐
│                  Serveur Node.js / Express (Vercel)                    │
│  - /api/search, /api/stream-url/:id, /api/stream/:id                   │
│  - /api/prefetch (Batch), /api/lyrics, /api/user/sync                  │
│  - Extraction yt-dlp Android/TV & Cache LRU Haute Disponibilité       │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
    ┌───────────────▼──────────────┐  ┌──────────────▼───────────────────┐
    │  NeonDB PostgreSQL Serverless│  │         YouTube / CDN Google      │
    │  - Cache URLs (TTL 5h)       │  │  - Flux audio Opus/M4A WebM      │
    │  - Playlists, Likes, Écoutes │  │  - Extraction via yt-dlp         │
    │  - Settings & Profils        │  │  - CDN googlevideo.com           │
    └──────────────────────────────┘  └──────────────────────────────────┘
```

- **Backend** : Node.js avec Express, compression Gzip/Brotli sélective (les flux audio bypassent la compression pour éviter tout buffering de chunks), CORS sécurisé.
- **Extraction Audio** : Binaire `yt-dlp` optimisé avec options `--extractor-args "youtube:player_skip=configs;player_client=android"`, sautant le chargement des configs web lourdes et contournant nativement les blocages bot sur les IP de datacenters.
- **Base de données** : NeonDB (PostgreSQL Serverless) avec requêtes SQL paramétrées natives et pool SSL.
- **Frontend** : Vanilla JavaScript ES6+ orienté modules (`App`, `Player`, `API`, `Storage`, `LyricsManager`), CSS3 avec variables CSS modernes et animations GPU 60fps.
- **PWA** : Service Worker (`sw.js`) avec stratégie *Stale-While-Revalidate* pour les assets et *Network-First* pour les données dynamiques.

---

## 2. Moteur de Streaming Audio & Latence Ultra-Basse

### Pipeline d'optimisation (< 200 ms au clic)
1. **Préchargement Prédictif au Survol & Toucher (`Predictive Pre-warming`)** :
   - Sur desktop, le survol (`mouseover`, `pointerdown`) d'une carte musicale déclenche silencieusement la résolution du flux sur le serveur **300 à 800 ms avant le clic**.
   - Sur mobile, l'événement tactile `touchstart`/`pointerdown` amorce la requête dès la pose du doigt, devançant l'événement `click` de **150 à 300 ms**.
2. **Double Niveau de Cache (In-Memory + NeonDB)** :
   - **Cache mémoire** : Map LRU locale Node.js avec expiration automatique.
   - **Cache persistant PostgreSQL** : Table `stream_cache` conservant les URLs de flux CDN Google valides pendant 5 heures.
   - Un morceau déjà résolu ou préchauffé démarre en **moins de 200 millisecondes**.
3. **Résolution yt-dlp Priorité Android Client** :
   - Utilisation du client `android` en première tentative sans cookies de session web, évitant le piège des vérifications antibot "Sign in to confirm you're not a bot" sur les datacenters Vercel.
   - Arguments `--extractor-args "youtube:player_skip=configs;player_client=android"` et `--no-check-certificates` réduisant l'extraction à froid de 15s à moins de 2,5s.
4. **Streaming Direct sans Buffering (`X-Accel-Buffering: no` & `res.flushHeaders()`)** :
   - Dès la première poignée de main avec le CDN Google, les en-têtes HTTP 206 / 200 sont immédiatement envoyés à la balise `<audio>` du navigateur avec `res.flushHeaders()`.
   - Les premiers octets de musique arrivent instantanément dans le buffer du navigateur.
5. **Préchargement en File d'Attente (`Queue Lookahead`)** :
   - Dès que le morceau courant atteint la moitié de sa durée, les morceaux suivants de la playlist sont automatiquement préchauffés en arrière-plan via `/api/prefetch`.
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
  - Presets intégrés : Pop, Rock, Bass Boost, Mega Bass, Électro, Vocal, Acoustique Salon, Club 3D.
  - Réglage manuel fin des fréquences (basses, médiums, aigus) sur environnement Desktop.
- **Fondu Enchaîné (Crossfade Automatique)** :
  - Fondu sonore progressif configurable (1 à 6 secondes) entre la fin d'une piste et le début de la suivante pour une transition fluide sans silence.
- **Normalisation Audio & Réverbération Spatiale** :
  - Égalisation du volume pour éviter les écarts sonores entre différents enregistrements.
  - Moteur convolver pour simuler une acoustique de salle ou de club.

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

## 11. 🚀 Roadmap & Fonctionnalités Futures à Développer

Voici une sélection complète et détaillée de fonctionnalités à forte valeur ajoutée à intégrer dans les prochaines évolutions de l'application :

### 🎛️ A. Expérience Audio & Moteur Musical
1. **Mode DJ & Beatmatching Automatique** :
   - Analyse du BPM (tempo) et de la tonalité harmonique (Camelot Wheel).
   - Transitions fluides synchronisées sur les temps musicaux (synchro 4 ou 8 temps) entre deux morceaux de tempo compatible.
2. **Suppression Vocale en Temps Réel (AI Vocal Remover / Mode Karaoké Pur)** :
   - Algorithme WebAssembly (Spleeter / Demucs allégé ou API temps réel) pour atténuer ou couper la piste vocale et ne laisser que l'instrumentale, transformant n'importe quel son en karaoké.
3. **Audio Spatialisé 3D & Head Tracking** :
   - Simulation d'audio binaural 360° avec Web Audio PannerNode, offrant une immersion immersive au casque.
4. **Visualiseur Audio 3D Réactif (WebGL / Three.js)** :
   - Écran de veille ou mode plein écran avec sphère de particules, néons ou ondes spectrales ondulant au rythme des fréquences de la musique.

---

### 🤖 B. Intelligence Artificielle & Découverte
5. **Générateur de Playlist par Prompt IA ("Smart DJ Prompt")** :
   - Champ de saisie : *"Fais-moi une playlist chill rap français des années 2010 pour rouler la nuit sous la pluie"*.
   - L'IA génère instantanément une playlist de 20 titres cohérents avec cover thématique générée.
6. **Mode "Flow Infini" / Autoplay Intelligent** :
   - Lorsque la file d'attente se termine, le lecteur enchaîne automatiquement avec des morceaux similaires (analyse des artistes, genres et signatures acoustiques) sans jamais couper la musique.
7. **Reconnaissance Musicale Intégrée (Clone Shazam)** :
   - Bouton avec icône micro permettant à l'utilisateur de fredonner ou de capter un son ambiant pour l'identifier en 3 secondes et l'ajouter immédiatement à sa bibliothèque.

---

### 👥 C. Fonctionnalités Sociales & Temps Réel
8. **Sessions d'Écoute Partagée ("Jam Session" / Listening Party)** :
   - Synchronisation multi-utilisateurs via WebSockets / WebRTC : un utilisateur crée un salon, partage un code ou un lien, et tous les participants écoutent la musique exactement à la même milliseconde.
   - File d'attente collaborative : chaque invité peut ajouter ou voter pour les morceaux suivants.
   - Mini chat en direct avec réactions émojis éphémères synchronisées sur les refrains.
9. **Commentaires Temporels sur les Morceaux (façon SoundCloud)** :
   - Possibilité de laisser un commentaire rattaché à une seconde précise du morceau (ex: *"Ce drop à 1:42 est incroyable 🔥"*).
10. **Statistiques Annuelles & Mensuelles ("Mon YTM Wrapped")** :
    - Page de rétrospective avec infographies animées : temps total d'écoute, top 5 artistes, top genres, titres les plus écoutés, badge de fan (ex: *"Top 1% des auditeurs de Daft Punk"*).
    - Export en 1 clic sous format Story Instagram / TikTok / X.

---

### 📱 D. Intégration Écosystème & Mobilité
11. **Support Chromecast & AirPlay (Google Cast / Apple AirPlay)** :
    - Bouton "Diffuser" dans le lecteur pour streamer l'audio directement sur une enceinte connectée (Sonos, Google Home, Apple TV, ampli Wi-Fi).
12. **Discord Rich Presence & Last.fm Scrobbling** :
    - Affichage en temps réel du morceau en cours d'écoute sur le profil Discord de l'utilisateur avec bouton "Écouter avec".
    - Envoi automatique des écoutes vers Last.fm pour les audiophiles.
13. **Minilecteur Flottant (Picture-in-Picture Audio)** :
    - Widget flottant permettant de contrôler la musique tout en naviguant sur d'autres onglets ou sur son bureau.
14. **Mode Sommeil / Minuteur d'Arrêt (Sleep Timer)** :
    - Réglage d'un compte à rebours (15 min, 30 min, fin du morceau) pour couper la musique en douceur avec baisse progressive du volume avant de s'endormir.

---

### 📁 E. Organisation & Gestion Avancée
15. **Dossiers de Playlists & Système de Tags** :
    - Possibilité de classer ses playlists dans des dossiers hiérarchiques (ex: *Entraînement*, *Soirée*, *Travail*).
    - Tags colorés et filtres rapides par humeur (*Énergie*, *Concentration*, *Nostalgie*).
16. **Détection des Doublons dans les Playlists** :
    - Alerte intelligente lors de l'ajout d'un morceau déjà présent dans la playlist avec option pour ignorer ou ajouter quand même.
17. **Historique des Versions & Restauration de Playlists** :
    - Corbeille et historique des modifications permettant d'annuler une suppression accidentelle de titre ou de playlist.

---

*Documentation mise à jour — Version 3.4*

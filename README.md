# 🎵 YouTube Music Maison

Une application web complète, moderne et responsive inspirée de **YouTube Music**, conçue pour fonctionner sur **ordinateur, tablette et mobile**, avec lecture audio en arrière-plan, paroles synchronisées style karaoké, playlists et mode vidéo.

---

## 🌟 Fonctionnalités Principales

### 1. 🎧 Accès à toutes les musiques du monde
- Recherche instantanée parmi les millions de titres, artistes, albums et concerts de YouTube.
- Suggestions de recherche en temps réel lors de la frappe.
- Onglet **Accueil** avec tendances actuelles (Rap FR, Pop, Électro, Lofi, Rock...).
- Onglet **Explorer** avec univers musicaux colorés (Rap, Pop, Afro, Jazz, Classique, 80s/90s...).

### 2. 📱 Lecture en Arrière-Plan & Écran Verrouillé
- Utilisation d'un flux audio HTML5 standard (`<audio>`) avec support des requêtes HTTP Range (206 Partial Content).
- Intégration complète de la **MediaSession API** :
  - Métadonnées (Titre, Artiste, Album, Pochette haute définition 512x512).
  - Contrôles natifs sur l'écran de verrouillage du smartphone, le centre de contrôle et les touches multimédia du clavier (Play, Pause, Suivant, Précédent, Saut temporel).
  - La musique continue de jouer même si vous changez d'application, verrouillez votre téléphone ou passez dans un autre onglet.

### 3. 🎤 Paroles Synchronisées (Karaoké)
- Défilement automatique synchronisé avec la musique en temps réel via l'API lrclib.
- Mise en valeur lumineuse de la ligne active.
- Cliquez sur n'importe quelle ligne de parole pour sauter instantanément à ce moment de la chanson !

### 4. 🎚️ Mode Vidéo / Clip Officiel
- Basculez en un clic entre le mode **Audio pur** et le **Mode Vidéo** pour regarder le clip officiel YouTube synchronisé.

### 5. 📻 Radio Infinie (Autoplay Recommandations)
- Lorsque votre file d'attente se termine, l'application charge automatiquement des musiques similaires et recommandées pour que la musique ne s'arrête jamais.

### 6. 🎛️ Égaliseur Audio & Minuterie de Veille
- **Égaliseur 5 bandes** (60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz) avec pré-réglages : Bass Boost, Voix claire, Électro, Rock, Aigus ++.
- **Minuterie de veille** (15 min, 30 min, 45 min, 1h, ou fin du titre en cours) idéale pour s'endormir en musique.

### 7. 💾 Bibliothèque & Playlists Personnalisées
- **Titres Favoris** : Enregistrez vos sons préférés d'un clic sur le cœur ❤️.
- **Playlists** : Créez vos propres playlists, ajoutez-y des titres, réorganisez-les.
- **Historique** : Retrouvez facilement les derniers morceaux écoutés.
- **Sauvegarde / Restauration** : Exportez et importez vos données en JSON.
- **Téléchargement Hors-Ligne** : Téléchargez n'importe quel morceau en fichier audio direct (`.m4a`).

### 8. 📲 Responsive & PWA (Installable comme une application native)
- Compatible smartphones, tablettes et ordinateurs.
- Design sombre YouTube Music épuré avec lueur d'ambiance dynamique.
- Compatible **PWA** : Ouvrez l'URL sur votre smartphone (Safari sur iOS ou Chrome sur Android) et appuyez sur **"Ajouter à l'écran d'accueil"** pour l'utiliser en plein écran comme une vraie application native.

---

## 🚀 Démarrage Rapide

Dans le répertoire du projet :

```bash
# Démarrer le serveur
npm start
```

Puis ouvrez votre navigateur sur :
```
http://localhost:3000
```

> **Astuce mobile :** Pour y accéder depuis votre smartphone connecté au même réseau Wi-Fi, utilisez l'adresse IP locale de votre machine (ex: `http://192.168.1.XX:3000`).

---

## ⌨️ Raccourcis Clavier

| Touche | Action |
|---|---|
| <kbd>Espace</kbd> | Lecture / Pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Reculer / Avancer de 5 secondes |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Augmenter / Diminuer le volume |
| <kbd>M</kbd> | Couper le son (Mute) |
| <kbd>L</kbd> | Ouvrir / Fermer les Paroles |
| <kbd>Q</kbd> | Ouvrir / Fermer la File d'attente |
| <kbd>F</kbd> | Plein écran |

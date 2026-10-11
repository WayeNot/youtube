// Storage Manager for Favorites, Playlists, History, User Settings and Cloud Sync
const Storage = {
  KEYS: {
    FAVORITES: 'ytm_favorites',
    PLAYLISTS: 'ytm_playlists',
    HISTORY: 'ytm_history',
    RECENT_SEARCHES: 'ytm_recent_searches',
    SETTINGS: 'ytm_settings',
    AUTH_TOKEN: 'ytm_auth_token',
    AUTH_USER: 'ytm_auth_user',
    IS_GUEST: 'ytm_is_guest'
  },

  syncTimer: null,

  // Auth & Session
  getToken() {
    return localStorage.getItem(this.KEYS.AUTH_TOKEN);
  },

  getUser() {
    try {
      const u = JSON.parse(localStorage.getItem(this.KEYS.AUTH_USER));
      if (u && u.username) return u;
      const token = this.getToken();
      if (token) {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload && payload.username) {
            const fallback = { id: payload.id, username: payload.username };
            localStorage.setItem(this.KEYS.AUTH_USER, JSON.stringify(fallback));
            return fallback;
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  isLoggedIn() {
    return !!this.getToken() && !this.isGuest();
  },

  isGuest() {
    return localStorage.getItem(this.KEYS.IS_GUEST) === 'true';
  },

  setSession(token, user) {
    if (token) localStorage.setItem(this.KEYS.AUTH_TOKEN, token);
    if (user) localStorage.setItem(this.KEYS.AUTH_USER, JSON.stringify(user));
    localStorage.removeItem(this.KEYS.IS_GUEST);
    window.dispatchEvent(new CustomEvent('auth_changed', { detail: { user, isLoggedIn: true } }));
  },

  setGuestMode() {
    localStorage.removeItem(this.KEYS.AUTH_TOKEN);
    localStorage.removeItem(this.KEYS.AUTH_USER);
    localStorage.setItem(this.KEYS.IS_GUEST, 'true');
    window.dispatchEvent(new CustomEvent('auth_changed', { detail: { user: null, isLoggedIn: false, isGuest: true } }));
  },

  logout() {
    localStorage.removeItem(this.KEYS.AUTH_TOKEN);
    localStorage.removeItem(this.KEYS.AUTH_USER);
    localStorage.removeItem(this.KEYS.IS_GUEST);
    window.dispatchEvent(new CustomEvent('auth_changed', { detail: { user: null, isLoggedIn: false } }));
  },

  // Auto-sync with cloud if user logged in
  scheduleCloudSync() {
    if (!this.isLoggedIn()) return; // Guests do not persist to cloud
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.pushToCloud();
    }, 1200);
  },

  async pushToCloud() {
    const token = this.getToken();
    if (!token) return;
    if (this._isSyncing) {
      this.scheduleCloudSync();
      return;
    }

    // Check online status
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      localStorage.setItem('ytm_pending_sync', 'true');
      console.log('📡 Hors-ligne : synchronisation enregistrée en attente du réseau');
      return;
    }

    this._isSyncing = true;
    try {
      const res = await fetch('/api/user/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          favorites: this.getFavorites(),
          playlists: this.getPlaylists(),
          history: this.getHistory(),
          recent_searches: this.getRecentSearches(),
          settings: this.getSettings()
        })
      });
      if (res.ok) {
        localStorage.removeItem('ytm_pending_sync');
      } else {
        localStorage.setItem('ytm_pending_sync', 'true');
      }
    } catch (e) {
      console.warn('Cloud sync error (réseau indisponible, persistance locale conservée):', e.message);
      localStorage.setItem('ytm_pending_sync', 'true');
    } finally {
      this._isSyncing = false;
    }
  },

  async pullFromCloud() {
    const token = this.getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.user) {
          localStorage.setItem(this.KEYS.AUTH_USER, JSON.stringify(json.user));
          window.dispatchEvent(new CustomEvent('auth_changed', { detail: { user: json.user, isLoggedIn: true } }));
        }
        if (json.data) {
          if (json.data.favorites) localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify(json.data.favorites));
          if (json.data.playlists) localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(json.data.playlists));
          if (json.data.history) localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(json.data.history));
          if (json.data.recent_searches) localStorage.setItem(this.KEYS.RECENT_SEARCHES, JSON.stringify(json.data.recent_searches));
          if (json.data.settings) localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(json.data.settings));
          window.dispatchEvent(new CustomEvent('favorites_changed', { detail: { list: json.data.favorites } }));
          window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists: json.data.playlists } }));
          window.dispatchEvent(new CustomEvent('history_changed', { detail: { history: json.data.history } }));
          window.dispatchEvent(new CustomEvent('recent_searches_changed', { detail: { list: json.data.recent_searches } }));
        }
      } else if (res.status === 401) {
        this.logout();
      }
    } catch (e) {
      console.warn('Cloud pull error:', e);
    }
  },

  getRecentSearches() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.RECENT_SEARCHES)) || [];
    } catch (e) {
      return [];
    }
  },

  addRecentSearch(item) {
    if (!item) return;
    let list = this.getRecentSearches();
    // If string or track object
    const itemId = typeof item === 'string' ? item : item.id;
    list = list.filter(x => (typeof x === 'string' ? x : x.id) !== itemId);
    list.unshift(item);
    if (list.length > 10) list = list.slice(0, 10);
    localStorage.setItem(this.KEYS.RECENT_SEARCHES, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('recent_searches_changed', { detail: { list } }));
  },

  removeRecentSearch(itemOrQuery) {
    let list = this.getRecentSearches();
    const id = typeof itemOrQuery === 'string' ? itemOrQuery : itemOrQuery?.id;
    list = list.filter(x => (typeof x === 'string' ? x : x.id) !== id);
    localStorage.setItem(this.KEYS.RECENT_SEARCHES, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('recent_searches_changed', { detail: { list } }));
    this.scheduleCloudSync();
  },

  clearRecentSearches() {
    localStorage.removeItem(this.KEYS.RECENT_SEARCHES);
    window.dispatchEvent(new CustomEvent('recent_searches_changed', { detail: { list: [] } }));
    this.scheduleCloudSync();
  },

  getFavorites() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.FAVORITES)) || [];
    } catch (e) {
      return [];
    }
  },

  isFavorite(id) {
    const list = this.getFavorites();
    return list.some(item => item.id === id);
  },

  toggleFavorite(track) {
    if (!track || !track.id) return false;
    let list = this.getFavorites();
    const idx = list.findIndex(item => item.id === track.id);
    let isNowFav = false;
    if (idx >= 0) {
      list.splice(idx, 1);
      isNowFav = false;
    } else {
      list.unshift({
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        duration: track.duration,
        durationSec: track.durationSec,
        addedAt: Date.now()
      });
      isNowFav = true;
    }
    localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('favorites_changed', { detail: { list, track, isNowFav } }));

    // Send direct atomic like update to NeonDB if user is logged in
    const token = this.getToken();
    if (token && this.isLoggedIn()) {
      fetch('/api/user/like', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ track })
      }).catch(() => {});
    } else {
      this.scheduleCloudSync();
    }

    return isNowFav;
  },

  // Playlists
  getPlaylists() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.PLAYLISTS)) || [];
    } catch (e) {
      return [];
    }
  },

  createPlaylist(name, isPublic = true) {
    const playlists = this.getPlaylists();
    const newPl = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name.trim() || 'Ma Playlist',
      isPublic: isPublic !== false,
      createdAt: Date.now(),
      tracks: []
    };
    playlists.push(newPl);
    localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(playlists));
    window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists } }));
    this.scheduleCloudSync();
    return newPl;
  },

  createPlaylistWithTracks(name, tracks = [], isPublic = true) {
    const playlists = this.getPlaylists();
    const newPl = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name.trim() || 'Ma Playlist Importée',
      isPublic: isPublic !== false,
      createdAt: Date.now(),
      tracks: tracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        duration: t.duration,
        durationSec: t.durationSec,
        addedAt: Date.now()
      }))
    };
    playlists.push(newPl);
    localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(playlists));
    window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists } }));
    // Immediately persist to cloud/database
    this.pushToCloud();
    return newPl;
  },

  togglePlaylistPrivacy(playlistId) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return null;
    pl.isPublic = !pl.isPublic;
    localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(playlists));
    window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists } }));
    this.scheduleCloudSync();
    return pl.isPublic;
  },

  deletePlaylist(playlistId) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== playlistId);
    localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(playlists));
    window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists } }));
    this.scheduleCloudSync();
  },

  addTrackToPlaylist(playlistId, track) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return false;
    if (!pl.tracks.some(t => t.id === track.id)) {
      pl.tracks.push({
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        duration: track.duration,
        durationSec: track.durationSec,
        addedAt: Date.now()
      });
      localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(playlists));
      window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists } }));
      this.scheduleCloudSync();
      return true;
    }
    return false;
  },

  removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
    localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(playlists));
    window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists } }));
    this.scheduleCloudSync();
  },

  updatePlaylist(playlistId, updates = {}) {
    const playlists = this.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return null;
    Object.assign(pl, updates);
    localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(playlists));
    window.dispatchEvent(new CustomEvent('playlists_changed', { detail: { playlists } }));
    this.pushToCloud();
    return pl;
  },

  // History
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.HISTORY)) || [];
    } catch (e) {
      return [];
    }
  },

  addToHistory(track) {
    if (!track || !track.id) return;
    let history = this.getHistory();
    // Remove if already exists to push to front
    history = history.filter(item => item.id !== track.id);
    history.unshift({
      id: track.id,
      title: track.title,
      artist: track.artist,
      thumbnail: track.thumbnail,
      duration: track.duration,
      durationSec: track.durationSec,
      playedAt: Date.now()
    });
    // Keep max 60 items
    if (history.length > 60) history = history.slice(0, 60);
    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
    window.dispatchEvent(new CustomEvent('history_changed', { detail: { history } }));
    this.scheduleCloudSync();
  },

  clearHistory() {
    localStorage.removeItem(this.KEYS.HISTORY);
    window.dispatchEvent(new CustomEvent('history_changed', { detail: { history: [] } }));
    this.scheduleCloudSync();
  },

  // Settings
  getSettings() {
    try {
      return (
        JSON.parse(localStorage.getItem(this.KEYS.SETTINGS)) || {
          volume: 0.9,
          muted: false,
          repeat: 'off', // off, all, one
          shuffle: false,
          autoplayRadio: true,
          playbackRate: 1,
          audioQuality: 'high',
          eqPreset: 'flat'
        }
      );
    } catch (e) {
      return { volume: 0.9, repeat: 'off', shuffle: false, autoplayRadio: true, playbackRate: 1 };
    }
  },

  saveSetting(key, val) {
    const settings = this.getSettings();
    settings[key] = val;
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    this.scheduleCloudSync();
  },

  // Export / Import
  exportData() {
    const data = {
      favorites: this.getFavorites(),
      playlists: this.getPlaylists(),
      history: this.getHistory(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ytm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.favorites) localStorage.setItem(this.KEYS.FAVORITES, JSON.stringify(data.favorites));
      if (data.playlists) localStorage.setItem(this.KEYS.PLAYLISTS, JSON.stringify(data.playlists));
      if (data.history) localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(data.history));
      if (data.settings) localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(data.settings));
      window.location.reload();
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }
};

// Automatic reconnect recovery: Push pending changes when coming back online
window.addEventListener('online', () => {
  console.log('🌐 Réseau rétabli ! Synchronisation avec NeonDB...');
  if (Storage.isLoggedIn()) {
    Storage.pushToCloud();
  }
});

// Resync on tab focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Storage.isLoggedIn() && localStorage.getItem('ytm_pending_sync')) {
    Storage.pushToCloud();
  }
});

window.Storage = Storage;

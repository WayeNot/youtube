// API Client for YouTube Music
const API = {
  async search(query) {
    if (!query || !query.trim()) return [];
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      results.artist = data.artist || null;
      return results;
    } catch (err) {
      console.error('Search error:', err);
      return [];
    }
  },

  async getSuggestions(query) {
    if (!query || !query.trim()) return { suggestions: [], artist: null };
    try {
      const res = await fetch(`/api/suggestions?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      return {
        suggestions: data.suggestions || [],
        artist: data.artist || null,
        tracks: Array.isArray(data.tracks) ? data.tracks : []
      };
    } catch (err) {
      return { suggestions: [], artist: null, tracks: [] };
    }
  },

  async getArtist(name) {
    if (!name || !name.trim()) return null;
    try {
      const res = await fetch(`/api/artist/${encodeURIComponent(name.trim())}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error('Artist fetch error:', err);
      return null;
    }
  },

  async getAlbum(id, query) {
    if (!id && !query) return null;
    try {
      const q = new URLSearchParams();
      if (query) q.set('q', query);
      const res = await fetch(`/api/album/${encodeURIComponent(id || 'search')}?${q.toString()}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error('Album fetch error:', err);
      return null;
    }
  },

  async getHome() {
    try {
      const res = await fetch('/api/home');
      const data = await res.json();
      return data.sections || [];
    } catch (err) {
      console.error('Home load error:', err);
      return [];
    }
  },

  async getRandom() {
    try {
      const res = await fetch('/api/random');
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      return [];
    }
  },

  async getRelated(id, artist = '', title = '') {
    if (!id) return [];
    try {
      const q = new URLSearchParams();
      if (artist) q.set('artist', artist);
      if (title) q.set('title', title);
      const queryStr = q.toString() ? `?${q.toString()}` : '';
      const res = await fetch(`/api/related/${id}${queryStr}`);
      const data = await res.json();
      return data.results || [];
    } catch (err) {
      console.error('Related error:', err);
      return [];
    }
  },

  async getLyrics(title, artist) {
    if (!title) return null;
    try {
      const q = new URLSearchParams({ title, artist: artist || '' });
      const res = await fetch(`/api/lyrics?${q.toString()}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('Lyrics error:', err);
      return null;
    }
  },

  async getInfo(id) {
    if (!id) return null;
    try {
      const res = await fetch(`/api/info/${id}`);
      return await res.json();
    } catch (err) {
      return null;
    }
  },

  getStreamUrl(id) {
    return `/api/stream/${id}`;
  },

  _prefetched: new Set(),
  prefetch(id) {
    if (!id || this._prefetched.has(id)) return;
    this._prefetched.add(id);
    // Silent background pre-warm of stream cache
    fetch(`/api/stream-url/${id}`).catch(() => {});
  },

  prefetchBatch(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const toFetch = ids.filter(id => id && !this._prefetched.has(id));
    toFetch.forEach(id => this._prefetched.add(id));
    if (toFetch.length === 0) return;
    fetch('/api/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: toFetch })
    }).catch(() => {});
  },

  getDownloadUrl(id, title) {
    return `/api/download/${id}?title=${encodeURIComponent(title || 'audio')}`;
  },

  async importPlaylist(payload) {
    const res = await fetch('/api/playlist/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Échec de l\'importation de la playlist');
    }
    return await res.json();
  },

  // Auth & Cloud Sync
  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Échec de la connexion');
    return data;
  },

  async register(username, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Échec de l\'inscription');
    return data;
  },

  async getMe(token) {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Session expirée');
    return await res.json();
  },

  // VibeTube Feed
  async getVibeTubeFeed(category = 'trending') {
    try {
      const res = await fetch(`/api/vibetube/feed?category=${encodeURIComponent(category)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('VibeTube feed API error:', e);
      return { category, videos: [] };
    }
  },

  // VibeTube Video & Channel Search
  async searchVibeTube(query) {
    try {
      const res = await fetch(`/api/vibetube/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('VibeTube search API error:', e);
      return { channels: [], videos: [] };
    }
  },

  // VibeTube Watch Page Details & Related Videos
  async getVibeTubeWatch(id) {
    try {
      const res = await fetch(`/api/vibetube/watch?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('VibeTube watch API error:', e);
      return null;
    }
  },

  // VibeTube Comments
  async getVibeTubeComments(id) {
    try {
      const res = await fetch(`/api/vibetube/comments?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('VibeTube comments API error:', e);
      return { comments: [], total: 0 };
    }
  },

  async postVibeTubeComment({ videoId, content, authorName, authorAvatar, userId }) {
    try {
      const res = await fetch('/api/vibetube/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, content, authorName, authorAvatar, userId })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('VibeTube post comment error:', e);
      return null;
    }
  }
};

window.API = API;

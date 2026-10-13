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
    fetch(`/api/stream-url/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data && data.url && window.Player && window.Player.streamUrlCache) {
          window.Player.streamUrlCache.set(id, data.url);
        }
      })
      .catch(() => {});
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
  },

  // Admin Panel & RBAC API
  async getAdminStats() {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch('/api/admin/stats', {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Admin stats error:', e);
      return null;
    }
  },

  async getAdminUsers(limit = 100) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch(`/api/admin/users?limit=${limit}`, {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Admin users error:', e);
      return null;
    }
  },

  async updateAdminUserRole(userId, role) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ role })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn('Update user role error:', e);
      throw e;
    }
  },

  async updateAdminUserBadges(userId, badges) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch(`/api/admin/users/${userId}/badges`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ badges })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn('Update user badges error:', e);
      throw e;
    }
  },

  async getAdminAuditLogs(limit = 50) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch(`/api/admin/audit-logs?limit=${limit}`, {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Admin audit logs error:', e);
      return null;
    }
  },

  async getVibeTubeChannel(channelName) {
    try {
      const res = await fetch(`/api/vibetube/channel?name=${encodeURIComponent(channelName)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('VibeTube channel API error:', e);
      return null;
    }
  },

  async deleteAdminUser(userId) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn('Delete user error:', e);
      throw e;
    }
  },

  async purgeAdminStreamCache() {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch('/api/admin/purge-cache', {
        method: 'POST',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.warn('Purge cache error:', e);
      throw e;
    }
  },

  // Guns.lol Bio Page & Gamer Socials
  async getBioPage(username) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/bio/${encodeURIComponent(username)}`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Page bio introuvable');
      }
      return await res.json();
    } catch (e) {
      console.warn('Bio page error:', e);
      throw e;
    }
  },

  async updateBioConfig(config) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch('/api/bio/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(config)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de la sauvegarde de la bio');
      }
      return await res.json();
    } catch (e) {
      console.warn('Update bio config error:', e);
      throw e;
    }
  },

  async updateUserSocials(socials) {
    try {
      const token = Storage.getToken ? Storage.getToken() : null;
      const res = await fetch('/api/user/socials', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(socials)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erreur lors de la sauvegarde des réseaux');
      }
      return await res.json();
    } catch (e) {
      console.warn('Update socials error:', e);
      throw e;
    }
  }
};

window.API = API;

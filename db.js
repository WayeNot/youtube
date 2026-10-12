const fs = require('fs');
const path = require('path');
const config = require('./config');

let isNeon = false;
let neonSql = null;
let sqliteDb = null;

// Check if Neon Database URL is provided
if (config.databaseUrl && config.databaseUrl.trim().startsWith('postgres')) {
  try {
    const { neon } = require('@neondatabase/serverless');
    neonSql = neon(config.databaseUrl.trim());
    isNeon = true;
    console.log('⚡ Connexion à NeonDB PostgreSQL établie !');
  } catch (err) {
    console.warn('⚠️ Échec de connexion à NeonDB, bascule vers SQLite local:', err.message);
  }
}

// Fallback to local SQLite if NeonDB is not configured or fails
if (!isNeon) {
  try {
    const Database = require('better-sqlite3');
    const dbDir = path.dirname(config.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    sqliteDb = new Database(config.dbPath);
    sqliteDb.pragma('journal_mode = WAL');
    console.log('📁 Utilisation de SQLite local (data/ytm.db)');
  } catch (err) {
    console.warn('⚠️ SQLite local non disponible:', err.message);
  }
}

// Comprehensive Database Layer
const db = {
  isNeon() {
    return isNeon;
  },

  async initSchema() {
    if (isNeon) {
      await neonSql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          avatar TEXT DEFAULT '',
          bio TEXT DEFAULT '',
          created_at BIGINT NOT NULL
        );
      `;
      try {
        await neonSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT ''`;
      } catch (e) {}
      try {
        await neonSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''`;
      } catch (e) {}
      try {
        await neonSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE`;
      } catch (e) {}

      await neonSql`
        CREATE TABLE IF NOT EXISTS user_follows (
          follower_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          followed_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (follower_id, followed_id)
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          theme TEXT DEFAULT '#ff0033',
          accent_color TEXT DEFAULT '#ff0033',
          accent_hover_color TEXT DEFAULT '#cc0029',
          ambient_glow BOOLEAN DEFAULT TRUE,
          audio_quality TEXT DEFAULT 'high',
          eq_preset TEXT DEFAULT 'flat',
          autoplay_radio BOOLEAN DEFAULT TRUE,
          recent_searches JSONB NOT NULL DEFAULT '[]'::jsonb,
          custom_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at BIGINT NOT NULL
        );
      `;

      // Safe migration from legacy user_data table if it existed
      try {
        await neonSql`
          INSERT INTO user_settings (user_id, recent_searches, custom_settings, updated_at)
          SELECT user_id, COALESCE(recent_searches, '[]'::jsonb), COALESCE(settings, '{}'::jsonb), updated_at
          FROM user_data
          ON CONFLICT (user_id) DO NOTHING;
        `;
        await neonSql`DROP TABLE IF EXISTS user_data CASCADE;`;
      } catch (e) {}

      // Dedicated Tables for Relational Queries, Indexes & Direct Sync
      await neonSql`
        CREATE TABLE IF NOT EXISTS liked_tracks (
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT,
          thumbnail TEXT,
          duration TEXT,
          duration_sec INT,
          added_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, track_id)
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          is_public BOOLEAN NOT NULL DEFAULT TRUE,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `;
      try {
        await neonSql`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE`;
      } catch (e) {}

      await neonSql`
        CREATE TABLE IF NOT EXISTS playlist_tracks (
          id SERIAL PRIMARY KEY,
          playlist_id TEXT REFERENCES playlists(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT,
          thumbnail TEXT,
          duration TEXT,
          duration_sec INT,
          position INT NOT NULL,
          added_at BIGINT NOT NULL
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS listen_history (
          id SERIAL PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          track_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT,
          thumbnail TEXT,
          duration TEXT,
          duration_sec INT,
          listened_at BIGINT NOT NULL
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS stream_cache (
          video_id TEXT PRIMARY KEY,
          stream_url TEXT NOT NULL,
          expires_at BIGINT NOT NULL
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS video_comments (
          id SERIAL PRIMARY KEY,
          video_id TEXT NOT NULL,
          user_id TEXT,
          author_name TEXT NOT NULL,
          author_avatar TEXT,
          content TEXT NOT NULL,
          likes INT DEFAULT 0,
          created_at BIGINT NOT NULL
        );
      `;

      try {
        await neonSql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'`;
      } catch (e) {}

      // --- DEDICATED VIBETUBE TABLES (100% Separated from VibeStream) ---
      await neonSql`
        CREATE TABLE IF NOT EXISTS vibetube_history (
          id SERIAL PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          views TEXT,
          watched_at BIGINT NOT NULL
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS vibetube_watch_later (
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          views TEXT,
          added_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, video_id)
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS vibetube_liked (
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          views TEXT,
          liked_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, video_id)
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS vibetube_playlists (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS vibetube_playlist_videos (
          id SERIAL PRIMARY KEY,
          playlist_id TEXT REFERENCES vibetube_playlists(id) ON DELETE CASCADE,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          position INT NOT NULL,
          added_at BIGINT NOT NULL
        );
      `;

      await neonSql`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          target TEXT,
          details JSONB DEFAULT '{}'::jsonb,
          ip TEXT,
          created_at BIGINT NOT NULL
        );
      `;

      // Create indexes for blazing fast lookups
      await neonSql`CREATE INDEX IF NOT EXISTS idx_liked_user ON liked_tracks(user_id, added_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id, updated_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_pl_tracks ON playlist_tracks(playlist_id, position);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_history_user ON listen_history(user_id, listened_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_stream_expires ON stream_cache(expires_at);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_follows_followed ON user_follows(followed_id);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_comments_vid ON video_comments(video_id, created_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_vt_hist_user ON vibetube_history(user_id, watched_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_vt_wl_user ON vibetube_watch_later(user_id, added_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_vt_like_user ON vibetube_liked(user_id, liked_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_vt_pl_user ON vibetube_playlists(user_id, updated_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);`;

      console.log('✅ Tables relationnelles NeonDB (liked_tracks, playlists, playlist_tracks, history, user_follows, video_comments) prêtes !');
    } else {
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT UNIQUE NOT NULL COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          avatar TEXT DEFAULT '',
          bio TEXT DEFAULT '',
          is_public INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY,
          theme TEXT DEFAULT '#ff0033',
          accent_color TEXT DEFAULT '#ff0033',
          accent_hover_color TEXT DEFAULT '#cc0029',
          ambient_glow INTEGER DEFAULT 1,
          audio_quality TEXT DEFAULT 'high',
          eq_preset TEXT DEFAULT 'flat',
          autoplay_radio INTEGER DEFAULT 1,
          recent_searches TEXT NOT NULL DEFAULT '[]',
          custom_settings TEXT NOT NULL DEFAULT '{}',
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_follows (
          follower_id TEXT NOT NULL,
          followed_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (follower_id, followed_id),
          FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(followed_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS liked_tracks (
          user_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT,
          thumbnail TEXT,
          duration TEXT,
          duration_sec INTEGER,
          added_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, track_id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS playlists (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          playlist_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT,
          thumbnail TEXT,
          duration TEXT,
          duration_sec INTEGER,
          position INTEGER NOT NULL,
          added_at INTEGER NOT NULL,
          FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS listen_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          track_id TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT,
          thumbnail TEXT,
          duration TEXT,
          duration_sec INTEGER,
          listened_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS stream_cache (
          video_id TEXT PRIMARY KEY,
          stream_url TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS video_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT NOT NULL,
          user_id TEXT,
          author_name TEXT NOT NULL,
          author_avatar TEXT,
          content TEXT NOT NULL,
          likes INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vibetube_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          views TEXT,
          watched_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vibetube_watch_later (
          user_id TEXT NOT NULL,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          views TEXT,
          added_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, video_id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vibetube_liked (
          user_id TEXT NOT NULL,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          views TEXT,
          liked_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, video_id),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vibetube_playlists (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS vibetube_playlist_videos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          playlist_id TEXT NOT NULL,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          channel TEXT,
          thumbnail TEXT,
          position INTEGER NOT NULL,
          added_at INTEGER NOT NULL,
          FOREIGN KEY(playlist_id) REFERENCES vibetube_playlists(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT,
          action TEXT NOT NULL,
          target TEXT,
          details TEXT DEFAULT '{}',
          ip TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_liked_user ON liked_tracks(user_id, added_at DESC);
        CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pl_tracks ON playlist_tracks(playlist_id, position);
        CREATE INDEX IF NOT EXISTS idx_history_user ON listen_history(user_id, listened_at DESC);
        CREATE INDEX IF NOT EXISTS idx_stream_expires ON stream_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
        CREATE INDEX IF NOT EXISTS idx_follows_followed ON user_follows(followed_id);
        CREATE INDEX IF NOT EXISTS idx_comments_vid ON video_comments(video_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_vt_hist_user ON vibetube_history(user_id, watched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_vt_wl_user ON vibetube_watch_later(user_id, added_at DESC);
        CREATE INDEX IF NOT EXISTS idx_vt_like_user ON vibetube_liked(user_id, liked_at DESC);
        CREATE INDEX IF NOT EXISTS idx_vt_pl_user ON vibetube_playlists(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
      `);

      try {
        sqliteDb.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      } catch (e) {}

      try {
        sqliteDb.exec('ALTER TABLE users ADD COLUMN is_public INTEGER DEFAULT 1');
      } catch (e) {}

      // Safe migration from legacy user_data in SQLite
      try {
        sqliteDb.exec(`
          INSERT OR IGNORE INTO user_settings (user_id, recent_searches, custom_settings, updated_at)
          SELECT user_id, recent_searches, settings, updated_at FROM user_data;
        `);
        sqliteDb.exec('DROP TABLE IF EXISTS user_data;');
      } catch (e) {}
      console.log('✅ Tables relationnelles SQLite prêtes !');
    }
  },

  // Users
  async findUserByUsername(username) {
    if (isNeon) {
      const rows = await neonSql`SELECT id, username, password_hash, avatar, bio, is_public, role, created_at FROM users WHERE LOWER(username) = LOWER(${username.trim()}) LIMIT 1`;
      return rows[0] || null;
    } else {
      return sqliteDb.prepare('SELECT id, username, password_hash, avatar, bio, is_public, role, created_at FROM users WHERE username = ?').get(username.trim()) || null;
    }
  },

  async findUserById(id) {
    if (isNeon) {
      const rows = await neonSql`SELECT id, username, avatar, bio, is_public, role, created_at FROM users WHERE id = ${id} LIMIT 1`;
      return rows[0] || null;
    } else {
      return sqliteDb.prepare('SELECT id, username, avatar, bio, is_public, role, created_at FROM users WHERE id = ?').get(id) || null;
    }
  },

  async updateUserProfile(userId, { avatar, bio, isPublic }) {
    const isPubVal = isPublic !== undefined ? (isPublic ? true : false) : true;
    if (isNeon) {
      await neonSql`
        UPDATE users
        SET avatar = ${avatar || ''}, bio = ${bio || ''}, is_public = ${isPubVal}
        WHERE id = ${userId}
      `;
    } else {
      sqliteDb.prepare('UPDATE users SET avatar = ?, bio = ?, is_public = ? WHERE id = ?').run(
        avatar || '',
        bio || '',
        isPubVal ? 1 : 0,
        userId
      );
    }
  },

  // Follow / Subscription System
  async isFollowing(followerId, targetUserId) {
    if (!followerId || !targetUserId) return false;
    if (isNeon) {
      const rows = await neonSql`
        SELECT 1 FROM user_follows WHERE follower_id = ${followerId} AND followed_id = ${targetUserId} LIMIT 1
      `;
      return rows.length > 0;
    } else {
      const row = sqliteDb.prepare('SELECT 1 FROM user_follows WHERE follower_id = ? AND followed_id = ?').get(followerId, targetUserId);
      return Boolean(row);
    }
  },

  async toggleFollow(followerId, targetUserId) {
    if (!followerId || !targetUserId || String(followerId) === String(targetUserId)) {
      throw new Error('Action impossible : vous ne pouvez pas vous abonner à vous-même.');
    }
    const alreadyFollowing = await this.isFollowing(followerId, targetUserId);
    const now = Date.now();

    if (isNeon) {
      if (alreadyFollowing) {
        await neonSql`DELETE FROM user_follows WHERE follower_id = ${followerId} AND followed_id = ${targetUserId}`;
      } else {
        await neonSql`INSERT INTO user_follows (follower_id, followed_id, created_at) VALUES (${followerId}, ${targetUserId}, ${now}) ON CONFLICT DO NOTHING`;
      }
    } else {
      if (alreadyFollowing) {
        sqliteDb.prepare('DELETE FROM user_follows WHERE follower_id = ? AND followed_id = ?').run(followerId, targetUserId);
      } else {
        sqliteDb.prepare('INSERT OR IGNORE INTO user_follows (follower_id, followed_id, created_at) VALUES (?, ?, ?)').run(followerId, targetUserId, now);
      }
    }

    const counts = await this.getFollowCounts(targetUserId);
    return {
      isFollowing: !alreadyFollowing,
      followersCount: counts.followersCount,
      followingCount: counts.followingCount
    };
  },

  async getFollowCounts(userId) {
    if (!userId) return { followersCount: 0, followingCount: 0 };
    if (isNeon) {
      const followersRes = await neonSql`SELECT COUNT(*)::int AS count FROM user_follows WHERE followed_id = ${userId}`;
      const followingRes = await neonSql`SELECT COUNT(*)::int AS count FROM user_follows WHERE follower_id = ${userId}`;
      return {
        followersCount: followersRes[0]?.count || 0,
        followingCount: followingRes[0]?.count || 0
      };
    } else {
      const followersRow = sqliteDb.prepare('SELECT COUNT(*) as count FROM user_follows WHERE followed_id = ?').get(userId);
      const followingRow = sqliteDb.prepare('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = ?').get(userId);
      return {
        followersCount: followersRow?.count || 0,
        followingCount: followingRow?.count || 0
      };
    }
  },

  async getPublicProfile(username, viewerUserId = null) {
    const user = await this.findUserByUsername(username);
    if (!user) return null;
    const isOwner = viewerUserId && String(viewerUserId) === String(user.id);
    const isPublic = user.is_public !== false && user.is_public !== 0;
    const data = (await this.getUserData(user.id)) || { favorites: [], playlists: [], history: [] };
    const allPlaylists = data.playlists || [];
    const visiblePlaylists = allPlaylists.filter(p => isOwner || p.isPublic !== false);
    const favorites = data.favorites || [];
    const history = data.history || [];

    // Follower counts and isFollowing status
    const followCounts = await this.getFollowCounts(user.id);
    const isFollowing = viewerUserId ? await this.isFollowing(viewerUserId, user.id) : false;

    // Calculate Top Artists from history & favorites
    const artistCounts = {};
    const artistAvatars = {};
    const tracksPool = [...history, ...favorites];

    tracksPool.forEach(track => {
      const art = track.artist ? track.artist.trim() : null;
      if (art && art !== 'Artiste' && art.length > 1) {
        artistCounts[art] = (artistCounts[art] || 0) + 1;
        if (!artistAvatars[art] && track.thumbnail) {
          artistAvatars[art] = track.thumbnail;
        }
      }
    });

    const topArtists = Object.keys(artistCounts)
      .sort((a, b) => artistCounts[b] - artistCounts[a])
      .slice(0, 6)
      .map(name => ({
        name,
        plays: artistCounts[name],
        avatar: artistAvatars[name] || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`
      }));

    // Badges calculation
    const badges = [];
    const createdAtMs = Number(user.created_at) || Date.now();
    const ageDays = Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24));

    if (ageDays >= 1) {
      badges.push({ id: 'pioneer', icon: '🏆', title: 'Pionnier', desc: 'Membre actif de la communauté' });
    }
    if (favorites.length >= 1) {
      badges.push({ id: 'melophile', icon: '❤️', title: 'Mélomane', desc: `${favorites.length} titres favoris` });
    }
    if (visiblePlaylists.length >= 1) {
      badges.push({ id: 'curator', icon: '🎧', title: 'Curateur', desc: `${visiblePlaylists.length} playlists créées` });
    }
    if (history.length >= 5) {
      badges.push({ id: 'explorer', icon: '⚡', title: 'Auditeur Passionné', desc: `${history.length} titres écoutés` });
    }
    if (followCounts.followersCount >= 1) {
      badges.push({ id: 'influencer', icon: '🌟', title: 'Vedette', desc: `${followCounts.followersCount} abonné${followCounts.followersCount > 1 ? 's' : ''}` });
    }
    if (badges.length === 0) {
      badges.push({ id: 'newbie', icon: '✨', title: 'Nouvel Arrivant', desc: 'Prêt à découvrir de nouvelles vibes' });
    }

    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar || '',
      banner: user.banner || '',
      bio: user.bio || '',
      isPublic,
      isOwner: Boolean(isOwner),
      isFollowing: Boolean(isFollowing),
      createdAt: createdAtMs,
      stats: {
        likesCount: favorites.length,
        playlistsCount: visiblePlaylists.length,
        historyCount: history.length,
        followersCount: followCounts.followersCount,
        followingCount: followCounts.followingCount
      },
      topArtists,
      badges,
      playlists: visiblePlaylists.map(p => ({
        id: p.id,
        name: p.name,
        isPublic: p.isPublic !== false,
        trackCount: p.tracks ? p.tracks.length : 0,
        cover: p.tracks && p.tracks[0] ? p.tracks[0].thumbnail : null
      }))
    };
  },

  async getPlaylistByUserAndName(username, playlistName, viewerUserId = null) {
    const user = await this.findUserByUsername(username);
    if (!user) return { error: 'Utilisateur introuvable' };

    const data = (await this.getUserData(user.id)) || { playlists: [] };
    const pl = (data.playlists || []).find(p =>
      p.name.trim().toLowerCase() === playlistName.trim().toLowerCase() ||
      p.id === playlistName
    );

    if (!pl) return { error: 'Playlist introuvable' };

    const isOwner = viewerUserId && String(viewerUserId) === String(user.id);
    if (pl.isPublic === false && !isOwner) {
      return { error: 'Cette playlist est privée.', isPrivate: true };
    }

    return {
      playlist: {
        ...pl,
        ownerUsername: user.username,
        ownerAvatar: user.avatar || '',
        isOwner: !!isOwner
      }
    };
  },

  async createUser(id, username, passwordHash, createdAt) {
    if (isNeon) {
      await neonSql`
        INSERT INTO users (id, username, password_hash, avatar, bio, created_at)
        VALUES (${id}, ${username.trim()}, ${passwordHash}, '', '', ${createdAt})
      `;
      await neonSql`
        INSERT INTO user_settings (user_id, theme, accent_color, accent_hover_color, ambient_glow, audio_quality, eq_preset, autoplay_radio, recent_searches, custom_settings, updated_at)
        VALUES (${id}, '#ff0033', '#ff0033', '#cc0029', TRUE, 'high', 'flat', TRUE, '[]'::jsonb, '{}'::jsonb, ${createdAt})
      `;
    } else {
      sqliteDb.prepare('INSERT INTO users (id, username, password_hash, avatar, bio, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, username.trim(), passwordHash, '', '', createdAt);
      sqliteDb.prepare(`
        INSERT INTO user_settings (user_id, theme, accent_color, accent_hover_color, ambient_glow, audio_quality, eq_preset, autoplay_radio, recent_searches, custom_settings, updated_at)
        VALUES (?, '#ff0033', '#ff0033', '#cc0029', 1, 'high', 'flat', 1, '[]', '{}', ?)
      `).run(id, createdAt);
    }
  },

  // User Data: Reconstruct all consolidated data directly from dedicated relational tables and user_settings
  async getUserData(userId) {
    if (isNeon) {
      // 1. Liked tracks
      const favRows = await neonSql`
        SELECT track_id AS id, title, artist, thumbnail, duration, duration_sec AS "durationSec", added_at AS "addedAt"
        FROM liked_tracks
        WHERE user_id = ${userId}
        ORDER BY added_at DESC
      `;

      // 2. Playlists with their tracks
      const plRows = await neonSql`
        SELECT id, name, is_public AS "isPublic", created_at AS "createdAt", updated_at AS "updatedAt"
        FROM playlists
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
      `;

      const playlists = [];
      for (const pl of plRows) {
        const trRows = await neonSql`
          SELECT track_id AS id, title, artist, thumbnail, duration, duration_sec AS "durationSec", added_at AS "addedAt"
          FROM playlist_tracks
          WHERE playlist_id = ${pl.id}
          ORDER BY position ASC
        `;
        playlists.push({
          id: pl.id,
          name: pl.name,
          isPublic: pl.isPublic !== false,
          createdAt: Number(pl.createdAt),
          updatedAt: Number(pl.updatedAt),
          tracks: trRows.map(tr => ({
            id: tr.id,
            title: tr.title,
            artist: tr.artist || '',
            thumbnail: tr.thumbnail || '',
            duration: tr.duration || '',
            durationSec: tr.durationSec || 0,
            addedAt: Number(tr.addedAt)
          }))
        });
      }

      // 3. Listen history (latest 100)
      const histRows = await neonSql`
        SELECT track_id AS id, title, artist, thumbnail, duration, duration_sec AS "durationSec", listened_at AS "listenedAt"
        FROM listen_history
        WHERE user_id = ${userId}
        ORDER BY listened_at DESC
        LIMIT 100
      `;

      // 4. User settings & recent searches
      const setRows = await neonSql`
        SELECT theme, accent_color AS "accentColor", accent_hover_color AS "accentHoverColor",
               ambient_glow AS "ambientGlow", audio_quality AS "audioQuality", eq_preset AS "eqPreset",
               autoplay_radio AS "autoplayRadio", recent_searches, custom_settings, updated_at
        FROM user_settings
        WHERE user_id = ${userId}
        LIMIT 1
      `;

      let settings = {};
      let recentSearches = [];
      let updatedAt = Date.now();

      if (setRows && setRows.length > 0) {
        const sr = setRows[0];
        const custom = typeof sr.custom_settings === 'string' ? JSON.parse(sr.custom_settings || '{}') : (sr.custom_settings || {});
        settings = {
          theme: sr.theme || '#ff0033',
          accentColor: sr.accentColor || '#ff0033',
          accentHoverColor: sr.accentHoverColor || '#cc0029',
          ambientGlow: sr.ambientGlow !== false,
          audioQuality: sr.audioQuality || 'high',
          eqPreset: sr.eqPreset || 'flat',
          autoplayRadio: sr.autoplayRadio !== false,
          ...custom
        };
        recentSearches = typeof sr.recent_searches === 'string' ? JSON.parse(sr.recent_searches || '[]') : (sr.recent_searches || []);
        updatedAt = Number(sr.updated_at) || updatedAt;
      }

      return {
        favorites: favRows.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist || '',
          thumbnail: t.thumbnail || '',
          duration: t.duration || '',
          durationSec: t.durationSec || 0,
          addedAt: Number(t.addedAt)
        })),
        playlists,
        history: histRows.map(h => ({
          id: h.id,
          title: h.title,
          artist: h.artist || '',
          thumbnail: h.thumbnail || '',
          duration: h.duration || '',
          durationSec: h.durationSec || 0,
          listenedAt: Number(h.listenedAt)
        })),
        recent_searches: recentSearches,
        settings,
        updatedAt
      };
    } else {
      // Local SQLite
      // 1. Liked tracks
      const favRows = sqliteDb.prepare(`
        SELECT track_id AS id, title, artist, thumbnail, duration, duration_sec AS durationSec, added_at AS addedAt
        FROM liked_tracks
        WHERE user_id = ?
        ORDER BY added_at DESC
      `).all(userId);

      // 2. Playlists
      const plRows = sqliteDb.prepare(`
        SELECT id, name, is_public AS isPublic, created_at AS createdAt, updated_at AS updatedAt
        FROM playlists
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `).all(userId);

      const plTrackStmt = sqliteDb.prepare(`
        SELECT track_id AS id, title, artist, thumbnail, duration, duration_sec AS durationSec, added_at AS addedAt
        FROM playlist_tracks
        WHERE playlist_id = ?
        ORDER BY position ASC
      `);

      const playlists = plRows.map(pl => ({
        id: pl.id,
        name: pl.name,
        isPublic: pl.isPublic !== 0,
        createdAt: pl.createdAt,
        updatedAt: pl.updatedAt,
        tracks: plTrackStmt.all(pl.id).map(tr => ({
          id: tr.id,
          title: tr.title,
          artist: tr.artist || '',
          thumbnail: tr.thumbnail || '',
          duration: tr.duration || '',
          durationSec: tr.durationSec || 0,
          addedAt: tr.addedAt
        }))
      }));

      // 3. History
      const histRows = sqliteDb.prepare(`
        SELECT track_id AS id, title, artist, thumbnail, duration, duration_sec AS durationSec, listened_at AS listenedAt
        FROM listen_history
        WHERE user_id = ?
        ORDER BY listened_at DESC
        LIMIT 100
      `).all(userId);

      // 4. Settings
      const sr = sqliteDb.prepare(`
        SELECT theme, accent_color AS accentColor, accent_hover_color AS accentHoverColor,
               ambient_glow AS ambientGlow, audio_quality AS audioQuality, eq_preset AS eqPreset,
               autoplay_radio AS autoplayRadio, recent_searches, custom_settings, updated_at
        FROM user_settings
        WHERE user_id = ?
      `).get(userId);

      let settings = {};
      let recentSearches = [];
      let updatedAt = Date.now();

      if (sr) {
        let custom = {};
        try { custom = JSON.parse(sr.custom_settings || '{}'); } catch(e){}
        settings = {
          theme: sr.theme || '#ff0033',
          accentColor: sr.accentColor || '#ff0033',
          accentHoverColor: sr.accentHoverColor || '#cc0029',
          ambientGlow: sr.ambientGlow !== 0,
          audioQuality: sr.audioQuality || 'high',
          eqPreset: sr.eqPreset || 'flat',
          autoplayRadio: sr.autoplayRadio !== 0,
          ...custom
        };
        try { recentSearches = JSON.parse(sr.recent_searches || '[]'); } catch(e){}
        updatedAt = sr.updated_at || updatedAt;
      }

      return {
        favorites: favRows,
        playlists,
        history: histRows,
        recent_searches: recentSearches,
        settings,
        updatedAt
      };
    }
  },

  // Save User Data: Updates dedicated relational tables and user_settings directly
  async saveUserData(userId, { favorites, playlists, history, recent_searches, settings }, updatedAt) {
    const favsArr = Array.isArray(favorites) ? favorites : [];
    const plsArr = Array.isArray(playlists) ? playlists : [];
    const histArr = Array.isArray(history) ? history : [];
    const recArr = Array.isArray(recent_searches) ? recent_searches : [];
    const settObj = settings && typeof settings === 'object' ? settings : {};

    const recStr = JSON.stringify(recArr);
    const customSett = { ...settObj };
    const theme = customSett.theme || customSett.accentColor || '#ff0033';
    const accentColor = customSett.accentColor || '#ff0033';
    const accentHoverColor = customSett.accentHoverColor || '#cc0029';
    const ambientGlow = customSett.ambientGlow !== false;
    const audioQuality = customSett.audioQuality || 'high';
    const eqPreset = customSett.eqPreset || 'flat';
    const autoplayRadio = customSett.autoplayRadio !== false;

    delete customSett.theme;
    delete customSett.accentColor;
    delete customSett.accentHoverColor;
    delete customSett.ambientGlow;
    delete customSett.audioQuality;
    delete customSett.eqPreset;
    delete customSett.autoplayRadio;

    const customStr = JSON.stringify(customSett);

    if (isNeon) {
      // 1. Update user_settings table
      await neonSql`
        INSERT INTO user_settings (
          user_id, theme, accent_color, accent_hover_color, ambient_glow,
          audio_quality, eq_preset, autoplay_radio, recent_searches, custom_settings, updated_at
        )
        VALUES (
          ${userId}, ${theme}, ${accentColor}, ${accentHoverColor}, ${ambientGlow},
          ${audioQuality}, ${eqPreset}, ${autoplayRadio}, ${recStr}::jsonb, ${customStr}::jsonb, ${updatedAt}
        )
        ON CONFLICT (user_id) DO UPDATE SET
          theme = EXCLUDED.theme,
          accent_color = EXCLUDED.accent_color,
          accent_hover_color = EXCLUDED.accent_hover_color,
          ambient_glow = EXCLUDED.ambient_glow,
          audio_quality = EXCLUDED.audio_quality,
          eq_preset = EXCLUDED.eq_preset,
          autoplay_radio = EXCLUDED.autoplay_radio,
          recent_searches = EXCLUDED.recent_searches,
          custom_settings = EXCLUDED.custom_settings,
          updated_at = EXCLUDED.updated_at
      `;

      // 2. Synchronize liked_tracks relational table
      await neonSql`DELETE FROM liked_tracks WHERE user_id = ${userId}`;
      for (const t of favsArr) {
        if (!t || !t.id) continue;
        await neonSql`
          INSERT INTO liked_tracks (user_id, track_id, title, artist, thumbnail, duration, duration_sec, added_at)
          VALUES (${userId}, ${t.id}, ${t.title || 'Inconnu'}, ${t.artist || ''}, ${t.thumbnail || ''}, ${t.duration || ''}, ${t.durationSec || 0}, ${t.addedAt || updatedAt})
          ON CONFLICT (user_id, track_id) DO UPDATE SET
            title = EXCLUDED.title,
            artist = EXCLUDED.artist,
            thumbnail = EXCLUDED.thumbnail,
            duration = EXCLUDED.duration,
            duration_sec = EXCLUDED.duration_sec
        `;
      }

      // 3. Synchronize playlists & playlist_tracks relational tables safely
      try {
        const validPlIds = plsArr.filter(p => p && p.id).map(p => p.id);
        if (validPlIds.length === 0) {
          await neonSql`DELETE FROM playlists WHERE user_id = ${userId}`;
        } else {
          const existing = await neonSql`SELECT id FROM playlists WHERE user_id = ${userId}`;
          for (const row of existing) {
            if (!validPlIds.includes(row.id)) {
              await neonSql`DELETE FROM playlists WHERE id = ${row.id} AND user_id = ${userId}`;
            }
          }
        }

        for (const pl of plsArr) {
          if (!pl || !pl.id) continue;
          const plTime = pl.createdAt || updatedAt;
          const isPub = pl.isPublic !== false;
          await neonSql`
            INSERT INTO playlists (id, user_id, name, is_public, created_at, updated_at)
            VALUES (${pl.id}, ${userId}, ${pl.name || 'Playlist'}, ${isPub}, ${plTime}, ${updatedAt})
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              name = EXCLUDED.name,
              is_public = EXCLUDED.is_public,
              updated_at = EXCLUDED.updated_at
          `;

          await neonSql`DELETE FROM playlist_tracks WHERE playlist_id = ${pl.id}`;

          if (Array.isArray(pl.tracks) && pl.tracks.length > 0) {
            for (let i = 0; i < pl.tracks.length; i++) {
              const tr = pl.tracks[i];
              if (!tr || !tr.id) continue;
              try {
                await neonSql`
                  INSERT INTO playlist_tracks (playlist_id, track_id, title, artist, thumbnail, duration, duration_sec, position, added_at)
                  VALUES (${pl.id}, ${tr.id}, ${tr.title || 'Inconnu'}, ${tr.artist || ''}, ${tr.thumbnail || ''}, ${tr.duration || ''}, ${tr.durationSec || 0}, ${i}, ${tr.addedAt || plTime})
                `;
              } catch (trackInsertErr) {}
            }
          }
        }
      } catch (plSyncErr) {
        console.warn('⚠️ Playlist relational sync warning:', plSyncErr.message);
      }

      // 4. Synchronize listen_history relational table (keep latest 100)
      await neonSql`DELETE FROM listen_history WHERE user_id = ${userId}`;
      for (const h of histArr.slice(0, 100)) {
        if (!h || !h.id) continue;
        await neonSql`
          INSERT INTO listen_history (user_id, track_id, title, artist, thumbnail, duration, duration_sec, listened_at)
          VALUES (${userId}, ${h.id}, ${h.title || 'Inconnu'}, ${h.artist || ''}, ${h.thumbnail || ''}, ${h.duration || ''}, ${h.durationSec || 0}, ${h.listenedAt || updatedAt})
        `;
      }
    } else {
      // SQLite execution in transaction
      const syncTx = sqliteDb.transaction(() => {
        // user_settings
        sqliteDb.prepare(`
          INSERT INTO user_settings (
            user_id, theme, accent_color, accent_hover_color, ambient_glow,
            audio_quality, eq_preset, autoplay_radio, recent_searches, custom_settings, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            theme = excluded.theme,
            accent_color = excluded.accent_color,
            accent_hover_color = excluded.accent_hover_color,
            ambient_glow = excluded.ambient_glow,
            audio_quality = excluded.audio_quality,
            eq_preset = excluded.eq_preset,
            autoplay_radio = excluded.autoplay_radio,
            recent_searches = excluded.recent_searches,
            custom_settings = excluded.custom_settings,
            updated_at = excluded.updated_at
        `).run(
          userId, theme, accentColor, accentHoverColor, ambientGlow ? 1 : 0,
          audioQuality, eqPreset, autoplayRadio ? 1 : 0, recStr, customStr, updatedAt
        );

        // liked_tracks
        sqliteDb.prepare('DELETE FROM liked_tracks WHERE user_id = ?').run(userId);
        const insertLiked = sqliteDb.prepare(`
          INSERT INTO liked_tracks (user_id, track_id, title, artist, thumbnail, duration, duration_sec, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of favsArr) {
          if (t && t.id) {
            insertLiked.run(userId, t.id, t.title || 'Inconnu', t.artist || '', t.thumbnail || '', t.duration || '', t.durationSec || 0, t.addedAt || updatedAt);
          }
        }

        // playlists & playlist_tracks
        sqliteDb.prepare('DELETE FROM playlists WHERE user_id = ?').run(userId);
        const insertPl = sqliteDb.prepare('INSERT INTO playlists (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
        const insertPlTrack = sqliteDb.prepare(`
          INSERT INTO playlist_tracks (playlist_id, track_id, title, artist, thumbnail, duration, duration_sec, position, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const pl of plsArr) {
          if (pl && pl.id) {
            const plTime = pl.createdAt || updatedAt;
            insertPl.run(pl.id, userId, pl.name || 'Playlist', plTime, updatedAt);
            if (Array.isArray(pl.tracks)) {
              pl.tracks.forEach((tr, i) => {
                if (tr && tr.id) {
                  insertPlTrack.run(pl.id, tr.id, tr.title || 'Inconnu', tr.artist || '', tr.thumbnail || '', tr.duration || '', tr.durationSec || 0, i, tr.addedAt || plTime);
                }
              });
            }
          }
        }

        // listen_history
        sqliteDb.prepare('DELETE FROM listen_history WHERE user_id = ?').run(userId);
        const insertHist = sqliteDb.prepare(`
          INSERT INTO listen_history (user_id, track_id, title, artist, thumbnail, duration, duration_sec, listened_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const h of histArr.slice(0, 100)) {
          if (h && h.id) {
            insertHist.run(userId, h.id, h.title || 'Inconnu', h.artist || '', h.thumbnail || '', h.duration || '', h.durationSec || 0, h.listenedAt || updatedAt);
          }
        }
      });
      syncTx();
    }
  },

  // Direct fast operations for likes (atomic operation directly on liked_tracks)
  async toggleLike(userId, track) {
    if (!userId || !track || !track.id) return false;
    const now = Date.now();
    let isLiked = false;

    if (isNeon) {
      const existing = await neonSql`SELECT track_id FROM liked_tracks WHERE user_id = ${userId} AND track_id = ${track.id} LIMIT 1`;
      if (existing && existing.length > 0) {
        await neonSql`DELETE FROM liked_tracks WHERE user_id = ${userId} AND track_id = ${track.id}`;
        isLiked = false;
      } else {
        await neonSql`
          INSERT INTO liked_tracks (user_id, track_id, title, artist, thumbnail, duration, duration_sec, added_at)
          VALUES (${userId}, ${track.id}, ${track.title || 'Inconnu'}, ${track.artist || ''}, ${track.thumbnail || ''}, ${track.duration || ''}, ${track.durationSec || 0}, ${now})
        `;
        isLiked = true;
      }
    } else {
      const existing = sqliteDb.prepare('SELECT track_id FROM liked_tracks WHERE user_id = ? AND track_id = ?').get(userId, track.id);
      if (existing) {
        sqliteDb.prepare('DELETE FROM liked_tracks WHERE user_id = ? AND track_id = ?').run(userId, track.id);
        isLiked = false;
      } else {
        sqliteDb.prepare(`
          INSERT INTO liked_tracks (user_id, track_id, title, artist, thumbnail, duration, duration_sec, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(userId, track.id, track.title || 'Inconnu', track.artist || '', track.thumbnail || '', track.duration || '', track.durationSec || 0, now);
        isLiked = true;
      }
    }
    return isLiked;
  },

  // Stream cache
  async getStreamCache(videoId) {
    const now = Date.now();
    if (isNeon) {
      const rows = await neonSql`SELECT stream_url, expires_at FROM stream_cache WHERE video_id = ${videoId} AND expires_at > ${now} LIMIT 1`;
      return rows[0] ? { url: rows[0].stream_url, streamUrl: rows[0].stream_url, expiresAt: Number(rows[0].expires_at) } : null;
    } else {
      const row = sqliteDb.prepare('SELECT stream_url, expires_at FROM stream_cache WHERE video_id = ? AND expires_at > ?').get(videoId, now);
      return row ? { url: row.stream_url, streamUrl: row.stream_url, expiresAt: row.expires_at } : null;
    }
  },

  async setStreamCache(videoId, streamUrl, expiresAt) {
    if (isNeon) {
      await neonSql`
        INSERT INTO stream_cache (video_id, stream_url, expires_at)
        VALUES (${videoId}, ${streamUrl}, ${expiresAt})
        ON CONFLICT (video_id) DO UPDATE SET
          stream_url = EXCLUDED.stream_url,
          expires_at = EXCLUDED.expires_at
      `;
    } else {
      sqliteDb.prepare('INSERT OR REPLACE INTO stream_cache (video_id, stream_url, expires_at) VALUES (?, ?, ?)').run(videoId, streamUrl, expiresAt);
    }
  },

  async deleteStreamCache(videoId) {
    if (isNeon) {
      await neonSql`DELETE FROM stream_cache WHERE video_id = ${videoId}`;
    } else {
      sqliteDb.prepare('DELETE FROM stream_cache WHERE video_id = ?').run(videoId);
    }
  },

  async cleanupExpiredStreamCache(now) {
    if (isNeon) {
      await neonSql`DELETE FROM stream_cache WHERE expires_at <= ${now}`;
    } else {
      sqliteDb.prepare('DELETE FROM stream_cache WHERE expires_at <= ?').run(now);
    }
  },

  async getVideoComments(videoId) {
    if (isNeon) {
      const rows = await neonSql`
        SELECT id, video_id as "videoId", user_id as "userId", author_name as "authorName", author_avatar as "authorAvatar", content, likes, created_at as "createdAt"
        FROM video_comments
        WHERE video_id = ${videoId}
        ORDER BY created_at DESC
        LIMIT 60
      `;
      return rows;
    } else {
      const rows = sqliteDb.prepare(`
        SELECT id, video_id as videoId, user_id as userId, author_name as authorName, author_avatar as authorAvatar, content, likes, created_at as createdAt
        FROM video_comments
        WHERE video_id = ?
        ORDER BY created_at DESC
        LIMIT 60
      `).all(videoId);
      return rows;
    }
  },

  async addVideoComment({ videoId, userId, authorName, authorAvatar, content }) {
    const now = Date.now();
    const avatar = authorAvatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(authorName || 'user')}`;
    if (isNeon) {
      const res = await neonSql`
        INSERT INTO video_comments (video_id, user_id, author_name, author_avatar, content, likes, created_at)
        VALUES (${videoId}, ${userId || null}, ${authorName || 'Utilisateur'}, ${avatar}, ${content}, 0, ${now})
        RETURNING id, video_id as "videoId", user_id as "userId", author_name as "authorName", author_avatar as "authorAvatar", content, likes, created_at as "createdAt"
      `;
      return res[0];
    } else {
      const info = sqliteDb.prepare(`
        INSERT INTO video_comments (video_id, user_id, author_name, author_avatar, content, likes, created_at)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `).run(videoId, userId || null, authorName || 'Utilisateur', avatar, content, now);
      return {
        id: info.lastInsertRowid,
        videoId,
        userId: userId || null,
        authorName: authorName || 'Utilisateur',
        authorAvatar: avatar,
        content,
        likes: 0,
        createdAt: now
      };
    }
  },

  // --- ADMIN & RBAC METHODS ---
  async getAdminStats() {
    if (isNeon) {
      const usersCount = (await neonSql`SELECT COUNT(*)::int as count FROM users`)[0]?.count || 0;
      const streamsCount = (await neonSql`SELECT COUNT(*)::int as count FROM listen_history`)[0]?.count || 0;
      const vibetubeViewsCount = (await neonSql`SELECT COUNT(*)::int as count FROM vibetube_history`)[0]?.count || 0;
      const playlistsCount = (await neonSql`SELECT COUNT(*)::int as count FROM playlists`)[0]?.count || 0;
      return {
        totalUsers: usersCount,
        totalStreams: streamsCount,
        totalVibeTubeViews: vibetubeViewsCount,
        totalPlaylists: playlistsCount
      };
    } else {
      const usersCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
      const streamsCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM listen_history').get()?.count || 0;
      const vibetubeViewsCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM vibetube_history').get()?.count || 0;
      const playlistsCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM playlists').get()?.count || 0;
      return {
        totalUsers: usersCount,
        totalStreams: streamsCount,
        totalVibeTubeViews: vibetubeViewsCount,
        totalPlaylists: playlistsCount
      };
    }
  },

  async getAdminUsers(limit = 100) {
    if (isNeon) {
      const rows = await neonSql`
        SELECT id, username, avatar, role, created_at as "createdAt"
        FROM users
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return rows;
    } else {
      const rows = sqliteDb.prepare(`
        SELECT id, username, avatar, role, created_at as createdAt
        FROM users
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
      return rows;
    }
  },

  async updateAdminUserRole(userId, newRole) {
    const validRoles = ['user', 'vip', 'mod', 'admin'];
    const roleToSet = validRoles.includes(newRole) ? newRole : 'user';
    if (isNeon) {
      await neonSql`UPDATE users SET role = ${roleToSet} WHERE id = ${userId}`;
    } else {
      sqliteDb.prepare('UPDATE users SET role = ? WHERE id = ?').run(roleToSet, userId);
    }
    return roleToSet;
  },

  async addAuditLog(userId, action, target, details = {}, ip = '') {
    const now = Date.now();
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    if (isNeon) {
      await neonSql`
        INSERT INTO audit_logs (user_id, action, target, details, ip, created_at)
        VALUES (${userId || null}, ${action}, ${target || null}, ${detailsStr}::jsonb, ${ip || null}, ${now})
      `;
    } else {
      sqliteDb.prepare(`
        INSERT INTO audit_logs (user_id, action, target, details, ip, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userId || null, action, target || null, detailsStr, ip || null, now);
    }
  },

  async getAuditLogs(limit = 50) {
    if (isNeon) {
      const rows = await neonSql`
        SELECT a.id, a.user_id as "userId", u.username, a.action, a.target, a.details, a.ip, a.created_at as "createdAt"
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT ${limit}
      `;
      return rows;
    } else {
      const rows = sqliteDb.prepare(`
        SELECT a.id, a.user_id as userId, u.username, a.action, a.target, a.details, a.ip, a.created_at as createdAt
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT ?
      `).all(limit);
      return rows;
    }
  }
};

module.exports = db;

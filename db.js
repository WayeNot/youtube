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
  const Database = require('better-sqlite3');
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  sqliteDb = new Database(config.dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  console.log('📁 Utilisation de SQLite local (data/ytm.db)');
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
        CREATE TABLE IF NOT EXISTS user_data (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          favorites JSONB NOT NULL DEFAULT '[]'::jsonb,
          playlists JSONB NOT NULL DEFAULT '[]'::jsonb,
          history JSONB NOT NULL DEFAULT '[]'::jsonb,
          recent_searches JSONB NOT NULL DEFAULT '[]'::jsonb,
          settings JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at BIGINT NOT NULL
        );
      `;

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

      // Create indexes for blazing fast lookups
      await neonSql`CREATE INDEX IF NOT EXISTS idx_liked_user ON liked_tracks(user_id, added_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id, updated_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_pl_tracks ON playlist_tracks(playlist_id, position);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_history_user ON listen_history(user_id, listened_at DESC);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_stream_expires ON stream_cache(expires_at);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);`;
      await neonSql`CREATE INDEX IF NOT EXISTS idx_follows_followed ON user_follows(followed_id);`;

      console.log('✅ Tables relationnelles NeonDB (liked_tracks, playlists, playlist_tracks, history, user_follows) prêtes !');
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

        CREATE TABLE IF NOT EXISTS user_data (
          user_id TEXT PRIMARY KEY,
          favorites TEXT NOT NULL DEFAULT '[]',
          playlists TEXT NOT NULL DEFAULT '[]',
          history TEXT NOT NULL DEFAULT '[]',
          recent_searches TEXT NOT NULL DEFAULT '[]',
          settings TEXT NOT NULL DEFAULT '{}',
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

        CREATE INDEX IF NOT EXISTS idx_liked_user ON liked_tracks(user_id, added_at DESC);
        CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pl_tracks ON playlist_tracks(playlist_id, position);
        CREATE INDEX IF NOT EXISTS idx_history_user ON listen_history(user_id, listened_at DESC);
        CREATE INDEX IF NOT EXISTS idx_stream_expires ON stream_cache(expires_at);
        CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_id);
        CREATE INDEX IF NOT EXISTS idx_follows_followed ON user_follows(followed_id);
      `);

      try {
        sqliteDb.exec('ALTER TABLE users ADD COLUMN is_public INTEGER DEFAULT 1');
      } catch (e) {}
      console.log('✅ Tables relationnelles SQLite prêtes !');
    }
  },

  // Users
  async findUserByUsername(username) {
    if (isNeon) {
      const rows = await neonSql`SELECT id, username, password_hash, avatar, bio, is_public, created_at FROM users WHERE LOWER(username) = LOWER(${username.trim()}) LIMIT 1`;
      return rows[0] || null;
    } else {
      return sqliteDb.prepare('SELECT id, username, password_hash, avatar, bio, is_public, created_at FROM users WHERE username = ?').get(username.trim()) || null;
    }
  },

  async findUserById(id) {
    if (isNeon) {
      const rows = await neonSql`SELECT id, username, avatar, bio, is_public, created_at FROM users WHERE id = ${id} LIMIT 1`;
      return rows[0] || null;
    } else {
      return sqliteDb.prepare('SELECT id, username, avatar, bio, is_public, created_at FROM users WHERE id = ?').get(id) || null;
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
        INSERT INTO user_data (user_id, favorites, playlists, history, recent_searches, settings, updated_at)
        VALUES (${id}, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, ${createdAt})
      `;
    } else {
      sqliteDb.prepare('INSERT INTO users (id, username, password_hash, avatar, bio, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, username.trim(), passwordHash, '', '', createdAt);
      sqliteDb.prepare(`
        INSERT INTO user_data (user_id, favorites, playlists, history, recent_searches, settings, updated_at)
        VALUES (?, '[]', '[]', '[]', '[]', '{}', ?)
      `).run(id, createdAt);
    }
  },

  // User Data: Get all consolidated data
  async getUserData(userId) {
    if (isNeon) {
      const rows = await neonSql`
        SELECT favorites, playlists, history, recent_searches, settings, updated_at
        FROM user_data
        WHERE user_id = ${userId}
        LIMIT 1
      `;
      if (!rows || rows.length === 0) return null;
      const r = rows[0];
      return {
        favorites: typeof r.favorites === 'string' ? JSON.parse(r.favorites) : (r.favorites || []),
        playlists: typeof r.playlists === 'string' ? JSON.parse(r.playlists) : (r.playlists || []),
        history: typeof r.history === 'string' ? JSON.parse(r.history) : (r.history || []),
        recent_searches: typeof r.recent_searches === 'string' ? JSON.parse(r.recent_searches) : (r.recent_searches || []),
        settings: typeof r.settings === 'string' ? JSON.parse(r.settings) : (r.settings || {}),
        updatedAt: Number(r.updated_at)
      };
    } else {
      const row = sqliteDb.prepare('SELECT favorites, playlists, history, recent_searches, settings, updated_at FROM user_data WHERE user_id = ?').get(userId);
      if (!row) return null;
      return {
        favorites: JSON.parse(row.favorites || '[]'),
        playlists: JSON.parse(row.playlists || '[]'),
        history: JSON.parse(row.history || '[]'),
        recent_searches: JSON.parse(row.recent_searches || '[]'),
        settings: JSON.parse(row.settings || '{}'),
        updatedAt: row.updated_at
      };
    }
  },

  // Save User Data: Updates both JSON documents AND structured relational tables
  async saveUserData(userId, { favorites, playlists, history, recent_searches, settings }, updatedAt) {
    const favsArr = Array.isArray(favorites) ? favorites : [];
    const plsArr = Array.isArray(playlists) ? playlists : [];
    const histArr = Array.isArray(history) ? history : [];
    const recArr = Array.isArray(recent_searches) ? recent_searches : [];
    const settObj = settings && typeof settings === 'object' ? settings : {};

    const favsStr = JSON.stringify(favsArr);
    const plsStr = JSON.stringify(plsArr);
    const histStr = JSON.stringify(histArr);
    const recStr = JSON.stringify(recArr);
    const setStr = JSON.stringify(settObj);

    if (isNeon) {
      // 1. Update user_data JSON cache
      await neonSql`
        INSERT INTO user_data (user_id, favorites, playlists, history, recent_searches, settings, updated_at)
        VALUES (${userId}, ${favsStr}::jsonb, ${plsStr}::jsonb, ${histStr}::jsonb, ${recStr}::jsonb, ${setStr}::jsonb, ${updatedAt})
        ON CONFLICT (user_id) DO UPDATE SET
          favorites = EXCLUDED.favorites,
          playlists = EXCLUDED.playlists,
          history = EXCLUDED.history,
          recent_searches = EXCLUDED.recent_searches,
          settings = EXCLUDED.settings,
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
          // Delete playlists no longer present for this user
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

          // Clear existing tracks for this playlist before inserting updated ones
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
              } catch (trackInsertErr) {
                // Ignore transient concurrent track conflict
              }
            }
          }
        }
      } catch (plSyncErr) {
        console.warn('⚠️ Playlist relational sync warning (user_data json is safely preserved):', plSyncErr.message);
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
        // user_data
        sqliteDb.prepare(`
          INSERT INTO user_data (user_id, favorites, playlists, history, recent_searches, settings, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            favorites = excluded.favorites,
            playlists = excluded.playlists,
            history = excluded.history,
            recent_searches = excluded.recent_searches,
            settings = excluded.settings,
            updated_at = excluded.updated_at
        `).run(userId, favsStr, plsStr, histStr, recStr, setStr, updatedAt);

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

  // Direct fast operations for likes
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
      // Re-aggregate favorites in user_data
      const favRows = await neonSql`SELECT track_id as id, title, artist, thumbnail, duration, duration_sec as "durationSec", added_at as "addedAt" FROM liked_tracks WHERE user_id = ${userId} ORDER BY added_at DESC`;
      await neonSql`UPDATE user_data SET favorites = ${JSON.stringify(favRows)}::jsonb, updated_at = ${now} WHERE user_id = ${userId}`;
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
      const favRows = sqliteDb.prepare('SELECT track_id as id, title, artist, thumbnail, duration, duration_sec as durationSec, added_at as addedAt FROM liked_tracks WHERE user_id = ? ORDER BY added_at DESC').all(userId);
      sqliteDb.prepare('UPDATE user_data SET favorites = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(favRows), now, userId);
    }
    return isLiked;
  },

  // Stream cache
  async getStreamCache(videoId) {
    const now = Date.now();
    if (isNeon) {
      const rows = await neonSql`SELECT stream_url, expires_at FROM stream_cache WHERE video_id = ${videoId} AND expires_at > ${now} LIMIT 1`;
      return rows[0] ? { url: rows[0].stream_url, expiresAt: Number(rows[0].expires_at) } : null;
    } else {
      const row = sqliteDb.prepare('SELECT stream_url, expires_at FROM stream_cache WHERE video_id = ? AND expires_at > ?').get(videoId, now);
      return row ? { url: row.stream_url, expiresAt: row.expires_at } : null;
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

  async cleanupExpiredStreamCache(now) {
    if (isNeon) {
      await neonSql`DELETE FROM stream_cache WHERE expires_at <= ${now}`;
    } else {
      sqliteDb.prepare('DELETE FROM stream_cache WHERE expires_at <= ?').run(now);
    }
  }
};

module.exports = db;

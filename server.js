const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { execFile } = require('child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const config = require('./config');
const db = require('./db');

const app = express();
const PORT = config.port;
const YTDLP_PATH = config.ytdlpPath;

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory caches with TTL
const streamCache = new Map(); // id -> { url, expiresAt }
const searchCache = new Map(); // key -> { data, expiresAt }
const relatedCache = new Map(); // id -> { data, expiresAt }
const lyricsCache = new Map(); // key -> { data, expiresAt }
const homeCache = { data: null, expiresAt: 0 };

function getCached(cache, key) {
    const item = cache.get(key);
    if (item && item.expiresAt > Date.now()) {
        return item.data;
    }
    cache.delete(key);
    return null;
}

function setCache(cache, key, data, ttlMs) {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Clean old cache entries every 15 minutes
setInterval(async () => {
    const now = Date.now();
    for (const [k, v] of streamCache.entries()) {
        if (v.expiresAt <= now) streamCache.delete(k);
    }
    for (const [k, v] of searchCache.entries()) {
        if (v.expiresAt <= now) searchCache.delete(k);
    }
    for (const [k, v] of relatedCache.entries()) {
        if (v.expiresAt <= now) relatedCache.delete(k);
    }
    for (const [k, v] of lyricsCache.entries()) {
        if (v.expiresAt <= now) lyricsCache.delete(k);
    }
    try {
        await db.cleanupExpiredStreamCache(now);
    } catch (e) { }
}, 15 * 60 * 1000);

// Helper: Ensure cookies.txt is created from environment variables if present
function syncCookiesFile() {
    const fs = require('fs');
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    try {
        if (process.env.YTDLP_COOKIES_BASE64 && process.env.YTDLP_COOKIES_BASE64.trim()) {
            const decoded = Buffer.from(process.env.YTDLP_COOKIES_BASE64.trim(), 'base64').toString('utf-8');
            if (decoded.length > 20) {
                fs.writeFileSync(cookiesPath, decoded, 'utf-8');
                return true;
            }
        }
        if (process.env.YTDLP_COOKIES && process.env.YTDLP_COOKIES.trim()) {
            fs.writeFileSync(cookiesPath, process.env.YTDLP_COOKIES.trim(), 'utf-8');
            return true;
        }
    } catch (e) {
        console.error('❌ Erreur écriture cookies.txt:', e.message);
    }
    return fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10;
}

// In-flight extraction promises map to avoid duplicate concurrent yt-dlp processes
const inFlightStreams = new Map();

// Helper: Extract audio URL using fast in-memory cache + yt-dlp
// NOTE: Google Video stream URLs are strictly bound to the outgoing IP of the server that resolved them.
// Therefore, we keep the stream cache in memory per-instance to prevent cross-server IP 403 Forbidden errors.
async function getAudioStreamUrl(videoId) {
    const now = Date.now();
    // 1. Check in-memory cache
    const mem = streamCache.get(videoId);
    if (mem && mem.expiresAt > now) {
        return mem.url;
    }

    // 2. Return active in-flight extraction if already solving
    if (inFlightStreams.has(videoId)) {
        return inFlightStreams.get(videoId);
    }

    // 3. Ensure cookies file exists if env variable is set
    const hasCookies = syncCookiesFile();

    const fs = require('fs');
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    const cacheDir = path.join(__dirname, '.yt-dlp-cache');
    const ytdlpArgs = [
        '-g',
        '-f', '251/140/250/ba/b/bestaudio/best',
        '--no-playlist',
        '--no-warnings',
        '--cache-dir', cacheDir,
        '--js-runtimes', `node:${process.execPath}`
    ];

    if (hasCookies) {
        ytdlpArgs.push('--cookies', cookiesPath);
    }

    ytdlpArgs.push('--', `https://www.youtube.com/watch?v=${videoId}`);

    // 4. Extract stream with yt-dlp and deduplicate concurrent calls
    const streamPromise = new Promise((resolve, reject) => {
        execFile(
            YTDLP_PATH,
            ytdlpArgs,
            { timeout: 60000 },
            async (err, stdout, stderr) => {
                inFlightStreams.delete(videoId);
                if (err) {
                    const errMsg = stderr ? stderr.trim() : err.message;
                    console.error(`yt-dlp error for ${videoId}:`, errMsg);
                    return reject(new Error(errMsg || 'Failed to extract audio stream URL'));
                }
                const lines = stdout.trim().split('\n');
                const streamUrl = lines[0]?.trim();
                if (!streamUrl || !streamUrl.startsWith('http')) {
                    return reject(new Error('Invalid audio stream URL returned'));
                }

                const expiresAt = Date.now() + config.cacheTtl.stream;
                // Save to instance in-memory cache
                streamCache.set(videoId, { url: streamUrl, expiresAt });

                resolve(streamUrl);
            }
        );
    });

    inFlightStreams.set(videoId, streamPromise);
    return streamPromise;
}

// Helper: Search via YouTube Innertube WEB API
async function searchInnertube(query) {
    try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.20240401.01.00',
                        hl: 'fr',
                        gl: 'FR',
                    },
                },
                query: query,
            }),
        });

        if (!res.ok) throw new Error(`Innertube HTTP ${res.status}`);
        const data = await res.json();
        const contents =
            data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
                ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents ||
            [];

        const results = [];
        for (const item of contents) {
            const vr = item.videoRenderer;
            if (vr && vr.videoId) {
                const title = vr.title?.runs?.map((r) => r.text).join('') || '';
                const artist =
                    vr.ownerText?.runs?.map((r) => r.text).join('') || 'Artiste inconnu';
                const duration = vr.lengthText?.simpleText || '3:30';
                const views = vr.shortViewCountText?.simpleText || '';
                const thumb =
                    vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                    `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`;

                // Calculate duration in seconds
                const parts = duration.split(':').map(Number);
                let durationSec = 0;
                if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
                else if (parts.length === 3)
                    durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

                results.push({
                    id: vr.videoId,
                    title,
                    artist,
                    duration,
                    durationSec,
                    thumbnail: thumb,
                    views,
                });
            }
        }
        return results;
    } catch (err) {
        console.error('Innertube search failed, falling back to yt-dlp:', err.message);
        return null;
    }
}

// Fallback: Search via yt-dlp flat playlist
function searchYtDlp(query, limit = 20) {
    return new Promise((resolve) => {
        execFile(
            YTDLP_PATH,
            ['--dump-json', '--flat-playlist', '--', `ytsearch${limit}:${query}`],
            { timeout: 15000 },
            (err, stdout) => {
                if (err || !stdout) return resolve([]);
                const results = [];
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        if (item && item.id) {
                            const durSec = item.duration || 0;
                            const mins = Math.floor(durSec / 60);
                            const secs = Math.floor(durSec % 60)
                                .toString()
                                .padStart(2, '0');
                            const durStr = durSec > 0 ? `${mins}:${secs}` : '3:30';
                            results.push({
                                id: item.id,
                                title: item.title || 'Sans titre',
                                artist: item.uploader || item.channel || 'Artiste inconnu',
                                duration: durStr,
                                durationSec: durSec,
                                thumbnail:
                                    item.thumbnails?.slice(-1)[0]?.url ||
                                    `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
                                views: item.view_count
                                    ? `${(item.view_count / 1000000).toFixed(1)} M de vues`
                                    : '',
                            });
                        }
                    } catch (e) { }
                }
                resolve(results);
            }
        );
    });
}

// Main Search Function
async function performSearch(query, limit = 20) {
    const cached = getCached(searchCache, query);
    if (cached) return cached;

    let results = await searchInnertube(query);
    if (!results || results.length === 0) {
        results = await searchYtDlp(query, limit);
    }

    // Cache for 15 minutes
    if (results && results.length > 0) {
        setCache(searchCache, query, results, 15 * 60 * 1000);
    }
    return results || [];
}

// -------------------------------------------------------------
// ROUTES
// -------------------------------------------------------------

// 1. Search API
app.get('/api/search', async (req, res) => {
    const query = (req.query.q || '').trim();
    if (!query) return res.json({ results: [] });

    try {
        const results = await performSearch(query);
        res.json({ results });
    } catch (err) {
        console.error('Search endpoint error:', err);
        res.status(500).json({ error: 'Search failed', results: [] });
    }
});

const artistCache = new Map();

async function findArtistCard(query) {
    if (!query || typeof query !== 'string') return null;
    const clean = query.trim().toLowerCase();
    if (artistCache.has(clean)) {
        const cached = artistCache.get(clean);
        if (cached.expiresAt > Date.now()) return cached.data;
    }

    try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                context: { client: { clientName: 'WEB', clientVersion: '2.20240401.01.00', hl: 'fr', gl: 'FR' } },
                query: query.trim(),
            }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const contents =
            data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
                ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

        for (const c of contents) {
            if (c.officialCardViewModel) {
                const header = c.officialCardViewModel.header?.pageHeaderViewModel;
                const title = header?.title?.dynamicTextViewModel?.text?.content || query;
                const img = header?.image?.contentPreviewImageViewModel?.image?.sources?.[0]?.url;
                const metaRows = header?.metadata?.contentMetadataViewModel?.metadataRows || [];
                const parts = [];
                metaRows.forEach((r) =>
                    r.metadataParts?.forEach((p) => {
                        if (p.text?.content) parts.push(p.text.content);
                    })
                );
                const result = {
                    name: title,
                    avatar: img || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(title)}`,
                    subscribers: parts.join(' • ') || 'Artiste officiel',
                };
                artistCache.set(clean, { data: result, expiresAt: Date.now() + 60 * 60 * 1000 });
                return result;
            }
            if (c.channelRenderer) {
                const cr = c.channelRenderer;
                const title = cr.title?.simpleText || query;
                const img = cr.thumbnail?.thumbnails?.[0]?.url;
                const sub = cr.subscriberCountText?.simpleText || 'Artiste officiel';
                const result = {
                    name: title,
                    avatar: img || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(title)}`,
                    subscribers: sub,
                };
                artistCache.set(clean, { data: result, expiresAt: Date.now() + 60 * 60 * 1000 });
                return result;
            }
        }
    } catch (e) { }
    return null;
}

// 2. Suggestions API (Google / YouTube autocomplete + Detected Artist Entity + Direct Track Previews)
app.get('/api/suggestions', async (req, res) => {
    const query = (req.query.q || '').trim();
    if (!query) return res.json({ suggestions: [], artist: null, tracks: [] });

    try {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(
            query
        )}`;
        const [r, artistCard, quickTracks] = await Promise.all([
            fetch(url),
            query.length >= 2 ? findArtistCard(query) : Promise.resolve(null),
            query.length >= 2 ? searchInnertube(query) : Promise.resolve([])
        ]);
        const data = await r.json();
        const suggestions = Array.isArray(data?.[1]) ? data[1] : [];
        const tracks = Array.isArray(quickTracks) ? quickTracks.slice(0, 4) : [];
        res.json({ suggestions, artist: artistCard, tracks });
    } catch (err) {
        res.json({ suggestions: [], artist: null, tracks: [] });
    }
});

const albumCache = new Map();

async function getArtistBio(artistName) {
    // 1. Try FR Wikipedia direct summary by exact artist name
    try {
        const clean = artistName.replace(/\s+/g, '_');
        const wikiRes = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean)}`, {
            headers: { 'User-Agent': 'YouTubeMusicClone/1.0 (contact@example.com)' },
        });
        if (wikiRes.ok) {
            const wikiData = await wikiRes.json();
            if (wikiData.extract && wikiData.type !== 'disambiguation' && !wikiData.extract.includes('peut faire référence à')) {
                return wikiData.extract;
            }
        }
    } catch (e) { }

    // 2. Try FR Wikipedia search with "${artistName} musicien", then fetch the first result's summary
    try {
        const searchTerm = `${artistName} musicien`;
        const searchRes = await fetch(
            `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&srlimit=1`,
            { headers: { 'User-Agent': 'YouTubeMusicClone/1.0 (contact@example.com)' } }
        );
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            const hits = searchData?.query?.search;
            if (hits && hits.length > 0) {
                const pageTitle = hits[0].title;
                const summaryRes = await fetch(
                    `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`,
                    { headers: { 'User-Agent': 'YouTubeMusicClone/1.0 (contact@example.com)' } }
                );
                if (summaryRes.ok) {
                    const summaryData = await summaryRes.json();
                    if (summaryData.extract && summaryData.type !== 'disambiguation' && !summaryData.extract.includes('peut faire référence à')) {
                        return summaryData.extract;
                    }
                }
            }
        }
    } catch (e) { }

    // 3. French generic fallback message
    return `${artistName} est un artiste de musique incontournable, réunissant une large communauté d'auditeurs et de nombreux succès populaires.`;
}

async function getArtistAlbums(artistName) {
    try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                context: { client: { clientName: 'WEB', clientVersion: '2.20240401.01.00', hl: 'fr', gl: 'FR' } },
                query: `${artistName} album`,
            }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        const items =
            data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
                ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

        const albums = [];
        const seen = new Set();
        for (const it of items) {
            if (it.lockupViewModel && it.lockupViewModel.contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST') {
                const lm = it.lockupViewModel;
                const plId = lm.contentId;
                if (!plId || seen.has(plId)) continue;
                seen.add(plId);
                const metadata = lm.metadata?.lockupMetadataViewModel;
                const rawTitle = metadata?.title?.content || 'Album';
                const metaRows = metadata?.metadata?.contentMetadataViewModel?.metadataRows || [];
                let countText = '';
                metaRows.forEach((r) =>
                    r.metadataParts?.forEach((p) => {
                        if (p.text?.content && (p.text.content.includes('vidéo') || p.text.content.includes('titre'))) {
                            countText = p.text.content;
                        }
                    })
                );
                const img =
                    lm.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.[0]?.url;
                albums.push({
                    id: plId,
                    title: rawTitle
                        .replace(/\s*\(?\s*album\s*complet\s*\)?/gi, '')
                        .replace(/\s*\(?\s*sans\s*clip\s*\)?/gi, '')
                        .replace(/\s*\[?\s*full\s*album\s*\]?/gi, '')
                        .trim(),
                    artist: artistName,
                    year: 'Album',
                    trackCountText: countText || 'Album',
                    thumbnail: img || '/icons/icon.svg',
                });
            }
        }

        if (albums.length > 0) return albums;
    } catch (e) { }

    // Fallback: search tracks with album keyword
    try {
        const fallback = await performSearch(`${artistName} album`, 12);
        return (fallback || []).map((t) => ({
            id: t.id,
            title: t.title.replace(/\(Clip officiel\)/i, '').trim(),
            artist: artistName,
            year: 'Album / Single',
            trackCountText: 'Titre',
            thumbnail: t.thumbnail,
        }));
    } catch (e) {
        return [];
    }
}

// 2b. Full Artist Page API (/api/artist/:name)
app.get('/api/artist/:name', async (req, res) => {
    const name = (req.params.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nom d\'artiste requis' });

    try {
        const [artistCard, bio, topTracks, albums] = await Promise.all([
            findArtistCard(name),
            getArtistBio(name),
            performSearch(`${name} chanson`, 25),
            getArtistAlbums(name),
        ]);

        const artist = {
            name: artistCard?.name || name,
            avatar: artistCard?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
            subscribers: artistCard?.subscribers || 'Artiste officiel',
            bio: bio || `${name} est un artiste musical incontournable.`,
        };

        res.json({
            artist,
            topTracks: topTracks || [],
            albums: albums || [],
        });
    } catch (err) {
        console.error('Artist endpoint error:', err);
        res.status(500).json({ error: 'Erreur lors du chargement de l\'artiste' });
    }
});

// 2c. Album Details API (/api/album/:id)
app.get('/api/album/:id', async (req, res) => {
    const albumId = (req.params.id || '').trim();
    const query = (req.query.q || '').trim();
    if (!albumId && !query) return res.status(400).json({ error: 'Identifiant d\'album requis' });

    const cacheKey = `${albumId}_${query}`.toLowerCase();
    if (albumCache.has(cacheKey)) {
        const cached = albumCache.get(cacheKey);
        if (cached.expiresAt > Date.now()) return res.json(cached.data);
    }

    try {
        // If it's a YouTube Playlist ID (e.g. starts with PL or VL)
        if (albumId && (albumId.startsWith('PL') || albumId.startsWith('VL') || albumId.length > 15)) {
            const cleanPlId = albumId.startsWith('VL') ? albumId.substring(2) : albumId;
            const tracks = await new Promise((resolve) => {
                execFile(
                    YTDLP_PATH,
                    [
                        '--flat-playlist',
                        '-j',
                        '--playlist-end',
                        '50',
                        '--',
                        `https://www.youtube.com/playlist?list=${cleanPlId}`,
                    ],
                    { timeout: 15000 },
                    (err, stdout) => {
                        if (err && !stdout) return resolve([]);
                        const result = [];
                        stdout.trim().split('\n').forEach((line) => {
                            try {
                                const item = JSON.parse(line);
                                const dur = parseInt(item.duration, 10) || 0;
                                const m = Math.floor(dur / 60);
                                const s = (dur % 60).toString().padStart(2, '0');
                                result.push({
                                    id: item.id,
                                    title: item.title,
                                    artist: item.uploader || item.channel || 'Artiste',
                                    duration: item.duration_string || `${m}:${s}`,
                                    durationSec: dur,
                                    thumbnail: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
                                    playlistTitle: item.playlist_title || item.playlist,
                                });
                            } catch (e) { }
                        });
                        resolve(result);
                    }
                );
            });

            if (tracks.length > 0) {
                const totalDurationSec = tracks.reduce((acc, t) => acc + (t.durationSec || 0), 0);
                const totalMins = Math.floor(totalDurationSec / 60);
                const totalHours = Math.floor(totalMins / 60);
                const remMins = totalMins % 60;
                const totalDurationText = totalHours > 0 ? `${totalHours} h ${remMins} min` : `${totalMins} min`;

                const rawTitle = tracks[0].playlistTitle || query || 'Album';
                const cleanTitle = rawTitle.replace(/\s*\(?\s*album\s*complet\s*\)?/gi, '').trim();
                const albumArtist = tracks[0].artist || 'Artiste';

                const albumData = {
                    album: {
                        id: cleanPlId,
                        title: cleanTitle,
                        artist: albumArtist,
                        year: 'Album',
                        thumbnail: tracks[0].thumbnail,
                        trackCount: tracks.length,
                        totalDuration: totalDurationText,
                        totalDurationSec,
                        description: `Album "${cleanTitle}" par ${albumArtist}. Comprend ${tracks.length} titres pour une durée totale d'écoute de ${totalDurationText}.`,
                    },
                    tracks,
                };
                albumCache.set(cacheKey, { data: albumData, expiresAt: Date.now() + 60 * 60 * 1000 });
                return res.json(albumData);
            }
        }

        // Fallback: search tracks for this album
        const searchTarget = query || albumId;
        const searchResults = await performSearch(`${searchTarget}`, 20);
        const validTracks = searchResults || [];
        const totalDurationSec = validTracks.reduce((acc, t) => acc + (t.durationSec || 200), 0);
        const totalMins = Math.floor(totalDurationSec / 60);
        const totalHours = Math.floor(totalMins / 60);
        const remMins = totalMins % 60;
        const totalDurationText = totalHours > 0 ? `${totalHours} h ${remMins} min` : `${totalMins} min`;

        const albumData = {
            album: {
                id: albumId,
                title: searchTarget,
                artist: validTracks[0]?.artist || 'Artiste',
                year: 'Album',
                thumbnail: validTracks[0]?.thumbnail || '/icons/icon.svg',
                trackCount: validTracks.length,
                totalDuration: totalDurationText,
                totalDurationSec,
                description: `Album "${searchTarget}". Comprend ${validTracks.length} titres pour une durée totale d'écoute de ${totalDurationText}.`,
            },
            tracks: validTracks,
        };
        albumCache.set(cacheKey, { data: albumData, expiresAt: Date.now() + 60 * 60 * 1000 });
        res.json(albumData);
    } catch (err) {
        console.error('Album API error:', err);
        res.status(500).json({ error: 'Erreur lors du chargement de l\'album' });
    }
});

// Diagnostic endpoint to check environment & yt-dlp binary
app.get('/api/debug', (req, res) => {
    syncCookiesFile();
    const fs = require('fs');
    const exists = fs.existsSync(YTDLP_PATH);
    let size = 0;
    if (exists) {
        try { size = fs.statSync(YTDLP_PATH).size; } catch (e) { }
    }
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    const hasCookies = fs.existsSync(cookiesPath) && fs.statSync(cookiesPath).size > 10;
    const cookiesSize = hasCookies ? fs.statSync(cookiesPath).size : 0;
    const { execFile } = require('child_process');
    execFile(YTDLP_PATH, ['--version'], { timeout: 4000 }, (err, stdout, stderr) => {
        res.json({
            ytdlpPath: YTDLP_PATH,
            exists,
            size,
            hasCookies,
            cookiesSize,
            hasEnvCookies: !!(process.env.YTDLP_COOKIES && process.env.YTDLP_COOKIES.trim()),
            hasBase64Cookies: !!(process.env.YTDLP_COOKIES_BASE64 && process.env.YTDLP_COOKIES_BASE64.trim()),
            version: stdout ? stdout.trim() : null,
            err: err ? err.message : null,
            stderr: stderr ? stderr.trim() : null,
            platform: process.platform,
            arch: process.arch
        });
    });
});


// 3. Audio Streaming Proxy with HTTP Range Support
app.get('/api/stream/:id', async (req, res) => {
    const videoId = req.params.id;
    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
        return res.status(400).send('Invalid video ID');
    }

    try {
        if (req.query.retry === '1') {
            streamCache.delete(videoId);
        }
        const streamUrl = await getAudioStreamUrl(videoId);

        // Standard headers to prevent Google Video 403 Forbidden
        const fetchHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity;q=1, *;q=0',
            'Connection': 'keep-alive'
        };
        if (req.headers.range) {
            fetchHeaders['Range'] = req.headers.range;
        }

        const abortController = new AbortController();
        req.on('close', () => {
            abortController.abort();
        });

        const upstreamRes = await fetch(streamUrl, {
            headers: fetchHeaders,
            signal: abortController.signal,
        });

        if (!upstreamRes.ok && upstreamRes.status !== 206) {
            // Stream URL might have expired or been rejected, invalidate cache and retry once
            streamCache.delete(videoId);
            console.warn(`Upstream error ${upstreamRes.status} for ${videoId}, retrying with fresh URL...`);
            const freshUrl = await getAudioStreamUrl(videoId);
            const freshUpstream = await fetch(freshUrl, {
                headers: fetchHeaders,
                signal: abortController.signal,
            });

            res.status(freshUpstream.status);
            ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
                const val = freshUpstream.headers.get(h);
                if (val) res.setHeader(h, val);
            });
            res.setHeader('Cache-Control', 'public, max-age=3600');

            const { Readable } = require('stream');
            if (freshUpstream.body) {
                Readable.fromWeb(freshUpstream.body).pipe(res);
            } else {
                res.end();
            }
            return;
        }

        // Forward response status (200 or 206) and headers
        res.status(upstreamRes.status);
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach((h) => {
            const val = upstreamRes.headers.get(h);
            if (val) res.setHeader(h, val);
        });
        res.setHeader('Cache-Control', 'public, max-age=3600');

        const { Readable } = require('stream');
        if (upstreamRes.body) {
            Readable.fromWeb(upstreamRes.body).pipe(res);
        } else {
            res.end();
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error(`Streaming error for ${videoId}:`, err.message);
        if (!res.headersSent) {
            res.status(500).send('Streaming error');
        }
    }
});

// Helper: pump web stream to express response
async function pumpStream(reader, res) {
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();
    } catch (e) {
        // Client disconnect or abort
    }
}

// 4. Stream URL directly (in case client wants direct link)
app.get('/api/stream-url/:id', async (req, res) => {
    const videoId = req.params.id;
    try {
        const url = await getAudioStreamUrl(videoId);
        res.json({ url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Download track as Audio file
app.get('/api/download/:id', async (req, res) => {
    const videoId = req.params.id;
    const rawTitle = req.query.title || 'audio';
    const cleanTitle = rawTitle.replace(/[^\w\s-]/gi, '').trim().substring(0, 80) || 'track';

    try {
        const streamUrl = await getAudioStreamUrl(videoId);
        const upstream = await fetch(streamUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
                'Accept': '*/*'
            }
        });
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(cleanTitle)}.m4a"`);
        res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mp4');

        const reader = upstream.body.getReader();
        await pumpStream(reader, res);
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).send('Download failed');
    }
});

// 6. Up next / Related Songs for Continuous Autoplay Radio
app.get('/api/related/:id', async (req, res) => {
    const videoId = req.params.id;
    const cached = getCached(relatedCache, videoId);
    if (cached) return res.json({ results: cached });

    try {
        const r = await fetch('https://www.youtube.com/youtubei/v1/next', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'WEB',
                        clientVersion: '2.20240401.01.00',
                        hl: 'fr',
                        gl: 'FR',
                    },
                },
                videoId: videoId,
            }),
        });

        const data = await r.json();
        const items =
            data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];

        const results = [];
        for (const item of items) {
            if (item.lockupViewModel) {
                const lm = item.lockupViewModel;
                const id = lm.contentId;
                const title =
                    lm.metadata?.lockupMetadataViewModel?.title?.content ||
                    lm.rendererContext?.accessibilityContext?.label ||
                    '';
                if (id && /^[\w-]{11}$/.test(id) && id !== videoId) {
                    results.push({
                        id,
                        title: title.replace(/\d+\s*(minutes?|secondes?|min).*$/i, '').trim(),
                        artist: 'YouTube Music',
                        duration: '3:30',
                        durationSec: 210,
                        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                        views: '',
                    });
                }
            } else if (item.compactVideoRenderer) {
                const cv = item.compactVideoRenderer;
                if (cv.videoId && cv.videoId !== videoId) {
                    results.push({
                        id: cv.videoId,
                        title: cv.title?.simpleText || cv.title?.runs?.[0]?.text || '',
                        artist: cv.shortBylineText?.runs?.[0]?.text || 'Artiste',
                        duration: cv.lengthText?.simpleText || '3:30',
                        durationSec: 210,
                        thumbnail:
                            cv.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
                            `https://i.ytimg.com/vi/${cv.videoId}/hqdefault.jpg`,
                        views: cv.viewCountText?.simpleText || '',
                    });
                }
            }
        }

        if (results.length > 0) {
            setCache(relatedCache, videoId, results, 30 * 60 * 1000);
        }
        res.json({ results });
    } catch (err) {
        console.error('Related error:', err.message);
        res.json({ results: [] });
    }
});

// 7. Synchronized & Plain Lyrics (lrclib.net)
app.get('/api/lyrics', async (req, res) => {
    const { title, artist } = req.query;
    if (!title) return res.json({ lyrics: null });

    // Clean title: remove "feat", "(Official Video)", "[Clip Officiel]", etc.
    const cleanTitle = title
        .replace(/\s*[\(\[](official\s*video|clip\s*officiel|audio|lyrics|paroles|remastered|hq|4k)[\)\]]/gi, '')
        .replace(/ft\..*$/i, '')
        .replace(/feat\..*$/i, '')
        .trim();

    const cacheKey = `${artist || ''}_${cleanTitle}`.toLowerCase();
    const cached = getCached(lyricsCache, cacheKey);
    if (cached) return res.json(cached);

    try {
        let url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}`;
        if (artist) url += `&artist_name=${encodeURIComponent(artist)}`;

        let response = await fetch(url, { headers: { 'User-Agent': 'YouTubeMusicHomemade/1.0' } });
        let data = null;

        if (response.ok) {
            data = await response.json();
        } else {
            // Try search endpoint
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${artist || ''}`)}`;
            const sRes = await fetch(searchUrl, { headers: { 'User-Agent': 'YouTubeMusicHomemade/1.0' } });
            if (sRes.ok) {
                const list = await sRes.json();
                if (Array.isArray(list) && list.length > 0) {
                    data = list[0];
                }
            }
        }

        if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
            return res.json({ lyrics: null });
        }

        // Parse synchronized lyrics into [{ time: seconds, text: "..." }]
        let parsedSynced = [];
        if (data.syncedLyrics) {
            const lines = data.syncedLyrics.split('\n');
            const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
            for (const line of lines) {
                const match = timeRegex.exec(line);
                if (match) {
                    const mins = parseInt(match[1], 10);
                    const secs = parseInt(match[2], 10);
                    const ms = parseFloat('0.' + match[3]);
                    const time = mins * 60 + secs + ms;
                    const text = match[4].trim();
                    if (text) {
                        parsedSynced.push({ time, text });
                    }
                }
            }
        }

        const result = {
            syncedLyrics: parsedSynced.length > 0 ? parsedSynced : null,
            plainLyrics: data.plainLyrics || null,
            trackName: data.trackName || cleanTitle,
            artistName: data.artistName || artist,
        };

        setCache(lyricsCache, cacheKey, result, 24 * 60 * 60 * 1000);
        res.json(result);
    } catch (err) {
        console.error('Lyrics error:', err.message);
        res.json({ lyrics: null });
    }
});

// 8. Explore & Home categories
const HOME_SECTIONS = [
    { id: 'random', title: '🎲 Sons Aléatoires & Découvertes', queries: ['hits 2026', 'daft punk', 'the weeknd', 'jul', 'billie eilish', 'dua lipa', 'travis scott', 'queen'] },
    { id: 'trending', title: '🔥 Tendances & Hits du Moment', query: 'hits du moment france' },
    { id: 'french_rap', title: '🇫🇷 Rap & Urbain Français', query: 'rap francais hits' },
    { id: 'pop', title: '✨ Pop & Hits Internationaux', query: 'top pop hits music' },
    { id: 'electro', title: '⚡ Électro, House & Dance', query: 'electro dance music' },
    { id: 'chill', title: '☕ Chill, Lofi & Détente', query: 'lofi hip hop chill beats' },
    { id: 'rock', title: '🎸 Rock & Légendes', query: 'best rock classics' },
    { id: 'workout', title: '💪 Motivation & Sport', query: 'workout music edm' },
];

// Rich fallback items so Home is NEVER empty
const POPULAR_STARTERS = [
    { id: 'FGBhQbmPwH8', title: 'Daft Punk - One More Time', artist: 'Daft Punk', duration: '5:22', durationSec: 322, thumbnail: 'https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg' },
    { id: 'XXYlFuWEuKI', title: 'The Weeknd - Save Your Tears', artist: 'The Weeknd', duration: '4:09', durationSec: 249, thumbnail: 'https://i.ytimg.com/vi/XXYlFuWEuKI/hqdefault.jpg' },
    { id: 'a5uQMwRMHcs', title: 'Daft Punk - Instant Crush ft. Julian Casablancas', artist: 'Daft Punk', duration: '5:40', durationSec: 340, thumbnail: 'https://i.ytimg.com/vi/a5uQMwRMHcs/hqdefault.jpg' },
    { id: 'gAjR4_CbPpQ', title: 'Daft Punk - Harder, Better, Faster, Stronger', artist: 'Daft Punk', duration: '3:43', durationSec: 223, thumbnail: 'https://i.ytimg.com/vi/gAjR4_CbPpQ/hqdefault.jpg' },
    { id: '2DwR_0wp95g', title: "Naza (ft. JUL) - Pas d'problèmes", artist: 'NAZA', duration: '2:50', durationSec: 170, thumbnail: 'https://i.ytimg.com/vi/2DwR_0wp95g/hqdefault.jpg' },
    { id: 'M4ZoCHID9GI', title: 'The Weeknd - Call Out My Name', artist: 'The Weeknd', duration: '3:59', durationSec: 239, thumbnail: 'https://i.ytimg.com/vi/M4ZoCHID9GI/hqdefault.jpg' },
    { id: 'fJ9rUzIMcZQ', title: 'Queen - Bohemian Rhapsody', artist: 'Queen', duration: '5:59', durationSec: 359, thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg' },
    { id: '4NRXx6U8ABQ', title: 'The Weeknd - Blinding Lights', artist: 'The Weeknd', duration: '3:20', durationSec: 200, thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg' },
    { id: 'hT_nvWreIhg', title: 'OneRepublic - Counting Stars', artist: 'OneRepublic', duration: '4:17', durationSec: 257, thumbnail: 'https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg' },
    { id: 'k2qgadSvNyU', title: 'Dua Lipa - New Rules', artist: 'Dua Lipa', duration: '3:45', durationSec: 225, thumbnail: 'https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg' },
    { id: 'jfKfPfyJRdk', title: 'Lofi Girl - Relaxing beats to study/chill', artist: 'Lofi Girl', duration: '3:30', durationSec: 210, thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg' },
    { id: '09R8_2nJtjg', title: 'Maroon 5 - Sugar', artist: 'Maroon 5', duration: '3:55', durationSec: 235, thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg' }
];

app.get('/api/home', async (req, res) => {
    if (homeCache.data && homeCache.expiresAt > Date.now()) {
        return res.json(homeCache.data);
    }

    try {
        const sections = await Promise.all(
            HOME_SECTIONS.map(async (sec) => {
                try {
                    let q = sec.query;
                    if (sec.queries) {
                        // Pick random query from pool
                        q = sec.queries[Math.floor(Math.random() * sec.queries.length)];
                    }
                    let items = await performSearch(q, 10);
                    if (!items || items.length === 0) {
                        items = POPULAR_STARTERS.sort(() => 0.5 - Math.random()).slice(0, 8);
                    }
                    return {
                        id: sec.id,
                        title: sec.title,
                        items: items.slice(0, 10),
                    };
                } catch (e) {
                    return {
                        id: sec.id,
                        title: sec.title,
                        items: POPULAR_STARTERS.slice(0, 6),
                    };
                }
            })
        );

        const payload = { sections };
        homeCache.data = payload;
        homeCache.expiresAt = Date.now() + 15 * 60 * 1000; // 15 min cache
        res.json(payload);
    } catch (err) {
        console.error('Home load error:', err);
        res.json({
            sections: [
                { id: 'starters', title: '🎲 Sélection Musicale', items: POPULAR_STARTERS }
            ]
        });
    }
});

// Endpoint for quick random mix / shuffle
app.get('/api/random', async (req, res) => {
    const randomQueries = [
        'top hits world', 'rap francais 2026', 'daft punk classics',
        'the weeknd hits', 'french touch electro', 'pop viral hits',
        'lofi beats relax', 'rock legends 90s', 'jul hits'
    ];
    const q = randomQueries[Math.floor(Math.random() * randomQueries.length)];
    try {
        const results = await performSearch(q, 15);
        res.json({ results: results.sort(() => 0.5 - Math.random()) });
    } catch (e) {
        res.json({ results: POPULAR_STARTERS.sort(() => 0.5 - Math.random()) });
    }
});

// 9. Single Video Details
app.get('/api/info/:id', async (req, res) => {
    const videoId = req.params.id;
    try {
        execFile(
            YTDLP_PATH,
            ['-j', '--no-playlist', '--', `https://www.youtube.com/watch?v=${videoId}`],
            { timeout: 10000 },
            (err, stdout) => {
                if (err || !stdout) {
                    return res.json({
                        id: videoId,
                        title: 'Musique',
                        artist: 'YouTube Music',
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        duration: '3:30',
                    });
                }
                try {
                    const info = JSON.parse(stdout);
                    res.json({
                        id: videoId,
                        title: info.title,
                        artist: info.uploader || info.channel,
                        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        duration: info.duration_string || '3:30',
                        durationSec: info.duration || 210,
                        viewCount: info.view_count,
                        description: info.description,
                    });
                } catch (e) {
                    res.json({
                        id: videoId,
                        title: 'Musique',
                        artist: 'Artiste inconnu',
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    });
                }
            }
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Import Playlist (YouTube / YouTube Music URL or Text Tracklist)
app.post('/api/playlist/import', async (req, res) => {
    const { url, text, name } = req.body || {};

    // Case A: Import from URL (Spotify, Deezer, YouTube / YouTube Music)
    if (url && typeof url === 'string') {
        const cleanUrl = url.trim();

        // 1. Spotify Playlist Import
        const spotifyMatch = cleanUrl.match(/open\.spotify\.com\/(?:embed\/)?playlist\/([a-zA-Z0-9]+)/);
        if (spotifyMatch) {
            const spotifyId = spotifyMatch[1];
            try {
                const spotifyRes = await fetch(`https://open.spotify.com/embed/playlist/${spotifyId}`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                    }
                });
                if (!spotifyRes.ok) throw new Error('Impossible d\'accéder à la playlist Spotify.');
                const html = await spotifyRes.text();
                const jsonMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                if (!jsonMatch) throw new Error('Structure Spotify non reconnue.');
                const data = JSON.parse(jsonMatch[1]);
                const entity = data.props?.pageProps?.state?.data?.entity;
                const spotifyTitle = entity?.title || name || 'Playlist Spotify';
                const trackList = entity?.trackList || [];

                if (trackList.length === 0) {
                    return res.status(400).json({ error: 'Cette playlist Spotify ne contient aucun titre public.' });
                }

                // Resolve tracks on YouTube (concurrency limited to 5 at a time)
                const itemsToResolve = trackList.slice(0, 50);
                const tracks = [];
                for (const item of itemsToResolve) {
                    const artist = item.subtitle || '';
                    const title = item.title || '';
                    const query = `${artist} - ${title}`.trim();
                    try {
                        const found = await performSearch(query, 1);
                        if (found && found.length > 0) {
                            tracks.push(found[0]);
                        }
                    } catch (e) { }
                }

                return res.json({
                    name: spotifyTitle,
                    tracks,
                    count: tracks.length
                });
            } catch (err) {
                console.error('Spotify import error:', err);
                return res.status(400).json({ error: `Erreur import Spotify: ${err.message}` });
            }
        }

        // 2. Deezer Playlist Import
        const deezerMatch = cleanUrl.match(/deezer\.com\/(?:\w{2}\/)?playlist\/(\d+)/) || cleanUrl.match(/deezer\.page\.link\/[a-zA-Z0-9]+/);
        if (deezerMatch) {
            try {
                let playlistId = deezerMatch[1];
                if (!playlistId) {
                    // Follow redirect for short links
                    const headRes = await fetch(cleanUrl, { redirect: 'follow' });
                    const resolvedMatch = headRes.url.match(/playlist\/(\d+)/);
                    if (resolvedMatch) playlistId = resolvedMatch[1];
                }

                if (!playlistId) throw new Error('Identifiant Deezer introuvable.');

                const dzRes = await fetch(`https://api.deezer.com/playlist/${playlistId}`);
                if (!dzRes.ok) throw new Error('Impossible d\'accéder à l\'API Deezer.');
                const dzData = await dzRes.json();
                if (dzData.error) throw new Error(dzData.error.message || 'Erreur API Deezer');

                const deezerTitle = dzData.title || name || 'Playlist Deezer';
                const dzTracks = dzData.tracks?.data || [];
                if (dzTracks.length === 0) {
                    return res.status(400).json({ error: 'Cette playlist Deezer ne contient aucun morceau.' });
                }

                // Resolve tracks on YouTube (first 50 tracks)
                const itemsToResolve = dzTracks.slice(0, 50);
                const tracks = [];
                for (const item of itemsToResolve) {
                    const artist = item.artist?.name || '';
                    const title = item.title || '';
                    const query = `${artist} - ${title}`.trim();
                    try {
                        const found = await performSearch(query, 1);
                        if (found && found.length > 0) {
                            tracks.push(found[0]);
                        }
                    } catch (e) { }
                }

                return res.json({
                    name: deezerTitle,
                    tracks,
                    count: tracks.length
                });
            } catch (err) {
                console.error('Deezer import error:', err);
                return res.status(400).json({ error: `Erreur import Deezer: ${err.message}` });
            }
        }

        // 3. YouTube / YouTube Music URL (via yt-dlp)
        execFile(
            YTDLP_PATH,
            ['--flat-playlist', '-j', '--playlist-end', '80', '--', cleanUrl],
            { timeout: 35000 },
            (err, stdout) => {
                if (err || !stdout) {
                    return res.status(400).json({ error: 'Impossible de récupérer cette playlist. Vérifiez le lien.' });
                }
                const tracks = [];
                let detectedPlaylistTitle = name || 'Playlist Importée';
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    try {
                        const item = JSON.parse(line);
                        if (item.playlist_title && (!name || name === 'Playlist Importée')) {
                            detectedPlaylistTitle = item.playlist_title;
                        }
                        if (item.id) {
                            const durSec = item.duration || 0;
                            const mins = Math.floor(durSec / 60);
                            const secs = Math.floor(durSec % 60).toString().padStart(2, '0');
                            tracks.push({
                                id: item.id,
                                title: item.title || 'Titre',
                                artist: item.uploader || item.channel || item.creator || 'Artiste',
                                duration: durSec > 0 ? `${mins}:${secs}` : (item.duration_string || '3:30'),
                                durationSec: durSec || 210,
                                thumbnail: item.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
                            });
                        }
                    } catch (e) { }
                }
                res.json({
                    name: detectedPlaylistTitle,
                    tracks,
                    count: tracks.length
                });
            }
        );
        return;
    }

    // Case B: Import from Text Tracklist (e.g. pasted from Spotify, Deezer, Apple Music)
    if (text && typeof text === 'string') {
        const lines = text
            .split('\n')
            .map(l => l.replace(/^\d+[\.\)\-\s]+/, '').trim())
            .filter(l => l.length > 2)
            .slice(0, 35);

        const tracks = [];
        for (const query of lines) {
            try {
                const found = await performSearch(query, 1);
                if (found && found.length > 0) {
                    tracks.push(found[0]);
                }
            } catch (e) { }
        }

        return res.json({
            name: name || 'Playlist Importée',
            tracks,
            count: tracks.length
        });
    }

    res.status(400).json({ error: 'URL ou liste de titres requise' });
});

// -------------------------------------------------------------
// AUTHENTICATION & CLOUD SYNC ROUTES
// -------------------------------------------------------------

// Auth Middleware
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Non authentifié (mode invité)' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
    }
}

// 1. Register User (Username + Password only)
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 2) {
        return res.status(400).json({ error: 'Le nom d\'utilisateur doit contenir au moins 2 caractères' });
    }
    if (password.length < 3) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 3 caractères' });
    }

    try {
        const existing = await db.findUserByUsername(cleanUsername);
        if (existing) {
            return res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà pris' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        const userId = crypto.randomUUID();
        const now = Date.now();

        await db.createUser(userId, cleanUsername, passwordHash, now);

        const token = jwt.sign({ id: userId, username: cleanUsername }, config.jwtSecret, { expiresIn: '30d' });

        res.json({
            success: true,
            token,
            user: { id: userId, username: cleanUsername },
            data: { favorites: [], playlists: [], history: [], recent_searches: [], settings: {} }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Erreur lors de la création du compte' });
    }
});

// 2. Login User
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
    }
    const cleanUsername = username.trim();

    try {
        const user = await db.findUserByUsername(cleanUsername);
        if (!user) {
            return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Nom d\'utilisateur ou mot de passe incorrect' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, { expiresIn: '30d' });

        // Fetch user saved data
        const userData = (await db.getUserData(user.id)) || {
            favorites: [],
            playlists: [],
            history: [],
            recent_searches: [],
            settings: {}
        };

        res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username },
            data: userData
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Erreur lors de la connexion' });
    }
});

// 3. Get Current User Profile & Sync Data
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await db.findUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }
        const userData = (await db.getUserData(user.id)) || {
            favorites: [],
            playlists: [],
            history: [],
            recent_searches: [],
            settings: {}
        };
        res.json({
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar || '',
                bio: user.bio || '',
                createdAt: Number(user.created_at)
            },
            data: userData
        });
    } catch (err) {
        console.error('Me error:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 4. Cloud Sync User Data (Auto save favorites, playlists, history, settings)
app.post('/api/user/sync', authMiddleware, async (req, res) => {
    const { favorites, playlists, history, recent_searches, settings } = req.body || {};
    const userId = req.user.id;
    const now = Date.now();

    try {
        await db.saveUserData(
            userId,
            { favorites, playlists, history, recent_searches, settings },
            now
        );

        res.json({ success: true, syncedAt: now });
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ error: 'Erreur lors de la synchronisation' });
    }
});

// 5. Instant Like / Unlike Atomic Endpoint
app.post('/api/user/like', authMiddleware, async (req, res) => {
    const { track } = req.body || {};
    if (!track || !track.id) {
        return res.status(400).json({ error: 'Track information required' });
    }

    try {
        const isLiked = await db.toggleLike(req.user.id, track);
        res.json({ success: true, isLiked, trackId: track.id });
    } catch (err) {
        console.error('Like toggle error:', err);
        res.status(500).json({ error: 'Erreur lors de la mise à jour des favoris' });
    }
});

// 6. Public User Profile endpoint (/user/:username data)
app.get(['/api/user/profile/:username', '/api/user/:username'], async (req, res) => {
    const username = req.params.username;
    if (!username) return res.status(400).json({ error: 'Username required' });

    // Optional token for viewer
    let viewerUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, config.jwtSecret);
            if (decoded) viewerUserId = decoded.id;
        } catch (e) { }
    }

    try {
        const profile = await db.getPublicProfile(username, viewerUserId);
        if (!profile) return res.status(404).json({ error: 'Utilisateur introuvable' });
        res.json({ profile });
    } catch (err) {
        console.error('Public profile error:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 6b. User Playlist endpoint (/user/:username/playlist/:playlistName)
app.get('/api/user/:username/playlist/:playlistName', async (req, res) => {
    const { username, playlistName } = req.params;
    if (!username || !playlistName) return res.status(400).json({ error: 'Paramètres manquants' });

    let viewerUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, config.jwtSecret);
            if (decoded) viewerUserId = decoded.id;
        } catch (e) { }
    }

    try {
        const result = await db.getPlaylistByUserAndName(username, playlistName, viewerUserId);
        if (result.error) {
            if (result.isPrivate) return res.status(403).json({ error: result.error, isPrivate: true });
            return res.status(404).json({ error: result.error });
        }
        res.json(result);
    } catch (err) {
        console.error('User playlist error:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 7. Update User Profile Settings (avatar, bio, etc.)
app.put('/api/user/profile', authMiddleware, async (req, res) => {
    let { avatar, bio } = req.body || {};
    avatar = typeof avatar === 'string' ? avatar.trim() : '';
    bio = typeof bio === 'string' ? bio.trim() : '';

    // Security & input bounds
    if (bio.length > 500) {
        return res.status(400).json({ error: 'La biographie ne doit pas dépasser 500 caractères.' });
    }
    if (avatar.length > 250000) {
        return res.status(400).json({ error: 'L\'image de l\'avatar est trop volumineuse (max ~180 Ko compressée).' });
    }
    if (avatar && !/^https?:\/\//i.test(avatar) && !avatar.startsWith('data:image/')) {
        return res.status(400).json({ error: 'L\'URL de l\'avatar doit commencer par http:// ou https://' });
    }

    try {
        await db.updateUserProfile(req.user.id, { avatar, bio });
        const user = await db.findUserById(req.user.id);
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                bio: user.bio,
                createdAt: Number(user.created_at)
            }
        });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Erreur lors de la mise à jour du profil' });
    }
});

// Single Page Application Fallback
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ensure yt-dlp binary and cookies are present
async function ensureYtDlp() {
    const fs = require('fs');
    const binDir = path.dirname(YTDLP_PATH);
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }
    if (!fs.existsSync(YTDLP_PATH)) {
        console.log('⬇️ yt-dlp introuvable, téléchargement automatique en cours...');
        try {
            const { execSync } = require('child_process');
            execSync(`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${YTDLP_PATH}" && chmod a+rx "${YTDLP_PATH}"`);
            console.log('✅ yt-dlp installé avec succès !');
        } catch (e) {
            console.error('❌ Échec du téléchargement de yt-dlp:', e.message);
        }
    }

    // Ensure cookies are synchronized on startup
    const hasCookies = syncCookiesFile();
    if (hasCookies) {
        const cookiesPath = path.join(__dirname, 'cookies.txt');
        console.log('🍪 Cookies YouTube actifs ! Taille:', fs.statSync(cookiesPath).size, 'octets');
    } else {
        console.log('⚠️ Aucun cookie YouTube détecté (YTDLP_COOKIES ou YTDLP_COOKIES_BASE64 non défini)');
    }
}

// Initialize Database schema and start server
(async () => {
    try {
        await ensureYtDlp();
        await db.initSchema();
    } catch (e) {
        console.error('Erreur initialisation DB:', e);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🎵 Serveur YouTube Music prêt sur http://localhost:${PORT}`);
        if (db.isNeon()) {
            console.log('☁️ Base de données: NeonDB (PostgreSQL Serverless)');
        } else {
            console.log('📁 Base de données: SQLite Local (data/ytm.db)');
        }
    });
})();

module.exports = app;
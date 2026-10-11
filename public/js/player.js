// Full Audio Player Engine with Background Playback, MediaSession, Queue, Radio & Equalizer
class PlayerEngine {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';

    this.currentTrack = null;
    this.queue = [];
    this.originalQueue = [];
    this.currentIndex = -1;

    this.isPlaying = false;
    this.isLoading = false;
    this.repeatMode = 'off'; // 'off', 'all', 'one'
    this.isShuffled = false;
    this.autoplayRadio = true;

    // Sleep Timer
    this.sleepTimerId = null;
    this.sleepTimerEndAt = null;
    this.sleepTimerInterval = null;
    this.sleepAtTrackEnd = false;

    // Web Audio Equalizer
    this.audioCtx = null;
    this.sourceNode = null;
    this.eqFilters = [];
    this.isEqInitialized = false;

    this.initAudioListeners();
    this.initMediaSession();
    this.loadSavedSettings();
  }

  loadSavedSettings() {
    const s = Storage.getSettings();
    const savedVol = localStorage.getItem('ytm_volume');
    const savedMuted = localStorage.getItem('ytm_muted');
    if (savedVol !== null && !isNaN(parseFloat(savedVol))) {
      this.audio.volume = Math.max(0, Math.min(1, parseFloat(savedVol)));
    } else {
      this.audio.volume = typeof s.volume === 'number' ? s.volume : 0.9;
    }
    if (savedMuted !== null) {
      this.audio.muted = savedMuted === 'true';
    } else if (typeof s.muted === 'boolean') {
      this.audio.muted = s.muted;
    }
    this.repeatMode = s.repeat || 'off';
    this.autoplayRadio = s.autoplayRadio !== undefined ? s.autoplayRadio : true;
    this.crossfadeDuration = typeof s.crossfade === 'number' ? s.crossfade : 4; // default 4 seconds crossfade
    if (s.playbackRate) this.audio.playbackRate = s.playbackRate;
  }

  initAudioListeners() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.isLoading = false;
      this.initEqualizer();
      this.updateMediaSessionState();
      this.emit('playback_change', { isPlaying: true, isLoading: false });
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updateMediaSessionState();
      this.emit('playback_change', { isPlaying: false, isLoading: false });
    });

    this.audio.addEventListener('waiting', () => {
      this.isLoading = true;
      this.emit('playback_change', { isPlaying: this.isPlaying, isLoading: true });
    });

    this.audio.addEventListener('playing', () => {
      this.isLoading = false;
      this.emit('playback_change', { isPlaying: true, isLoading: false });
    });

    this.audio.addEventListener('timeupdate', () => {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || this.currentTrack?.durationSec || 0;
      this.emit('time_update', { currentTime: cur, duration: dur });
      if (window.LyricsManager) {
        window.LyricsManager.updateTime(cur);
      }

      // Smooth Crossfade & Gapless Transition:
      // If crossfade is enabled (3-8s) and we are close to song end, trigger playNext smoothly
      if (this.crossfadeDuration > 0 && dur > 25 && dur - cur <= this.crossfadeDuration && !this._isCrossfading && this.isPlaying) {
        this._isCrossfading = true;
        // Fade out slightly
        const targetVol = this.audio.volume;
        const fadeInterval = setInterval(() => {
          if (this.audio.volume > 0.15) {
            this.audio.volume = Math.max(0.05, this.audio.volume - 0.15);
          } else {
            clearInterval(fadeInterval);
          }
        }, 300);

        setTimeout(() => {
          clearInterval(fadeInterval);
          this._isCrossfading = false;
          this.setVolume(targetVol);
          this.playNext();
        }, this.crossfadeDuration * 1000);
      }
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio element error, attempting recovery:', e);
      this.isLoading = false;
      // Retry stream via proxy with cache-buster if proxy had an issue
      if (this.currentTrack && !this.audio.src.includes('retry=1')) {
        this.fallbackDirectStream(this.currentTrack);
      } else {
        this.emit('error', { message: 'Impossible de lire ce titre' });
      }
    });
  }

  // MediaSession API for Background Playback & Lockscreen controls
  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
      navigator.mediaSession.setActionHandler('stop', () => this.pause());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) this.seek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        this.seek(Math.max(0, this.audio.currentTime - (details.seekOffset || 10)));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        this.seek(Math.min(this.audio.duration || 0, this.audio.currentTime + (details.seekOffset || 10)));
      });
    } catch (e) {
      console.warn('MediaSession init error:', e);
    }
  }

  updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !this.currentTrack) return;

    const t = this.currentTrack;
    const thumbUrl = t.thumbnail || `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || 'YouTube Music',
      artist: t.artist || 'Artiste inconnu',
      album: 'YouTube Music Maison',
      artwork: [
        { src: thumbUrl, sizes: '96x96', type: 'image/jpeg' },
        { src: thumbUrl, sizes: '128x128', type: 'image/jpeg' },
        { src: thumbUrl, sizes: '192x192', type: 'image/jpeg' },
        { src: thumbUrl, sizes: '256x256', type: 'image/jpeg' },
        { src: thumbUrl, sizes: '512x512', type: 'image/jpeg' }
      ]
    });
    this.updateMediaSessionState();
  }

  updateMediaSessionState() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = this.isPlaying ? 'playing' : 'paused';

    if (this.audio.duration && !isNaN(this.audio.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          playbackRate: this.audio.playbackRate,
          position: this.audio.currentTime
        });
      } catch (e) {}
    }
  }

  // Web Audio Equalizer (5-Band) & Analyser for Visualizer
  initEqualizer() {
    if (this.isEqInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioCtx = new AudioContext();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      const freqs = [60, 230, 910, 3600, 14000];
      const types = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      let prevNode = this.sourceNode;
      this.eqFilters = freqs.map((freq, idx) => {
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = types[idx];
        filter.frequency.value = freq;
        filter.gain.value = 0;
        prevNode.connect(filter);
        prevNode = filter;
        return filter;
      });

      // DynamicsCompressorNode for Smart Volume Normalization / ReplayGain
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-24, this.audioCtx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.audioCtx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.audioCtx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.audioCtx.currentTime);

      // Connect filters through compressor to destination
      prevNode.connect(this.compressor);
      this.compressor.connect(this.audioCtx.destination);
      this.isEqInitialized = true;
    } catch (e) {
      console.warn('Equalizer/Normalizer initialization error:', e);
    }
  }

  setEqBand(bandIndex, gainValue) {
    this.initEqualizer();
    if (this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.value = gainValue;
    }
  }

  applyEqPreset(presetName) {
    this.initEqualizer();
    const presets = {
      flat: [0, 0, 0, 0, 0],
      bass_boost: [6, 4, 1, 0, 0],
      treble_boost: [0, 0, 1, 4, 6],
      vocal: [-2, 1, 4, 3, -1],
      rock: [4, 2, -1, 2, 4],
      electronic: [5, 3, 0, 2, 4]
    };
    const gains = presets[presetName] || presets.flat;
    gains.forEach((g, i) => this.setEqBand(i, g));
    Storage.saveSetting('eqPreset', presetName);
  }

  // Playback Methods
  async playTrack(track, newQueue = null, explicitIndex = null) {
    if (!track || !track.id) return;

    this.isLoading = true;
    this.prefetchedNext = false;
    this.currentTrack = track;

    // Check if new queue provided
    if (newQueue && Array.isArray(newQueue)) {
      // Deduplicate newQueue by track id
      const seen = new Set();
      const deduped = [];
      newQueue.forEach(t => {
        if (t && t.id && !seen.has(t.id)) {
          seen.add(t.id);
          deduped.push(t);
        }
      });
      this.queue = deduped.length > 0 ? deduped : [...newQueue];
      this.originalQueue = [...this.queue];
      this.currentIndex = this.queue.findIndex(t => t.id === track.id);
      if (this.currentIndex === -1) {
        this.queue.unshift(track);
        this.currentIndex = 0;
      }
    } else if (explicitIndex !== null && typeof explicitIndex === 'number') {
      this.currentIndex = explicitIndex;
    } else {
      // If song not in queue, add it
      const existingIdx = this.queue.findIndex(t => t.id === track.id);
      if (existingIdx >= 0) {
        this.currentIndex = existingIdx;
      } else {
        this.queue.splice(this.currentIndex + 1, 0, track);
        this.currentIndex = this.currentIndex + 1;
      }
    }

    Storage.addToHistory(track);
    Storage.addRecentSearch(track);
    this.emit('track_change', { track: this.currentTrack, index: this.currentIndex });
    this.updateMediaSessionMetadata();

    // Check if track is cached in IndexedDB offline vault
    try {
      const offlineItem = await Storage.getTrackOffline(track.id);
      if (offlineItem && offlineItem.audioBlob) {
        const blobUrl = URL.createObjectURL(offlineItem.audioBlob);
        this.audio.src = blobUrl;
      } else {
        const streamUrl = API.getStreamUrl(track.id);
        this.audio.preload = 'auto';
        this.audio.src = streamUrl;
      }
    } catch (e) {
      const streamUrl = API.getStreamUrl(track.id);
      this.audio.preload = 'auto';
      this.audio.src = streamUrl;
    }

    try {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      await this.audio.play();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Audio play request failed:', err);
      }
    }
  }

  async fallbackDirectStream(track) {
    try {
      // Retry via backend proxy with cache busting so server extracts a fresh stream URL
      const retryUrl = `${API.getStreamUrl(track.id)}?retry=1&t=${Date.now()}`;
      this.audio.src = retryUrl;
      await this.audio.play();
    } catch (e) {
      console.error('Fallback recovery failed:', e);
      this.emit('error', { message: 'Impossible de lire ce titre' });
    }
  }

  prefetchNextTrack() {
    this.prefetchedNext = true;
    const nextTrack = this.queue[this.currentIndex + 1];
    if (nextTrack) {
      API.prefetch(nextTrack.id);
    }
  }

  async play() {
    if (!this.currentTrack) {
      if (this.queue.length > 0) {
        return this.playTrack(this.queue[0]);
      }
      if (window.App) {
        return window.App.playRandom();
      }
    }
    try {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      await this.audio.play();
    } catch (e) {}
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(seconds) {
    if (isNaN(seconds)) return;
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 99999));
    this.updateMediaSessionState();
  }

  playNext() {
    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
      return;
    }

    if (this.currentIndex < this.queue.length - 1) {
      const nextIdx = this.currentIndex + 1;
      this.playTrack(this.queue[nextIdx], null, nextIdx);
    } else {
      // Reached end of queue
      if (this.repeatMode === 'all' && this.queue.length > 0) {
        this.playTrack(this.queue[0], null, 0);
      } else if (this.autoplayRadio && this.currentTrack) {
        this.fetchRadioRecommendations();
      } else {
        this.pause();
        this.seek(0);
      }
    }
  }

  playPrevious() {
    // If played more than 3 seconds, replay current song
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }

    if (this.currentIndex > 0) {
      const prevIdx = this.currentIndex - 1;
      this.playTrack(this.queue[prevIdx], null, prevIdx);
    } else {
      this.seek(0);
    }
  }

  handleTrackEnded() {
    if (this.sleepAtTrackEnd) {
      this.pause();
      this.cancelSleepTimer();
      this.emit('sleep_timer_ended');
      return;
    }

    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
    } else {
      this.playNext();
    }
  }

  async fetchRadioRecommendations() {
    if (!this.currentTrack) return;
    try {
      this.emit('radio_loading', { track: this.currentTrack });
      let candidates = await API.getRelated(this.currentTrack.id);

      // Fallback: If no direct related tracks found, search for similar artist radio
      if (!candidates || candidates.length === 0) {
        const query = `${this.currentTrack.artist || ''} mix radio hits`.trim();
        const searchResults = await API.search(query, 'songs');
        candidates = searchResults.songs || [];
      }

      if (candidates && candidates.length > 0) {
        // Filter out songs already played or in queue
        const existingIds = new Set(this.queue.map(t => t.id));
        const newTracks = candidates.filter(t => !existingIds.has(t.id));
        if (newTracks.length > 0) {
          const nextSongs = newTracks.slice(0, 5);
          this.queue.push(...nextSongs);
          this.currentIndex++;
          this.emit('queue_change', { queue: this.queue, isRadioInfinite: true });
          this.playTrack(this.queue[this.currentIndex]);
          return;
        }
      }
    } catch (e) {
      console.warn('Radio autoplay error:', e);
    }
    this.pause();
  }

  // Queue manipulation
  addToQueue(track) {
    if (!track) return;
    this.queue.push(track);
    this.emit('queue_change', { queue: this.queue });
  }

  playNextInQueue(track) {
    if (!track) return;
    this.queue.splice(this.currentIndex + 1, 0, track);
    this.emit('queue_change', { queue: this.queue });
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      if (this.queue.length > 0) {
        this.playTrack(this.queue[Math.min(index, this.queue.length - 1)]);
      } else {
        this.pause();
        this.currentTrack = null;
      }
    }
    this.emit('queue_change', { queue: this.queue });
  }

  clearQueue() {
    if (this.currentTrack) {
      this.queue = [this.currentTrack];
      this.currentIndex = 0;
    } else {
      this.queue = [];
      this.currentIndex = -1;
    }
    this.emit('queue_change', { queue: this.queue });
  }

  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    if (this.isShuffled) {
      this.originalQueue = [...this.queue];
      const current = this.currentTrack;
      const rest = this.queue.filter(t => t.id !== current?.id);
      // Fisher-Yates shuffle
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      this.queue = current ? [current, ...rest] : rest;
      this.currentIndex = current ? 0 : -1;
    } else {
      this.queue = [...this.originalQueue];
      if (this.currentTrack) {
        this.currentIndex = this.queue.findIndex(t => t.id === this.currentTrack.id);
      }
    }
    Storage.saveSetting('shuffle', this.isShuffled);
    this.emit('queue_change', { queue: this.queue, isShuffled: this.isShuffled });
    return this.isShuffled;
  }

  cycleRepeatMode() {
    const modes = ['off', 'all', 'one'];
    const nextIdx = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.repeatMode = modes[nextIdx];
    this.audio.loop = this.repeatMode === 'one';
    Storage.saveSetting('repeat', this.repeatMode);
    this.emit('repeat_change', { mode: this.repeatMode });
    return this.repeatMode;
  }

  setVolume(vol) {
    const val = Math.max(0, Math.min(1, vol));
    this.audio.volume = val;
    this.audio.muted = false;
    try {
      localStorage.setItem('ytm_volume', val.toString());
      localStorage.setItem('ytm_muted', 'false');
    } catch (e) {}
    Storage.saveSetting('volume', val);
    Storage.saveSetting('muted', false);
    this.emit('volume_change', { volume: val, muted: false });
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    try {
      localStorage.setItem('ytm_muted', this.audio.muted ? 'true' : 'false');
    } catch (e) {}
    Storage.saveSetting('muted', this.audio.muted);
    this.emit('volume_change', { volume: this.audio.volume, muted: this.audio.muted });
    return this.audio.muted;
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = rate;
    Storage.saveSetting('playbackRate', rate);
    this.emit('rate_change', { rate });
  }

  // Sleep Timer
  setSleepTimer(minutes) {
    this.cancelSleepTimer();
    if (minutes === 'end_of_track') {
      this.sleepAtTrackEnd = true;
      this.emit('sleep_timer_set', { type: 'end_of_track' });
      return;
    }

    const ms = minutes * 60 * 1000;
    this.sleepTimerEndAt = Date.now() + ms;
    this.sleepTimerId = setTimeout(() => {
      this.pause();
      this.cancelSleepTimer();
      this.emit('sleep_timer_ended');
    }, ms);

    this.sleepTimerInterval = setInterval(() => {
      const remainingMs = Math.max(0, this.sleepTimerEndAt - Date.now());
      this.emit('sleep_timer_tick', { remainingSeconds: Math.ceil(remainingMs / 1000) });
    }, 1000);

    this.emit('sleep_timer_set', { type: 'minutes', minutes });
  }

  cancelSleepTimer() {
    if (this.sleepTimerId) clearTimeout(this.sleepTimerId);
    if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
    this.sleepTimerId = null;
    this.sleepTimerEndAt = null;
    this.sleepTimerInterval = null;
    this.sleepAtTrackEnd = false;
    this.emit('sleep_timer_cancelled');
  }

  // Events dispatcher
  emit(eventName, detail = {}) {
    window.dispatchEvent(new CustomEvent(`player_${eventName}`, { detail }));
  }
}

window.Player = new PlayerEngine();

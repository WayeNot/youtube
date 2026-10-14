// Full Audio Player Engine with Background Playback, MediaSession, Queue, Radio & Equalizer

// Helper: Detect mobile devices (iOS / Android) where Web Audio breaks background playback
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && !window.MSStream);
};

class PlayerEngine {
  constructor() {
    // Attach to existing DOM audio element or create and attach for rock-solid mobile background & lockscreen persistence
    this.audio = document.getElementById('ytm-main-audio');
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.id = 'ytm-main-audio';
      this.audio.style.position = 'fixed';
      this.audio.style.top = '-9999px';
      this.audio.style.left = '-9999px';
      this.audio.style.width = '1px';
      this.audio.style.height = '1px';
      this.audio.style.opacity = '0';
      this.audio.style.pointerEvents = 'none';
      const attachAudio = () => {
        if (document.body && !document.getElementById('ytm-main-audio')) {
          document.body.appendChild(this.audio);
        }
      };
      if (document.body) attachAudio();
      else document.addEventListener('DOMContentLoaded', attachAudio);
    }
    this.audio.preload = 'auto';
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');
    this.audio.setAttribute('x-webkit-airplay', 'allow');

    this.currentTrack = null;
    this.queue = [];
    this.originalQueue = [];
    this.currentIndex = -1;

    this.isPlaying = false;
    this.isLoading = false;
    this.repeatMode = 'off'; // 'off', 'all', 'one'
    this.isShuffled = false;
    this.autoplayRadio = true;

    // Predictive Pre-buffering & Background Cache
    this.preloadAudio = new Audio();
    this.preloadAudio.preload = 'auto';
    this.preloadedTrackId = null;
    this.preloadedNextAudio = false;

    // Web Audio Equalizer (used on Desktop for audio processing)
    this.audioCtx = null;
    this.sourceNode = null;
    this.eqFilters = [];
    this.isEqInitialized = false;

    this.initAudioListeners();
    this.initMediaSession();
    this.loadSavedSettings();

    // Silent audio data URI for mobile audio pipeline activation (44-byte minimal silent WAV)
    const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    this._audioUnlocked = false;

    // Mobile & Desktop audio gesture unlock: primes the HTML5 audio pipeline on the very first touch
    const unlockUserGesture = () => {
      if (!this._audioUnlocked && !this.isPlaying && !this.currentTrack) {
        try {
          this.audio.src = SILENT_WAV;
          const p = this.audio.play();
          if (p !== undefined) {
            p.then(() => {
              this.audio.pause();
              this.audio.currentTime = 0;
              this._audioUnlocked = true;
            }).catch(() => {});
          }
        } catch (_) {}
      } else {
        this._audioUnlocked = true;
      }

      if (!isMobileDevice()) {
        const s = Storage.getSettings();
        if (s.eqPreset && s.eqPreset !== 'flat') {
          this.initEqualizer();
          if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
          }
        }
      }
    };
    window.addEventListener('touchstart', unlockUserGesture, { passive: true });
    window.addEventListener('touchend', unlockUserGesture, { passive: true });
    window.addEventListener('click', unlockUserGesture, { passive: true });
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
    this._lastVolume = this.audio.volume > 0.05 ? this.audio.volume : 0.9;
    this.repeatMode = s.repeat || 'off';
    this.autoplayRadio = s.autoplayRadio !== undefined ? s.autoplayRadio : true;
    this.crossfadeDuration = typeof s.crossfade === 'number' ? s.crossfade : 4; // default 4 seconds crossfade
    if (s.playbackRate) this.audio.playbackRate = s.playbackRate;
  }

  initAudioListeners() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.isLoading = false;
      this.updateMediaSessionState();
      this.emit('playback_change', { isPlaying: true, isLoading: false });
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updateMediaSessionState();
      this.emit('playback_change', { isPlaying: false, isLoading: false });
    });

    this.audio.addEventListener('loadedmetadata', () => {
      const dur = this.audio.duration;
      if (dur && !isNaN(dur) && dur > 0) {
        this._currentDuration = dur;
        this.emit('time_update', { currentTime: this.audio.currentTime || 0, duration: dur });
      }
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

      // Last.fm Scrobble: trigger once at 50% of track (or 4 minutes)
      if (dur > 30 && (cur >= dur * 0.5 || cur >= 240) && !this._lastFmScrobbled && this.currentTrack) {
        this._lastFmScrobbled = true;
        const lfm = window.Storage?.getLastFmConfig ? window.Storage.getLastFmConfig() : null;
        if (lfm && lfm.enabled && lfm.username) {
          if (window.App?.showToast) {
            window.App.showToast(`Scrobblé sur Last.fm (${lfm.username}) : ${this.currentTrack.title} 🎧`);
          }
        }
      }

      // Predictive Pre-buffering: at 65% of track (or 30s remaining), buffer next track silently
      if (dur > 20 && ((cur / dur >= 0.65) || (dur - cur <= 30)) && !this.preloadedNextAudio) {
        this.preloadedNextAudio = true;
        this.bufferNextTrack();
      }

      // Smooth Crossfade & Gapless Transition:
      // If crossfade is enabled (3-8s) and we are close to song end, trigger playNext smoothly
      if (this.crossfadeDuration > 0 && dur > 25 && dur - cur <= this.crossfadeDuration && !this._isCrossfading && this.isPlaying) {
        this._isCrossfading = true;
        // Fade out slightly
        const targetVol = this.volume !== undefined ? this.volume : (this.audio.volume || 1);
        const fadeInterval = setInterval(() => {
          if (this.audio.volume > 0.15) {
            this.audio.volume = Math.max(0.05, this.audio.volume - 0.15);
          } else {
            clearInterval(fadeInterval);
          }
        }, 300);

        if (this._crossfadeTimeout) clearTimeout(this._crossfadeTimeout);
        this._crossfadeTimeout = setTimeout(() => {
          clearInterval(fadeInterval);
          this._crossfadeTimeout = null;
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
      // Guarantee only ONE fallback attempt per track to prevent infinite loops
      if (this.currentTrack && !this._recoveryAttempted) {
        this._recoveryAttempted = true;
        this.fallbackDirectStream(this.currentTrack);
      } else {
        this.emit('error', { message: 'Impossible de lire ce titre' });
      }
    });

    // Ensure MediaSession & continuous audio streaming when app is backgrounded (e.g. user opens Waze or locks screen)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.isPlaying && this.audio) {
          this.updateMediaSessionState();
          // Keep audio stream active if not paused by the user
          if (this.audio.paused && !this._userPaused) {
            this.audio.play().catch(() => {});
          }
        }
      } else {
        this.updateMediaSessionState();
      }
    });

    window.addEventListener('pagehide', () => {
      if (this.isPlaying) {
        this.updateMediaSessionState();
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

  // Web Audio Equalizer (5-Band), 3D Convolver Reverb & Analyser (Desktop only)
  initEqualizer() {
    if (this.isEqInitialized || this.sourceNode || isMobileDevice()) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioCtx = new AudioContext();
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      // Attach visualizer analyser directly to source node
      try {
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.8;
        this.sourceNode.connect(this.analyser);
      } catch (ae) {}

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

      // ConvolverNode for 3D Spatial Reverb & Acoustics
      this.convolver = this.audioCtx.createConvolver();
      this.convolverGain = this.audioCtx.createGain();
      this.convolverGain.gain.setValueAtTime(0, this.audioCtx.currentTime); // Wet level (0 = dry)

      this.dryGain = this.audioCtx.createGain();
      this.dryGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime); // Dry level

      // GainNode for universal volume & mute control (required on iOS/Mobile & Web Audio graph)
      this.gainNode = this.audioCtx.createGain();
      const currentVol = this.audio.muted ? 0 : (this.audio.volume ?? 1);
      this.gainNode.gain.setValueAtTime(currentVol, this.audioCtx.currentTime);

      // Connect filters through compressor
      prevNode.connect(this.compressor);

      // Split into Dry and Wet (Convolver) paths
      this.compressor.connect(this.dryGain);
      this.compressor.connect(this.convolver);
      this.convolver.connect(this.convolverGain);

      // Sum Dry and Wet into Master GainNode
      this.dryGain.connect(this.gainNode);
      this.convolverGain.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      const unlockAudioCtx = () => {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      };
      document.addEventListener('touchstart', unlockAudioCtx, { passive: true });
      document.addEventListener('touchend', unlockAudioCtx, { passive: true });
      document.addEventListener('click', unlockAudioCtx, { passive: true });

      this.isEqInitialized = true;
    } catch (e) {
      console.warn('Equalizer/Normalizer initialization error:', e);
    }
  }

  generateReverbImpulse(durationSec = 2.0, decay = 2.0) {
    if (!this.audioCtx) return null;
    try {
      const rate = this.audioCtx.sampleRate;
      const length = Math.floor(rate * durationSec);
      const impulse = this.audioCtx.createBuffer(2, length, rate);
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          const t = i / length;
          const env = Math.pow(1 - t, decay);
          data[i] = ((Math.random() * 2) - 1) * env;
        }
      }
      return impulse;
    } catch (e) {
      console.warn('Impulse generation error:', e);
      return null;
    }
  }

  setSpatialReverb(durationSec = 0, decay = 2.0, dryLevel = 1.0, wetLevel = 0) {
    if (isMobileDevice()) return;
    this.initEqualizer();
    if (!this.convolver || !this.convolverGain || !this.dryGain || !this.audioCtx) return;
    try {
      if (wetLevel > 0 && durationSec > 0) {
        const buf = this.generateReverbImpulse(durationSec, decay);
        if (buf) this.convolver.buffer = buf;
        this.convolverGain.gain.setValueAtTime(wetLevel, this.audioCtx.currentTime);
        this.dryGain.gain.setValueAtTime(dryLevel, this.audioCtx.currentTime);
      } else {
        this.convolverGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        this.dryGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      }
    } catch (e) {
      console.warn('Spatial reverb setup error:', e);
    }
  }

  setEqBand(bandIndex, gainValue) {
    if (isMobileDevice()) return;
    this.initEqualizer();
    if (this.eqFilters && this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.value = gainValue;
    }
  }

  applyEqPreset(presetName) {
    if (isMobileDevice()) {
      Storage.saveSetting('eqPreset', presetName);
      return;
    }
    this.initEqualizer();
    const presets = {
      flat: [0, 0, 0, 0, 0],
      bass_boost: [6, 4, 1, 0, 0],
      mega_bass: [12, 7, 2, -1, 0], // Ultra Bass Boost with deep low-end sub
      treble_boost: [0, 0, 1, 4, 6],
      vocal: [-2, 1, 4, 3, -1],
      rock: [4, 2, -1, 2, 4],
      electronic: [5, 3, 0, 2, 4],
      club_3d: [6, 3, 1, 3, 5], // Club 3D with immersive spatial acoustic reverb
      acoustic_salon: [2, 1, 4, 3, 2] // Warm acoustique salon ambience
    };
    const gains = presets[presetName] || presets.flat;
    gains.forEach((g, i) => this.setEqBand(i, g));

    if (presetName === 'club_3d') {
      this.setSpatialReverb(2.0, 1.8, 0.82, 0.38);
    } else if (presetName === 'acoustic_salon') {
      this.setSpatialReverb(2.6, 2.5, 0.8, 0.42);
    } else {
      this.setSpatialReverb(0, 0, 1.0, 0);
    }

    Storage.saveSetting('eqPreset', presetName);
  }

  parseDurationSec(dur) {
    if (typeof dur === 'number' && !isNaN(dur) && dur > 0) return dur;
    if (typeof dur === 'string') {
      const parts = dur.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return parts[0] * 60 + parts[1];
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 210;
  }

  // Playback Methods
  playTrack(track, newQueue = null, explicitIndex = null) {
    if (!track || !track.id) return;

    if (this._crossfadeTimeout) {
      clearTimeout(this._crossfadeTimeout);
      this._crossfadeTimeout = null;
    }
    this._isCrossfading = false;

    this.isLoading = true;
    this.prefetchedNext = false;
    this._recoveryAttempted = false;
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

    // Reveal bottom music player bar only now that a track has started (unless in VibeTube)
    if (!window.App || window.App.currentAppMode !== 'vibetube') {
      const desktopBar = document.getElementById('desktop-player-bar');
      const mobileMini = document.getElementById('mobile-mini-player');
      if (desktopBar) desktopBar.classList.remove('hidden');
      if (mobileMini) mobileMini.classList.remove('hidden');
    }

    this.emit('track_change', { track: this.currentTrack, index: this.currentIndex });
    this.updateMediaSessionMetadata();

    this.preloadedNextAudio = false;

    if (this._usingDirectAudio && this.directAudio) {
      this._usingDirectAudio = false;
      try {
        this.directAudio.pause();
        this.directAudio.removeAttribute('src');
      } catch (e) {}
    }

    if (this._usingYtEmbed) {
      this._usingYtEmbed = false;
      if (this._ytEmbedTimer) clearInterval(this._ytEmbedTimer);
      const iframe = document.getElementById('yt-fallback-iframe');
      if (iframe) iframe.src = 'about:blank';
    }

    // Immediately reset progress & timeline synchronously so scrubber resets to 0:00 without delay
    const initialDuration = this.parseDurationSec(track.durationSec || track.duration);
    this._currentDuration = initialDuration;
    this.emit('time_update', { currentTime: 0, duration: initialDuration });

    // Set audio source synchronously (from memory cache if offline, else stream URL)
    const offlineItem = Storage.getTrackOfflineSync ? Storage.getTrackOfflineSync(track.id) : null;
    if (offlineItem && offlineItem.audioBlob) {
      this.audio.src = URL.createObjectURL(offlineItem.audioBlob);
    } else {
      this.audio.preload = 'auto';
      this.audio.src = API.getStreamUrl(track.id);
    }
    try {
      this.audio.currentTime = 0;
    } catch (e) {}

    // Unlock Web Audio only if equalizer was already initialized on desktop
    if (!isMobileDevice() && this.isEqInitialized && this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    this._userPaused = false;
    this.audio.muted = false;
    if (this.audio.volume <= 0.05) this.audio.volume = this._lastVolume || 0.9;

    // Play immediately in the synchronous user gesture tick (vital for Mobile Safari & Android Chrome)
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isPlaying = true;
          this.isLoading = false;
          this.updateMediaSessionState();
          this.emit('playback_change', { isPlaying: true, isLoading: false });
        })
        .catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('Audio play request failed, arming gesture retry:', err);
            const unlockAndPlay = () => {
              window.removeEventListener('click', unlockAndPlay);
              window.removeEventListener('touchend', unlockAndPlay);
              if (!isMobileDevice() && this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => {});
              }
              this.audio.play().catch(() => {});
            };
            window.addEventListener('click', unlockAndPlay, { once: true });
            window.addEventListener('touchend', unlockAndPlay, { once: true });
          }
        });
    }

    // Background check in case offline cache needs async fetch
    if (!offlineItem && Storage.getTrackOffline) {
      Storage.getTrackOffline(track.id).then(item => {
        if (item && item.audioBlob && this.currentTrack?.id === track.id) {
          const currentCur = this.audio.currentTime;
          const wasPlaying = !this.audio.paused;
          this.audio.src = URL.createObjectURL(item.audioBlob);
          this.audio.currentTime = currentCur;
          if (wasPlaying) this.audio.play().catch(() => {});
        }
      }).catch(() => {});
    }

    // Proactive background pre-warming of next upcoming tracks in queue
    if (this._prefetchTimer) clearTimeout(this._prefetchTimer);
    this._prefetchTimer = setTimeout(() => {
      this.prefetchNextTrack();
    }, 1500);
  }

  async fallbackDirectStream(track) {
    if (!track || !track.id) return;
    try {
      // 1. Direct CDN streaming fallback: fetch fresh direct audio stream URL from /api/stream-url/:id
      const res = await fetch(`/api/stream-url/${track.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.url) {
          console.log('⚡ Basculement sur le flux direct CDN audio haute vitesse:', track.id);
          // If Web Audio Equalizer is active, direct googlevideo.com on this.audio will be muted by CORS.
          // Use directAudio (unattached to createMediaElementSource) to guarantee sound!
          if (this.isEqInitialized || this.sourceNode) {
            this.playViaDirectAudio(data.url, track);
            return;
          }
          this.audio.src = data.url;
          this.audio.currentTime = 0;
          this.audio.load();
          await this.audio.play();
          this.isPlaying = true;
          this.isLoading = false;
          this.updateMediaSessionState();
          this.emit('playback_change', { isPlaying: true, isLoading: false });
          return;
        }
      }
    } catch (e) {
      console.warn('Fallback direct CDN stream error:', e);
    }

    // 2. High-availability audio/embed fallback when direct stream cannot be extracted (e.g. Premium-only tracks)
    try {
      this.playViaYouTubeEmbed(track);
      return;
    } catch (e) {
      console.warn('YouTube embed fallback error:', e);
    }

    this.emit('error', { message: 'Impossible de lire ce titre' });
  }

  playViaDirectAudio(url, track) {
    try {
      this.audio.pause();
      this.audio.removeAttribute('src');
    } catch (e) {}

    if (!this.directAudio) {
      this.directAudio = new Audio();
      this.directAudio.id = 'ytm-direct-audio';
      this.directAudio.preload = 'auto';
      this.directAudio.setAttribute('playsinline', 'true');
      this.directAudio.setAttribute('webkit-playsinline', 'true');
      this.directAudio.setAttribute('x-webkit-airplay', 'allow');
      document.body.appendChild(this.directAudio);

      this.directAudio.addEventListener('timeupdate', () => {
        if (this._usingDirectAudio) {
          const cur = this.directAudio.currentTime || 0;
          const dur = this.directAudio.duration || this.currentTrack?.durationSec || 0;
          this.emit('time_update', { currentTime: cur, duration: dur });
          if (window.LyricsManager) window.LyricsManager.updateTime(cur);
        }
      });
      this.directAudio.addEventListener('ended', () => {
        if (this._usingDirectAudio) this.handleTrackEnded();
      });
      this.directAudio.addEventListener('play', () => {
        if (this._usingDirectAudio) {
          this.isPlaying = true;
          this.isLoading = false;
          this.updateMediaSessionState();
          this.emit('playback_change', { isPlaying: true, isLoading: false });
          this.emit('play', { track: this.currentTrack });
        }
      });
      this.directAudio.addEventListener('pause', () => {
        if (this._usingDirectAudio && this._userPaused) {
          this.isPlaying = false;
          this.isLoading = false;
          this.emit('playback_change', { isPlaying: false, isLoading: false });
          this.emit('pause', { track: this.currentTrack });
        }
      });
      this.directAudio.addEventListener('error', () => {
        if (this._usingDirectAudio) {
          console.warn('Direct audio fallback failed, falling back to YouTube Embed');
          this._usingDirectAudio = false;
          this.playViaYouTubeEmbed(this.currentTrack);
        }
      });
    }

    this._usingDirectAudio = true;
    this.directAudio.volume = this.volume !== undefined ? this.volume : (this.audio.volume || 0.9);
    this.directAudio.src = url;
    this.directAudio.currentTime = 0;
    this.directAudio.load();
    const p = this.directAudio.play();
    if (p !== undefined) {
      p.then(() => {
        this.isPlaying = true;
        this.isLoading = false;
        this.updateMediaSessionState();
        this.emit('playback_change', { isPlaying: true, isLoading: false });
        this.emit('play', { track: this.currentTrack });
      }).catch(err => {
        console.warn('Direct audio play failed:', err);
        this.playViaYouTubeEmbed(track);
      });
    }
  }

  playViaYouTubeEmbed(track) {
    if (!track || !track.id) return;
    console.log('⚡ Basculement automatique sur le moteur haute disponibilité pour:', track.id);

    try {
      this.audio.pause();
      this.audio.src = '';
    } catch (e) {}

    let iframe = document.getElementById('yt-fallback-iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'yt-fallback-iframe';
      iframe.style.position = 'fixed';
      iframe.style.bottom = '10px';
      iframe.style.right = '10px';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.opacity = '0.001';
      iframe.style.pointerEvents = 'none';
      iframe.style.zIndex = '99999';
      iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
      document.body.appendChild(iframe);

      window.addEventListener('message', (e) => {
        try {
          const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (data && (data.event === 'onReady' || data.event === 'initialDelivery')) {
            iframe.contentWindow?.postMessage('{"event":"command","func":"unMute","args":""}', '*');
            iframe.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*');
            iframe.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
          }
          if (data && data.event === 'onStateChange') {
            if (data.info === 0) {
              this.handleTrackEnded();
            } else if (data.info === 1) {
              this.isPlaying = true;
              this.isLoading = false;
              this.emit('playback_change', { isPlaying: true, isLoading: false });
              this.emit('play', { track: this.currentTrack });
            } else if (data.info === 2) {
              this.isPlaying = false;
              this.isLoading = false;
              this.emit('playback_change', { isPlaying: false, isLoading: false });
              this.emit('pause', { track: this.currentTrack });
            }
          }
        } catch (err) {}
      });
    }

    this._usingYtEmbed = true;
    this.isPlaying = true;
    this.isLoading = false;
    this._currentEmbedTime = 0;
    this._currentDuration = track.durationSec || 200;

    // Load iframe with JS API enabled and un-muted autoplay
    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.postMessage('{"event":"command","func":"unMute","args":""}', '*');
          iframe.contentWindow?.postMessage('{"event":"command","func":"setVolume","args":[100]}', '*');
          iframe.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        } catch (e) {}
      }, 300);
    };
    iframe.src = `https://www.youtube.com/embed/${track.id}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&playsinline=1`;
    this.emit('playback_change', { isPlaying: true, isLoading: false });
    this.emit('play', { track: this.currentTrack });

    if (this._ytEmbedTimer) clearInterval(this._ytEmbedTimer);
    const durSec = this._currentDuration;
    this._ytEmbedTimer = setInterval(() => {
      if (this.isPlaying && this._usingYtEmbed) {
        this._currentEmbedTime++;
        this.emit('time_update', { currentTime: this._currentEmbedTime, duration: durSec });
        if (this._currentEmbedTime >= durSec) {
          clearInterval(this._ytEmbedTimer);
          this.handleTrackEnded();
        }
      }
    }, 1000);
  }

  prefetchNextTrack() {
    this.prefetchedNext = true;
    const nextTracks = this.queue.slice(this.currentIndex + 1, this.currentIndex + 2);
    if (nextTracks.length > 0) {
      const ids = nextTracks.map(t => t.id).filter(Boolean);
      if (API.prefetchBatch) {
        API.prefetchBatch(ids);
      } else {
        ids.forEach(id => API.prefetch(id));
      }
    }
  }

  bufferNextTrack() {
    const nextTrack = this.queue[this.currentIndex + 1];
    if (!nextTrack || !nextTrack.id) return;
    if (this.preloadedTrackId === nextTrack.id) return;
    this.preloadedTrackId = nextTrack.id;
    try {
      this.preloadAudio.src = API.getStreamUrl(nextTrack.id);
      this.preloadAudio.load();
    } catch (e) {}
  }

  // Chromecast & AirPlay
  async requestCastOrAirPlay() {
    if (!this.audio) return;
    try {
      if (window.WebKitPlaybackTargetAvailabilityEvent && typeof this.audio.webkitShowPlaybackTargetPicker === 'function') {
        this.audio.webkitShowPlaybackTargetPicker();
        return;
      }
      if (this.audio.remote && typeof this.audio.remote.prompt === 'function') {
        try {
          await this.audio.remote.prompt();
          return;
        } catch (promptErr) {
          if (promptErr.name === 'NotAllowedError') return;
          // NotFoundError (no device found on network) falls through to instructions modal
        }
      }
      if (window.App?.showModalAlert) {
        window.App.showModalAlert(
          "Pour diffuser vers votre TV ou enceinte connectée :\n\n- Sur Chrome Desktop : Cliquez sur ⋮ (Menu) > 'Caster...'\n- Sur Safari / iOS : Utilisez l'icône AirPlay du Centre de Contrôle\n- Sur Android : Utilisez le bouton 'Caster l'écran / audio' des réglages rapides.\n\nAssurez-vous que votre appareil est connecté au même réseau Wi-Fi.",
          "📺 Diffuser (AirPlay / Chromecast)"
        );
      }
    } catch (e) {
      if (e.name !== 'NotAllowedError' && e.name !== 'NotFoundError') {
        console.warn('Cast / AirPlay error:', e);
      }
    }
  }

  // Floating Mini-Player (Picture-in-Picture)
  async togglePictureInPicture() {
    if (!this.currentTrack) {
      if (window.App?.showToast) window.App.showToast('Lancez un titre pour ouvrir le minilecteur flottant');
      return;
    }

    // 1. Document Picture-in-Picture API (Chrome 116+, Edge)
    if ('documentPictureInPicture' in window) {
      try {
        if (window.documentPictureInPicture.window) {
          window.documentPictureInPicture.window.close();
          return;
        }
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 380,
          height: 180
        });

        // Copy styles
        [...document.styleSheets].forEach((styleSheet) => {
          try {
            const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
            const style = document.createElement('style');
            style.textContent = cssRules;
            pipWin.document.head.appendChild(style);
          } catch (e) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = styleSheet.href;
            pipWin.document.head.appendChild(link);
          }
        });

        pipWin.document.body.style.cssText = 'margin: 0; padding: 12px; background: #0f0f0f; color: #fff; font-family: Roboto, sans-serif; display: flex; align-items: center; gap: 14px; overflow: hidden;';
        pipWin.document.body.innerHTML = `
          <img id="pip-cover" src="${this.currentTrack.thumbnail}" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
          <div style="flex: 1; min-width: 0;">
            <div id="pip-title" style="font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.currentTrack.title}</div>
            <div id="pip-artist" style="font-size: 13px; color: #aaa; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.currentTrack.artist}</div>
            <div style="display: flex; gap: 10px; margin-top: 10px; align-items: center;">
              <button id="pip-prev" style="background: rgba(255,255,255,0.1); border: none; color: #fff; width: 34px; height: 34px; border-radius: 50%; cursor: pointer;">⏮</button>
              <button id="pip-play" style="background: #ff0055; border: none; color: #fff; width: 38px; height: 38px; border-radius: 50%; font-size: 16px; cursor: pointer;">${this.isPlaying ? '⏸' : '▶'}</button>
              <button id="pip-next" style="background: rgba(255,255,255,0.1); border: none; color: #fff; width: 34px; height: 34px; border-radius: 50%; cursor: pointer;">⏭</button>
            </div>
          </div>
        `;

        pipWin.document.getElementById('pip-prev').onclick = () => this.playPrevious();
        pipWin.document.getElementById('pip-play').onclick = () => this.togglePlay();
        pipWin.document.getElementById('pip-next').onclick = () => this.playNext();

        const updatePipUi = () => {
          if (!pipWin || pipWin.closed) return;
          const cover = pipWin.document.getElementById('pip-cover');
          const title = pipWin.document.getElementById('pip-title');
          const artist = pipWin.document.getElementById('pip-artist');
          const playBtn = pipWin.document.getElementById('pip-play');
          if (cover && this.currentTrack) cover.src = this.currentTrack.thumbnail;
          if (title && this.currentTrack) title.textContent = this.currentTrack.title;
          if (artist && this.currentTrack) artist.textContent = this.currentTrack.artist;
          if (playBtn) playBtn.textContent = this.isPlaying ? '⏸' : '▶';
        };

        const onTrackChange = () => updatePipUi();
        const onPlaybackChange = () => updatePipUi();
        this.on('track_change', onTrackChange);
        this.on('playback_change', onPlaybackChange);

        pipWin.addEventListener('pagehide', () => {
          this.off('track_change', onTrackChange);
          this.off('playback_change', onPlaybackChange);
        });

        if (window.App?.showToast) window.App.showToast('Minilecteur flottant activé ! 🪟');
        return;
      } catch (err) {
        console.warn('Document Picture-in-Picture error:', err);
      }
    }

    // 2. Fallback: Canvas Video Picture-in-Picture
    try {
      if (!this._pipVideo) {
        this._pipCanvas = document.createElement('canvas');
        this._pipCanvas.width = 400;
        this._pipCanvas.height = 400;
        this._pipVideo = document.createElement('video');
        this._pipVideo.muted = true;
        this._pipVideo.playsInline = true;
        this._pipVideo.srcObject = this._pipCanvas.captureStream(10);
      }
      const ctx = this._pipCanvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.fillStyle = '#0f0f0f';
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, 20, 20, 360, 300);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Roboto, sans-serif';
        ctx.fillText(this.currentTrack.title.substring(0, 30), 20, 350);
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '16px Roboto, sans-serif';
        ctx.fillText(this.currentTrack.artist.substring(0, 35), 20, 380);
      };
      img.src = this.currentTrack.thumbnail;

      await this._pipVideo.play();
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await this._pipVideo.requestPictureInPicture();
        if (window.App?.showToast) window.App.showToast('Minilecteur vidéo Picture-in-Picture actif ! 🪟');
      }
    } catch (e) {
      if (window.App?.showToast) window.App.showToast('Le Picture-in-Picture n\'est pas supporté sur ce navigateur.');
    }
  }

  async play() {
    this._userPaused = false;
    if (this._usingYtEmbed) {
      const iframe = document.getElementById('yt-fallback-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      }
      this.isPlaying = true;
      this.isLoading = false;
      this.emit('playback_change', { isPlaying: true, isLoading: false });
      this.emit('play', { track: this.currentTrack });
      return;
    }

    if (this._usingDirectAudio && this.directAudio) {
      try {
        await this.directAudio.play();
        this.isPlaying = true;
        this.isLoading = false;
        this.updateMediaSessionState();
        this.emit('playback_change', { isPlaying: true, isLoading: false });
        this.emit('play', { track: this.currentTrack });
      } catch (e) {
        console.warn('Direct audio play error:', e);
      }
      return;
    }

    if (!this.currentTrack) {
      if (this.queue.length > 0) {
        return this.playTrack(this.queue[0]);
      }
      if (window.App) {
        return window.App.playRandom();
      }
    }
    try {
      if (!isMobileDevice() && this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      this.audio.muted = false;
      await this.audio.play();
      this.isPlaying = true;
      this.isLoading = false;
      this.updateMediaSessionState();
      this.emit('playback_change', { isPlaying: true, isLoading: false });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  pause() {
    this._userPaused = true;
    if (this._usingYtEmbed) {
      const iframe = document.getElementById('yt-fallback-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      }
      this.isPlaying = false;
      this.isLoading = false;
      this.emit('playback_change', { isPlaying: false, isLoading: false });
      this.emit('pause', { track: this.currentTrack });
      return;
    }
    if (this._usingDirectAudio && this.directAudio) {
      this.directAudio.pause();
      this.isPlaying = false;
      this.isLoading = false;
      this.emit('playback_change', { isPlaying: false, isLoading: false });
      this.emit('pause', { track: this.currentTrack });
      return;
    }
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
    if (this._usingYtEmbed) {
      const targetSec = Math.max(0, Math.min(seconds, this._currentDuration || 99999));
      this._currentEmbedTime = targetSec;
      const iframe = document.getElementById('yt-fallback-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'seekTo',
          args: [targetSec, true]
        }), '*');
      }
      this.emit('time_update', { currentTime: targetSec, duration: this._currentDuration || 200 });
      return;
    }
    if (this._usingDirectAudio && this.directAudio) {
      this.directAudio.currentTime = Math.max(0, Math.min(seconds, this.directAudio.duration || 99999));
      this.updateMediaSessionState();
      return;
    }
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 99999));
    this.updateMediaSessionState();
  }

  playNext() {
    if (this._crossfadeTimeout) {
      clearTimeout(this._crossfadeTimeout);
      this._crossfadeTimeout = null;
    }
    this._isCrossfading = false;

    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
      return;
    }

    if (this.currentIndex < this.queue.length - 1) {
      const nextIdx = this.currentIndex + 1;
      this.playTrack(this.queue[nextIdx], null, nextIdx);

      // Pre-emptively fetch next batch of infinite radio if approaching end of queue
      if (this.autoplayRadio && (this.queue.length - nextIdx <= 2)) {
        this.fetchRadioRecommendations(false);
      }
    } else {
      // Reached end of queue
      if (this.repeatMode === 'all' && this.queue.length > 0) {
        this.playTrack(this.queue[0], null, 0);
      } else if (this.autoplayRadio && this.currentTrack) {
        this.fetchRadioRecommendations(true);
      } else {
        this.pause();
        this.seek(0);
      }
    }
  }

  playPrevious() {
    if (this._crossfadeTimeout) {
      clearTimeout(this._crossfadeTimeout);
      this._crossfadeTimeout = null;
    }
    this._isCrossfading = false;

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
    // Guard against duplicate ended events or rapid transitions skipping tracks
    if (this._isAdvancingTrack) return;
    this._isAdvancingTrack = true;
    setTimeout(() => { this._isAdvancingTrack = false; }, 800);

    if (this._crossfadeTimeout) {
      clearTimeout(this._crossfadeTimeout);
      this._crossfadeTimeout = null;
    }
    this._isCrossfading = false;

    if (this.repeatMode === 'one') {
      this.seek(0);
      this.play();
    } else {
      this.playNext();
    }
  }

  async fetchRadioRecommendations(autoPlayImmediately = true) {
    if (!this.currentTrack || this._isLoadingRadio) return;
    this._isLoadingRadio = true;
    try {
      this.emit('radio_loading', { track: this.currentTrack });
      const currentTrack = this.currentTrack;
      let candidates = await API.getRelated(currentTrack.id, currentTrack.artist, currentTrack.title);

      // Complement with artist and genre searches if fewer than 20 candidates
      if (!candidates || candidates.length < 20) {
        const query = `${currentTrack.artist || ''} mix radio hits`.trim();
        const searchResults = await API.search(query, 'songs');
        const songResults = searchResults.songs || [];
        candidates = [...(candidates || []), ...songResults];
      }

      if (candidates && candidates.length > 0) {
        // Filter out songs already in queue
        const existingIds = new Set(this.queue.map(t => t.id));
        const newTracks = candidates.filter(t => !existingIds.has(t.id));
        if (newTracks.length > 0) {
          // Add 20 new tracks
          const batch = newTracks.slice(0, 20);
          this.queue.push(...batch);
          this.emit('queue_change', { queue: this.queue, isRadioInfinite: true });

          if (autoPlayImmediately) {
            this.currentIndex++;
            if (this.queue[this.currentIndex]) {
              this.playTrack(this.queue[this.currentIndex]);
            }
          }
          return batch;
        }
      }
    } catch (e) {
      console.warn('Radio autoplay error:', e);
    } finally {
      this._isLoadingRadio = false;
    }
    if (autoPlayImmediately) {
      this.pause();
    }
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

  moveInQueue(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.queue.length || toIdx < 0 || toIdx >= this.queue.length || fromIdx === toIdx) return;
    const item = this.queue.splice(fromIdx, 1)[0];
    this.queue.splice(toIdx, 0, item);
    if (this.currentIndex === fromIdx) {
      this.currentIndex = toIdx;
    } else if (fromIdx < this.currentIndex && toIdx >= this.currentIndex) {
      this.currentIndex--;
    } else if (fromIdx > this.currentIndex && toIdx <= this.currentIndex) {
      this.currentIndex++;
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
    this.audio.muted = val === 0;
    if (this.directAudio) {
      this.directAudio.volume = val;
      this.directAudio.muted = val === 0;
    }
    if (val > 0.05) {
      this._lastVolume = val;
    }

    // Sync Web Audio GainNode
    if (this.gainNode && this.audioCtx) {
      try {
        if (this.audioCtx.state === 'suspended' && val > 0) {
          this.audioCtx.resume();
        }
        this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.gainNode.gain.setValueAtTime(val, this.audioCtx.currentTime);
        this.gainNode.gain.value = val;
      } catch (e) {}
    }

    // Sync YouTube Embed if active
    if (this._usingYtEmbed) {
      const iframe = document.getElementById('yt-fallback-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'setVolume',
          args: [Math.round(val * 100)]
        }), '*');
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: val === 0 ? 'mute' : 'unMute',
          args: []
        }), '*');
      }
    }

    try {
      localStorage.setItem('ytm_volume', val.toString());
      localStorage.setItem('ytm_muted', val === 0 ? 'true' : 'false');
    } catch (e) {}
    Storage.saveSetting('volume', val);
    Storage.saveSetting('muted', val === 0);
    this.emit('volume_change', { volume: val, muted: val === 0 });
  }

  toggleMute() {
    const willMute = !this.audio.muted;
    if (willMute) {
      if (this.audio.volume > 0.05) {
        this._lastVolume = this.audio.volume;
      }
      this.audio.muted = true;
    } else {
      this.audio.muted = false;
      const restored = this._lastVolume || 0.9;
      this.audio.volume = restored;
    }
    const isMuted = this.audio.muted;
    const currentVol = isMuted ? 0 : (this.audio.volume || 0.9);

    // Sync Web Audio GainNode
    if (this.gainNode && this.audioCtx) {
      try {
        if (this.audioCtx.state === 'suspended' && !isMuted) {
          this.audioCtx.resume();
        }
        this.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.gainNode.gain.setValueAtTime(currentVol, this.audioCtx.currentTime);
        this.gainNode.gain.value = currentVol;
      } catch (e) {}
    }

    // Sync YouTube Embed if active
    if (this._usingYtEmbed) {
      const iframe = document.getElementById('yt-fallback-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: isMuted ? 'mute' : 'unMute',
          args: []
        }), '*');
        if (!isMuted) {
          iframe.contentWindow.postMessage(JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [Math.round(currentVol * 100)]
          }), '*');
        }
      }
    }

    try {
      localStorage.setItem('ytm_muted', isMuted ? 'true' : 'false');
      if (!isMuted) {
        localStorage.setItem('ytm_volume', currentVol.toString());
      }
    } catch (e) {}
    Storage.saveSetting('muted', isMuted);
    if (!isMuted) {
      Storage.saveSetting('volume', currentVol);
    }
    this.emit('volume_change', { volume: currentVol, muted: isMuted });
    return isMuted;
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = rate;
    Storage.saveSetting('playbackRate', rate);
    this.emit('rate_change', { rate });
  }

  // Events dispatcher
  emit(eventName, detail = {}) {
    window.dispatchEvent(new CustomEvent(`player_${eventName}`, { detail }));
  }

  on(eventName, handler) {
    if (!handler) return;
    const wrapped = (e) => handler(e.detail);
    handler._wrapped = wrapped;
    window.addEventListener(`player_${eventName}`, wrapped);
  }

  off(eventName, handler) {
    if (handler && handler._wrapped) {
      window.removeEventListener(`player_${eventName}`, handler._wrapped);
    }
  }
}

window.Player = new PlayerEngine();

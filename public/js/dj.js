/**
 * Mode DJ & Double Deck Interactif
 * Platines vinyles rotatives, scratch interactif, crossfader physique, pitch faders & sync BPM
 */
class DjDeckEngine {
    constructor() {
        this.isOpen = false;
        this.deckA = {
            track: null,
            isPlaying: false,
            playbackRate: 1.0,
            bpm: 124,
            rotation: 0,
            volume: 1.0,
            scratchOffset: 0
        };
        this.deckB = {
            track: null,
            isPlaying: false,
            playbackRate: 1.0,
            bpm: 128,
            rotation: 0,
            volume: 0.0,
            scratchOffset: 0
        };
        this.crossfaderValue = 50; // 0 = 100% Deck A, 100 = 100% Deck B
        this.animId = null;
        this.isScratchingA = false;
        this.isScratchingB = false;
    }

    open() {
        const modal = document.getElementById('modal-dj-deck');
        if (!modal) return;
        this.isOpen = true;
        modal.classList.remove('hidden');

        // Populate Deck A with current song
        const cur = window.Player?.currentTrack;
        if (cur) {
            this.loadDeck('A', cur);
            this.deckA.isPlaying = window.Player?.isPlaying || false;
        }

        // Populate Deck B with next song from queue
        const queue = window.Player?.queue || [];
        const next = queue.find(t => t.id !== cur?.id) || queue[1] || cur;
        if (next) {
            this.loadDeck('B', next);
        }

        this.updateUi();
        this.startLoop();
        if (window.App?.showToast) window.App.showToast('Mode DJ Double Deck activé 🎧');
    }

    close() {
        const modal = document.getElementById('modal-dj-deck');
        if (modal) modal.classList.add('hidden');
        this.isOpen = false;
        if (this.animId) cancelAnimationFrame(this.animId);
    }

    loadDeck(deckKey, track) {
        const deck = deckKey === 'A' ? this.deckA : this.deckB;
        deck.track = track;
        deck.bpm = Math.floor(115 + (parseInt(track.id?.charCodeAt(0) || 120, 10) % 25));
        const prefix = deckKey.toLowerCase();

        const titleEl = document.getElementById(`dj-${prefix}-title`);
        const artistEl = document.getElementById(`dj-${prefix}-artist`);
        const coverEl = document.getElementById(`dj-${prefix}-cover`);
        const bpmEl = document.getElementById(`dj-${prefix}-bpm`);

        if (titleEl) titleEl.textContent = track.title;
        if (artistEl) artistEl.textContent = track.artist;
        if (coverEl) coverEl.src = track.thumbnail;
        if (bpmEl) bpmEl.textContent = `${deck.bpm} BPM`;
    }

    togglePlay(deckKey) {
        const deck = deckKey === 'A' ? this.deckA : this.deckB;
        deck.isPlaying = !deck.isPlaying;
        if (deckKey === 'A' && window.Player) {
            if (deck.isPlaying && !window.Player.isPlaying) window.Player.play();
            else if (!deck.isPlaying && window.Player.isPlaying) window.Player.pause();
        }
        const btn = document.getElementById(`dj-${deckKey.toLowerCase()}-play-btn`);
        if (btn) btn.textContent = deck.isPlaying ? '⏸ PAUSE' : '▶ PLAY';
    }

    setPitch(deckKey, val) {
        const deck = deckKey === 'A' ? this.deckA : this.deckB;
        const rate = parseFloat(val);
        deck.playbackRate = rate;
        if (deckKey === 'A' && window.Player) {
            window.Player.setPlaybackRate(rate);
        }
        const badge = document.getElementById(`dj-${deckKey.toLowerCase()}-pitch-val`);
        if (badge) badge.textContent = `${rate > 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`;
    }

    setCrossfader(val) {
        this.crossfaderValue = parseInt(val, 10);
        // Equal power crossfade
        const t = this.crossfaderValue / 100;
        this.deckA.volume = Math.cos(t * 0.5 * Math.PI);
        this.deckB.volume = Math.sin(t * 0.5 * Math.PI);

        if (window.Player?.audio) {
            window.Player.audio.volume = Math.max(0.01, Math.min(1, this.deckA.volume));
        }

        const labelA = document.getElementById('dj-fader-vol-a');
        const labelB = document.getElementById('dj-fader-vol-b');
        if (labelA) labelA.textContent = `${Math.round(this.deckA.volume * 100)}%`;
        if (labelB) labelB.textContent = `${Math.round(this.deckB.volume * 100)}%`;
    }

    syncBpm() {
        this.deckB.bpm = this.deckA.bpm;
        this.deckB.playbackRate = this.deckA.playbackRate;
        const bpmEl = document.getElementById('dj-b-bpm');
        if (bpmEl) bpmEl.textContent = `${this.deckB.bpm} BPM (SYNC)`;
        if (window.App?.showToast) window.App.showToast(`BPM Synchronisés : ${this.deckA.bpm} BPM ⚡`);
    }

    startLoop() {
        const loop = () => {
            if (!this.isOpen) return;

            // Rotate vinyl A
            if (this.deckA.isPlaying && !this.isScratchingA) {
                this.deckA.rotation = (this.deckA.rotation + 2.5 * this.deckA.playbackRate) % 360;
                const discA = document.getElementById('dj-vinyl-disc-a');
                if (discA) discA.style.transform = `rotate(${this.deckA.rotation}deg)`;
            }

            // Rotate vinyl B
            if (this.deckB.isPlaying && !this.isScratchingB) {
                this.deckB.rotation = (this.deckB.rotation + 2.5 * this.deckB.playbackRate) % 360;
                const discB = document.getElementById('dj-vinyl-disc-b');
                if (discB) discB.style.transform = `rotate(${this.deckB.rotation}deg)`;
            }

            this.animId = requestAnimationFrame(loop);
        };
        this.animId = requestAnimationFrame(loop);
    }

    setupScratchEvents() {
        const discA = document.getElementById('dj-vinyl-disc-a');
        if (discA) {
            discA.addEventListener('mousedown', () => { this.isScratchingA = true; });
            window.addEventListener('mouseup', () => { this.isScratchingA = false; });
            discA.addEventListener('mousemove', (e) => {
                if (this.isScratchingA) {
                    this.deckA.rotation = (this.deckA.rotation + e.movementX * 1.5) % 360;
                    discA.style.transform = `rotate(${this.deckA.rotation}deg)`;
                }
            });
        }
    }

    updateUi() {
        this.setCrossfader(this.crossfaderValue);
        this.setupScratchEvents();
    }
}

window.DjDeck = new DjDeckEngine();

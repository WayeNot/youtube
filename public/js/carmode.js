/**
 * Mode Voiture Dédié (Car Mode / Car Play Web)
 * Interface épurée géante, contraste élevé & gestes de balayage tactiles
 */
class CarModeManager {
    constructor() {
        this.isOpen = false;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.clockTimer = null;
    }

    open() {
        const modal = document.getElementById('view-car-mode');
        if (!modal) return;
        this.isOpen = true;
        modal.classList.remove('hidden');

        // Request Fullscreen if supported
        try {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        } catch (e) {}

        this.updateUi();
        this.setupGestures();
        this.startClock();

        if (window.App?.showToast) window.App.showToast('Mode Voiture activé 🚗 — Glissez pour zapper');
    }

    close() {
        const modal = document.getElementById('view-car-mode');
        if (modal) modal.classList.add('hidden');
        this.isOpen = false;
        if (this.clockTimer) clearInterval(this.clockTimer);

        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    updateUi() {
        const track = window.Player?.currentTrack;
        const titleEl = document.getElementById('car-track-title');
        const artistEl = document.getElementById('car-track-artist');
        const coverEl = document.getElementById('car-track-cover');
        const playBtn = document.getElementById('car-play-btn');

        if (track) {
            if (titleEl) titleEl.textContent = track.title;
            if (artistEl) artistEl.textContent = track.artist;
            if (coverEl) coverEl.src = track.thumbnail;
        }

        const isPlaying = window.Player?.isPlaying || false;
        if (playBtn) playBtn.innerHTML = isPlaying ? '❚❚' : '▶';
    }

    setupGestures() {
        const container = document.getElementById('view-car-mode');
        if (!container || container._hasGestures) return;
        container._hasGestures = true;

        container.addEventListener('touchstart', (e) => {
            this.touchStartX = e.changedTouches[0].screenX;
            this.touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        container.addEventListener('touchend', (e) => {
            const endX = e.changedTouches[0].screenX;
            const endY = e.changedTouches[0].screenY;
            const diffX = endX - this.touchStartX;
            const diffY = endY - this.touchStartY;

            // Horizontal Swipe
            if (Math.abs(diffX) > 60 && Math.abs(diffY) < 100) {
                if (diffX < 0) {
                    // Swipe Left -> Next
                    if (window.Player) window.Player.playNext();
                    this.triggerFeedback('Suivant ⏭');
                } else {
                    // Swipe Right -> Previous
                    if (window.Player) window.Player.playPrevious();
                    this.triggerFeedback('Précédent ⏮');
                }
            }
        }, { passive: true });

        // Update when player changes track
        window.addEventListener('player_track_change', () => {
            if (this.isOpen) this.updateUi();
        });
        window.addEventListener('player_playback_change', () => {
            if (this.isOpen) this.updateUi();
        });
    }

    triggerFeedback(text) {
        const feedback = document.getElementById('car-gesture-feedback');
        if (feedback) {
            feedback.textContent = text;
            feedback.classList.remove('hidden');
            clearTimeout(this._fbTimer);
            this._fbTimer = setTimeout(() => feedback.classList.add('hidden'), 1000);
        }
    }

    startClock() {
        const update = () => {
            const timeEl = document.getElementById('car-clock-display');
            if (timeEl) {
                const now = new Date();
                timeEl.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            }
        };
        update();
        this.clockTimer = setInterval(update, 1000);
    }
}

window.CarMode = new CarModeManager();

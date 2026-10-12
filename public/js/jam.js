/**
 * Jam Session en direct (Écoute Partagée Synchronisée & Réactions Émojis)
 */
class JamSessionManager {
    constructor() {
        this.roomId = null;
        this.isHost = false;
        this.syncInterval = null;
        this.userName = 'Auditeur ' + Math.floor(Math.random() * 900 + 100);
        this.listeners = [];
        this.lastReactionId = null;
    }

    async createRoom() {
        const track = window.Player?.currentTrack;
        try {
            const res = await fetch('/api/jam/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hostName: this.userName, track })
            });
            const data = await res.json();
            if (data.success && data.room) {
                this.roomId = data.room.id;
                this.isHost = true;
                this.openModal();
                this.startSync();
                if (window.App?.showToast) window.App.showToast(`Salon Jam créé : ${this.roomId} 🎉`);
            }
        } catch (e) {
            console.warn('Jam create error:', e);
        }
    }

    async joinRoom(code) {
        if (!code) return;
        this.roomId = code.toUpperCase().trim();
        this.isHost = false;
        this.openModal();
        this.startSync();
        if (window.App?.showToast) window.App.showToast(`Rejoint le salon Jam : ${this.roomId} 🎧`);
    }

    openModal() {
        const modal = document.getElementById('modal-jam-session');
        if (!modal) return;
        modal.classList.remove('hidden');

        const codeEl = document.getElementById('jam-room-code');
        const linkEl = document.getElementById('jam-room-link');
        const roleEl = document.getElementById('jam-user-role');

        if (codeEl) codeEl.textContent = this.roomId || 'NON CONNECTÉ';
        const fullUrl = `${window.location.origin}/?jam=${this.roomId}`;
        if (linkEl) linkEl.value = fullUrl;
        if (roleEl) roleEl.textContent = this.isHost ? '👑 Vous êtes l\'Hôte (Votre musique mène la danse)' : '🎧 Vous êtes Invité (Synchronisé sur l\'Hôte)';

        this.renderListeners();
    }

    closeModal() {
        const modal = document.getElementById('modal-jam-session');
        if (modal) modal.classList.add('hidden');
    }

    leaveSession() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = null;
        this.roomId = null;
        this.isHost = false;
        this.closeModal();
        if (window.App?.showToast) window.App.showToast('Vous avez quitté la Jam Session');
    }

    startSync() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.syncInterval = setInterval(() => this.syncTick(), 2500);
        this.syncTick();
    }

    async syncTick() {
        if (!this.roomId) return;
        try {
            const curTrack = window.Player?.currentTrack;
            const curTime = window.Player?.audio?.currentTime || 0;
            const isPlaying = window.Player?.isPlaying || false;

            const res = await fetch('/api/jam/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: this.roomId,
                    isHost: this.isHost,
                    track: this.isHost ? curTrack : undefined,
                    currentTime: this.isHost ? curTime : undefined,
                    isPlaying: this.isHost ? isPlaying : undefined,
                    user: { name: this.userName, avatar: '🎧' }
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.room) {
                    this.listeners = data.room.listeners || [];
                    this.renderListeners();

                    // If Guest, synchronize music playback with Host
                    if (!this.isHost && data.room.track) {
                        const hostTrack = data.room.track;
                        const hostTime = data.room.currentTime || 0;
                        const hostPlaying = data.room.isPlaying;

                        if (window.Player?.currentTrack?.id !== hostTrack.id) {
                            window.Player.playTrack(hostTrack);
                        } else {
                            const curAudioTime = window.Player.audio.currentTime;
                            if (Math.abs(curAudioTime - hostTime) > 3) {
                                window.Player.seek(hostTime);
                            }
                            if (hostPlaying && !window.Player.isPlaying) window.Player.play();
                            else if (!hostPlaying && window.Player.isPlaying) window.Player.pause();
                        }
                    }

                    // Display new reactions
                    if (data.room.reactions && Array.isArray(data.room.reactions)) {
                        data.room.reactions.forEach(r => {
                            if (!this.lastReactionId || r.timestamp > this.lastReactionId) {
                                this.triggerFloatingEmoji(r.emoji);
                                this.lastReactionId = r.timestamp;
                            }
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('Jam sync error:', e);
        }
    }

    renderListeners() {
        const container = document.getElementById('jam-listeners-list');
        if (!container) return;
        const list = this.listeners.length > 0 ? this.listeners : [{ name: this.userName, avatar: '🎧' }];
        container.innerHTML = list.map(l => `
            <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.06); padding:6px 12px; border-radius:20px; font-size:13px;">
                <span class="dancing-avatar" style="font-size:18px;">${l.avatar || '🎧'}</span>
                <span style="font-weight:600; color:#fff;">${l.name}</span>
            </div>
        `).join('');
    }

    async sendReaction(emoji) {
        if (!this.roomId) return;
        this.triggerFloatingEmoji(emoji);
        try {
            await fetch('/api/jam/react', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: this.roomId, emoji, user: this.userName })
            });
        } catch (e) {}
    }

    triggerFloatingEmoji(emoji) {
        const el = document.createElement('div');
        el.className = 'jam-floating-emoji';
        el.textContent = emoji;
        el.style.left = `${Math.random() * 70 + 15}%`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2600);
    }

    copyRoomLink() {
        const linkEl = document.getElementById('jam-room-link');
        if (linkEl && linkEl.value) {
            navigator.clipboard.writeText(linkEl.value).then(() => {
                if (window.App?.showToast) window.App.showToast('Lien Jam copié ! Partagez-le avec vos amis 📋');
            });
        }
    }
}

window.JamSession = new JamSessionManager();

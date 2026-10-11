// Synchronized & Plain Lyrics Renderer (Karaoke Style)
class LyricsManager {
    constructor() {
        this.containers = new Set();
        this.lyricsData = null;
        this.activeLineIndex = -1;
        this.autoScrollEnabled = true;
        this.scrollTimeout = null;
        this.currentTrackKey = null;
    }

    static getInstance() {
        if (!LyricsManager._instance) LyricsManager._instance = new LyricsManager();
        return LyricsManager._instance;
    }

    static setContainer(containerEl) {
        return LyricsManager.getInstance().setContainer(containerEl);
    }

    static addContainer(containerEl) {
        return LyricsManager.getInstance().addContainer(containerEl);
    }

    static render() {
        return LyricsManager.getInstance().render();
    }

    static loadLyrics(title, artist) {
        return LyricsManager.getInstance().loadLyrics(title, artist);
    }

    static updateProgress(currentTime) {
        return LyricsManager.getInstance().updateProgress(currentTime);
    }

    static clear() {
        return LyricsManager.getInstance().clear();
    }

    setContainer(containerEl) {
        this.addContainer(containerEl);
    }

    addContainer(containerEl) {
        if (!containerEl) return;
        if (!this.containers.has(containerEl)) {
            this.containers.add(containerEl);
            containerEl.addEventListener('wheel', () => this.handleUserScroll(), { passive: true });
            containerEl.addEventListener('touchmove', () => this.handleUserScroll(), { passive: true });
        }
    }

    getActiveContainers() {
        // Collect registered containers plus check DOM directly in case not registered yet
        const list = Array.from(this.containers);
        const sideEl = document.getElementById('side-lyrics-container');
        if (sideEl && !this.containers.has(sideEl)) this.addContainer(sideEl);
        const mobileEl = document.getElementById('mobile-lyrics-container');
        if (mobileEl && !this.containers.has(mobileEl)) this.addContainer(mobileEl);
        return Array.from(this.containers).filter(Boolean);
    }

    handleUserScroll() {
        this.autoScrollEnabled = false;
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.autoScrollEnabled = true;
        }, 4000);
    }

    async loadLyrics(title, artist) {
        const trackKey = `${artist || ''}_${title || ''}`.toLowerCase();
        if (this.currentTrackKey === trackKey && this.lyricsData) {
            this.render();
            return;
        }

        this.currentTrackKey = trackKey;
        this.lyricsData = null;
        this.activeLineIndex = -1;

        const containers = this.getActiveContainers();
        containers.forEach(c => {
            c.innerHTML = `
                <div class="lyrics-loading">
                    <div class="spinner"></div>
                    <p>Recherche des paroles en cours...</p>
                </div>
            `;
        });

        try {
            const data = await API.getLyrics(title, artist);
            // Verify track hasn't changed while awaiting API response
            if (this.currentTrackKey === trackKey) {
                this.lyricsData = data;
                this.render();
            }
        } catch (e) {
            if (this.currentTrackKey === trackKey) {
                this.lyricsData = null;
                this.render();
            }
        }
    }

    render() {
        const containers = this.getActiveContainers();
        if (containers.length === 0) return;

        if (!this.lyricsData || (!this.lyricsData.syncedLyrics && !this.lyricsData.plainLyrics)) {
            const emptyHTML = `
                <div class="lyrics-empty">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                    </svg>
                    <p>Paroles non disponibles pour ce titre</p>
                    <span class="subtext">Profitez simplement du son ! 🎶</span>
                </div>
            `;
            containers.forEach(c => { c.innerHTML = emptyHTML; });
            return;
        }

        if (this.lyricsData.syncedLyrics && this.lyricsData.syncedLyrics.length > 0) {
            let html = '<div class="lyrics-synced-list">';
            this.lyricsData.syncedLyrics.forEach((line, idx) => {
                const words = line.text.split(/(\s+)/);
                const wordsHtml = words.map((w, wIdx) => {
                    if (!w.trim()) return w;
                    return `<span class="karaoke-word" data-word-idx="${wIdx}">${this.escapeHtml(w)}</span>`;
                }).join('');

                html += `
                    <div class="lyrics-line" data-index="${idx}" data-time="${line.time}">
                        <div class="lyrics-line-text">${wordsHtml}</div>
                    </div>
                `;
            });
            html += '</div>';

            containers.forEach(container => {
                container.innerHTML = html;
                const lineElements = container.querySelectorAll('.lyrics-line');
                lineElements.forEach((el) => {
                    el.addEventListener('click', () => {
                        const seekTime = parseFloat(el.getAttribute('data-time'));
                        if (!isNaN(seekTime) && window.Player) {
                            window.Player.seek(seekTime);
                        }
                    });
                });
            });

            // Resync current active index if player is already playing
            if (window.Player && window.Player.audio && !isNaN(window.Player.audio.currentTime)) {
                this.updateTime(window.Player.audio.currentTime);
            }
        } else if (this.lyricsData.plainLyrics) {
            const plainHTML = `
                <div class="lyrics-plain">
                    <pre>${this.escapeHtml(this.lyricsData.plainLyrics)}</pre>
                </div>
            `;
            containers.forEach(c => { c.innerHTML = plainHTML; });
        }
    }

    updateTime(currentTime) {
        if (!this.lyricsData?.syncedLyrics) return;
        const containers = this.getActiveContainers();
        if (containers.length === 0) return;

        const synced = this.lyricsData.syncedLyrics;
        let newIndex = -1;

        for (let i = 0; i < synced.length; i++) {
            if (currentTime >= synced[i].time) {
                newIndex = i;
            } else {
                break;
            }
        }

        const isLineChanged = (newIndex !== this.activeLineIndex);
        const oldIndex = this.activeLineIndex;
        if (isLineChanged) {
            this.activeLineIndex = newIndex;
        }

        containers.forEach(container => {
            const lines = container.querySelectorAll('.lyrics-line');
            if (lines.length === 0) return;

            if (isLineChanged) {
                if (oldIndex >= 0 && lines[oldIndex]) {
                    lines[oldIndex].classList.remove('active');
                    lines[oldIndex].classList.add('passed');
                    lines[oldIndex].querySelectorAll('.karaoke-word').forEach(w => {
                        w.classList.add('sang');
                        w.style.setProperty('--word-progress', '100%');
                    });
                }

                if (newIndex >= 0 && lines[newIndex]) {
                    lines[newIndex].classList.add('active');
                    lines[newIndex].classList.remove('passed');

                    if (this.autoScrollEnabled) {
                        lines[newIndex].scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                    }
                }
            }

            // Word-by-word progression
            if (newIndex >= 0 && lines[newIndex]) {
                const curLine = synced[newIndex];
                const nextLineTime = (newIndex < synced.length - 1) ? synced[newIndex + 1].time : (curLine.time + 4.5);
                const lineDuration = Math.max(0.8, nextLineTime - curLine.time);
                const elapsed = Math.max(0, currentTime - curLine.time);
                const progress = Math.min(1, elapsed / lineDuration);

                const words = lines[newIndex].querySelectorAll('.karaoke-word');
                const totalWords = words.length;

                words.forEach((wordEl, wIdx) => {
                    const wordStart = wIdx / totalWords;
                    const wordEnd = (wIdx + 1) / totalWords;

                    if (progress >= wordEnd) {
                        wordEl.classList.add('sang');
                        wordEl.style.setProperty('--word-progress', '100%');
                    } else if (progress > wordStart) {
                        wordEl.classList.remove('sang');
                        const wordProg = (progress - wordStart) / (wordEnd - wordStart);
                        wordEl.style.setProperty('--word-progress', `${Math.round(wordProg * 100)}%`);
                    } else {
                        wordEl.classList.remove('sang');
                        wordEl.style.setProperty('--word-progress', '0%');
                    }
                });
            }
        });
    }

    clear() {
        this.lyricsData = null;
        this.activeLineIndex = -1;
        this.currentTrackKey = null;
        this.getActiveContainers().forEach(c => { c.innerHTML = ''; });
    }

    escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

window.LyricsManager = new LyricsManager();

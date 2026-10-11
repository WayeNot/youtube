// Synchronized & Plain Lyrics Renderer (Karaoke Style)
class LyricsManager {
    constructor() {
        this.container = null;
        this.lyricsData = null;
        this.activeLineIndex = -1;
        this.autoScrollEnabled = true;
        this.scrollTimeout = null;
    }

    static getInstance() {
        if (!LyricsManager._instance) LyricsManager._instance = new LyricsManager();
        return LyricsManager._instance;
    }

    static setContainer(containerEl) {
        return LyricsManager.getInstance().setContainer(containerEl);
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
        this.container = containerEl;
        if (this.container) {
            // Allow user manual scroll without fighting auto-scroll immediately
            this.container.addEventListener('wheel', () => this.handleUserScroll(), { passive: true });
            this.container.addEventListener('touchmove', () => this.handleUserScroll(), { passive: true });
        }
    }

    handleUserScroll() {
        this.autoScrollEnabled = false;
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.autoScrollEnabled = true;
        }, 4000);
    }

    async loadLyrics(title, artist) {
        this.lyricsData = null;
        this.activeLineIndex = -1;
        if (!this.container) return;

        this.container.innerHTML = `
      <div class="lyrics-loading">
        <div class="spinner"></div>
        <p>Recherche des paroles en cours...</p>
      </div>
    `;

        const data = await API.getLyrics(title, artist);
        this.lyricsData = data;
        this.render();
    }

    render() {
        if (!this.container) return;

        if (!this.lyricsData || (!this.lyricsData.syncedLyrics && !this.lyricsData.plainLyrics)) {
            this.container.innerHTML = `
        <div class="lyrics-empty">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <p>Paroles non disponibles pour ce titre</p>
          <span class="subtext">Profitez simplement du son ! 🎶</span>
        </div>
      `;
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
            this.container.innerHTML = html;

            // Click to seek handler
            const lineElements = this.container.querySelectorAll('.lyrics-line');
            lineElements.forEach((el) => {
                el.addEventListener('click', () => {
                    const seekTime = parseFloat(el.getAttribute('data-time'));
                    if (!isNaN(seekTime) && window.Player) {
                        window.Player.seek(seekTime);
                    }
                });
            });
        } else if (this.lyricsData.plainLyrics) {
            this.container.innerHTML = `
        <div class="lyrics-plain">
          <pre>${this.escapeHtml(this.lyricsData.plainLyrics)}</pre>
        </div>
      `;
        }
    }

    updateTime(currentTime) {
        if (!this.lyricsData?.syncedLyrics || !this.container) return;

        const synced = this.lyricsData.syncedLyrics;
        let newIndex = -1;

        for (let i = 0; i < synced.length; i++) {
            if (currentTime >= synced[i].time) {
                newIndex = i;
            } else {
                break;
            }
        }

        const lines = this.container.querySelectorAll('.lyrics-line');

        if (newIndex !== this.activeLineIndex) {
            if (this.activeLineIndex >= 0 && lines[this.activeLineIndex]) {
                lines[this.activeLineIndex].classList.remove('active');
                lines[this.activeLineIndex].classList.add('passed');
                lines[this.activeLineIndex].querySelectorAll('.karaoke-word').forEach(w => {
                    w.classList.add('sang');
                    w.style.setProperty('--word-progress', '100%');
                });
            }

            this.activeLineIndex = newIndex;

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

        // Word-by-word / sub-line timing progression
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

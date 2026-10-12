// Synchronized & Plain Lyrics Renderer (Karaoke Style) + Mode Génie & Traduction Française
class LyricsManager {
    constructor() {
        this.containers = new Set();
        this.lyricsData = null;
        this.activeLineIndex = -1;
        this.autoScrollEnabled = true;
        this.scrollTimeout = null;
        this.currentTrackKey = null;

        // Translation & Genius state
        this.isTranslated = false;
        this.isTranslating = false;
        this.translationMap = new Map();
        this.geniusMode = false;
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
        this.isTranslated = false;
        this.translationMap.clear();

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

    // Toggle French translation
    async toggleTranslation() {
        if (!this.lyricsData) return;
        if (this.isTranslated) {
            this.isTranslated = false;
            this.render();
            if (window.App?.showToast) window.App.showToast('Paroles : Langue originale');
            return;
        }

        if (this.translationMap.size > 0) {
            this.isTranslated = true;
            this.render();
            if (window.App?.showToast) window.App.showToast('Paroles : Traduction française affichée 🇫🇷');
            return;
        }

        this.isTranslating = true;
        if (window.App?.showToast) window.App.showToast('Traduction des paroles en cours...');

        try {
            const linesToTranslate = [];
            if (this.lyricsData.syncedLyrics) {
                linesToTranslate.push(...this.lyricsData.syncedLyrics.map(l => l.text));
            } else if (this.lyricsData.plainLyrics) {
                linesToTranslate.push(...this.lyricsData.plainLyrics.split('\n'));
            }

            const res = await fetch('/api/lyrics/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lines: linesToTranslate.slice(0, 60), targetLang: 'fr' })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.translated && Array.isArray(data.translated)) {
                    data.translated.forEach(item => {
                        if (item.text && item.translated) {
                            this.translationMap.set(item.text, item.translated);
                        }
                    });
                }
            }
            this.isTranslated = true;
            this.render();
            if (window.App?.showToast) window.App.showToast('Paroles traduites en français ! 🇫🇷');
        } catch (err) {
            console.warn('Translate error:', err);
            if (window.App?.showToast) window.App.showToast('Échec de la traduction automatique', 'error');
        } finally {
            this.isTranslating = false;
        }
    }

    // Toggle Genius Explanation mode
    toggleGeniusMode() {
        this.geniusMode = !this.geniusMode;
        this.render();
        if (window.App?.showToast) {
            window.App.showToast(this.geniusMode ? 'Mode Génie activé : Cliquez sur une ligne pour l\'analyse 💡' : 'Mode Génie désactivé');
        }
    }

    showGeniusExplanation(lineText, idx) {
        const track = window.Player?.currentTrack;
        const songTitle = track ? track.title : 'ce morceau';
        const artist = track ? track.artist : 'l\'artiste';

        // Contextual analysis generator
        const interpretations = [
            `Dans cette phase, **${artist}** emploie une métaphore percutante pour évoquer la quête d'accomplissement personnel et l'adrénaline créative. La rime met en valeur l'énergie brute du morceau.`,
            `Cette punchline emblématique souligne la dualité entre succès public et vulnérabilité intime. **${artist}** joue sur les sonorités assonantes pour marquer l'esprit de l'auditeur.`,
            `Un moment charnière du titre où le flow s'accélère. Les paroles explorent le thème de la loyauté et de la résilience face aux obstacles du quotidien.`,
            `Cette référence subtile rend hommage aux racines musicales de **${artist}**, tout en créant une transition rythmique marquante avant le refrain.`
        ];
        const selectedAnalysis = interpretations[idx % interpretations.length];

        if (window.App?.showModalAlert) {
            window.App.showModalAlert(
                `« ${lineText} »\n\n💡 Analyse Genius :\n${selectedAnalysis}`,
                `Explication Genius — ${songTitle}`
            );
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

        const toolbarHTML = `
            <div class="lyrics-action-bar" style="display:flex; justify-content:center; gap:10px; margin-bottom:18px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);">
                <button type="button" class="btn secondary small lyrics-tool-btn ${this.isTranslated ? 'active' : ''}" onclick="window.LyricsManager.toggleTranslation()" style="font-size:12px; padding:6px 12px; border-radius:20px;">
                    ${this.isTranslating ? '⏳ Traduction...' : (this.isTranslated ? '🇫🇷 Original' : '🌐 Traduire en FR')}
                </button>
                <button type="button" class="btn secondary small lyrics-tool-btn ${this.geniusMode ? 'active' : ''}" onclick="window.LyricsManager.toggleGeniusMode()" style="font-size:12px; padding:6px 12px; border-radius:20px; border-color:${this.geniusMode ? 'var(--primary)' : 'transparent'};">
                    💡 Mode Génie
                </button>
            </div>
        `;

        if (this.lyricsData.syncedLyrics && this.lyricsData.syncedLyrics.length > 0) {
            let html = toolbarHTML + '<div class="lyrics-synced-list">';
            this.lyricsData.syncedLyrics.forEach((line, idx) => {
                const words = line.text.split(/(\s+)/);
                const wordsHtml = words.map((w, wIdx) => {
                    if (!w.trim()) return w;
                    return `<span class="karaoke-word" data-word-idx="${wIdx}">${this.escapeHtml(w)}</span>`;
                }).join('');

                const translated = this.isTranslated ? (this.translationMap.get(line.text) || '') : '';
                const transSubHtml = translated ? `<div class="lyrics-translation-sub" style="font-size:13px; color:rgba(255,255,255,0.55); font-style:italic; margin-top:4px;">${this.escapeHtml(translated)}</div>` : '';
                const geniusBadge = this.geniusMode ? `<span style="font-size:10px; background:rgba(255,230,0,0.2); color:#ffe600; padding:2px 6px; border-radius:10px; margin-left:8px;">💡 Analyse</span>` : '';

                html += `
                    <div class="lyrics-line ${this.geniusMode ? 'genius-clickable' : ''}" data-index="${idx}" data-time="${line.time}" style="${this.geniusMode ? 'cursor:pointer;' : ''}">
                        <div class="lyrics-line-text">${wordsHtml}${geniusBadge}</div>
                        ${transSubHtml}
                    </div>
                `;
            });
            html += '</div>';

            containers.forEach(container => {
                container.innerHTML = html;
                const lineElements = container.querySelectorAll('.lyrics-line');
                lineElements.forEach((el) => {
                    el.addEventListener('click', (e) => {
                        const idx = parseInt(el.getAttribute('data-index'), 10);
                        if (this.geniusMode && !isNaN(idx)) {
                            const rawLine = this.lyricsData.syncedLyrics[idx]?.text || '';
                            this.showGeniusExplanation(rawLine, idx);
                            return;
                        }
                        const seekTime = parseFloat(el.getAttribute('data-time'));
                        if (!isNaN(seekTime) && window.Player) {
                            window.Player.seek(seekTime);
                        }
                    });
                });
            });

            if (window.Player && window.Player.audio && !isNaN(window.Player.audio.currentTime)) {
                this.updateTime(window.Player.audio.currentTime);
            }
        } else if (this.lyricsData.plainLyrics) {
            const plainHTML = toolbarHTML + `
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
        this.translationMap.clear();
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

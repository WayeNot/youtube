// Main Application Controller
const App = {
    currentView: 'home',
        currentFilter: 'all',
        currentSearchFilter: 'all',
        currentSearchQuery: '',
        currentSearchArtist: null,
        currentSearchResults: [],
        currentProfileUser: null,
        selectedTrackForPlaylist: null,
        searchDebounceTimer: null,

        init() {
            window.App = this;
            this.bindDOM();
            this.bindPlayerEvents();
            this.bindStorageEvents();
            this.bindKeyboardShortcuts();
            this.loadHome();
            this.initExploreView();
            this.renderPlaylists();
            this.renderFavorites();
            this.renderRecentSearches();
            if (window.LyricsManager && this.dom.sideLyricsContainer) {
                LyricsManager.setContainer(this.dom.sideLyricsContainer);
            }

            // Auth & Cloud Sync initial state
            this.updateAuthUI();
            if (Storage.isLoggedIn()) {
                Storage.pullFromCloud();
            }

            // Apply saved appearance & ambient glow settings
            const initialSettings = Storage.getSettings();
            if (initialSettings.accentColor) {
                this.applyAccentThemeDirect(initialSettings.accentColor, initialSettings.accentHoverColor);
            }
            if (typeof initialSettings.ambientGlow === 'boolean') {
                const glowEl = document.getElementById('ambient-glow');
                if (glowEl) glowEl.classList.toggle('disabled', !initialSettings.ambientGlow);
                const glowInput = document.getElementById('settings-ambient-glow');
                if (glowInput) glowInput.checked = initialSettings.ambientGlow;
            }

            // Initialize volume UI from saved settings
            if (Player.audio) {
                this.updateVolumeUI(Player.audio.volume, Player.audio.muted);
            }

            // Handle routing from both pathname (/user/:username, /user/:username/playlist/:name, /library, /explore) and hash
            this.handleRoute();
            window.addEventListener('popstate', () => this.handleRoute());
        },

        handleRoute() {
            // Auto-join Jam Session via URL query ?jam=XXXX
            const urlParams = new URLSearchParams(window.location.search);
            const jamCode = urlParams.get('jam');
            if (jamCode && window.JamSession) {
                setTimeout(() => window.JamSession.joinRoom(jamCode), 500);
            }

            const pathname = decodeURIComponent(window.location.pathname);
            const hash = window.location.hash.replace('#', '');
            const path = pathname !== '/' ? pathname : (hash ? '/' + hash : '/');

            // 1. /user/:username/playlist/:playlistName
            const userPlaylistMatch = path.match(/^\/user\/([^/]+)\/playlist\/([^/]+)/);
            if (userPlaylistMatch) {
                const username = userPlaylistMatch[1];
                const playlistName = userPlaylistMatch[2];
                this.openPlaylistView(playlistName, username);
                return;
            }

            // 2. /user/:username or /#user/:username
            const userMatch = path.match(/^\/user\/([^/]+)/);
            if (userMatch) {
                const username = decodeURIComponent(userMatch[1]);
                this.openUserProfile(username);
                return;
            }

            // 3. /artist/:name
            const artistMatch = path.match(/^\/artist\/([^/]+)/);
            if (artistMatch) {
                const artistName = decodeURIComponent(artistMatch[1]);
                this.openArtistView(artistName);
                return;
            }

            // 4. /playlist/:id
            const playlistMatch = path.match(/^\/playlist\/([^/]+)/);
            if (playlistMatch) {
                this.openPlaylistView(decodeURIComponent(playlistMatch[1]));
                return;
            }

            // 4b. /album/:id
            const albumMatch = path.match(/^\/album\/([^/]+)/);
            if (albumMatch) {
                this.openAlbumView(decodeURIComponent(albumMatch[1]));
                return;
            }

            // 5. Standard views (/vibetube, /explore, /library, /settings, /profile)
            if (path.startsWith('/vibetube')) {
                this.setAppMode('vibetube', false);
                let v = null;
                let q = null;
                let c = null;
                try {
                    const urlObj = new URL(window.location.href);
                    v = urlObj.searchParams.get('v');
                    q = urlObj.searchParams.get('q');
                    c = urlObj.searchParams.get('c');
                } catch (e) {}

                if (v) {
                    this.openVibeTubeVideo(v);
                } else if (path.startsWith('/vibetube/search')) {
                    if (q) this.executeVibeTubeSearch(q, false);
                    else this.switchView('vibetube-search', false);
                } else if (path.startsWith('/vibetube/channel')) {
                    const chMatch = path.match(/^\/vibetube\/channel\/([^/]+)/);
                    const chName = chMatch ? decodeURIComponent(chMatch[1]) : c;
                    if (chName) this.openVibeTubeChannel(chName);
                    else this.switchView('vibetube', false);
                } else if (path === '/vibetube/shorts') {
                    this.openVibeTubeShorts(false);
                } else if (path === '/vibetube/subscriptions') {
                    this.openVibeTubeSubscriptionsView(false);
                } else if (path === '/vibetube/trending') {
                    this.filterVibeTube('trending');
                } else if (path === '/vibetube/history') {
                    this.openVibeTubeLibrarySection('history', false);
                } else if (path === '/vibetube/watch-later') {
                    this.openVibeTubeLibrarySection('watch-later', false);
                } else if (path === '/vibetube/liked') {
                    this.openVibeTubeLibrarySection('liked', false);
                } else if (path === '/vibetube/playlists') {
                    this.openVibeTubeLibrarySection('playlists', false);
                } else {
                    this.switchView('vibetube', false);
                }
            } else if (path.startsWith('/channel/')) {
                const chMatch = path.match(/^\/channel\/([^/]+)/);
                if (chMatch) {
                    this.setAppMode('vibetube', false);
                    this.openVibeTubeChannel(decodeURIComponent(chMatch[1]));
                } else {
                    this.switchView('home', false);
                }
            } else if (path === '/admin') {
                this.openAdminPanel(false);
            } else if (path === '/vibestream') {
                this.setAppMode('vibestream', false);
                this.switchView('home', false);
            } else if (path.startsWith('/search')) {
                this.setAppMode('vibestream', false);
                let q = null;
                try {
                    q = new URL(window.location.href).searchParams.get('q');
                } catch (e) {}
                if (q) {
                    if (this.dom.searchInput) this.dom.searchInput.value = q;
                    this.executeSearch(q, true);
                } else {
                    this.switchView('search', false);
                }
            } else if (path === '/explore') {
                this.setAppMode('vibestream', false);
                this.switchView('explore', false);
            } else if (path === '/library' || path === '/library/liked') {
                this.setAppMode('vibestream', false);
                if (path === '/library/liked') {
                    this.openPlaylistView('liked_tracks');
                } else {
                    this.switchView('library', false);
                }
            } else if (path === '/settings') {
                this.setAppMode('vibestream', false);
                this.openSettings(null, false);
            } else if (path === '/profile') {
                this.setAppMode('vibestream', false);
                this.openMyProfile();
            } else {
                const savedMode = localStorage.getItem('vibe_app_mode') || 'vibestream';
                this.setAppMode(savedMode, false);
                if (savedMode === 'vibetube') {
                    this.switchView('vibetube', true);
                } else {
                    this.switchView('home', true);
                }
            }
        },

        bindDOM() {
            this.dom = {
                // App container & Views
                appSidebar: document.getElementById('app-sidebar'),
                sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
                brandHomeBtn: document.getElementById('brand-home-btn'),
                ambientGlow: document.getElementById('ambient-glow'),

                // Search
                searchInput: document.getElementById('search-input'),
                searchClearBtn: document.getElementById('search-clear-btn'),
                suggestionsDropdown: document.getElementById('suggestions-dropdown'),
                mobileSearchInput: document.getElementById('mobile-search-input'),
                mobileSearchClearBtn: document.getElementById('mobile-search-clear-btn'),
                mobileSuggestionsDropdown: document.getElementById('mobile-suggestions-dropdown'),
                searchResultsList: document.getElementById('search-results-list'),
                searchTitle: document.getElementById('search-title'),

                // Chips
                chipsContainer: document.getElementById('chips-container'),

                // Views
                viewHome: document.getElementById('view-home'),
                viewSearch: document.getElementById('view-search'),
                viewExplore: document.getElementById('view-explore'),
                viewLibrary: document.getElementById('view-library'),
                viewPlaylist: document.getElementById('view-playlist'),
                viewArtist: document.getElementById('view-artist'),
                artistAvatar: document.getElementById('artist-avatar-img') || document.getElementById('artist-avatar'),
                artistName: document.getElementById('artist-display-name') || document.getElementById('artist-name'),
                artistSubscribers: document.getElementById('artist-subscribers-text') || document.getElementById('artist-subscribers'),
                artistHeroGlow: document.getElementById('artist-hero-glow'),
                artistBioCard: document.getElementById('artist-bio-card'),
                artistBioText: document.getElementById('artist-bio-text'),
                artistPlayAllBtn: document.getElementById('artist-play-all-btn'),
                artistRadioBtn: document.getElementById('artist-radio-btn'),
                artistShuffleBtn: document.getElementById('artist-shuffle-btn'),
                artistTracksList: document.getElementById('artist-tracks-list'),
                artistAlbumsGrid: document.getElementById('artist-albums-grid'),

                // Album View
                viewAlbum: document.getElementById('view-album'),
                albumCoverImg: document.getElementById('album-cover-img'),
                albumDisplayTitle: document.getElementById('album-display-title'),
                albumArtistName: document.getElementById('album-artist-name'),
                albumReleaseYear: document.getElementById('album-release-year'),
                albumTracksCountText: document.getElementById('album-tracks-count-text'),
                albumTotalDurationText: document.getElementById('album-total-duration-text'),
                albumDescriptionText: document.getElementById('album-description-text'),
                albumPlayAllBtn: document.getElementById('album-play-all-btn'),
                albumShuffleBtn: document.getElementById('album-shuffle-btn'),
                albumBackArtistBtn: document.getElementById('album-back-artist-btn'),
                albumTracksList: document.getElementById('album-tracks-list'),
                albumHeroGlow: document.getElementById('album-hero-glow'),

                homeSectionsContainer: document.getElementById('home-sections-container'),
                genreGrid: document.getElementById('genre-grid'),

                // Library
                favoritesList: document.getElementById('favorites-list'),
                playlistsGrid: document.getElementById('playlists-grid'),
                historyList: document.getElementById('history-list'),
                sidebarCollections: document.getElementById('sidebar-collections'),
                sidebarPlaylists: document.getElementById('sidebar-playlists'),
                playAllFavoritesBtn: document.getElementById('play-all-favorites-btn'),
                shuffleFavoritesBtn: document.getElementById('shuffle-favorites-btn'),
                createPlaylistBtn: document.getElementById('create-playlist-btn'),
                createPlaylistBtn2: document.getElementById('create-playlist-btn-2'),
                clearHistoryBtn: document.getElementById('clear-history-btn'),

                // Single Playlist View
                playlistDetailTitle: document.getElementById('playlist-detail-title'),
                playlistDetailMeta: document.getElementById('playlist-detail-meta'),
                playlistTracksList: document.getElementById('playlist-tracks-list'),
                playlistPlayAllBtn: document.getElementById('playlist-play-all-btn'),
                playlistDeleteBtn: document.getElementById('playlist-delete-btn'),
                playlistBackBtn: document.getElementById('playlist-back-btn'),
                playlistPrivacyBadge: document.getElementById('playlist-privacy-badge'),
                playlistPrivacyToggleBtn: document.getElementById('playlist-privacy-toggle-btn'),
                playlistPrivacyIcon: document.getElementById('playlist-privacy-icon'),
                playlistPrivacyLabel: document.getElementById('playlist-privacy-label'),
                playlistCoverBig: document.getElementById('playlist-cover-big'),
                playlistCoverFileInput: document.getElementById('playlist-cover-file-input'),
                playlistCoverEditBadge: document.getElementById('playlist-cover-edit-badge'),

                // Desktop Player Bar
                desktopPlayerBar: document.getElementById('desktop-player-bar'),
                playerCover: document.getElementById('player-cover'),
                playerTitle: document.getElementById('player-title'),
                playerArtist: document.getElementById('player-artist'),
                playerFavBtn: document.getElementById('player-fav-btn'),
                playerAddToPlBtn: document.getElementById('player-add-to-pl-btn'),
                trackCoverBtn: document.getElementById('track-cover-btn'),

                // Controls
                playPauseBtn: document.getElementById('play-pause-btn'),
                playerSpinner: document.getElementById('player-spinner'),
                prevBtn: document.getElementById('prev-btn'),
                nextBtn: document.getElementById('next-btn'),
                shuffleBtn: document.getElementById('shuffle-btn'),
                repeatBtn: document.getElementById('repeat-btn'),
                repeatOneIndicator: document.querySelector('.repeat-one-indicator'),

                // Scrubber
                scrubberWrapper: document.getElementById('player-scrubber-wrapper'),
                playerProgress: document.getElementById('player-progress'),
                playerBuffered: document.getElementById('player-buffered'),
                playerScrubberThumb: document.getElementById('player-scrubber-thumb'),
                scrubTooltip: document.getElementById('scrub-tooltip'),
                currentTimeText: document.getElementById('current-time'),
                totalDurationText: document.getElementById('total-duration'),

                // Right tools
                modeAudioBtn: document.getElementById('mode-audio-btn'),
                modeVideoBtn: document.getElementById('mode-video-btn'),
                toggleLyricsBtn: document.getElementById('toggle-lyrics-btn'),
                toggleQueueBtn: document.getElementById('toggle-queue-btn'),
                downloadTrackBtn: document.getElementById('download-track-btn'),
                volumeSlider: document.getElementById('volume-slider'),
                muteBtn: document.getElementById('mute-btn'),

                // Side Panel (Lyrics & Queue)
                sidePanel: document.getElementById('side-panel'),
                closeSidePanelBtn: document.getElementById('close-side-panel-btn'),
                sideQueueList: document.getElementById('side-queue-list'),
                sideLyricsContainer: document.getElementById('side-lyrics-container'),
                autoplayRadioCheckbox: document.getElementById('autoplay-radio-checkbox'),
                clearQueueBtn: document.getElementById('clear-queue-btn'),

                // Mobile Mini Player
                mobileMiniPlayer: document.getElementById('mobile-mini-player'),
                miniCover: document.getElementById('mini-cover'),
                miniTitle: document.getElementById('mini-title'),
                miniArtist: document.getElementById('mini-artist'),
                miniPlayBtn: document.getElementById('mini-play-btn'),
                miniNextBtn: document.getElementById('mini-next-btn'),
                miniProgressFill: document.getElementById('mini-progress-fill'),

                // Mobile Fullscreen Player
                mobileFullscreenPlayer: document.getElementById('mobile-fullscreen-player'),
                closeFullscreenPlayerBtn: document.getElementById('close-fullscreen-player-btn'),
                mobileBigCover: document.getElementById('mobile-big-cover'),
                mobileTrackTitle: document.getElementById('mobile-track-title'),
                mobileTrackArtist: document.getElementById('mobile-track-artist'),
                mobilePlayerFavBtn: document.getElementById('mobile-player-fav-btn'),
                mobileAddToPlBtn: document.getElementById('mobile-add-to-pl-btn'),
                mobileSeekSlider: document.getElementById('mobile-seek-slider'),
                mobileCurrentTime: document.getElementById('mobile-current-time'),
                mobileTotalDuration: document.getElementById('mobile-total-duration'),
                mobileShuffleBtn: document.getElementById('mobile-shuffle-btn'),
                mobilePrevBtn: document.getElementById('mobile-prev-btn'),
                mobilePlayBtn: document.getElementById('mobile-play-btn'),
                mobileNextBtn: document.getElementById('mobile-next-btn'),
                mobileRepeatBtn: document.getElementById('mobile-repeat-btn'),
                mobileDownloadBtn: document.getElementById('mobile-download-btn'),
                mobileSleepBtn: document.getElementById('mobile-sleep-btn'),
                mobileEqBtn: document.getElementById('mobile-eq-btn'),
                mobileModeAudioBtn: document.getElementById('mobile-mode-audio-btn'),
                mobileModeVideoBtn: document.getElementById('mobile-mode-video-btn'),
                videoFrameContainer: document.getElementById('video-frame-container'),
                youtubeVideoIframe: document.getElementById('youtube-video-iframe'),
                mobileLyricsContainer: document.getElementById('mobile-lyrics-container'),
                mobileQueueList: document.getElementById('mobile-queue-list'),

                // Modals & Header Actions
                eqBtn: document.getElementById('eq-btn'),
                sleepTimerBtn: document.getElementById('sleep-timer-btn'),
                sleepTimerBadge: document.getElementById('sleep-timer-badge'),
                fullscreenBtn: document.getElementById('fullscreen-btn'),
                modalSleepTimer: document.getElementById('modal-sleep-timer'),
                cancelTimerBtn: document.getElementById('cancel-timer-btn'),
                modalEqualizer: document.getElementById('modal-equalizer'),
                modalPlaylistPicker: document.getElementById('modal-playlist-picker'),
                playlistPickerList: document.getElementById('playlist-picker-list'),
                newPlaylistInput: document.getElementById('new-playlist-input'),
                createAndAddPlBtn: document.getElementById('create-and-add-pl-btn'),
                toastContainer: document.getElementById('toast-container'),

                // Auth Modal & Pill
                authBtn: document.getElementById('auth-btn'),
                authBtnLabel: document.getElementById('auth-btn-label'),
                authBtnAvatar: document.getElementById('auth-btn-avatar'),
                authBtnIcon: document.getElementById('auth-btn-icon'),
                authDropdownArrow: document.getElementById('auth-dropdown-arrow'),
                userMenuWrapper: document.getElementById('user-menu-wrapper'),
                userDropdownMenu: document.getElementById('user-dropdown-menu'),
                dropdownUsernameDisplay: document.getElementById('dropdown-username-display'),
                modalAuth: document.getElementById('modal-auth'),
                authModalTitle: document.getElementById('auth-modal-title'),
                authModeDesc: document.getElementById('auth-mode-desc'),
                authTabLogin: document.getElementById('auth-tab-login'),
                authTabRegister: document.getElementById('auth-tab-register'),
                authForm: document.getElementById('auth-form'),
                authUsernameInput: document.getElementById('auth-username-input'),
                authPasswordInput: document.getElementById('auth-password-input'),
                authSubmitLabel: document.getElementById('auth-submit-label'),
                authErrorMsg: document.getElementById('auth-error-msg'),
                authStatusBox: document.getElementById('auth-status-box'),
                authStatusMsg: document.getElementById('auth-status-msg'),

                // Profile & Settings Views
                profileAvatarImg: document.getElementById('profile-avatar-img'),
                profileDisplayUsername: document.getElementById('profile-display-username'),
                profileBioText: document.getElementById('profile-bio-text'),
                profileStatLikes: document.getElementById('profile-stat-likes'),
                profileStatPlaylists: document.getElementById('profile-stat-playlists'),
                profileStatHistory: document.getElementById('profile-stat-history'),
                profileBadgesRow: document.getElementById('profile-badges-row'),
                profileBannerBg: document.getElementById('profile-banner-bg'),
                profileTopArtistsGrid: document.getElementById('profile-top-artists-grid'),
                profilePlaylistsGrid: document.getElementById('profile-playlists-grid'),
                settingsAvatarInput: document.getElementById('settings-avatar-input'),
                settingsBioInput: document.getElementById('settings-bio-input'),

                // Playlist Importer Modal
                modalImportPlaylist: document.getElementById('modal-import-playlist'),
                importYtUrlInput: document.getElementById('import-yt-url-input'),
                importYtNameInput: document.getElementById('import-yt-name-input'),
                submitImportYtBtn: document.getElementById('submit-import-yt-btn'),
                importTextInput: document.getElementById('import-text-input'),
                importTextNameInput: document.getElementById('import-text-name-input'),
                submitImportTextBtn: document.getElementById('submit-import-text-btn'),
                importLoadingIndicator: document.getElementById('import-loading-indicator'),
                importLoadingText: document.getElementById('import-loading-text'),

                // Import triggers
                headerImportBtn: document.getElementById('header-import-btn'),
                sidebarImportBtn: document.getElementById('sidebar-import-btn'),
                heroImportBtn: document.getElementById('hero-import-btn'),
                libraryImportPlaylistBtn: document.getElementById('library-import-playlist-btn'),

                // Recent searches container
                recentShelfContainer: document.getElementById('recent-shelf-container'),
                recentShelfList: document.getElementById('recent-shelf-list'),
                clearRecentSearchesBtn: document.getElementById('clear-recent-searches-btn'),

                // Export/Import
                exportDataBtn: document.getElementById('export-data-btn'),
                importDataBtn: document.getElementById('import-data-btn'),
                importFileInput: document.getElementById('import-file-input')
            };

            this.bindListeners();
            this.bindImportListeners();
        },

        bindImportListeners() {
            // Open import modal
            const openImportModal = () => {
                this.dom.modalImportPlaylist && this.dom.modalImportPlaylist.classList.remove('hidden');
            };

            if (this.dom.headerImportBtn) this.dom.headerImportBtn.onclick = openImportModal;
            if (this.dom.sidebarImportBtn) this.dom.sidebarImportBtn.onclick = openImportModal;
            if (this.dom.heroImportBtn) this.dom.heroImportBtn.onclick = openImportModal;
            if (this.dom.libraryImportPlaylistBtn) this.dom.libraryImportPlaylistBtn.onclick = openImportModal;

            // Import modal tab switching
            document.querySelectorAll('.import-tab').forEach((tab) => {
                tab.onclick = () => {
                    document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.import-tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    const target = tab.getAttribute('data-tab');
                    document.getElementById(`import-tab-${target}`)?.classList.add('active');
                };
            });

            // Submit YouTube / Spotify / Deezer URL Import
            if (this.dom.submitImportYtBtn) {
                this.dom.submitImportYtBtn.onclick = () => this.submitImportYouTube();
            }

            // Submit Text Tracklist Import
            if (this.dom.submitImportTextBtn) {
                this.dom.submitImportTextBtn.onclick = () => this.submitImportText();
            }

            // Clear recent searches button
            if (this.dom.clearRecentSearchesBtn) {
                this.dom.clearRecentSearchesBtn.onclick = () => {
                    Storage.clearRecentSearches();
                    this.renderRecentSearches();
                    this.showToast('Recherches récentes effacées');
                };
            }

            // Playlist Custom Cover File Upload
            if (this.dom.playlistCoverFileInput) {
                this.dom.playlistCoverFileInput.onchange = (e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file || !this.currentOpenPlaylist || this.currentOpenPlaylist.id === 'liked_tracks') return;

                    const reader = new FileReader();
                    reader.onload = (loadEvent) => {
                        const img = new Image();
                        img.onload = () => {
                            // Resize / compress to max 500x500 to keep local storage & cloud fast
                            const canvas = document.createElement('canvas');
                            const maxSize = 500;
                            let width = img.width;
                            let height = img.height;
                            if (width > height) {
                                if (width > maxSize) {
                                    height = Math.round((height * maxSize) / width);
                                    width = maxSize;
                                }
                            } else {
                                if (height > maxSize) {
                                    width = Math.round((width * maxSize) / height);
                                    height = maxSize;
                                }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

                            // Update storage & reload current playlist view
                            Storage.updatePlaylist(this.currentOpenPlaylist.id, { customCover: compressedDataUrl });
                            this.currentOpenPlaylist.customCover = compressedDataUrl;
                            this.renderPlaylists();
                            this.openPlaylistView(this.currentOpenPlaylist.id);
                            this.showToast('Cover de la playlist modifiée avec succès ! 🖼️');
                        };
                        img.src = loadEvent.target.result;
                    };
                    reader.readAsDataURL(file);
                    // Reset file input
                    this.dom.playlistCoverFileInput.value = '';
                };
            }
        },

        bindListeners() {
            this.initProfileAvatarUpload();
            this.initPlaylistModalFileUpload();

            // Sidebar Toggle
            if (this.dom.sidebarToggleBtn) {
                this.dom.sidebarToggleBtn.addEventListener('click', () => {
                    this.dom.appSidebar.classList.toggle('collapsed');
                });
            }

            if (this.dom.brandHomeBtn) {
                this.dom.brandHomeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.switchView('home');
                    this.loadHome();
                });
            }

            // Navigation Links
            document.querySelectorAll('[data-view]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    const view = el.getAttribute('data-view');
                    this.switchView(view);
                    if (view === 'home') {
                        this.loadHome();
                    }
                });
            });

            // Chips Filter
            this.dom.chipsContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('.chip');
                if (!chip) return;
                document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const filter = chip.getAttribute('data-filter');
                this.handleFilterChange(filter);
            });

            // Search Inputs & Suggestions
            this.dom.searchInput.addEventListener('focus', () => {
                const val = this.dom.searchInput.value.trim();
                if (!val) {
                    this.showRecentSearchSuggestions();
                } else if (val.length >= 2) {
                    this.fetchSuggestions(val);
                }
            });

            this.dom.searchInput.addEventListener('click', () => {
                const val = this.dom.searchInput.value.trim();
                if (!val) {
                    this.showRecentSearchSuggestions();
                }
            });

            this.dom.searchInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                this.dom.searchClearBtn.classList.toggle('hidden', !val);
                clearTimeout(this.searchDebounceTimer);
                if (!val) {
                    this.dom.suggestionsDropdown.classList.add('hidden');
                    this.showRecentSearchSuggestions();
                    return;
                }

                // Smooth debounced live query suggestions
                this.searchDebounceTimer = setTimeout(() => {
                    this.fetchSuggestions(val);
                }, 160);
            });

            this.dom.searchInput.addEventListener('keydown', (e) => {
                const items = Array.from(this.dom.suggestionsDropdown.querySelectorAll('.suggestion-item, .suggestion-artist-item, .suggestion-track-item'));
                const isDropdownOpen = !this.dom.suggestionsDropdown.classList.contains('hidden') && items.length > 0;

                if (e.key === 'ArrowDown' && isDropdownOpen) {
                    e.preventDefault();
                    let currentIdx = items.findIndex(el => el.classList.contains('active-nav'));
                    if (currentIdx >= 0) items[currentIdx].classList.remove('active-nav');
                    currentIdx = (currentIdx + 1) % items.length;
                    items[currentIdx].classList.add('active-nav');
                    items[currentIdx].scrollIntoView({ block: 'nearest' });
                    const q = items[currentIdx].getAttribute('data-query') || items[currentIdx].getAttribute('data-artist-name');
                    if (q) this.dom.searchInput.value = q;
                    return;
                }

                if (e.key === 'ArrowUp' && isDropdownOpen) {
                    e.preventDefault();
                    let currentIdx = items.findIndex(el => el.classList.contains('active-nav'));
                    if (currentIdx >= 0) items[currentIdx].classList.remove('active-nav');
                    currentIdx = (currentIdx - 1 + items.length) % items.length;
                    items[currentIdx].classList.add('active-nav');
                    items[currentIdx].scrollIntoView({ block: 'nearest' });
                    const q = items[currentIdx].getAttribute('data-query') || items[currentIdx].getAttribute('data-artist-name');
                    if (q) this.dom.searchInput.value = q;
                    return;
                }

                if (e.key === 'Escape') {
                    this.dom.suggestionsDropdown.classList.add('hidden');
                    return;
                }

                if (e.key === 'Enter') {
                    clearTimeout(this.searchDebounceTimer);
                    if (isDropdownOpen) {
                        const activeItem = items.find(el => el.classList.contains('active-nav'));
                        if (activeItem) {
                            e.preventDefault();
                            activeItem.click();
                            return;
                        }
                    }
                    const val = this.dom.searchInput.value.trim();
                    if (val) {
                        this.dom.suggestionsDropdown.classList.add('hidden');
                        this.executeSearch(val, true);
                    }
                }
            });

            this.dom.searchClearBtn.addEventListener('click', () => {
                this.dom.searchInput.value = '';
                if (this.dom.mobileSearchInput) this.dom.mobileSearchInput.value = '';
                this.dom.searchClearBtn.classList.add('hidden');
                this.dom.suggestionsDropdown.classList.add('hidden');
            });

            // Mobile in-view search input listeners
            if (this.dom.mobileSearchInput) {
                this.dom.mobileSearchInput.addEventListener('input', (e) => {
                    const val = e.target.value.trim();
                    this.dom.searchInput.value = e.target.value;
                    if (this.dom.mobileSearchClearBtn) {
                        this.dom.mobileSearchClearBtn.classList.toggle('hidden', !val);
                    }
                    clearTimeout(this.searchDebounceTimer);
                    if (!val) {
                        if (this.dom.mobileSuggestionsDropdown) this.dom.mobileSuggestionsDropdown.classList.add('hidden');
                        return;
                    }
                    this.searchDebounceTimer = setTimeout(() => {
                        this.fetchSuggestions(val, this.dom.mobileSuggestionsDropdown);
                    }, 160);
                });

                this.dom.mobileSearchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const val = this.dom.mobileSearchInput.value.trim();
                        if (val) {
                            clearTimeout(this.searchDebounceTimer);
                            if (this.dom.mobileSuggestionsDropdown) this.dom.mobileSuggestionsDropdown.classList.add('hidden');
                            this.executeSearch(val, true);
                        }
                    }
                });

                if (this.dom.mobileSearchClearBtn) {
                    this.dom.mobileSearchClearBtn.addEventListener('click', () => {
                        this.dom.mobileSearchInput.value = '';
                        this.dom.searchInput.value = '';
                        this.dom.mobileSearchClearBtn.classList.add('hidden');
                        if (this.dom.mobileSuggestionsDropdown) this.dom.mobileSuggestionsDropdown.classList.add('hidden');
                    });
                }
            }

            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.search-box-wrapper') && !e.target.closest('.search-view-input-box')) {
                    this.dom.suggestionsDropdown.classList.add('hidden');
                    if (this.dom.mobileSuggestionsDropdown) this.dom.mobileSuggestionsDropdown.classList.add('hidden');
                }
                if (!e.target.closest('.user-menu-wrapper')) {
                    this.closeUserDropdown();
                }
            });

            // Playback Controls (Desktop & Mobile)
            const togglePlay = () => Player.togglePlay();
            this.dom.playPauseBtn.addEventListener('click', togglePlay);
            this.dom.miniPlayBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePlay();
            });
            this.dom.mobilePlayBtn.addEventListener('click', togglePlay);

            const nextTrack = () => Player.playNext();
            this.dom.nextBtn.addEventListener('click', nextTrack);
            this.dom.miniNextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                nextTrack();
            });
            this.dom.mobileNextBtn.addEventListener('click', nextTrack);

            const prevTrack = () => Player.playPrevious();
            this.dom.prevBtn.addEventListener('click', prevTrack);
            this.dom.mobilePrevBtn.addEventListener('click', prevTrack);

            const toggleShuffle = () => {
                const isShuffled = Player.toggleShuffle();
                this.dom.shuffleBtn.classList.toggle('active', isShuffled);
                this.dom.mobileShuffleBtn.classList.toggle('active', isShuffled);
                this.showToast(isShuffled ? 'Lecture aléatoire activée' : 'Lecture aléatoire désactivée');
            };
            this.dom.shuffleBtn.addEventListener('click', toggleShuffle);
            this.dom.mobileShuffleBtn.addEventListener('click', toggleShuffle);

            const cycleRepeat = () => {
                const mode = Player.cycleRepeatMode();
                this.updateRepeatUI(mode);
            };
            this.dom.repeatBtn.addEventListener('click', cycleRepeat);
            this.dom.mobileRepeatBtn.addEventListener('click', cycleRepeat);

            // Scrubber (Desktop)
            let isScrubbing = false;
            this.dom.scrubberWrapper.addEventListener('click', (e) => {
                const rect = this.dom.scrubberWrapper.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const totalDur = Player.audio.duration || Player._currentDuration || Player.currentTrack?.durationSec || 0;
                if (totalDur > 0) {
                    Player.seek(pos * totalDur);
                }
            });

            this.dom.scrubberWrapper.addEventListener('mousemove', (e) => {
                const rect = this.dom.scrubberWrapper.getBoundingClientRect();
                const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const totalDur = Player.audio.duration || Player._currentDuration || Player.currentTrack?.durationSec || 0;
                if (totalDur > 0) {
                    const previewSec = pos * totalDur;
                    this.dom.scrubTooltip.textContent = this.formatTime(previewSec);
                    this.dom.scrubTooltip.style.left = `${pos * 100}%`;
                    this.dom.scrubTooltip.classList.remove('hidden');
                }
            });

            this.dom.scrubberWrapper.addEventListener('mouseleave', () => {
                this.dom.scrubTooltip.classList.add('hidden');
            });

            // Mobile Seek Slider
            this.dom.mobileSeekSlider.addEventListener('input', (e) => {
                const totalDur = Player.audio.duration || Player._currentDuration || Player.currentTrack?.durationSec || 0;
                if (totalDur > 0) {
                    const sec = (parseFloat(e.target.value) / 100) * totalDur;
                    this.dom.mobileCurrentTime.textContent = this.formatTime(sec);
                }
            });
            this.dom.mobileSeekSlider.addEventListener('change', (e) => {
                const totalDur = Player.audio.duration || Player._currentDuration || Player.currentTrack?.durationSec || 0;
                if (totalDur > 0) {
                    const sec = (parseFloat(e.target.value) / 100) * totalDur;
                    Player.seek(sec);
                }
            });

            // Volume Controls
            this.dom.volumeSlider.addEventListener('input', (e) => {
                Player.setVolume(parseFloat(e.target.value));
            });
            this.dom.muteBtn.addEventListener('click', () => {
                const muted = Player.toggleMute();
                this.updateVolumeUI(Player.audio.volume, muted);
            });

            // Mode Switcher (Audio / Video)
            const setAudioMode = () => this.setPlayerMode(false);
            const setVideoMode = () => this.setPlayerMode(true);
            if (this.dom.modeAudioBtn) this.dom.modeAudioBtn.addEventListener('click', setAudioMode);
            if (this.dom.mobileModeAudioBtn) this.dom.mobileModeAudioBtn.addEventListener('click', setAudioMode);
            if (this.dom.modeVideoBtn) this.dom.modeVideoBtn.addEventListener('click', setVideoMode);
            if (this.dom.mobileModeVideoBtn) this.dom.mobileModeVideoBtn.addEventListener('click', setVideoMode);

            // Side Panel Toggles (Queue)
            if (this.dom.toggleLyricsBtn) this.dom.toggleLyricsBtn.addEventListener('click', () => this.toggleSidePanel('lyrics'));
            if (this.dom.toggleQueueBtn) this.dom.toggleQueueBtn.addEventListener('click', () => this.toggleSidePanel('queue'));
            if (this.dom.closeSidePanelBtn) this.dom.closeSidePanelBtn.addEventListener('click', () => this.dom.sidePanel.classList.add('hidden'));

            document.querySelectorAll('.side-tab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    const target = tab.getAttribute('data-panel');
                    this.switchSidePanelTab(target);
                });
            });

            // Mobile Fullscreen Player Open / Close
            this.dom.mobileMiniPlayer.addEventListener('click', () => {
                this.openMobileFullscreenPlayer();
            });
            this.dom.trackCoverBtn.addEventListener('click', () => {
                this.openMobileFullscreenPlayer();
            });
            this.dom.closeFullscreenPlayerBtn.addEventListener('click', () => {
                this.closeMobileFullscreenPlayer();
            });

            // Swipe down gesture to dismiss mobile fullscreen player
            let touchStartY = 0;
            let touchStartX = 0;
            this.dom.mobileFullscreenPlayer.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
                touchStartX = e.touches[0].clientX;
            }, { passive: true });
            this.dom.mobileFullscreenPlayer.addEventListener('touchend', (e) => {
                const touchEndY = e.changedTouches[0].clientY;
                const touchEndX = e.changedTouches[0].clientX;
                const diffY = touchEndY - touchStartY;
                const diffX = touchEndX - touchStartX;

                // Swipe down to dismiss
                if (diffY > 90 && Math.abs(diffX) < 80) {
                    this.closeMobileFullscreenPlayer();
                }
                // Horizontal Swipe on Cover: Left = Next Track, Right = Previous Track
                else if (Math.abs(diffX) > 75 && Math.abs(diffY) < 60) {
                    if (diffX < 0) {
                        Player.playNext();
                        this.showToast('Titre suivant ⏭️');
                    } else {
                        Player.playPrevious();
                        this.showToast('Titre précédent ⏮️');
                    }
                }
            }, { passive: true });

            // Mobile Fullscreen Tabs (Meta / Lyrics / Queue)
            document.querySelectorAll('.mobile-tab-btn').forEach((tab) => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.mobile-tab-btn').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.mobile-tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    const target = tab.getAttribute('data-tab');
                    const content = document.getElementById(`mobile-tab-${target}`);
                    if (content) content.classList.add('active');

                    if (target === 'lyrics') {
                        if (window.LyricsManager && typeof window.LyricsManager.setContainer === 'function') {
                            window.LyricsManager.setContainer(this.dom.mobileLyricsContainer);
                            window.LyricsManager.render();
                        }
                    }
                });
            });

            // Favorites Toggle
            const toggleFav = () => {
                if (!Player.currentTrack) return;
                const isFav = Storage.toggleFavorite(Player.currentTrack);
                this.updateFavoriteUI(isFav);
                this.showToast(isFav ? 'Ajouté aux Titres favoris ❤️' : 'Retiré des favoris');
            };
            this.dom.playerFavBtn.addEventListener('click', toggleFav);
            this.dom.mobilePlayerFavBtn.addEventListener('click', toggleFav);

            // Add to playlist modal
            const openPlModal = () => {
                if (!Player.currentTrack) return;
                this.openPlaylistPicker(Player.currentTrack);
            };
            this.dom.playerAddToPlBtn.addEventListener('click', openPlModal);
            this.dom.mobileAddToPlBtn.addEventListener('click', openPlModal);

            // Download Offline
            const downloadTrack = () => {
                if (!Player.currentTrack) return;
                const url = API.getDownloadUrl(Player.currentTrack.id, Player.currentTrack.title);
                window.open(url, '_blank');
                this.showToast('Téléchargement lancé...');
            };
            this.dom.downloadTrackBtn.addEventListener('click', downloadTrack);
            this.dom.mobileDownloadBtn.addEventListener('click', downloadTrack);

            // Sleep Timer Modal
            const openSleepModal = () => this.dom.modalSleepTimer && this.dom.modalSleepTimer.classList.remove('hidden');
            if (this.dom.sleepTimerBtn) this.dom.sleepTimerBtn.addEventListener('click', openSleepModal);
            if (this.dom.mobileSleepBtn) this.dom.mobileSleepBtn.addEventListener('click', openSleepModal);

            document.querySelectorAll('.timer-option-btn[data-minutes]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const raw = btn.getAttribute('data-minutes');
                    const val = raw === 'end_of_track' ? 'end_of_track' : parseInt(raw, 10);
                    Player.setSleepTimer(val);
                    this.dom.modalSleepTimer.classList.add('hidden');
                    this.showToast(`Minuterie activée : ${raw === 'end_of_track' ? 'Fin du titre' : raw + ' min'}`);
                });
            });

            if (this.dom.cancelTimerBtn) {
                this.dom.cancelTimerBtn.addEventListener('click', () => {
                    Player.cancelSleepTimer();
                    if (this.dom.modalSleepTimer) this.dom.modalSleepTimer.classList.add('hidden');
                    this.showToast('Minuterie annulée');
                });
            }

            // Equalizer Modal
            const openEqModal = () => this.dom.modalEqualizer && this.dom.modalEqualizer.classList.remove('hidden');
            if (this.dom.eqBtn) this.dom.eqBtn.addEventListener('click', openEqModal);
            if (this.dom.mobileEqBtn) this.dom.mobileEqBtn.addEventListener('click', openEqModal);

            document.querySelectorAll('.eq-preset-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const preset = btn.getAttribute('data-preset');
                    Player.applyEqPreset(preset);
                    this.showToast(`Preset appliqué : ${btn.textContent}`);
                });
            });

            document.querySelectorAll('.eq-slider').forEach((slider) => {
                slider.addEventListener('input', (e) => {
                    const band = parseInt(e.target.getAttribute('data-band'), 10);
                    Player.setEqBand(band, parseFloat(e.target.value));
                });
            });

            // Close modal overlays on outside click or close btn
            document.querySelectorAll('.modal-overlay').forEach((modal) => {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal || e.target.closest('.close-modal-btn')) {
                        modal.classList.add('hidden');
                    }
                });
            });

            // Search Filter Pills (Tous, Titres, Artistes)
            document.querySelectorAll('.filter-pill').forEach((pill) => {
                pill.addEventListener('click', () => {
                    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    this.currentSearchFilter = pill.getAttribute('data-type') || 'all';
                    this.renderSearchResults();
                });
            });

            // Fullscreen Toggle
            if (this.dom.fullscreenBtn) {
                this.dom.fullscreenBtn.addEventListener('click', () => {
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen().catch(() => { });
                    } else {
                        document.exitFullscreen().catch(() => { });
                    }
                });
            }

            // Playlists Management
            const openCreatePl = () => {
                this.openCreatePlaylistModal();
            };
            if (this.dom.createPlaylistBtn) this.dom.createPlaylistBtn.addEventListener('click', openCreatePl);
            if (this.dom.createPlaylistBtn2) this.dom.createPlaylistBtn2.addEventListener('click', openCreatePl);

            const playlistShareBtn = document.getElementById('playlist-share-btn');
            if (playlistShareBtn) {
                playlistShareBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.shareCurrentPlaylist();
                });
            }

            const libImportBtn = document.getElementById('library-import-playlist-btn');
            if (libImportBtn) {
                libImportBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openImportModal();
                });
            }

            const heroImportBtn = document.getElementById('hero-import-btn');
            if (heroImportBtn) {
                heroImportBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openImportModal();
                });
            }

            const headerImportBtn = document.getElementById('header-import-btn');
            if (headerImportBtn) {
                headerImportBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openImportModal();
                });
            }

            const sidebarImportBtn = document.getElementById('sidebar-import-btn');
            if (sidebarImportBtn) {
                sidebarImportBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openImportModal();
                });
            }

            // Modal Create Playlist Enter key support
            const createPlInput = document.getElementById('new-playlist-modal-name');
            if (createPlInput) {
                createPlInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.submitCreatePlaylist();
                    } else if (e.key === 'Escape') {
                        this.closeCreatePlaylistModal();
                    }
                });
            }

            if (this.dom.createAndAddPlBtn) {
                this.dom.createAndAddPlBtn.addEventListener('click', () => {
                    const name = this.dom.newPlaylistInput ? this.dom.newPlaylistInput.value.trim() : '';
                    if (name && this.selectedTrackForPlaylist) {
                        const pl = Storage.createPlaylist(name);
                        Storage.addTrackToPlaylist(pl.id, this.selectedTrackForPlaylist);
                        if (this.dom.modalPlaylistPicker) this.dom.modalPlaylistPicker.classList.add('hidden');
                        if (this.dom.newPlaylistInput) this.dom.newPlaylistInput.value = '';
                        this.showToast(`Ajouté à "${pl.name}"`);
                    }
                });
            }

            // Library Sub-tabs
            document.querySelectorAll('.library-tab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    document.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.library-tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    const target = tab.getAttribute('data-tab');
                    const targetEl = document.getElementById(`library-tab-${target}`);
                    if (targetEl) targetEl.classList.add('active');
                    if (target === 'subscriptions') {
                        this.renderSubscriptions();
                    }
                });
            });

            window.addEventListener('subscriptions_changed', () => {
                this.renderSubscriptions();
            });

            if (this.dom.playAllFavoritesBtn) {
                this.dom.playAllFavoritesBtn.addEventListener('click', () => {
                    const favs = Storage.getFavorites();
                    if (favs.length > 0) Player.playTrack(favs[0], favs);
                });
            }

            if (this.dom.shuffleFavoritesBtn) {
                this.dom.shuffleFavoritesBtn.addEventListener('click', () => {
                    const favs = Storage.getFavorites();
                    if (favs.length > 0) {
                        Player.playTrack(favs[0], favs);
                        if (!Player.isShuffled) Player.toggleShuffle();
                    }
                });
            }

            if (this.dom.clearHistoryBtn) {
                this.dom.clearHistoryBtn.addEventListener('click', async () => {
                    const confirmed = await this.showModalConfirm('Effacer tout votre historique d\'écoute ? Cette action est irréversible.', 'Effacer l\'historique', 'Effacer', 'Annuler');
                    if (confirmed) {
                        Storage.clearHistory();
                        this.showToast('Historique effacé');
                    }
                });
            }

            if (this.dom.playlistBackBtn) {
                this.dom.playlistBackBtn.addEventListener('click', () => {
                    this.switchView('library');
                });
            }

            // Export / Import
            if (this.dom.exportDataBtn) this.dom.exportDataBtn.addEventListener('click', () => Storage.exportData());
            if (this.dom.importDataBtn && this.dom.importFileInput) {
                this.dom.importDataBtn.addEventListener('click', () => this.dom.importFileInput.click());
                this.dom.importFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (evt) => {
                        if (Storage.importData(evt.target.result)) {
                            this.showToast('Données restaurées !');
                        } else {
                            await this.showModalAlert('Le format du fichier JSON est invalide ou corrompu.', 'Erreur d\'importation');
                        }
                    };
                    reader.readAsText(file);
                }
            });
            }

            // Clear queue button
            if (this.dom.clearQueueBtn) this.dom.clearQueueBtn.addEventListener('click', () => Player.clearQueue());
            if (this.dom.mobileClearQueueBtn) this.dom.mobileClearQueueBtn.addEventListener('click', () => Player.clearQueue());

            // Global Event Delegation for Modals, Cards, Hero buttons & Shelves
            document.addEventListener('click', (e) => {
                // Universal modal triggers
                if (e.target.closest('#header-import-btn, #sidebar-import-btn, #library-import-playlist-btn, #hero-import-btn')) {
                    e.preventDefault();
                    this.openImportModal();
                    return;
                }
                if (e.target.closest('#create-playlist-btn, #create-playlist-btn-2')) {
                    e.preventDefault();
                    this.openCreatePlaylistModal();
                    return;
                }
                if (e.target.closest('#playlist-share-btn')) {
                    e.preventDefault();
                    this.shareCurrentPlaylist();
                    return;
                }
                if (e.target.closest('#profile-share-btn')) {
                    e.preventDefault();
                    this.shareUserProfile();
                    return;
                }
                if (e.target.closest('#profile-story-btn')) {
                    e.preventDefault();
                    this.openStoryGenerator();
                    return;
                }
                if (e.target.closest('#auth-btn')) {
                    e.preventDefault();
                    this.handleAuthBtnClick(e);
                    return;
                }

                // Modal backdrop & close button delegations
                const closeBtn = e.target.closest('.close-modal-btn');
                if (closeBtn) {
                    const modal = closeBtn.closest('.modal-overlay');
                    if (modal) {
                        this.closeModal(modal);
                        return;
                    }
                }
                if (e.target.classList.contains('modal-overlay')) {
                    this.closeModal(e.target);
                    return;
                }

                // Hero Random button
                if (e.target.closest('#hero-random-btn')) {
                    e.preventDefault();
                    this.playRandom();
                    return;
                }

                // Hero Hits button
                if (e.target.closest('#hero-hits-btn')) {
                    e.preventDefault();
                    this.playHits();
                    return;
                }

                // Hero Import button
                if (e.target.closest('#hero-import-btn')) {
                    e.preventDefault();
                    this.openImportModal();
                    return;
                }

                // Shelf Play All
                const playAllBtn = e.target.closest('.shelf-play-all-btn');
                if (playAllBtn) {
                    e.preventDefault();
                    const shelfId = playAllBtn.getAttribute('data-shelf-id');
                    const shelf = this.currentHomeSections?.find(s => s.id === shelfId);
                    if (shelf && shelf.items?.length > 0) {
                        Player.playTrack(shelf.items[0], shelf.items);
                        this.showToast(`Lecture : ${shelf.title}`);
                    } else {
                        // Check DOM siblings
                        const carousel = playAllBtn.closest('.home-shelf')?.querySelector('.shelf-carousel');
                        if (carousel) {
                            const firstCard = carousel.querySelector('[data-track-id]');
                            if (firstCard) {
                                const id = firstCard.getAttribute('data-track-id');
                                const t = this.findTrackInMemory(id);
                                if (t) Player.playTrack(t);
                            }
                        }
                    }
                    return;
                }

                // Shelf Refresh Random
                const refreshBtn = e.target.closest('.shelf-refresh-random-btn');
                if (refreshBtn) {
                    e.preventDefault();
                    this.showToast('Recherche de nouveaux sons aléatoires...');
                    refreshBtn.disabled = true;
                    API.getRandom().then((fresh) => {
                        refreshBtn.disabled = false;
                        if (fresh && fresh.length > 0) {
                            const shelfEl = refreshBtn.closest('.home-shelf');
                            if (shelfEl) {
                                const carousel = shelfEl.querySelector('.shelf-carousel');
                                if (carousel) {
                                    carousel.innerHTML = fresh.slice(0, 10).map(t => this.createMusicCardHTML(t)).join('');
                                    this.attachTrackClickHandlers(carousel);
                                }
                                const randSec = this.currentHomeSections?.find(s => s.id === 'random');
                                if (randSec) randSec.items = fresh;
                            }
                        }
                    }).catch(() => {
                        refreshBtn.disabled = false;
                    });
                    return;
                }

                // Music Card or Track Row click
                const cardOrRow = e.target.closest('.music-card[data-track-id], .track-row[data-track-id]');
                if (cardOrRow && !e.target.closest('button') && !e.target.closest('a')) {
                    const trackId = cardOrRow.getAttribute('data-track-id');
                    if (trackId) {
                        const track = this.findTrackInMemory(trackId);
                        if (track) {
                            // Collect sibling tracks in container
                            const parent = cardOrRow.closest('.shelf-carousel') || cardOrRow.closest('.tracks-list');
                            let queue = null;
                            if (parent) {
                                const all = Array.from(parent.querySelectorAll('[data-track-id]')).map(el => {
                                    const id = el.getAttribute('data-track-id');
                                    return this.findTrackInMemory(id);
                                }).filter(Boolean);
                                if (all.length > 1) queue = all;
                            }
                            Player.playTrack(track, queue);
                        }
                    }
                }
            });

            // Predictive audio pre-warming on hover (desktop) & touchstart/pointerdown (mobile)
            // Begins resolving YouTube stream URL into memory & NeonDB 200-800ms before click finishes
            const prewarmFromElement = (target) => {
                const el = target?.closest?.('[data-track-id]');
                if (!el) return;
                const trackId = el.getAttribute('data-track-id');
                if (trackId && window.API?.prefetch) {
                    window.API.prefetch(trackId);
                }
            };

            document.addEventListener('mouseover', (e) => {
                prewarmFromElement(e.target);
            }, { passive: true });

            document.addEventListener('touchstart', (e) => {
                prewarmFromElement(e.target);
            }, { passive: true });

            document.addEventListener('pointerdown', (e) => {
                prewarmFromElement(e.target);
            }, { passive: true });
        },

        bindPlayerEvents() {
            // Track Change
            window.addEventListener('player_track_change', (e) => {
                const { track } = e.detail;
                if (!track) return;
                this.updateNowPlayingUI(track);
                this.renderQueueUI();
                this.updateAmbientGlow(track.thumbnail);
                if (window.LyricsManager) {
                    window.LyricsManager.loadLyrics(track.title, track.artist);
                }
            });

            // Playback state
            window.addEventListener('player_playback_change', (e) => {
                const { isPlaying, isLoading } = e.detail;
                this.updatePlayStateUI(isPlaying, isLoading);
            });

            // Time update
            window.addEventListener('player_time_update', (e) => {
                const { currentTime, duration } = e.detail;
                this.updateProgressUI(currentTime, duration);
            });

            // Volume change
            window.addEventListener('player_volume_change', (e) => {
                const { volume, muted } = e.detail;
                this.updateVolumeUI(volume, muted);
            });

            // Queue change
            window.addEventListener('player_queue_change', () => {
                this.renderQueueUI();
            });

            // Sleep Timer Events
            window.addEventListener('player_sleep_timer_set', () => {
                if (this.dom.sleepTimerBadge) this.dom.sleepTimerBadge.classList.remove('hidden');
                if (this.dom.cancelTimerBtn) this.dom.cancelTimerBtn.classList.remove('hidden');
            });

            window.addEventListener('player_sleep_timer_tick', (e) => {
                const mins = Math.ceil(e.detail.remainingSeconds / 60);
                if (this.dom.sleepTimerBadge) this.dom.sleepTimerBadge.textContent = `${mins}m`;
            });

            window.addEventListener('player_sleep_timer_ended', () => {
                if (this.dom.sleepTimerBadge) this.dom.sleepTimerBadge.classList.add('hidden');
                if (this.dom.cancelTimerBtn) this.dom.cancelTimerBtn.classList.add('hidden');
                this.showToast('Minuterie de veille terminée, musique mise en pause.');
            });

            window.addEventListener('player_sleep_timer_cancelled', () => {
                if (this.dom.sleepTimerBadge) this.dom.sleepTimerBadge.classList.add('hidden');
                if (this.dom.cancelTimerBtn) this.dom.cancelTimerBtn.classList.add('hidden');
            });

            // Cloud settings synchronization
            window.addEventListener('settings_changed', (e) => {
                const s = e.detail?.settings;
                if (!s) return;
                if (s.accentColor) {
                    this.applyAccentThemeDirect(s.accentColor, s.accentHoverColor);
                }
                if (typeof s.ambientGlow === 'boolean') {
                    const glowEl = document.getElementById('ambient-glow');
                    if (glowEl) glowEl.classList.toggle('disabled', !s.ambientGlow);
                    const glowInput = document.getElementById('settings-ambient-glow');
                    if (glowInput) glowInput.checked = s.ambientGlow;
                }
            });

            // Error
            window.addEventListener('player_error', (e) => {
                this.showToast(e.detail?.message || 'Erreur de lecture');
            });
        },

        bindStorageEvents() {
            window.addEventListener('favorites_changed', () => {
                this.renderFavorites();
                if (Player.currentTrack) {
                    this.updateFavoriteUI(Storage.isFavorite(Player.currentTrack.id));
                }
            });

            window.addEventListener('playlists_changed', () => {
                this.renderPlaylists();
            });

            window.addEventListener('history_changed', () => {
                this.renderHistory();
                if (this.currentView === 'home') {
                    this.loadHome();
                }
            });

            window.addEventListener('recent_searches_changed', () => {
                this.renderRecentSearches();
            });

            window.addEventListener('auth_changed', () => {
                this.updateAuthUI();
                this.renderPlaylists();
                this.renderFavorites();
                this.renderHistory();
                if (this.currentView === 'home') {
                    this.loadHome();
                }
            });
        },

        bindKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                // Ignore if user typing in input
                if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

                switch (e.code) {
                    case 'Space':
                        e.preventDefault();
                        Player.togglePlay();
                        break;
                    case 'ArrowLeft':
                        e.preventDefault();
                        Player.seek(Player.audio.currentTime - 5);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        Player.seek(Player.audio.currentTime + 5);
                        break;
                    case 'ArrowUp':
                        e.preventDefault();
                        Player.setVolume(Player.audio.volume + 0.05);
                        break;
                    case 'ArrowDown':
                        e.preventDefault();
                        Player.setVolume(Player.audio.volume - 0.05);
                        break;
                    case 'KeyN':
                    case 'KeyK': // J/K next track style
                        e.preventDefault();
                        Player.playNext();
                        this.showToast('Titre suivant ⏭️');
                        break;
                    case 'KeyP':
                    case 'KeyJ': // previous track
                        e.preventDefault();
                        Player.playPrevious();
                        this.showToast('Titre précédent ⏮️');
                        break;
                    case 'KeyM':
                        Player.toggleMute();
                        break;
                    case 'KeyL':
                        if (Player.currentTrack) {
                            const isFav = Storage.toggleFavorite(Player.currentTrack);
                            this.updateFavoriteUI(isFav);
                            this.showToast(isFav ? 'Ajouté aux favoris ❤️' : 'Retiré des favoris');
                        }
                        break;
                    case 'KeyQ':
                        this.toggleSidePanel('queue');
                        break;
                    case 'KeyF':
                        this.dom.fullscreenBtn.click();
                        break;
                    case 'Slash':
                        e.preventDefault();
                        if (window.innerWidth <= 768 && this.dom.mobileSearchInput) {
                            this.switchView('search');
                            this.dom.mobileSearchInput.focus();
                        } else if (this.dom.searchInput) {
                            this.dom.searchInput.focus();
                            this.dom.searchInput.select();
                            this.showRecentSearchSuggestions();
                        }
                        break;
                }

                // Global Ctrl+K / Cmd+K search shortcut
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    if (window.innerWidth <= 768 && this.dom.mobileSearchInput) {
                        this.switchView('search');
                        this.dom.mobileSearchInput.focus();
                    } else if (this.dom.searchInput) {
                        this.dom.searchInput.focus();
                        this.dom.searchInput.select();
                        this.showRecentSearchSuggestions();
                    }
                }
            });
        },

        // -------------------------------------------------------------
        // VIEWS & NAVIGATION
        // -------------------------------------------------------------
        updateURL(path) {
            if (window.location.pathname !== path) {
                window.history.pushState({}, '', path);
            }
        },

        switchView(viewName, updatePath = true) {
            this.currentView = viewName;
            const videoViews = ['vibetube', 'vibetube-search', 'vibetube-channel', 'vibetube-watch', 'vibetube-library', 'vibetube-shorts', 'vibetube-subscriptions'];
            const isVideoView = videoViews.includes(viewName);

            // Automatically synchronize app mode with active view
            if (isVideoView && this.currentAppMode !== 'vibetube') {
                this.setAppMode('vibetube', false);
            } else if (!isVideoView && this.currentAppMode === 'vibetube' && viewName !== 'admin') {
                this.setAppMode('vibestream', false);
            }

            // If switching away from watch view, stop iframe video
            if (viewName !== 'vibetube-watch') {
                const watchIframe = document.getElementById('vibetube-watch-iframe');
                if (watchIframe && watchIframe.src) watchIframe.src = '';
            }

            if (updatePath) {
                const pathMap = {
                    home: '/vibestream',
                    explore: '/explore',
                    library: '/library',
                    settings: '/settings',
                    search: '/search',
                    album: '/album',
                    admin: '/admin',
                    vibetube: '/vibetube',
                    'vibetube-shorts': '/vibetube/shorts',
                    'vibetube-subscriptions': '/vibetube/subscriptions',
                    'vibetube-search': '/vibetube/search',
                    'vibetube-channel': '/vibetube/channel',
                    'vibetube-watch': '/vibetube/watch',
                    'vibetube-library': `/vibetube/${this.currentVibeTubeLibSection || 'history'}`,
                    error: '/error'
                };
                const newPath = pathMap[viewName] || `/${viewName}`;
                this.updateURL(newPath);
            }

            // Hide mood/filter chips on any page that is NOT home
            if (this.dom.chipsContainer) {
                this.dom.chipsContainer.classList.toggle('hidden', viewName !== 'home');
            }

            // Update Music Nav links
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-view') === viewName);
            });
            document.querySelectorAll('.mobile-nav-item').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-view') === viewName);
            });

            // Update VibeTube Sidebar Nav links
            document.querySelectorAll('.vibetube-nav-item').forEach(el => {
                const navKey = el.getAttribute('data-vibetube-nav');
                el.classList.toggle('active', navKey === viewName || (viewName === 'vibetube' && navKey === 'home'));
            });

            // If switching away from playlist view, clear active playlist highlight
            if (viewName !== 'playlist') {
                this.currentActivePlaylistId = null;
                document.querySelectorAll('.playlist-nav-item').forEach(el => {
                    el.classList.remove('active');
                });
            }

            // Update View sections
            document.querySelectorAll('.view-section').forEach(sec => {
                sec.classList.remove('active');
            });

            const activeView = document.getElementById(`view-${viewName}`);
            if (activeView) activeView.classList.add('active');

            // Scroll to top
            const appMain = document.getElementById('app-main');
            if (appMain) appMain.scrollTop = 0;

            // Always render sidebar playlists on music pages
            if (!isVideoView) {
                this.renderPlaylists();
            }

            if (viewName === 'home') {
                if (!this.dom.homeSectionsContainer || !this.dom.homeSectionsContainer.hasChildNodes() || this.dom.homeSectionsContainer.children.length === 0) {
                    this.loadHome();
                }
            }

            if (viewName === 'vibetube') {
                this.loadVibeTubeFeed(this.currentVibeTubeCategory || 'cyber');
            }

            if (viewName === 'library') {
                this.renderFavorites();
                this.renderHistory();
            }

            if (viewName === 'search') {
                if (this.dom.mobileSearchInput && this.dom.searchInput) {
                    this.dom.mobileSearchInput.value = this.dom.searchInput.value;
                }
                if (window.innerWidth <= 768 && this.dom.mobileSearchInput) {
                    setTimeout(() => { this.dom.mobileSearchInput.focus(); }, 150);
                }
            }
        },

        showErrorView(title = 'Page introuvable', message = 'Cet utilisateur ou cette playlist n\'existe pas ou a été supprimée.') {
            this.switchView('error', false);
            const titleEl = document.getElementById('error-view-title');
            const msgEl = document.getElementById('error-view-message');
            if (titleEl) titleEl.textContent = title;
            if (msgEl) msgEl.textContent = message;
        },

        async loadHome() {
            const defaultStarters = [
                { id: 'FGBhQbmPwH8', title: 'Daft Punk - One More Time', artist: 'Daft Punk', duration: '5:22', durationSec: 322, thumbnail: 'https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg' },
                { id: 'XXYlFuWEuKI', title: 'The Weeknd - Save Your Tears', artist: 'The Weeknd', duration: '4:09', durationSec: 249, thumbnail: 'https://i.ytimg.com/vi/XXYlFuWEuKI/hqdefault.jpg' },
                { id: 'a5uQMwRMHcs', title: 'Daft Punk - Instant Crush ft. Julian Casablancas', artist: 'Daft Punk', duration: '5:40', durationSec: 340, thumbnail: 'https://i.ytimg.com/vi/a5uQMwRMHcs/hqdefault.jpg' },
                { id: '2DwR_0wp95g', title: "Naza (ft. JUL) - Pas d'problèmes", artist: 'NAZA', duration: '2:50', durationSec: 170, thumbnail: 'https://i.ytimg.com/vi/2DwR_0wp95g/hqdefault.jpg' },
                { id: '4NRXx6U8ABQ', title: 'The Weeknd - Blinding Lights', artist: 'The Weeknd', duration: '3:20', durationSec: 200, thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg' },
                { id: 'fJ9rUzIMcZQ', title: 'Queen - Bohemian Rhapsody', artist: 'Queen', duration: '5:59', durationSec: 359, thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg' },
                { id: 'k2qgadSvNyU', title: 'Dua Lipa - New Rules', artist: 'Dua Lipa', duration: '3:45', durationSec: 225, thumbnail: 'https://i.ytimg.com/vi/k2qgadSvNyU/hqdefault.jpg' },
                { id: 'gAjR4_CbPpQ', title: 'Daft Punk - Harder, Better, Faster, Stronger', artist: 'Daft Punk', duration: '3:43', durationSec: 223, thumbnail: 'https://i.ytimg.com/vi/gAjR4_CbPpQ/hqdefault.jpg' }
            ];

            const topHits = [
                { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', artist: 'Rick Astley', duration: '3:33', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
                { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You', artist: 'Ed Sheeran', duration: '4:23', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg' },
                { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', artist: 'Luis Fonsi', duration: '4:41', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg' },
                { id: 'OPf0YbXqDm0', title: 'Mark Ronson - Uptown Funk ft. Bruno Mars', artist: 'Mark Ronson', duration: '4:30', thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg' },
                { id: '09R8_2nJtjg', title: 'Maroon 5 - Sugar', artist: 'Maroon 5', duration: '5:01', thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg' },
                { id: 'YQHsXMglC9A', title: 'Adele - Hello', artist: 'Adele', duration: '6:06', thumbnail: 'https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg' }
            ];

            const rapHits = [
                { id: 'ifNfpzkoY9s', title: 'Ninho - Lettre à une femme', artist: 'Ninho', duration: '2:38', thumbnail: 'https://i.ytimg.com/vi/ifNfpzkoY9s/hqdefault.jpg' },
                { id: 'HqJ1qP05Si0', title: 'Ninho - Tout en Guerilla', artist: 'Ninho', duration: '3:45', thumbnail: 'https://i.ytimg.com/vi/HqJ1qP05Si0/hqdefault.jpg' },
                { id: 'iv03LRtztJU', title: 'SDM - Bolide Allemand', artist: 'SDM', duration: '2:56', thumbnail: 'https://i.ytimg.com/vi/iv03LRtztJU/hqdefault.jpg' },
                { id: '6SasSMzZeao', title: 'Gazo - DIE', artist: 'Gazo', duration: '3:01', thumbnail: 'https://i.ytimg.com/vi/6SasSMzZeao/hqdefault.jpg' },
                { id: 'Qq7Q6CLCfvs', title: 'Tiakola - Meuda', artist: 'Tiakola', duration: '3:15', thumbnail: 'https://i.ytimg.com/vi/Qq7Q6CLCfvs/hqdefault.jpg' }
            ];

            const chillHits = [
                { id: 'rFZHOHl-L8A', title: 'lofi hip hop radio - beats to relax/study to', artist: 'Lofi Girl', duration: 'Live', thumbnail: 'https://i.ytimg.com/vi/rFZHOHl-L8A/hqdefault.jpg' },
                { id: '5qap5aO4i9A', title: 'Lofi Hip Hop - Chill Beats', artist: 'ChilledCow', duration: '3:20', thumbnail: 'https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg' },
                { id: 'DWcJFNfaw9c', title: 'C418 - Sweden (Minecraft Music)', artist: 'C418', duration: '3:35', thumbnail: 'https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg' },
                { id: '7maJOI3QMu0', title: 'Yiruma - River Flows in You', artist: 'Yiruma', duration: '3:08', thumbnail: 'https://i.ytimg.com/vi/7maJOI3QMu0/hqdefault.jpg' }
            ];

            const history = Storage.getHistory();
            const hasHistory = Array.isArray(history) && history.length > 0;

            // 1. History Shelf (Titres dernièrement écoutés) - Exactement les 10 derniers titres en carrousel
            let historyShelfHTML = '';
            if (hasHistory) {
                const recentTracks = history.slice(0, 10);
                historyShelfHTML = `
          <div class="home-shelf" data-shelf-id="recent-history">
            <div class="shelf-header">
              <div style="display:flex;align-items:center;gap:10px;">
                <h2 class="shelf-title">🕒 Titres dernièrement écoutés</h2>
                <div class="shelf-nav-arrows">
                  <button type="button" class="shelf-arrow-btn" title="Précédent" onclick="const c = document.getElementById('home-history-carousel'); if(c) c.scrollBy({left: -360, behavior: 'smooth'});">
                    <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                  </button>
                  <button type="button" class="shelf-arrow-btn" title="Suivant" onclick="const c = document.getElementById('home-history-carousel'); if(c) c.scrollBy({left: 360, behavior: 'smooth'});">
                    <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                  </button>
                </div>
              </div>
              <div class="shelf-actions">
                <button class="btn primary small" id="home-play-all-recent-btn">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  <span>Tout écouter</span>
                </button>
              </div>
            </div>
            <div class="shelf-carousel horizontal-shelf-carousel" id="home-history-carousel">
              ${recentTracks.map(item => this.createMusicCardHTML(item)).join('')}
            </div>
          </div>
        `;
            }

            // 2. Random tracks & Discoveries - Always displayed!
            const initialRandom = (this._cachedRandomTracks && this._cachedRandomTracks.length > 0)
                ? this._cachedRandomTracks
                : defaultStarters;

            const randomShelfHTML = `
        <div class="home-shelf" data-shelf-id="random-discoveries">
          <div class="shelf-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <h2 class="shelf-title">🎲 Titres aléatoires & Découvertes</h2>
              <div class="shelf-nav-arrows">
                <button type="button" class="shelf-arrow-btn" title="Précédent" onclick="const c = document.getElementById('home-random-carousel'); if(c) c.scrollBy({left: -360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <button type="button" class="shelf-arrow-btn" title="Suivant" onclick="const c = document.getElementById('home-random-carousel'); if(c) c.scrollBy({left: 360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
            </div>
            <div class="shelf-actions">
              <button class="btn primary small" id="home-play-all-random-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Tout écouter</span>
              </button>
              <button class="btn secondary small" id="home-refresh-random-btn">
                <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                <span>Nouveaux sons</span>
              </button>
            </div>
          </div>
          <div class="shelf-carousel horizontal-shelf-carousel" id="home-random-carousel">
            ${initialRandom.map(item => this.createMusicCardHTML(item)).join('')}
          </div>
        </div>
      `;

            // 3. Additional rich shelves for rich browsing experience
            const topHitsShelfHTML = `
        <div class="home-shelf" data-shelf-id="top-hits">
          <div class="shelf-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <h2 class="shelf-title">🔥 Hits du Moment & Tendances</h2>
              <div class="shelf-nav-arrows">
                <button type="button" class="shelf-arrow-btn" title="Précédent" onclick="const c = document.getElementById('home-tophits-carousel'); if(c) c.scrollBy({left: -360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <button type="button" class="shelf-arrow-btn" title="Suivant" onclick="const c = document.getElementById('home-tophits-carousel'); if(c) c.scrollBy({left: 360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
            </div>
            <div class="shelf-actions">
              <button class="btn secondary small" id="home-play-all-tophits-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Écouter</span>
              </button>
            </div>
          </div>
          <div class="shelf-carousel horizontal-shelf-carousel" id="home-tophits-carousel">
            ${topHits.map(item => this.createMusicCardHTML(item)).join('')}
          </div>
        </div>
      `;

            const rapShelfHTML = `
        <div class="home-shelf" data-shelf-id="rap-fr">
          <div class="shelf-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <h2 class="shelf-title">⚡ Rap Français & Urbain</h2>
              <div class="shelf-nav-arrows">
                <button type="button" class="shelf-arrow-btn" title="Précédent" onclick="const c = document.getElementById('home-rap-carousel'); if(c) c.scrollBy({left: -360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <button type="button" class="shelf-arrow-btn" title="Suivant" onclick="const c = document.getElementById('home-rap-carousel'); if(c) c.scrollBy({left: 360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
            </div>
            <div class="shelf-actions">
              <button class="btn secondary small" id="home-play-all-rap-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Écouter</span>
              </button>
            </div>
          </div>
          <div class="shelf-carousel horizontal-shelf-carousel" id="home-rap-carousel">
            ${rapHits.map(item => this.createMusicCardHTML(item)).join('')}
          </div>
        </div>
      `;

            const chillShelfHTML = `
        <div class="home-shelf" data-shelf-id="chill-lofi">
          <div class="shelf-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <h2 class="shelf-title">☕ Chill, Lo-Fi & Détente</h2>
              <div class="shelf-nav-arrows">
                <button type="button" class="shelf-arrow-btn" title="Précédent" onclick="const c = document.getElementById('home-chill-carousel'); if(c) c.scrollBy({left: -360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                </button>
                <button type="button" class="shelf-arrow-btn" title="Suivant" onclick="const c = document.getElementById('home-chill-carousel'); if(c) c.scrollBy({left: 360, behavior: 'smooth'});">
                  <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
                </button>
              </div>
            </div>
            <div class="shelf-actions">
              <button class="btn secondary small" id="home-play-all-chill-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Écouter</span>
              </button>
            </div>
          </div>
          <div class="shelf-carousel horizontal-shelf-carousel" id="home-chill-carousel">
            ${chillHits.map(item => this.createMusicCardHTML(item)).join('')}
          </div>
        </div>
      `;

            this.dom.homeSectionsContainer.innerHTML = `
        <div class="home-shelves-list">
          ${historyShelfHTML}
          ${randomShelfHTML}
          ${topHitsShelfHTML}
          ${rapShelfHTML}
          ${chillShelfHTML}
        </div>
      `;

            this.attachTrackClickHandlers(this.dom.homeSectionsContainer);

            // Bind history action button if present
            if (hasHistory) {
                const playRecentBtn = document.getElementById('home-play-all-recent-btn');
                if (playRecentBtn) {
                    playRecentBtn.onclick = () => {
                        if (history.length > 0) Player.playTrack(history[0], history);
                    };
                }
            }

            // Bind random actions (Play all & refresh)
            let currentRandom = initialRandom;
            const playRandomBtn = document.getElementById('home-play-all-random-btn');
            if (playRandomBtn) {
                playRandomBtn.onclick = () => {
                    if (currentRandom.length > 0) Player.playTrack(currentRandom[0], currentRandom);
                };
            }

            const refreshRandomBtn = document.getElementById('home-refresh-random-btn');
            if (refreshRandomBtn) {
                refreshRandomBtn.onclick = async () => {
                    this.showToast('Recherche de nouveaux sons aléatoires...');
                    refreshRandomBtn.disabled = true;
                    try {
                        const fresh = await API.getRandom();
                        if (fresh && fresh.length > 0) {
                            this._cachedRandomTracks = fresh;
                            currentRandom = fresh;
                            const c = document.getElementById('home-random-carousel');
                            if (c) {
                                c.innerHTML = fresh.map(t => this.createMusicCardHTML(t)).join('');
                                this.attachTrackClickHandlers(c);
                            }
                        }
                    } catch (e) {
                    } finally {
                        refreshRandomBtn.disabled = false;
                    }
                };
            }

            // Fetch fresh random songs in background if not already cached
            if (!this._cachedRandomTracks || this._cachedRandomTracks.length === 0) {
                API.getRandom().then(fresh => {
                    if (fresh && fresh.length > 0) {
                        this._cachedRandomTracks = fresh;
                        currentRandom = fresh;
                        const c = document.getElementById('home-random-carousel');
                        if (c) {
                            c.innerHTML = fresh.map(t => this.createMusicCardHTML(t)).join('');
                            this.attachTrackClickHandlers(c);
                        }
                    }
                }).catch(() => { });
            }

            // Bind additional shelf play buttons
            const playTopHits = document.getElementById('home-play-all-tophits-btn');
            if (playTopHits) playTopHits.onclick = () => Player.playTrack(topHits[0], topHits);

            const playRap = document.getElementById('home-play-all-rap-btn');
            if (playRap) playRap.onclick = () => Player.playTrack(rapHits[0], rapHits);

            const playChill = document.getElementById('home-play-all-chill-btn');
            if (playChill) playChill.onclick = () => Player.playTrack(chillHits[0], chillHits);

            // Background pre-warm popular starters so initial playback starts in < 200ms
            if (window.API?.prefetchBatch) {
                const starterIds = [...defaultStarters.slice(0, 3), ...topHits.slice(0, 3)].map(t => t.id).filter(Boolean);
                API.prefetchBatch(starterIds);
            }
        },

        createMusicCardHTML(track) {
            return `
        <div class="music-card" data-track-id="${track.id}">
          <div class="card-thumb-wrapper">
            <img src="${track.thumbnail}" alt="${this.escapeHtml(track.title)}" loading="lazy">
            <div class="card-play-overlay" title="Écouter">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <span class="card-duration">${track.duration || '3:30'}</span>
          </div>
          <span class="card-title" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</span>
          <span class="card-artist" title="${this.escapeHtml(track.artist)}">${this.escapeHtml(track.artist)}</span>
        </div>
      `;
        },

        createTrackRowHTML(track, index = null, isPlaylist = false, playlistId = null) {
            const isCurrent = Player.currentTrack?.id === track.id;
            return `
        <div class="track-row ${isCurrent ? 'playing' : ''}" data-track-id="${track.id}">
          ${index !== null ? `<span class="row-index">${index + 1}</span>` : ''}
          <img src="${track.thumbnail}" alt="" class="row-thumb" loading="lazy">
          <div class="row-info">
            <span class="row-title">${this.escapeHtml(track.title)}</span>
            <span class="row-artist">${this.escapeHtml(track.artist)}</span>
          </div>
          <div class="row-actions">
            <button class="icon-btn small row-fav-btn ${Storage.isFavorite(track.id) ? 'favorited' : ''}" data-id="${track.id}" title="${Storage.isFavorite(track.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
              <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
            <button class="icon-btn small row-add-pl-btn" data-id="${track.id}" title="Ajouter à une playlist">
              <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
            </button>
            <button class="icon-btn small row-download-btn" data-id="${track.id}" title="Télécharger ou écouter hors-ligne">
              <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
            </button>
            ${isPlaylist ? `
            <button class="icon-btn small row-remove-track-btn" data-pl-id="${playlistId}" data-track-id="${track.id}" title="${playlistId === 'liked_tracks' ? 'Retirer des favoris' : 'Retirer de la playlist'}">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>` : ''}
          </div>
          <span class="row-duration">${track.duration || '3:30'}</span>
        </div>
      `;
        },

        attachTrackClickHandlers(container) {
            // Artist name direct navigation
            container.querySelectorAll('.row-artist, .card-artist').forEach((artistEl) => {
                artistEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const artistName = artistEl.getAttribute('data-artist') || artistEl.textContent.trim();
                    if (artistName && artistName !== 'YouTube Music') {
                        this.openArtistView(artistName);
                    }
                });
            });

            container.querySelectorAll('[data-track-id]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.row-fav-btn') || e.target.closest('.row-add-pl-btn') || e.target.closest('.row-download-btn') || e.target.closest('.row-remove-track-btn') || e.target.closest('.row-artist') || e.target.closest('.card-artist')) return;
                    const id = el.getAttribute('data-track-id');
                    const track = this.findTrackInMemory(id);
                    if (!track) return;

                    // Collect sibling tracks in the same shelf or list for seamless queueing (deduplicated)
                    const parentGroup = el.closest('.shelf-carousel') || el.closest('.tracks-list');
                    let queueTracks = null;
                    if (parentGroup) {
                        const trackEls = parentGroup.querySelectorAll('[data-track-id]');
                        const siblings = [];
                        const seenIds = new Set();
                        trackEls.forEach((item) => {
                            const tId = item.getAttribute('data-track-id');
                            if (tId && !seenIds.has(tId)) {
                                seenIds.add(tId);
                                const t = this.findTrackInMemory(tId);
                                if (t) siblings.push(t);
                            }
                        });
                        if (siblings.length > 1) {
                            queueTracks = siblings;
                        }
                    }
                    Player.playTrack(track, queueTracks);
                });
            });

            container.querySelectorAll('.row-fav-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    const track = this.findTrackInMemory(id);
                    if (track) {
                        const isFav = Storage.toggleFavorite(track);
                        btn.classList.toggle('favorited', isFav);
                        btn.title = isFav ? 'Retirer des favoris' : 'Ajouter aux favoris';
                        this.showToast(isFav ? 'Ajouté aux favoris' : 'Retiré des favoris');
                    }
                });
            });

            container.querySelectorAll('.row-add-pl-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    const track = this.findTrackInMemory(id);
                    if (track) this.openPlaylistPicker(track);
                });
            });

            container.querySelectorAll('.row-download-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    const track = this.findTrackInMemory(id);
                    if (track) this.openDownloadModal(track);
                });
            });

            container.querySelectorAll('.row-remove-track-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const plId = btn.getAttribute('data-pl-id');
                    const trackId = btn.getAttribute('data-track-id');
                    if (plId === 'liked_tracks') {
                        const track = this.findTrackInMemory(trackId);
                        if (track) Storage.toggleFavorite(track);
                        this.showToast('Titre retiré des favoris');
                        this.openPlaylistView('liked_tracks');
                        return;
                    }
                    if (plId && trackId) {
                        Storage.removeTrackFromPlaylist(plId, trackId);
                        this.showToast('Titre retiré de la playlist');
                        this.openPlaylistView(plId);
                    }
                });
            });
        },

        // -------------------------------------------------------------
        // SEARCH & AUTOCOMPLETE
        // -------------------------------------------------------------
        showRecentSearchSuggestions(targetDropdown = null) {
            const isTube = this.currentAppMode === 'vibetube';
            const dropdowns = targetDropdown
                ? [targetDropdown]
                : [this.dom.suggestionsDropdown, this.dom.mobileSuggestionsDropdown].filter(Boolean);

            if (isTube) {
                const recentTube = Storage.getVibeTubeRecentSearches();
                const queryItems = recentTube.filter(x => typeof x === 'string' && x.trim().length > 0);

                if (queryItems.length === 0) {
                    dropdowns.forEach(dd => {
                        dd.innerHTML = `
                            <div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">
                                Recherchez des vidéos ou chaînes YouTube
                            </div>
                        `;
                        dd.classList.remove('hidden');
                    });
                    return;
                }

                const html = queryItems.slice(0, 8).map(q => `
                    <div class="suggestion-item" data-query="${this.escapeHtml(q)}">
                        <div class="suggestion-left">
                            <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                            <span class="suggestion-text">${this.escapeHtml(q)}</span>
                        </div>
                        <button class="suggestion-delete-btn" data-delete-id="${this.escapeHtml(q)}" title="Supprimer de l'historique VibeTube">
                            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                    </div>
                `).join('');

                dropdowns.forEach(dd => {
                    dd.innerHTML = html;
                    dd.classList.remove('hidden');

                    dd.querySelectorAll('.suggestion-item').forEach(item => {
                        item.addEventListener('click', (e) => {
                            if (e.target.closest('.suggestion-delete-btn')) return;
                            const q = item.getAttribute('data-query');
                            if (this.dom.searchInput) this.dom.searchInput.value = q;
                            if (this.dom.mobileSearchInput) this.dom.mobileSearchInput.value = q;
                            dropdowns.forEach(d => d.classList.add('hidden'));
                            this.executeVibeTubeSearch(q);
                        });
                    });

                    dd.querySelectorAll('.suggestion-delete-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const delId = btn.getAttribute('data-delete-id');
                            Storage.removeVibeTubeRecentSearch(delId);
                            this.showRecentSearchSuggestions(targetDropdown);
                        });
                    });
                });
                return;
            }

            // VibeStream (Musique) Search Suggestions
            const recent = Storage.getRecentSearches();
            const history = Storage.getHistory();

            // Collect recent query strings
            const queryItems = recent.filter(x => typeof x === 'string' && x.trim().length > 0);

            // Collect recent tracks
            const trackItems = [];
            const seenIds = new Set();
            recent.forEach(item => {
                if (typeof item === 'object' && item !== null && item.id && !seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    trackItems.push(item);
                }
            });
            (history || []).forEach(item => {
                if (item && item.id && !seenIds.has(item.id) && trackItems.length < 5) {
                    seenIds.add(item.id);
                    trackItems.push(item);
                }
            });

            if (queryItems.length === 0 && trackItems.length === 0) {
                const emptyTarget = targetDropdown || this.dom.suggestionsDropdown;
                if (emptyTarget) {
                    emptyTarget.innerHTML = `
          <div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">
            Recherchez des morceaux, artistes ou albums
          </div>
        `;
                    emptyTarget.classList.remove('hidden');
                }
                return;
            }

            let html = '';

            // 1. Recent query searches
            if (queryItems.length > 0) {
                html += queryItems.slice(0, 6).map(q => `
          <div class="suggestion-item" data-query="${this.escapeHtml(q)}">
            <div class="suggestion-left">
              <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
              <span class="suggestion-text">${this.escapeHtml(q)}</span>
            </div>
            <button class="suggestion-delete-btn" data-delete-id="${this.escapeHtml(q)}" title="Supprimer de l'historique">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        `).join('');
            }

            // 2. Recent track results with direct action buttons (Like, Playlist, Queue, Play)
            if (trackItems.length > 0) {
                html += trackItems.slice(0, 4).map(item => this.createSuggestionTrackRowHTML(item, { isRecent: true })).join('');
            }

            dropdowns.forEach(dd => {
                dd.innerHTML = html;
                dd.classList.remove('hidden');

                // Bind Query Click
                dd.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.suggestion-delete-btn')) return;
                        const q = item.getAttribute('data-query');
                        this.dom.searchInput.value = q;
                        if (this.dom.mobileSearchInput) this.dom.mobileSearchInput.value = q;
                        dropdowns.forEach(d => d.classList.add('hidden'));
                        this.executeSearch(q);
                    });
                });

                // Bind Track Actions & Row Click
                this.bindSuggestionTrackActionListeners(dd, trackItems, dropdowns, targetDropdown);
            });
        },

        createSuggestionTrackRowHTML(track, { isRecent = false } = {}) {
            const isFav = Storage.isFavorite(track.id);
            return `
          <div class="suggestion-track-item ytm-track-preview-row" data-track-id="${track.id}">
            <div class="suggestion-thumb-wrap">
              <img src="${track.thumbnail || 'https://i.ytimg.com/vi/' + track.id + '/hqdefault.jpg'}" alt="" class="suggestion-track-thumb">
              <div class="suggestion-thumb-play-overlay">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
              </div>
            </div>
            <div class="suggestion-track-meta">
              <span class="suggestion-track-title">${this.escapeHtml(track.title)}</span>
              <span class="suggestion-track-sub">
                ${this.escapeHtml(track.artist || 'Artiste')} ${track.duration ? '• ' + track.duration : ''}
              </span>
            </div>
            <div class="suggestion-track-actions">
              <button type="button" class="suggestion-action-btn btn-like ${isFav ? 'is-liked' : ''}" data-action="like" data-track-id="${track.id}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                <svg viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </button>
              <button type="button" class="suggestion-action-btn btn-playlist" data-action="playlist" data-track-id="${track.id}" title="Ajouter à une playlist">
                <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
              </button>
              <button type="button" class="suggestion-action-btn btn-queue" data-action="queue" data-track-id="${track.id}" title="Ajouter à la file d'attente">
                <svg viewBox="0 0 24 24"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
              </button>
              ${isRecent ? `
              <button type="button" class="suggestion-action-btn suggestion-delete-btn" data-delete-id="${track.id}" title="Supprimer de l'historique">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
              ` : ''}
            </div>
          </div>
            `;
        },

        bindSuggestionTrackActionListeners(dd, trackList, dropdowns, targetDropdown = null) {
            // Delete recent search item
            dd.querySelectorAll('.suggestion-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const delId = btn.getAttribute('data-delete-id');
                    Storage.removeRecentSearch(delId);
                    this.showRecentSearchSuggestions(targetDropdown);
                    this.renderRecentSearches();
                });
            });

            // Action buttons: Like, Playlist, Queue
            dd.querySelectorAll('.suggestion-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.getAttribute('data-action');
                    const trackId = btn.getAttribute('data-track-id');
                    const track = trackList.find(t => t.id === trackId) || this.findTrackInMemory(trackId);
                    if (!track) return;

                    if (action === 'like') {
                        const isNowFav = Storage.toggleFavorite(track);
                        btn.classList.toggle('is-liked', isNowFav);
                        btn.title = isNowFav ? 'Retirer des favoris' : 'Ajouter aux favoris';
                        this.showToast(isNowFav ? 'Titre ajouté aux favoris ❤️' : 'Titre retiré des favoris');
                    } else if (action === 'playlist') {
                        this.openPlaylistPicker(track);
                    } else if (action === 'queue') {
                        Player.addToQueue(track);
                        this.showToast(`"${track.title}" ajouté à la file d'attente 🎶`);
                    }
                });
            });

            // Entire row click: play track
            dd.querySelectorAll('.suggestion-track-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.suggestion-action-btn')) return;
                    const trackId = item.getAttribute('data-track-id');
                    const track = trackList.find(t => t.id === trackId) || this.findTrackInMemory(trackId);
                    if (track) {
                        Player.playTrack(track);
                        dropdowns.forEach(d => d.classList.add('hidden'));
                    }
                });
            });
        },

        async fetchSuggestions(query, targetDropdown = null) {
            const data = await API.getSuggestions(query);
            const suggestions = (data && data.suggestions) ? data.suggestions : [];
            const artist = (data && data.artist) ? data.artist : null;
            const directTracks = (data && Array.isArray(data.tracks)) ? data.tracks : [];

            const dropdowns = targetDropdown
                ? [targetDropdown]
                : [this.dom.suggestionsDropdown, this.dom.mobileSuggestionsDropdown].filter(Boolean);

            if ((!suggestions || suggestions.length === 0) && !artist && directTracks.length === 0) {
                dropdowns.forEach(d => d.classList.add('hidden'));
                return;
            }

            // Register direct tracks in memory for immediate playback
            if (!Array.isArray(this.currentSearchResults)) {
                this.currentSearchResults = [];
            }
            directTracks.forEach(t => {
                if (t && t.id && !this.currentSearchResults.some(x => x.id === t.id)) {
                    this.currentSearchResults.push(t);
                }
            });

            let html = '';

            // Clean, fast YouTube-like text query suggestions
            if (suggestions && suggestions.length > 0) {
                html += suggestions.slice(0, 8).map(s => `
          <div class="suggestion-item ytm-suggestion-row" data-query="${this.escapeHtml(s)}">
            <div class="suggestion-left">
              <svg class="suggestion-search-svg" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <span class="suggestion-text">${this.escapeHtml(s)}</span>
            </div>
          </div>
        `).join('');
            } else if (directTracks.length > 0) {
                html += directTracks.slice(0, 6).map(t => `
          <div class="suggestion-item ytm-suggestion-row" data-query="${this.escapeHtml(t.title)}">
            <div class="suggestion-left">
              <svg class="suggestion-search-svg" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <span class="suggestion-text">${this.escapeHtml(t.title)}</span>
            </div>
          </div>
        `).join('');
            }

            dropdowns.forEach(dd => {
                dd.innerHTML = html;
                dd.classList.remove('hidden');

                // Click on Artist Suggestion
                dd.querySelectorAll('.suggestion-artist-item').forEach((item) => {
                    item.addEventListener('click', () => {
                        const artistName = item.getAttribute('data-artist-name');
                        dropdowns.forEach(d => d.classList.add('hidden'));
                        this.dom.searchInput.value = artistName;
                        if (this.dom.mobileSearchInput) this.dom.mobileSearchInput.value = artistName;
                        this.openArtistView(artistName);
                    });
                });

                // Click on Query Suggestion
                dd.querySelectorAll('.suggestion-item').forEach((item) => {
                    item.addEventListener('click', () => {
                        const q = item.getAttribute('data-query');
                        this.dom.searchInput.value = q;
                        if (this.dom.mobileSearchInput) this.dom.mobileSearchInput.value = q;
                        dropdowns.forEach(d => d.classList.add('hidden'));
                        this.executeSearch(q);
                    });
                });

                // Bind Track Actions & Row Click
                this.bindSuggestionTrackActionListeners(dd, directTracks, dropdowns, targetDropdown);
            });
        },

        renderRecentSearches() {
            const recent = Storage.getRecentSearches();
            const container = document.getElementById('recent-shelf-list');
            if (!container) return;

            if (!recent || recent.length === 0) {
                container.innerHTML = '<p class="empty-msg" style="padding: 12px 0;">Lancez une recherche ou écoutez des morceaux pour les retrouver directement ici !</p>';
                return;
            }

            container.innerHTML = recent
                .slice(0, 10)
                .map(track => this.createMusicCardHTML(track))
                .join('');

            this.attachTrackClickHandlers(container);
        },

        async executeSearch(query, shouldSwitchView = true) {
            if (this.currentAppMode === 'vibetube') {
                return this.executeVibeTubeSearch(query, shouldSwitchView);
            }
            if (shouldSwitchView && this.currentView !== 'search') {
                this.switchView('search', false);
            }
            try {
                window.history.pushState({ view: 'search', query }, '', `/search?q=${encodeURIComponent(query)}`);
            } catch (e) {}
            this.currentSearchQuery = query;
            this.dom.searchTitle.textContent = `Résultats pour "${query}"`;
            this.dom.searchResultsList.innerHTML = `
        <div class="home-loading">
          <div class="spinner"></div>
          <p>Recherche sur YouTube Music en cours...</p>
        </div>
      `;

            const results = await API.search(query);
            this.currentSearchResults = results || [];
            this.currentSearchArtist = (results && results.artist) ? results.artist : null;

            if (!results || results.length === 0) {
                this.dom.searchResultsList.innerHTML = '<p class="empty-msg">Aucun résultat trouvé pour cette recherche.</p>';
                return;
            }

            // Save query text and top result into recent searches
            Storage.addRecentSearch(query);
            if (results[0]) {
                Storage.addRecentSearch(results[0]);
            }
            this.renderRecentSearches();

            // Background pre-warm top 5 results for instant click response (< 200ms)
            if (results && results.length > 0 && window.API?.prefetchBatch) {
                const topIds = results.slice(0, 5).map(r => r.id).filter(Boolean);
                API.prefetchBatch(topIds);
            }

            this.renderSearchResults();
        },

        renderSearchResults() {
            const results = this.currentSearchResults || [];
            const artist = this.currentSearchArtist;
            const filter = this.currentSearchFilter || 'all';

            if (!results || results.length === 0) {
                this.dom.searchResultsList.innerHTML = '<p class="empty-msg">Aucun résultat trouvé pour cette recherche.</p>';
                return;
            }

            let html = '';

            if (filter === 'artists') {
                // Collect main artist + distinct artists from track results
                const artistsList = [];
                if (artist && artist.name) {
                    artistsList.push({
                        name: artist.name,
                        avatar: artist.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(artist.name)}`,
                        subscribers: artist.subscribers || 'Artiste officiel'
                    });
                }

                const seenNames = new Set(artistsList.map(a => a.name.toLowerCase()));
                results.forEach(t => {
                    if (t.artist && !seenNames.has(t.artist.toLowerCase())) {
                        seenNames.add(t.artist.toLowerCase());
                        artistsList.push({
                            name: t.artist,
                            avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(t.artist)}`,
                            subscribers: 'Artiste'
                        });
                    }
                });

                html = `
                    <div class="search-artists-grid">
                        ${artistsList.map(a => `
                            <div class="search-artist-card" data-artist-name="${this.escapeHtml(a.name)}">
                                <img src="${a.avatar}" alt="${this.escapeHtml(a.name)}" class="search-artist-avatar" loading="lazy">
                                <span class="search-artist-name">${this.escapeHtml(a.name)}</span>
                                <span class="search-artist-badge">${this.escapeHtml(a.subscribers)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
                this.dom.searchResultsList.innerHTML = html;

                this.dom.searchResultsList.querySelectorAll('.search-artist-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const artistName = card.getAttribute('data-artist-name');
                        this.openArtistView(artistName);
                    });
                });
                return;
            }

            if (filter === 'albums') {
                const albumCards = [];
                const seenAlbums = new Set();
                results.forEach(t => {
                    let albumName = t.album || t.title.replace(/[\(\[].*?[\)\]]/g, '').trim();
                    if (!seenAlbums.has(albumName) && albumName.length > 2) {
                        seenAlbums.add(albumName);
                        albumCards.push({
                            id: t.id,
                            title: albumName,
                            artist: t.artist,
                            thumbnail: t.thumbnail
                        });
                    }
                });

                if (albumCards.length === 0) {
                    this.dom.searchResultsList.innerHTML = '<p class="empty-msg">Aucun album trouvé pour cette recherche.</p>';
                    return;
                }

                html = `
                    <div class="search-albums-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; padding: 12px 0;">
                        ${albumCards.map(a => `
                            <div class="music-card" data-album-id="${a.id}" data-album-title="${this.escapeHtml(a.title)}" data-album-artist="${this.escapeHtml(a.artist)}">
                                <div class="card-thumb-wrapper">
                                    <img src="${a.thumbnail || '/icons/icon.svg'}" alt="${this.escapeHtml(a.title)}" loading="lazy">
                                    <div class="card-play-overlay">
                                        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                    </div>
                                </div>
                                <span class="card-title">${this.escapeHtml(a.title)}</span>
                                <span class="card-artist">${this.escapeHtml(a.artist)}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
                this.dom.searchResultsList.innerHTML = html;
                this.dom.searchResultsList.querySelectorAll('.music-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const albumId = card.getAttribute('data-album-id');
                        const albumTitle = card.getAttribute('data-album-title');
                        const albumArtist = card.getAttribute('data-album-artist');
                        this.openAlbumView(albumId, albumTitle, albumArtist);
                    });
                });
                return;
            }

            // 'all' or 'songs'
            if (filter === 'all' && artist && artist.name) {
                html += `
                    <div class="search-top-artist-banner" data-artist-name="${this.escapeHtml(artist.name)}">
                        <img src="${artist.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(artist.name)}" alt="${this.escapeHtml(artist.name)}" class="search-top-artist-avatar">
                        <div class="search-top-artist-info">
                            <span class="search-top-artist-badge">Meilleur résultat</span>
                            <h3 class="search-top-artist-name">${this.escapeHtml(artist.name)}</h3>
                            <span class="search-top-artist-sub">Artiste ${artist.subscribers ? '• ' + this.escapeHtml(artist.subscribers) : ''}</span>
                        </div>
                        <button class="search-top-artist-action-btn">Voir l'artiste</button>
                    </div>
                `;
            }

            // Render track rows
            html += results.map((track, idx) => this.createTrackRowHTML(track, idx)).join('');

            this.dom.searchResultsList.innerHTML = html;

            if (filter === 'all' && artist && artist.name) {
                const banner = this.dom.searchResultsList.querySelector('.search-top-artist-banner');
                if (banner) {
                    banner.addEventListener('click', () => {
                        this.openArtistView(artist.name);
                    });
                }
            }

            this.attachTrackClickHandlers(this.dom.searchResultsList);
        },

        handleFilterChange(filter) {
            this.currentFilter = filter;
            const queries = {
                all: '',
                rap: 'rap francais hits 2026',
                pop: 'pop hits top chart',
                electro: 'electro house dance music',
                chill: 'lofi chill study beats',
                rock: 'rock classics best songs',
                workout: 'workout motivation gym music',
                focus: 'deep focus study ambient'
            };
            if (filter === 'all') {
                this.switchView('home');
            } else if (queries[filter]) {
                this.executeSearch(queries[filter]);
            }
        },

        // -------------------------------------------------------------
        // EXPLORE VIEW
        // -------------------------------------------------------------
        initExploreView() {
            const genres = [
                { name: '🔥 Rap Français', query: 'rap francais', color: 'linear-gradient(135deg, #e52d27, #b31217)' },
                { name: '✨ Pop Internationale', query: 'top pop hits', color: 'linear-gradient(135deg, #8a2387, #e94057)' },
                { name: '⚡ Électro & EDM', query: 'electro dance music', color: 'linear-gradient(135deg, #00c6ff, #0072ff)' },
                { name: '☕ Lo-Fi & Chill', query: 'lofi hip hop chill beats', color: 'linear-gradient(135deg, #654ea3, #eaafc8)' },
                { name: '🎤 Hip-Hop US', query: 'us hip hop rap', color: 'linear-gradient(135deg, #11998e, #38ef7d)' },
                { name: '🎸 Rock & Metal', query: 'rock classics hits', color: 'linear-gradient(135deg, #f12711, #f5af19)' },
                { name: '🌴 Afro & Reggaeton', query: 'afrobeats reggaeton hits', color: 'linear-gradient(135deg, #ff8008, #ffc837)' },
                { name: '🎷 Jazz & Soul', query: 'smooth jazz soul', color: 'linear-gradient(135deg, #3a1c71, #d76d77)' },
                { name: '🎻 Classique & Piano', query: 'classical piano music', color: 'linear-gradient(135deg, #4b6cb7, #182848)' },
                { name: '🏆 Années 80s & 90s', query: '80s 90s hits nostalgic', color: 'linear-gradient(135deg, #ff0844, #ffb199)' }
            ];

            const exploreTrendingTracks = [
                { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', artist: 'Rick Astley', duration: '3:33', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
                { id: 'ifNfpzkoY9s', title: 'Ninho - Lettre à une femme', artist: 'Ninho', duration: '2:38', thumbnail: 'https://i.ytimg.com/vi/ifNfpzkoY9s/hqdefault.jpg' },
                { id: 'XXYlFuWEuKI', title: 'The Weeknd - Save Your Tears', artist: 'The Weeknd', duration: '4:09', thumbnail: 'https://i.ytimg.com/vi/XXYlFuWEuKI/hqdefault.jpg' },
                { id: 'iv03LRtztJU', title: 'SDM - Bolide Allemand', artist: 'SDM', duration: '2:56', thumbnail: 'https://i.ytimg.com/vi/iv03LRtztJU/hqdefault.jpg' },
                { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You', artist: 'Ed Sheeran', duration: '4:23', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg' },
                { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', artist: 'Luis Fonsi', duration: '4:41', thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg' },
                { id: 'FGBhQbmPwH8', title: 'Daft Punk - One More Time', artist: 'Daft Punk', duration: '5:22', thumbnail: 'https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg' },
                { id: '6SasSMzZeao', title: 'Gazo - DIE', artist: 'Gazo', duration: '3:01', thumbnail: 'https://i.ytimg.com/vi/6SasSMzZeao/hqdefault.jpg' }
            ];

            const exploreAlbums = [
                { title: 'GOAT', artist: 'Ninho', year: '2024', thumbnail: 'https://i.ytimg.com/vi/ifNfpzkoY9s/hqdefault.jpg' },
                { title: 'After Hours', artist: 'The Weeknd', year: '2020', thumbnail: 'https://i.ytimg.com/vi/XXYlFuWEuKI/hqdefault.jpg' },
                { title: 'Discovery', artist: 'Daft Punk', year: '2001', thumbnail: 'https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg' },
                { title: 'Liens du 100', artist: 'SDM', year: '2022', thumbnail: 'https://i.ytimg.com/vi/iv03LRtztJU/hqdefault.jpg' },
                { title: 'KMT', artist: 'Gazo', year: '2022', thumbnail: 'https://i.ytimg.com/vi/6SasSMzZeao/hqdefault.jpg' },
                { title: 'Divide (÷)', artist: 'Ed Sheeran', year: '2017', thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg' }
            ];

            // 1. Trending Tracks list in Explore
            const trendingContainer = document.getElementById('explore-trending-tracks');
            if (trendingContainer) {
                trendingContainer.innerHTML = exploreTrendingTracks
                    .map((t, idx) => this.createTrackRowHTML(t, idx))
                    .join('');
                this.attachTrackClickHandlers(trendingContainer);
            }

            // Play all trending tracks button
            const playTrendsBtn = document.getElementById('explore-play-trends-btn');
            if (playTrendsBtn) {
                playTrendsBtn.onclick = () => {
                    Player.playTrack(exploreTrendingTracks[0], exploreTrendingTracks);
                    this.showToast('Lecture des tendances...');
                };
            }

            // 2. Albums Grid in Explore
            const albumsContainer = document.getElementById('explore-albums-grid');
            if (albumsContainer) {
                albumsContainer.innerHTML = exploreAlbums.map(album => `
          <div class="music-card" data-album-query="${this.escapeHtml(album.artist + ' ' + album.title)}">
            <div class="card-thumb-wrapper">
              <img src="${album.thumbnail}" alt="${this.escapeHtml(album.title)}" loading="lazy">
              <div class="card-play-overlay" title="Explorer cet album">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
            <span class="card-title" title="${this.escapeHtml(album.title)}">${this.escapeHtml(album.title)}</span>
            <span class="card-artist">${this.escapeHtml(album.artist)} • ${this.escapeHtml(album.year)}</span>
          </div>
        `).join('');

                albumsContainer.querySelectorAll('.music-card').forEach(card => {
                    card.onclick = () => {
                        const q = card.getAttribute('data-album-query');
                        if (q) this.executeSearch(q);
                    };
                });
            }

            // 3. Genres Grid
            const genreGridEl = document.getElementById('genre-grid');
            if (genreGridEl) {
                genreGridEl.innerHTML = genres
                    .map(
                        (g) => `
              <div class="genre-card" style="background: ${g.color};" data-query="${g.query}">
                <span>${g.name}</span>
              </div>
            `
                    )
                    .join('');

                genreGridEl.querySelectorAll('.genre-card').forEach((card) => {
                    card.addEventListener('click', () => {
                        const q = card.getAttribute('data-query');
                        this.executeSearch(q);
                    });
                });
            }
        },

        // -------------------------------------------------------------
        // PLAYLISTS & LIBRARY
        // -------------------------------------------------------------
        async renderPlaylists() {
            const playlists = Storage.getPlaylists();
            const favs = Storage.getFavorites();
            let offlineTracks = [];
            try {
                if (Storage.getAllOfflineTracks) {
                    offlineTracks = await Storage.getAllOfflineTracks();
                }
            } catch (e) {}

            // 1. Sidebar Collections (Titres likés & Musiques téléchargées)
            if (this.dom.sidebarCollections) {
                const isLikedActive = String(this.currentActivePlaylistId) === 'liked_tracks';
                const isDownloadsActive = String(this.currentActivePlaylistId) === 'downloaded_tracks';

                this.dom.sidebarCollections.innerHTML = `
                    <div class="playlist-nav-item collection-item ${isLikedActive ? 'active' : ''}" data-playlist-id="liked_tracks" title="Titres likés">
                        <div class="sidebar-item-icon liked-icon">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        </div>
                        <div class="sidebar-item-text">
                            <span class="sidebar-item-title">Titres likés</span>
                            <span class="sidebar-item-count">${favs.length} titre${favs.length > 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="playlist-nav-item collection-item ${isDownloadsActive ? 'active' : ''}" data-playlist-id="downloaded_tracks" title="Musiques téléchargées">
                        <div class="sidebar-item-icon download-icon">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
                        </div>
                        <div class="sidebar-item-text">
                            <span class="sidebar-item-title">Téléchargements</span>
                            <span class="sidebar-item-count">${offlineTracks.length} hors-ligne</span>
                        </div>
                    </div>
                `;

                this.dom.sidebarCollections.querySelectorAll('.playlist-nav-item').forEach((item) => {
                    item.addEventListener('click', () => {
                        const id = item.getAttribute('data-playlist-id');
                        this.openPlaylistView(id);
                    });
                });
            }

            // 2. Sidebar Playlists de l'utilisateur
            if (this.dom.sidebarPlaylists) {
                if (playlists.length === 0) {
                    this.dom.sidebarPlaylists.innerHTML = `
                        <div class="sidebar-empty-playlists">
                            <span>Aucune playlist</span>
                        </div>
                    `;
                } else {
                    this.dom.sidebarPlaylists.innerHTML = playlists
                        .map((p) => {
                            const isActive = String(this.currentActivePlaylistId) === String(p.id);
                            const count = p.tracks ? p.tracks.length : 0;
                            const cover = p.customCover || (p.tracks && p.tracks[0] ? p.tracks[0].thumbnail : null);
                            return `
                                <div class="playlist-nav-item user-playlist-item ${isActive ? 'active' : ''}" data-playlist-id="${p.id}" title="${this.escapeHtml(p.name)}">
                                    <div class="sidebar-item-icon user-pl-icon">
                                        ${cover ? `<img src="${this.escapeHtml(cover)}" alt="" class="sidebar-pl-thumb" />` : `
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`}
                                    </div>
                                    <div class="sidebar-item-text">
                                        <span class="sidebar-item-title">${this.escapeHtml(p.name)}</span>
                                        <span class="sidebar-item-count">${count} titre${count > 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                            `;
                        })
                        .join('');

                    this.dom.sidebarPlaylists.querySelectorAll('.playlist-nav-item').forEach((item) => {
                        item.addEventListener('click', () => {
                            const id = item.getAttribute('data-playlist-id');
                            this.openPlaylistView(id);
                        });
                    });
                }
            }

            // Library view: Render clean list of playlists in column
            const likedRowHTML = `
                <div class="playlist-column-row featured-liked-row" data-playlist-id="liked_tracks">
                    <div class="playlist-row-thumb liked-thumb">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </div>
                    <div class="playlist-row-info">
                        <span class="playlist-row-name">❤️ Titres likés</span>
                        <span class="playlist-row-meta">${favs.length} titre${favs.length > 1 ? 's' : ''} sauvegardé${favs.length > 1 ? 's' : ''} • Playlist automatique</span>
                    </div>
                    <div class="playlist-row-arrow">
                        <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                    </div>
                </div>
            `;

            const playlistRowsHTML = playlists.map((p) => {
                const cover = p.customCover || (p.tracks && p.tracks[0] ? p.tracks[0].thumbnail : null);
                const count = p.tracks ? p.tracks.length : 0;
                const isPub = p.isPublic !== false;
                return `
                    <div class="playlist-column-row" data-playlist-id="${p.id}">
                        <div class="playlist-row-thumb">
                            ${cover ? `<img src="${this.escapeHtml(cover)}" alt="${this.escapeHtml(p.name)}" loading="lazy">` : `
                            <div class="playlist-row-fallback-icon">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                            </div>`}
                        </div>
                        <div class="playlist-row-info">
                            <div class="playlist-row-title-line">
                                <span class="playlist-row-name">${this.escapeHtml(p.name)}</span>
                                <span class="playlist-row-privacy-pill ${isPub ? 'public' : 'private'}">${isPub ? 'Public' : 'Privé'}</span>
                            </div>
                            <span class="playlist-row-meta">${count} titre${count > 1 ? 's' : ''}${p.ownerUsername ? ` • Par ${this.escapeHtml(p.ownerUsername)}` : ''}</span>
                        </div>
                        <div class="playlist-row-arrow">
                            <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                        </div>
                    </div>
                `;
            }).join('');

            this.dom.playlistsGrid.innerHTML = likedRowHTML + playlistRowsHTML;

            this.dom.playlistsGrid.querySelectorAll('[data-playlist-id]').forEach((el) => {
                el.addEventListener('click', () => {
                    const id = el.getAttribute('data-playlist-id');
                    this.openPlaylistView(id);
                });
            });
        },

        renderFavorites() {
            const favs = Storage.getFavorites();
            if (favs.length === 0) {
                this.dom.favoritesList.innerHTML = '<p class="empty-msg">Aucun titre favori pour le moment. Cliquez sur le cœur ❤️ en écoutant un son !</p>';
                return;
            }

            this.dom.favoritesList.innerHTML = favs
                .map((track, idx) => this.createTrackRowHTML(track, idx))
                .join('');

            this.attachTrackClickHandlers(this.dom.favoritesList);
        },

        renderHistory() {
            const history = Storage.getHistory();
            if (history.length === 0) {
                this.dom.historyList.innerHTML = '<p class="empty-msg">Votre historique d\'écoute est vide.</p>';
                return;
            }

            this.dom.historyList.innerHTML = history
                .map((track, idx) => this.createTrackRowHTML(track, idx))
                .join('');

            this.attachTrackClickHandlers(this.dom.historyList);
        },

        async openPlaylistView(playlistId, username = null) {
            this.currentActivePlaylistId = playlistId;
            const updateNavHighlights = () => {
                document.querySelectorAll('.playlist-nav-item').forEach((item) => {
                    item.classList.toggle('active', item.getAttribute('data-playlist-id') === String(playlistId));
                });
            };
            updateNavHighlights();

            if (playlistId === 'downloaded_tracks') {
                let offlineTracks = [];
                try {
                    if (Storage.getAllOfflineTracks) {
                        offlineTracks = await Storage.getAllOfflineTracks();
                    }
                } catch (e) {}

                this.currentOpenPlaylist = {
                    id: 'downloaded_tracks',
                    name: '📥 Musiques téléchargées',
                    tracks: offlineTracks,
                    isPublic: false
                };
                this.dom.playlistDetailTitle.textContent = '📥 Musiques téléchargées';
                this.dom.playlistDetailMeta.textContent = `${offlineTracks.length} titres hors-ligne`;
                this.dom.playlistDeleteBtn.classList.add('hidden');
                if (this.dom.playlistPrivacyToggleBtn) this.dom.playlistPrivacyToggleBtn.classList.add('hidden');
                if (this.dom.playlistPrivacyBadge) {
                    this.dom.playlistPrivacyBadge.className = 'badge-status private';
                    this.dom.playlistPrivacyBadge.textContent = '💾 Disponible hors-ligne';
                }
                if (this.dom.playlistCoverEditBadge) this.dom.playlistCoverEditBadge.classList.add('hidden');
                if (this.dom.playlistCoverBig) {
                    this.dom.playlistCoverBig.style.background = 'linear-gradient(135deg, #10b981, rgba(6, 78, 59, 0.8))';
                    this.dom.playlistCoverBig.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ffffff;">
              <svg viewBox="0 0 24 24" width="72" height="72" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
            </div>
          `;
                    this.dom.playlistCoverBig.onclick = null;
                }

                if (offlineTracks.length === 0) {
                    this.dom.playlistTracksList.innerHTML = '<p class="empty-msg">Aucun titre téléchargé hors-ligne. Vous pouvez télécharger des titres depuis le lecteur ou les playlists.</p>';
                } else {
                    this.dom.playlistTracksList.innerHTML = offlineTracks
                        .map((track, idx) => this.createTrackRowHTML(track, idx, true, 'downloaded_tracks'))
                        .join('');
                    this.attachTrackClickHandlers(this.dom.playlistTracksList);
                }

                this.dom.playlistPlayAllBtn.onclick = () => {
                    if (offlineTracks.length > 0) Player.playTrack(offlineTracks[0], offlineTracks);
                };

                this.switchView('playlist', false);
                this.currentActivePlaylistId = 'downloaded_tracks';
                updateNavHighlights();
                this.updateURL('/library/downloads');
                return;
            }

            if (playlistId === 'liked_tracks') {
                const favs = Storage.getFavorites();
                this.currentOpenPlaylist = {
                    id: 'liked_tracks',
                    name: '❤️ Titres likés',
                    tracks: favs,
                    isPublic: false
                };
                this.dom.playlistDetailTitle.textContent = '❤️ Titres likés';
                this.dom.playlistDetailMeta.textContent = `${favs.length} titres likés`;
                this.dom.playlistDeleteBtn.classList.add('hidden'); // Cannot delete liked playlist
                if (this.dom.playlistPrivacyToggleBtn) this.dom.playlistPrivacyToggleBtn.classList.add('hidden');
                if (this.dom.playlistPrivacyBadge) {
                    this.dom.playlistPrivacyBadge.className = 'badge-status private';
                    this.dom.playlistPrivacyBadge.textContent = '🔒 Privé (Personnel)';
                }
                if (this.dom.playlistCoverEditBadge) this.dom.playlistCoverEditBadge.classList.add('hidden');
                if (this.dom.playlistCoverBig) {
                    this.dom.playlistCoverBig.style.background = 'var(--accent-gradient-liked, linear-gradient(135deg, var(--accent-red), rgba(0,0,0,0.6)))';
                    this.dom.playlistCoverBig.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ffffff;">
              <svg viewBox="0 0 24 24" width="72" height="72" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
          `;
                    this.dom.playlistCoverBig.onclick = null;
                }

                if (favs.length === 0) {
                    this.dom.playlistTracksList.innerHTML = '<p class="empty-msg">Vous n\'avez aucun titre liké pour le moment.</p>';
                } else {
                    this.dom.playlistTracksList.innerHTML = favs
                        .map((track, idx) => this.createTrackRowHTML(track, idx, true, 'liked_tracks'))
                        .join('');
                    this.attachTrackClickHandlers(this.dom.playlistTracksList);
                }

                this.dom.playlistPlayAllBtn.onclick = () => {
                    if (favs.length > 0) Player.playTrack(favs[0], favs);
                };

                // Predictive background pre-warming of first tracks in liked playlist
                if (favs.length > 0 && window.API?.prefetchBatch) {
                    API.prefetchBatch(favs.slice(0, 3).map(t => t.id));
                }

                this.switchView('playlist', false);
                this.currentActivePlaylistId = 'liked_tracks';
                updateNavHighlights();
                this.updateURL('/library/liked');
                return;
            }

            // Check local playlists first
            const localPlaylists = Storage.getPlaylists();
            let pl = localPlaylists.find(p => p.id === playlistId || p.name.toLowerCase() === playlistId.toLowerCase());

            // If not found locally or if username is specified, fetch from server / NeonDB
            if (!pl && username) {
                try {
                    const token = Storage.getToken();
                    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                    const res = await fetch(`/api/user/${encodeURIComponent(username)}/playlist/${encodeURIComponent(playlistId)}`, { headers });
                    if (res.status === 403) {
                        this.showErrorView('Playlist privée', `Cette playlist appartient à ${this.escapeHtml(username)} et a été configurée en mode privé.`);
                        return;
                    }
                    if (!res.ok) {
                        this.showErrorView('Playlist introuvable', `La playlist demandée n'existe pas ou a été supprimée.`);
                        return;
                    }
                    const data = await res.json();
                    pl = data.playlist;
                } catch (e) {
                    this.showErrorView('Playlist introuvable', `Impossible de charger cette playlist.`);
                    return;
                }
            }

            if (!pl) {
                this.showErrorView('Playlist introuvable', `La playlist demandée n'existe pas ou a été supprimée.`);
                return;
            }

            this.currentOpenPlaylist = pl;
            const currentUser = Storage.getUser();
            const isOwner = !pl.ownerUsername || (currentUser && currentUser.username === pl.ownerUsername);

            this.dom.playlistDetailTitle.textContent = pl.name;
            this.dom.playlistDetailMeta.textContent = `${pl.tracks ? pl.tracks.length : 0} titres${pl.ownerUsername ? ` • Par ${pl.ownerUsername}` : ''}`;

            // Delete btn & cover edit only visible to owner
            if (isOwner) {
                this.dom.playlistDeleteBtn.classList.remove('hidden');
                if (this.dom.playlistPrivacyToggleBtn) this.dom.playlistPrivacyToggleBtn.classList.remove('hidden');
                if (this.dom.playlistCoverEditBadge) this.dom.playlistCoverEditBadge.classList.remove('hidden');
            } else {
                this.dom.playlistDeleteBtn.classList.add('hidden');
                if (this.dom.playlistPrivacyToggleBtn) this.dom.playlistPrivacyToggleBtn.classList.add('hidden');
                if (this.dom.playlistCoverEditBadge) this.dom.playlistCoverEditBadge.classList.add('hidden');
            }

            // Playlist Main Cover: prioritize customCover, then first track thumbnail, then fallback icon
            if (this.dom.playlistCoverBig) {
                this.dom.playlistCoverBig.style.background = 'linear-gradient(135deg, #2b2b2b, #111)';
                const coverUrl = pl.customCover || (pl.tracks && pl.tracks[0] ? pl.tracks[0].thumbnail : null);
                if (coverUrl) {
                    this.dom.playlistCoverBig.innerHTML = `
            <img src="${coverUrl}" alt="${this.escapeHtml(pl.name)}" style="width:100%;height:100%;object-fit:cover;display:block;">
            ${isOwner ? `
            <div class="playlist-cover-edit-badge" id="playlist-cover-edit-badge" title="Changer l'image de couverture">
              <svg viewBox="0 0 24 24"><path d="M3 4V1h2v3h3v2H5v3H3V6H0V4h3zm3 6V7h3V4h7l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3zm7 9c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-3.2-5c0 1.77 1.43 3.2 3.2 3.2s3.2-1.43 3.2-3.2-1.43-3.2-3.2-3.2-3.2 1.43-3.2 3.2z"/></svg>
            </div>` : ''}
          `;
                } else {
                    this.dom.playlistCoverBig.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--accent-red);">
              <svg viewBox="0 0 24 24" width="72" height="72" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
            </div>
            ${isOwner ? `
            <div class="playlist-cover-edit-badge" id="playlist-cover-edit-badge" title="Changer l'image de couverture">
              <svg viewBox="0 0 24 24"><path d="M3 4V1h2v3h3v2H5v3H3V6H0V4h3zm3 6V7h3V4h7l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3zm7 9c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-3.2-5c0 1.77 1.43 3.2 3.2 3.2s3.2-1.43 3.2-3.2-1.43-3.2-3.2-3.2-3.2 1.43-3.2 3.2z"/></svg>
            </div>` : ''}
          `;
                }

                if (isOwner) {
                    this.dom.playlistCoverBig.onclick = () => {
                        this.openPlaylistCoverModal();
                    };
                } else {
                    this.dom.playlistCoverBig.onclick = null;
                }
            }

            // Unified Privacy Button
            const isPub = pl.isPublic !== false;
            if (this.dom.playlistPrivacyToggleBtn) {
                this.dom.playlistPrivacyToggleBtn.className = `btn secondary playlist-privacy-btn ${isPub ? 'public' : 'private'}`;
            }
            if (this.dom.playlistPrivacyIcon) {
                this.dom.playlistPrivacyIcon.textContent = isPub ? '🌐' : '🔒';
            }
            if (this.dom.playlistPrivacyLabel) {
                this.dom.playlistPrivacyLabel.textContent = isPub ? 'Public' : 'Privé';
            }

            if (!pl.tracks || pl.tracks.length === 0) {
                this.dom.playlistTracksList.innerHTML = '<p class="empty-msg">Cette playlist ne contient aucun titre pour le moment.</p>';
            } else {
                this.dom.playlistTracksList.innerHTML = pl.tracks
                    .map((track, idx) => this.createTrackRowHTML(track, idx, true, pl.id))
                    .join('');
                this.attachTrackClickHandlers(this.dom.playlistTracksList);
            }

            this.dom.playlistPlayAllBtn.onclick = () => {
                if (pl.tracks && pl.tracks.length > 0) Player.playTrack(pl.tracks[0], pl.tracks);
            };

            // Predictive background pre-warming of first tracks in custom playlist
            if (pl.tracks && pl.tracks.length > 0 && window.API?.prefetchBatch) {
                API.prefetchBatch(pl.tracks.slice(0, 3).map(t => t.id));
            }

            this.dom.playlistDeleteBtn.onclick = async () => {
                const confirmed = await this.showModalConfirm(
                    `Voulez-vous déplacer la playlist "${pl.name}" dans la corbeille ?\nVous pourrez la restaurer en 1 clic à tout moment.`,
                    'Supprimer la playlist',
                    'Placer dans la corbeille',
                    'Annuler'
                );
                if (confirmed) {
                    Storage.deletePlaylist(pl.id);
                    this.switchView('library');
                    this.showToast('Playlist archivée dans la corbeille 🗑️');
                }
            };

            this.switchView('playlist', false);
            this.currentActivePlaylistId = pl.id;
            updateNavHighlights();
            const ownerName = pl.ownerUsername || (currentUser ? currentUser.username : 'user');
            this.updateURL(`/user/${encodeURIComponent(ownerName)}/playlist/${encodeURIComponent(pl.name)}`);
        },

        toggleCurrentPlaylistPrivacy() {
            if (!this.currentOpenPlaylist || this.currentOpenPlaylist.id === 'liked_tracks') return;
            const isPub = Storage.togglePlaylistPrivacy(this.currentOpenPlaylist.id);
            this.currentOpenPlaylist.isPublic = isPub;
            if (this.dom.playlistPrivacyToggleBtn) {
                this.dom.playlistPrivacyToggleBtn.className = `btn secondary playlist-privacy-btn ${isPub ? 'public' : 'private'}`;
            }
            if (this.dom.playlistPrivacyIcon) {
                this.dom.playlistPrivacyIcon.textContent = isPub ? '🌐' : '🔒';
            }
            if (this.dom.playlistPrivacyLabel) {
                this.dom.playlistPrivacyLabel.textContent = isPub ? 'Public' : 'Privé';
            }
            this.showToast(isPub ? 'Playlist maintenant Publique (partageable avec tout le monde) 🌐' : 'Playlist maintenant Privée (visible uniquement par vous) 🔒');
        },

        async openDownloadModal(track) {
            if (!track || !track.id) return;
            this.selectedTrackForDownload = track;

            const modal = document.getElementById('modal-download-options');
            if (!modal) return;

            const thumbEl = document.getElementById('download-modal-thumb');
            const titleEl = document.getElementById('download-modal-title');
            const artistEl = document.getElementById('download-modal-artist');
            const statusEl = document.getElementById('download-modal-offline-status');
            const vaultBtnTitle = document.getElementById('download-vault-btn-title');
            const vaultBtnDesc = document.getElementById('download-vault-btn-desc');
            const vaultIconCircle = document.getElementById('download-vault-icon-circle');

            if (thumbEl) thumbEl.src = track.thumbnail || '/icons/icon.svg';
            if (titleEl) titleEl.textContent = track.title || 'Titre inconnu';
            if (artistEl) artistEl.textContent = track.artist || 'Artiste inconnu';

            // Check if stored offline
            const offlineItem = await Storage.getTrackOffline(track.id);
            if (offlineItem) {
                if (statusEl) {
                    statusEl.textContent = '✅ Enregistré dans le coffre hors-ligne';
                    statusEl.className = 'download-modal-status badge-status public';
                }
                if (vaultBtnTitle) vaultBtnTitle.textContent = 'Retirer du Mode Hors-ligne';
                if (vaultBtnDesc) vaultBtnDesc.textContent = 'Supprimer le morceau stocké de l\'IndexedDB locale';
                if (vaultIconCircle) vaultIconCircle.className = 'opt-icon-circle offline-remove';
            } else {
                if (statusEl) {
                    statusEl.textContent = 'Non synchronisé hors-ligne';
                    statusEl.className = 'download-modal-status badge-status private';
                }
                if (vaultBtnTitle) vaultBtnTitle.textContent = 'Sauvegarder Hors-ligne (IndexedDB)';
                if (vaultBtnDesc) vaultBtnDesc.textContent = 'Écouter sans connexion Internet dans le métro ou l\'avion';
                if (vaultIconCircle) vaultIconCircle.className = 'opt-icon-circle offline-color';
            }

            modal.classList.remove('hidden');
        },

        triggerDownloadDirectMp3() {
            const track = this.selectedTrackForDownload || Player.currentTrack;
            if (!track || !track.id) return;
            const url = API.getDownloadUrl(track.id, track.title);
            window.location.href = url;
            this.showToast(`Téléchargement direct de "${track.title}" lancé (.mp3) 💾`);
        },

        async toggleTrackOfflineVault() {
            const track = this.selectedTrackForDownload || Player.currentTrack;
            if (!track || !track.id) return;

            const statusEl = document.getElementById('download-modal-offline-status');
            const vaultBtnTitle = document.getElementById('download-vault-btn-title');
            const vaultBtnDesc = document.getElementById('download-vault-btn-desc');
            const vaultIconCircle = document.getElementById('download-vault-icon-circle');

            const existing = await Storage.getTrackOffline(track.id);
            if (existing) {
                // Remove from offline
                await Storage.deleteTrackOffline(track.id);
                if (statusEl) {
                    statusEl.textContent = 'Non synchronisé hors-ligne';
                    statusEl.className = 'download-modal-status badge-status private';
                }
                if (vaultBtnTitle) vaultBtnTitle.textContent = 'Sauvegarder Hors-ligne (IndexedDB)';
                if (vaultBtnDesc) vaultBtnDesc.textContent = 'Écouter sans connexion Internet dans le métro ou l\'avion';
                if (vaultIconCircle) vaultIconCircle.className = 'opt-icon-circle offline-color';
                this.showToast(`Titre "${track.title}" retiré du mode hors-ligne.`);
            } else {
                // Download and save blob to IndexedDB
                if (statusEl) {
                    statusEl.textContent = '⏳ Téléchargement et mise en cache...';
                    statusEl.className = 'download-modal-status badge-status private';
                }
                try {
                    const streamUrl = API.getStreamUrl(track.id);
                    const res = await fetch(streamUrl);
                    if (!res.ok) throw new Error(`Stream fetch failed HTTP ${res.status}`);
                    const blob = await res.blob();
                    await Storage.saveTrackOffline(track, blob);

                    if (statusEl) {
                        statusEl.textContent = '✅ Enregistré dans le coffre hors-ligne';
                        statusEl.className = 'download-modal-status badge-status public';
                    }
                    if (vaultBtnTitle) vaultBtnTitle.textContent = 'Retirer du Mode Hors-ligne';
                    if (vaultBtnDesc) vaultBtnDesc.textContent = 'Supprimer le morceau stocké de l\'IndexedDB locale';
                    if (vaultIconCircle) vaultIconCircle.className = 'opt-icon-circle offline-remove';
                    this.showToast(`Morceau prêt pour écoute hors-ligne (métro / avion) ! ✈️`);
                } catch (e) {
                    console.error('Offline save error:', e);
                    if (statusEl) {
                        statusEl.textContent = '❌ Échec du téléchargement hors-ligne';
                        statusEl.className = 'download-modal-status badge-status private';
                    }
                    this.showToast('Erreur lors du téléchargement hors-ligne');
                }
            }
        },

        openPlaylistPicker(track) {
            this.selectedTrackForPlaylist = track;
            const playlists = Storage.getPlaylists();

            this.dom.playlistPickerList.innerHTML = playlists
                .map(
                    (p) => `
            <div class="playlist-picker-item" data-pl-id="${p.id}">
              <span>${this.escapeHtml(p.name)} (${p.tracks.length})</span>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </div>
          `
                )
                .join('');

            this.dom.playlistPickerList.querySelectorAll('.playlist-picker-item').forEach((item) => {
                item.addEventListener('click', async () => {
                    const plId = item.getAttribute('data-pl-id');
                    const res = Storage.addTrackToPlaylist(plId, track);
                    if (res && res.reason === 'duplicate') {
                        const confirmAdd = await this.showModalConfirm(
                            `Le morceau "${track.title}" est déjà présent dans la playlist "${res.playlistName}".\n\nSouhaitez-vous quand même l'ajouter en double ?`,
                            'Morceau déjà dans la playlist',
                            'Ajouter quand même',
                            'Annuler'
                        );
                        if (confirmAdd) {
                            Storage.addTrackToPlaylist(plId, track, true);
                            this.dom.modalPlaylistPicker.classList.add('hidden');
                            this.showToast('Morceau ajouté en double à la playlist !');
                        }
                        return;
                    }
                    this.dom.modalPlaylistPicker.classList.add('hidden');
                    this.showToast('Ajouté à la playlist !');
                });
            });

            this.dom.modalPlaylistPicker.classList.remove('hidden');
        },

        // -------------------------------------------------------------
        // AUDIO ENGINE SYNC & UI UPDATES
        // -------------------------------------------------------------
        updateNowPlayingUI(track) {
            if (!track) return;

            // Reveal bottom players with smooth transition
            document.querySelector('.app-container')?.classList.add('has-player');
            this.dom.desktopPlayerBar.classList.remove('hidden');
            this.dom.mobileMiniPlayer.classList.remove('hidden');

            // Update page title
            document.title = `▶ ${track.title} • ${track.artist} - YouTube Music`;

            // Desktop bar
            this.dom.playerCover.src = track.thumbnail;
            this.dom.playerTitle.textContent = track.title;
            this.dom.playerArtist.textContent = track.artist;
            if (this.dom.totalDurationText) {
                this.dom.totalDurationText.textContent = track.duration || '0:00';
            }
            if (this.dom.currentTimeText) {
                this.dom.currentTimeText.textContent = '0:00';
            }
            if (this.dom.playerProgress) {
                this.dom.playerProgress.style.width = '0%';
            }
            if (this.dom.playerScrubberThumb) {
                this.dom.playerScrubberThumb.style.left = '0%';
            }

            // Mobile mini player
            this.dom.miniCover.src = track.thumbnail;
            this.dom.miniTitle.textContent = track.title;
            this.dom.miniArtist.textContent = track.artist;
            if (this.dom.miniProgressFill) {
                this.dom.miniProgressFill.style.width = '0%';
            }

            // Mobile fullscreen player
            this.dom.mobileBigCover.src = track.thumbnail;
            this.dom.mobileTrackTitle.textContent = track.title;
            this.dom.mobileTrackArtist.textContent = track.artist;
            if (this.dom.mobileTotalDuration) {
                this.dom.mobileTotalDuration.textContent = track.duration || '0:00';
            }
            if (this.dom.mobileCurrentTime) {
                this.dom.mobileCurrentTime.textContent = '0:00';
            }
            if (this.dom.mobileSeekSlider) {
                this.dom.mobileSeekSlider.value = 0;
            }

            // Favorite state
            const isFav = Storage.isFavorite(track.id);
            this.updateFavoriteUI(isFav);

            // If video mode is active, load video iframe
            if (this.isVideoMode) {
                this.loadVideoClip(track.id);
            }
        },

        updatePlayStateUI(isPlaying, isLoading) {
            // Desktop play button
            const deskPlayIcon = this.dom.playPauseBtn.querySelector('.icon-play');
            const deskPauseIcon = this.dom.playPauseBtn.querySelector('.icon-pause');
            this.dom.playerSpinner.classList.toggle('hidden', !isLoading);

            if (isLoading) {
                deskPlayIcon.classList.add('hidden');
                deskPauseIcon.classList.add('hidden');
            } else {
                deskPlayIcon.classList.toggle('hidden', isPlaying);
                deskPauseIcon.classList.toggle('hidden', !isPlaying);
            }

            // Mobile mini play button
            const miniPlayIcon = this.dom.miniPlayBtn.querySelector('.icon-play');
            const miniPauseIcon = this.dom.miniPlayBtn.querySelector('.icon-pause');
            miniPlayIcon.classList.toggle('hidden', isPlaying);
            miniPauseIcon.classList.toggle('hidden', !isPlaying);

            // Mobile fullscreen play button
            const fullPlayIcon = this.dom.mobilePlayBtn.querySelector('.icon-play');
            const fullPauseIcon = this.dom.mobilePlayBtn.querySelector('.icon-pause');
            fullPlayIcon.classList.toggle('hidden', isPlaying);
            fullPauseIcon.classList.toggle('hidden', !isPlaying);
        },

        updateProgressUI(current, duration) {
            const curText = this.formatTime(current);
            const durText = this.formatTime(duration);

            this.dom.currentTimeText.textContent = curText;
            this.dom.totalDurationText.textContent = durText;
            this.dom.mobileCurrentTime.textContent = curText;
            this.dom.mobileTotalDuration.textContent = durText;

            const pct = duration > 0 ? (current / duration) * 100 : 0;
            this.dom.playerProgress.style.width = `${pct}%`;
            this.dom.playerScrubberThumb.style.left = `${pct}%`;
            this.dom.miniProgressFill.style.width = `${pct}%`;
            this.dom.mobileSeekSlider.value = pct;
        },

        updateVolumeUI(vol, muted) {
            const effectiveVol = muted ? 0 : (vol > 0 ? vol : 0.8);
            if (this.dom.volumeSlider) this.dom.volumeSlider.value = effectiveVol;
            if (this.dom.muteBtn) {
                const volHigh = this.dom.muteBtn.querySelector('.vol-high');
                const volMuted = this.dom.muteBtn.querySelector('.vol-muted');
                if (volHigh) volHigh.classList.toggle('hidden', muted || effectiveVol === 0);
                if (volMuted) volMuted.classList.toggle('hidden', !muted && effectiveVol > 0);
            }
        },

        updateRepeatUI(mode) {
            const isOne = mode === 'one';
            const isAll = mode === 'all';
            this.dom.repeatBtn.classList.toggle('active', isOne || isAll);
            this.dom.mobileRepeatBtn.classList.toggle('active', isOne || isAll);
            this.dom.repeatOneIndicator.classList.toggle('hidden', !isOne);
            this.showToast(`Mode répétition : ${mode === 'one' ? 'Titre unique' : mode === 'all' ? 'Toute la file' : 'Désactivé'}`);
        },

        updateFavoriteUI(isFav) {
            const fav = !!isFav;
            const btns = [this.dom.playerFavBtn, this.dom.mobilePlayerFavBtn].filter(Boolean);
            btns.forEach(btn => {
                btn.classList.toggle('favorited', fav);
                btn.setAttribute('aria-label', fav ? 'Retirer des favoris' : 'Ajouter aux favoris');
                btn.setAttribute('title', fav ? 'Retirer des favoris' : 'Ajouter aux favoris');
                const empty = btn.querySelector('.heart-empty');
                const filled = btn.querySelector('.heart-filled');
                if (empty) {
                    empty.classList.toggle('hidden', fav);
                    empty.style.display = fav ? 'none' : 'block';
                }
                if (filled) {
                    filled.classList.toggle('hidden', !fav);
                    filled.style.display = fav ? 'block' : 'none';
                }
            });
        },

        updateAmbientGlow(thumbUrl) {
            if (!thumbUrl) return;
            const id = Player.currentTrack?.id || '';
            let hash = 0;
            for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
            const hue1 = Math.abs(hash % 360);
            const hue2 = (hue1 + 60) % 360;

            this.dom.ambientGlow.style.backgroundImage = `
        radial-gradient(circle at 75% 20%, hsla(${hue1}, 85%, 45%, 0.35) 0%, transparent 60%),
        radial-gradient(circle at 20% 80%, hsla(${hue2}, 75%, 35%, 0.3) 0%, transparent 55%),
        radial-gradient(circle at 50% 50%, rgba(20, 20, 25, 0.5) 0%, transparent 100%)
      `;
        },

        // Mode Video / Audio Switcher
        setPlayerMode(isVideo) {
            this.isVideoMode = isVideo;
            this.dom.modeAudioBtn.classList.toggle('active', !isVideo);
            this.dom.modeVideoBtn.classList.toggle('active', isVideo);
            this.dom.mobileModeAudioBtn.classList.toggle('active', !isVideo);
            this.dom.mobileModeVideoBtn.classList.toggle('active', isVideo);

            if (isVideo) {
                if (Player.currentTrack) {
                    this.loadVideoClip(Player.currentTrack.id);
                    this.openMobileFullscreenPlayer();
                }
            } else {
                this.dom.videoFrameContainer.classList.add('hidden');
                this.dom.youtubeVideoIframe.src = '';
            }
        },

        loadVideoClip(videoId) {
            const curTime = Math.floor(Player.audio.currentTime || 0);
            this.dom.videoFrameContainer.classList.remove('hidden');
            this.dom.youtubeVideoIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${curTime}&playsinline=1&controls=1`;
        },

        // -------------------------------------------------------------
        // SIDE PANEL (QUEUE & LYRICS)
        // -------------------------------------------------------------
        toggleSidePanel(panelName) {
            if (!this.dom.sidePanel) return;
            if (!this.dom.sidePanel.classList.contains('hidden') && this.currentSideTab === panelName) {
                this.dom.sidePanel.classList.add('hidden');
                if (this.dom.toggleLyricsBtn) this.dom.toggleLyricsBtn.classList.remove('active');
                if (this.dom.toggleQueueBtn) this.dom.toggleQueueBtn.classList.remove('active');
                return;
            }

            this.dom.sidePanel.classList.remove('hidden');
            this.switchSidePanelTab(panelName);
        },

        switchSidePanelTab(panelName) {
            this.currentSideTab = panelName;
            document.querySelectorAll('.side-tab').forEach((t) => {
                t.classList.toggle('active', t.getAttribute('data-panel') === panelName);
            });
            document.querySelectorAll('.panel-tab-content').forEach((c) => {
                c.classList.remove('active');
            });

            const activeContent = document.getElementById(`panel-${panelName}-content`);
            if (activeContent) activeContent.classList.add('active');

            if (this.dom.toggleLyricsBtn) this.dom.toggleLyricsBtn.classList.toggle('active', panelName === 'lyrics');
            if (this.dom.toggleQueueBtn) this.dom.toggleQueueBtn.classList.toggle('active', panelName === 'queue');

            if (panelName === 'lyrics') {
                if (window.LyricsManager && typeof window.LyricsManager.setContainer === 'function') {
                    window.LyricsManager.setContainer(this.dom.sideLyricsContainer);
                    window.LyricsManager.render();
                }
            } else if (panelName === 'queue') {
                this.renderQueueUI();
            }
        },

        renderQueueUI() {
            const queue = Player.queue || [];
            const curIdx = Player.currentIndex;

            // Update badge counters
            const countText = queue.length <= 1 ? `${queue.length} titre` : `${queue.length} titres`;
            const sideBadge = document.getElementById('side-queue-count');
            if (sideBadge) sideBadge.textContent = countText;
            const mobileBadge = document.getElementById('mobile-queue-count');
            if (mobileBadge) mobileBadge.textContent = countText;

            // Update shuffle buttons active state
            const sideShuffle = document.getElementById('side-queue-shuffle-btn');
            if (sideShuffle) sideShuffle.classList.toggle('active', !!Player.isShuffled);
            const mobileShuffle = document.getElementById('mobile-queue-shuffle-btn');
            if (mobileShuffle) mobileShuffle.classList.toggle('active', !!Player.isShuffled);

            const containers = [this.dom.sideQueueList, this.dom.mobileQueueList].filter(Boolean);
            if (containers.length === 0) return;

            if (queue.length === 0) {
                containers.forEach(container => {
                    container.innerHTML = `
                        <div class="empty-queue-box">
                            <svg viewBox="0 0 24 24" class="empty-queue-icon"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                            <p class="empty-queue-title">Votre file d'attente est vide</p>
                            <p class="empty-queue-sub">Ajoutez des morceaux depuis l'accueil, une recherche ou une playlist pour les écouter à la suite.</p>
                        </div>
                    `;
                });
                return;
            }

            const html = queue.map((track, idx) => {
                const isCurrent = idx === curIdx;
                const isFav = Storage.isFavorite(track.id);
                return `
                    <div class="queue-item ${isCurrent ? 'active' : ''}" data-queue-index="${idx}" draggable="true">
                        <div class="queue-drag-handle" title="Glisser pour réorganiser">
                            <svg viewBox="0 0 24 24"><path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        </div>
                        <div class="queue-thumb-wrapper">
                            <img src="${track.thumbnail || '/icons/icon.svg'}" alt="" class="queue-thumb" loading="lazy">
                            ${isCurrent ? `
                                <div class="queue-playing-waves">
                                    <span class="wave-bar"></span>
                                    <span class="wave-bar"></span>
                                    <span class="wave-bar"></span>
                                </div>
                            ` : `
                                <div class="queue-play-hover-btn" title="Lire maintenant">
                                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                            `}
                        </div>
                        <div class="queue-info">
                            <div class="queue-title" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</div>
                            <div class="queue-artist" title="${this.escapeHtml(track.artist)}">${this.escapeHtml(track.artist)}</div>
                        </div>
                        <div class="queue-item-actions">
                            <button class="icon-btn small queue-fav-btn ${isFav ? 'favorited' : ''}" data-track-id="${track.id}" data-index="${idx}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
                                <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                            </button>
                            <button class="icon-btn small queue-add-pl-btn" data-index="${idx}" title="Ajouter à une playlist">
                                <svg viewBox="0 0 24 24"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
                            </button>
                            <button class="icon-btn small remove-queue-btn" data-index="${idx}" title="Retirer de la file">
                                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            containers.forEach(container => {
                container.innerHTML = html;

                // Click on queue item to play
                container.querySelectorAll('.queue-item').forEach((item) => {
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.queue-item-actions') || e.target.closest('.queue-drag-handle')) return;
                        const idx = parseInt(item.getAttribute('data-queue-index'), 10);
                        if (!isNaN(idx) && Player.queue[idx]) {
                            Player.playTrack(Player.queue[idx], null, idx);
                            this.renderQueueUI();
                        }
                    });

                    // Drag & Drop HTML5 Reordering
                    item.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('text/plain', item.getAttribute('data-queue-index'));
                        item.classList.add('dragging');
                    });
                    item.addEventListener('dragend', () => {
                        item.classList.remove('dragging');
                        container.querySelectorAll('.queue-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
                    });
                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        const rect = item.getBoundingClientRect();
                        const next = (e.clientY - rect.top) > (rect.height / 2);
                        item.classList.toggle('drag-over-bottom', next);
                        item.classList.toggle('drag-over-top', !next);
                    });
                    item.addEventListener('dragleave', () => {
                        item.classList.remove('drag-over-top', 'drag-over-bottom');
                    });
                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        item.classList.remove('drag-over-top', 'drag-over-bottom');
                        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        let toIdx = parseInt(item.getAttribute('data-queue-index'), 10);
                        const rect = item.getBoundingClientRect();
                        if ((e.clientY - rect.top) > (rect.height / 2)) {
                            toIdx++;
                        }
                        if (fromIdx < toIdx) toIdx--;
                        if (!isNaN(fromIdx) && !isNaN(toIdx) && fromIdx !== toIdx) {
                            Player.moveInQueue(fromIdx, toIdx);
                            this.renderQueueUI();
                        }
                    });
                });

                // Favorite toggle in queue
                container.querySelectorAll('.queue-fav-btn').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const idx = parseInt(btn.getAttribute('data-index'), 10);
                        const track = Player.queue[idx];
                        if (!track) return;
                        const isFav = Storage.toggleFavorite(track);
                        btn.classList.toggle('favorited', isFav);
                        btn.title = isFav ? 'Retirer des favoris' : 'Ajouter aux favoris';
                        if (Player.currentTrack && Player.currentTrack.id === track.id) {
                            this.updateFavoriteUI(isFav);
                        }
                        this.showToast(isFav ? 'Ajouté aux favoris ❤️' : 'Retiré des favoris');
                    });
                });

                // Add to playlist from queue
                container.querySelectorAll('.queue-add-pl-btn').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const idx = parseInt(btn.getAttribute('data-index'), 10);
                        const track = Player.queue[idx];
                        if (track) {
                            this.openPlaylistPicker(track);
                        }
                    });
                });

                // Remove item from queue
                container.querySelectorAll('.remove-queue-btn').forEach((btn) => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const idx = parseInt(btn.getAttribute('data-index'), 10);
                        Player.removeFromQueue(idx);
                        this.renderQueueUI();
                    });
                });
            });
        },

        // Mobile Fullscreen Modal
        openMobileFullscreenPlayer() {
            this.dom.mobileFullscreenPlayer.classList.remove('hidden');
        },

        closeMobileFullscreenPlayer() {
            this.dom.mobileFullscreenPlayer.classList.add('hidden');
        },

        // Helper: Find track metadata in current search/home/favorites
        findTrackInMemory(id) {
            if (Player.currentTrack?.id === id) return Player.currentTrack;

            if (this.currentHomeSections) {
                for (const sec of this.currentHomeSections) {
                    const item = sec.items?.find(t => t.id === id);
                    if (item) return item;
                }
            }

            if (this.currentSearchResults) {
                const found = this.currentSearchResults.find(t => t.id === id);
                if (found) return found;
            }

            const favs = Storage.getFavorites();
            const favFound = favs.find(t => t.id === id);
            if (favFound) return favFound;

            const hist = Storage.getHistory();
            const histFound = hist.find(t => t.id === id);
            if (histFound) return histFound;

            // Check DOM element
            const el = document.querySelector(`[data-track-id="${id}"]`);
            if (el) {
                const title = el.querySelector('.card-title, .row-title')?.textContent || 'Titre';
                const artist = el.querySelector('.card-artist, .row-artist')?.textContent || 'Artiste';
                const img = el.querySelector('img')?.src || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
                const dur = el.querySelector('.card-duration, .row-duration')?.textContent || '3:30';
                return { id, title, artist, thumbnail: img, duration: dur };
            }

            return { id, title: 'Titre', artist: 'Artiste inconnu', thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
        },

        async playRandom() {
            this.showToast('🎲 Chargement d\'une sélection aléatoire...');
            try {
                const randomSongs = await API.getRandom();
                if (randomSongs && randomSongs.length > 0) {
                    Player.playTrack(randomSongs[0], randomSongs);
                    this.showToast(`Lecture : ${randomSongs[0].title}`);
                } else {
                    // Fallback to in-memory cards
                    const allCards = Array.from(document.querySelectorAll('[data-track-id]')).map(el => {
                        const id = el.getAttribute('data-track-id');
                        return this.findTrackInMemory(id);
                    }).filter(Boolean);
                    if (allCards.length > 0) {
                        const rand = allCards[Math.floor(Math.random() * allCards.length)];
                        Player.playTrack(rand, allCards);
                    }
                }
            } catch (err) {
                console.error('playRandom error:', err);
                // Fallback directly to Daft Punk One More Time
                this.playTrackById('FGBhQbmPwH8');
            }
        },

        playHits() {
            const trendingShelf = this.currentHomeSections?.find(s => s.id === 'trending') || this.currentHomeSections?.[0];
            if (trendingShelf && trendingShelf.items?.length > 0) {
                Player.playTrack(trendingShelf.items[0], trendingShelf.items);
                this.showToast(`🔥 Lecture : ${trendingShelf.items[0].title}`);
                return;
            }
            // Or find cards in trending shelf DOM
            const trendingEl = document.querySelector('[data-shelf-id="trending"] [data-track-id]') || document.querySelector('[data-track-id]');
            if (trendingEl) {
                const id = trendingEl.getAttribute('data-track-id');
                this.playTrackById(id);
                this.showToast('🔥 Lancement des hits !');
            }
        },

        openModal(modalId) {
            const el = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
            if (el) {
                el.classList.remove('hidden');
                el.style.display = 'flex';
            }
        },

        closeModal(modalId) {
            const el = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
            if (el) {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        },

        openImportModal() {
            this.openModal('modal-import-playlist');
        },

        closeImportModal() {
            this.closeModal('modal-import-playlist');
        },

        switchImportTab(tabKey) {
            document.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.import-tab-content').forEach(c => c.classList.remove('active'));
            const activeTab = document.querySelector(`.import-tab[data-tab="${tabKey}"]`);
            const activeContent = document.getElementById(`import-tab-${tabKey}`);
            if (activeTab) activeTab.classList.add('active');
            if (activeContent) activeContent.classList.add('active');
        },

        async submitImportYouTube() {
            const urlInput = document.getElementById('import-yt-url-input');
            const nameInput = document.getElementById('import-yt-name-input');
            const submitBtn = document.getElementById('submit-import-yt-btn');
            const loader = document.getElementById('import-loading-indicator');
            const loaderText = document.getElementById('import-loading-text');
            const progressBarFill = document.getElementById('import-progress-bar-fill');

            const url = (urlInput?.value || '').trim();
            const name = (nameInput?.value || '').trim();

            if (!url) {
                await this.showModalAlert('Veuillez entrer une URL de playlist YouTube ou YouTube Music valide (ex: https://www.youtube.com/playlist?list=...)', 'URL manquante');
                return;
            }

            if (loader) loader.classList.remove('hidden');
            if (submitBtn) submitBtn.disabled = true;
            if (loaderText) loaderText.textContent = 'Extraction des titres depuis YouTube en cours...';
            if (progressBarFill) progressBarFill.style.width = '20%';

            this.startLoadingBar(20);

            let progressInterval = setInterval(() => {
                if (progressBarFill) {
                    const current = parseInt(progressBarFill.style.width, 10) || 20;
                    if (current < 90) progressBarFill.style.width = (current + 10) + '%';
                }
            }, 500);

            try {
                const data = await API.importPlaylist({ url, name });
                if (!data || !data.tracks || data.tracks.length === 0) {
                    throw new Error('Aucun titre trouvé dans cette playlist.');
                }

                if (progressBarFill) progressBarFill.style.width = '100%';
                this.setProgressBar(100);

                const newPl = Storage.createPlaylistWithTracks(data.name || 'Playlist YouTube Importée', data.tracks);

                this.closeImportModal();
                if (urlInput) urlInput.value = '';
                if (nameInput) nameInput.value = '';
                this.showToast(`Playlist "${newPl.name}" importée (${data.tracks.length} titres) ! 🎉`);
                this.renderPlaylists();
                this.openPlaylistView(newPl.id);
            } catch (err) {
                await this.showModalAlert(`Erreur d'importation : ${err.message || 'Impossible de charger la playlist'}`, 'Échec de l\'importation');
            } finally {
                clearInterval(progressInterval);
                this.stopLoadingBar();
                if (loader) loader.classList.add('hidden');
                if (progressBarFill) progressBarFill.style.width = '15%';
                if (submitBtn) submitBtn.disabled = false;
            }
        },

        async submitImportText() {
            const textInput = document.getElementById('import-text-input');
            const nameInput = document.getElementById('import-text-name-input');
            const submitBtn = document.getElementById('submit-import-text-btn');
            const loader = document.getElementById('import-loading-indicator');
            const loaderText = document.getElementById('import-loading-text');
            const progressBarFill = document.getElementById('import-progress-bar-fill');

            const text = (textInput?.value || '').trim();
            const name = (nameInput?.value || '').trim() || 'Ma Playlist Importée';

            if (!text) {
                await this.showModalAlert('Veuillez coller au moins un titre de morceau (ex: Daft Punk - One More Time).', 'Texte requis');
                return;
            }

            if (loader) loader.classList.remove('hidden');
            if (submitBtn) submitBtn.disabled = true;
            if (loaderText) loaderText.textContent = 'Recherche automatique des morceaux sur YouTube...';
            if (progressBarFill) progressBarFill.style.width = '20%';

            this.startLoadingBar(20);

            let progressInterval = setInterval(() => {
                if (progressBarFill) {
                    const current = parseInt(progressBarFill.style.width, 10) || 20;
                    if (current < 90) progressBarFill.style.width = (current + 10) + '%';
                }
            }, 500);

            try {
                const data = await API.importPlaylist({ text, name });
                if (!data || !data.tracks || data.tracks.length === 0) {
                    throw new Error('Aucun morceau trouvé correspondant aux titres indiqués.');
                }

                if (progressBarFill) progressBarFill.style.width = '100%';
                this.setProgressBar(100);

                const newPl = Storage.createPlaylistWithTracks(name, data.tracks);

                this.closeImportModal();
                if (textInput) textInput.value = '';
                if (nameInput) nameInput.value = '';
                this.showToast(`Playlist "${name}" créée avec ${data.tracks.length} titres ! 🎉`);
                this.renderPlaylists();
                this.openPlaylistView(newPl.id);
            } catch (err) {
                await this.showModalAlert(`Erreur d'importation : ${err.message}`, 'Échec de l\'importation');
            } finally {
                clearInterval(progressInterval);
                this.stopLoadingBar();
                if (loader) loader.classList.add('hidden');
                if (progressBarFill) progressBarFill.style.width = '15%';
                if (submitBtn) submitBtn.disabled = false;
            }
        },

        // Modal helpers
        openEqualizerModal() {
            this.openModal('modal-equalizer');
        },

        closeEqualizerModal() {
            this.closeModal('modal-equalizer');
        },

        openSleepModal() {
            this.openModal('modal-sleep-timer');
        },

        closeSleepModal() {
            this.closeModal('modal-sleep-timer');
        },

        openCreatePlaylistPrompt() {
            this.openCreatePlaylistModal();
        },

        newPlaylistCustomCover: null,

        handleNewPlaylistFileUpload(event) {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                this.showToast('⚠️ Veuillez sélectionner un fichier image valide.');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                this.showToast('⚠️ Image trop volumineuse (max 5 Mo).');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target?.result;
                if (base64) {
                    this.newPlaylistCustomCover = base64;
                    this.updateNewPlaylistCoverPreview(base64);
                    const urlInput = document.getElementById('new-playlist-cover-url-input');
                    if (urlInput) urlInput.value = '';
                }
            };
            reader.readAsDataURL(file);
        },

        handleNewPlaylistUrlInput(url) {
            const clean = (url || '').trim();
            if (!clean) {
                if (!this.newPlaylistCustomCover || this.newPlaylistCustomCover.startsWith('http')) {
                    this.clearNewPlaylistCover();
                }
                return;
            }
            if (/^https?:\/\/.+/i.test(clean)) {
                this.newPlaylistCustomCover = clean;
                this.updateNewPlaylistCoverPreview(clean);
                const fileInput = document.getElementById('new-playlist-file-input');
                if (fileInput) fileInput.value = '';
            }
        },

        updateNewPlaylistCoverPreview(imgSrc) {
            const imgEl = document.getElementById('new-playlist-cover-img');
            const placeholderEl = document.getElementById('new-playlist-cover-placeholder');
            const removeBtn = document.getElementById('new-playlist-cover-remove-btn');
            if (imgEl && placeholderEl) {
                imgEl.src = imgSrc;
                imgEl.classList.remove('hidden');
                placeholderEl.classList.add('hidden');
            }
            if (removeBtn) removeBtn.classList.remove('hidden');
        },

        clearNewPlaylistCover() {
            this.newPlaylistCustomCover = null;
            const imgEl = document.getElementById('new-playlist-cover-img');
            const placeholderEl = document.getElementById('new-playlist-cover-placeholder');
            const removeBtn = document.getElementById('new-playlist-cover-remove-btn');
            const fileInput = document.getElementById('new-playlist-file-input');
            const urlInput = document.getElementById('new-playlist-cover-url-input');

            if (imgEl) {
                imgEl.src = '';
                imgEl.classList.add('hidden');
            }
            if (placeholderEl) placeholderEl.classList.remove('hidden');
            if (removeBtn) removeBtn.classList.add('hidden');
            if (fileInput) fileInput.value = '';
            if (urlInput) urlInput.value = '';
        },

        openCreatePlaylistModal() {
            const modal = document.getElementById('modal-create-playlist');
            const input = document.getElementById('new-playlist-modal-name');
            this.clearNewPlaylistCover();
            if (!modal) return;
            if (input) input.value = '';
            this.openModal(modal);
            setTimeout(() => {
                if (input) input.focus();
            }, 60);
        },

        closeCreatePlaylistModal() {
            this.closeModal('modal-create-playlist');
            this.clearNewPlaylistCover();
        },

        submitCreatePlaylist() {
            const input = document.getElementById('new-playlist-modal-name');
            const name = input ? input.value.trim() : '';
            if (!name) {
                if (input) {
                    input.focus();
                    input.classList.add('shake-error');
                    setTimeout(() => input.classList.remove('shake-error'), 400);
                }
                this.showToast('⚠️ Veuillez entrer un nom pour la playlist');
                return;
            }
            const pl = Storage.createPlaylist(name, true, this.newPlaylistCustomCover);
            this.closeCreatePlaylistModal();
            this.showToast(`✨ Playlist "${pl.name}" créée !`);
            this.renderPlaylists();
            this.openPlaylistView(pl.id);
        },

        // -------------------------------------------------------------
        // CAROUSEL AIDE IMPORT TITRES LIKES (Spotify / Deezer / YouTube)
        // -------------------------------------------------------------
        likedHelpCurrentSlide: 0,

        setLikedHelpSlide(index) {
            this.likedHelpCurrentSlide = Math.max(0, Math.min(2, index));
            const track = document.getElementById('liked-help-track');
            if (track) {
                track.style.transform = `translateX(-${this.likedHelpCurrentSlide * (100 / 3)}%)`;
            }

            // Update pills
            document.querySelectorAll('.liked-help-pill').forEach((pill, idx) => {
                pill.classList.toggle('active', idx === this.likedHelpCurrentSlide);
            });

            // Update dots
            document.querySelectorAll('.liked-dot').forEach((dot, idx) => {
                dot.classList.toggle('active', idx === this.likedHelpCurrentSlide);
            });
        },

        prevLikedHelpSlide() {
            const nextIdx = (this.likedHelpCurrentSlide - 1 + 3) % 3;
            this.setLikedHelpSlide(nextIdx);
        },

        nextLikedHelpSlide() {
            const nextIdx = (this.likedHelpCurrentSlide + 1) % 3;
            this.setLikedHelpSlide(nextIdx);
        },

        async playTrackById(id) {
            const track = this.findTrackInMemory(id);
            Player.playTrack(track);
        },

        // Global Top Loading Progress Bar Controller
        startLoadingBar(initialPercent = 25) {
            const bar = document.getElementById('global-progress-bar');
            const fill = document.getElementById('global-progress-fill');
            if (!bar || !fill) return;
            bar.classList.add('loading');
            fill.style.width = `${initialPercent}%`;
            if (this._loadingBarInterval) clearInterval(this._loadingBarInterval);
            let p = initialPercent;
            this._loadingBarInterval = setInterval(() => {
                if (p < 88) {
                    p += Math.random() * 8 + 2;
                    fill.style.width = `${Math.min(90, p)}%`;
                }
            }, 300);
        },

        setProgressBar(percent) {
            const fill = document.getElementById('global-progress-fill');
            if (fill) fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        },

        stopLoadingBar() {
            if (this._loadingBarInterval) {
                clearInterval(this._loadingBarInterval);
                this._loadingBarInterval = null;
            }
            const bar = document.getElementById('global-progress-bar');
            const fill = document.getElementById('global-progress-fill');
            if (!bar || !fill) return;
            fill.style.width = '100%';
            setTimeout(() => {
                bar.classList.remove('loading');
                setTimeout(() => {
                    fill.style.width = '0%';
                }, 200);
            }, 250);
        },

        // Playback Speed Controller (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
        setPlaybackSpeed(rate) {
            if (window.Player) window.Player.setPlaybackRate(rate);
            const badge = document.getElementById('speed-badge-text');
            if (badge) badge.textContent = `${rate}x`;
            const mobileLabel = document.getElementById('mobile-speed-label');
            if (mobileLabel) mobileLabel.textContent = `${rate}x`;
            document.querySelectorAll('.speed-item').forEach(el => {
                const isCur = parseFloat(el.textContent) === rate;
                el.classList.toggle('active', isCur);
            });
            document.getElementById('speed-dropdown-menu')?.classList.add('hidden');
            this.showToast(`Vitesse de lecture : ${rate}x`);
        },

        async openSpeedPrompt() {
            const current = window.Player?.audio?.playbackRate || 1;
            const choice = await this.showModalPrompt(
                'Entrez la vitesse souhaitée (ex: 0.5, 0.75, 1, 1.25, 1.5, 2) :',
                String(current),
                'Vitesse de lecture',
                '1.0'
            );
            if (choice !== null && choice !== undefined) {
                const val = parseFloat(choice);
                if (!isNaN(val) && val >= 0.25 && val <= 4) {
                    this.setPlaybackSpeed(val);
                }
            }
        },

        // Offline Track Download to IndexedDB Vault
        async downloadTrackOffline(track) {
            if (!track || !track.id) return;
            this.showToast(`Mise en cache hors-ligne : ${track.title}...`);
            this.startLoadingBar(25);
            try {
                const streamUrl = API.getStreamUrl(track.id);
                const res = await fetch(streamUrl);
                if (!res.ok) throw new Error('Impossible de télécharger le flux audio');
                const blob = await res.blob();
                await Storage.saveTrackOffline(track, blob);
                this.stopLoadingBar();
                this.showToast(`✅ "${track.title}" est disponible hors-ligne ! (PWA Vault)`);
            } catch (err) {
                this.stopLoadingBar();
                this.showToast(`Erreur hors-ligne : ${err.message}`);
            }
        },

        // Toast Notifications
        showToast(message) {
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            this.dom.toastContainer.appendChild(toast);
            setTimeout(() => {
                toast.remove();
            }, 3000);
        },

        formatTime(sec) {
            if (isNaN(sec) || sec < 0) return '0:00';
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60).toString().padStart(2, '0');
            return `${m}:${s}`;
        },

        // Auth & Session UI
        openAuthModal() {
            const modal = this.dom.modalAuth || document.getElementById('modal-auth');
            if (!modal) return;
            this.openModal(modal);
            this.authMode = 'login';
            this.switchAuthTab('login');
            this.updateAuthModalView();
        },

        closeAuthModal() {
            this.closeModal(this.dom.modalAuth || 'modal-auth');
        },

        handleAuthBtnClick(e) {
            if (Storage.isLoggedIn()) {
                e.stopPropagation();
                const isOpen = !this.dom.userDropdownMenu.classList.contains('hidden');
                this.dom.userDropdownMenu.classList.toggle('hidden', isOpen);
                this.dom.userMenuWrapper.classList.toggle('open', !isOpen);
            } else {
                this.openAuthModal();
            }
        },

        updateAuthUI() {
            if (!this.dom.authBtnLabel) return;
            if (Storage.isLoggedIn()) {
                const u = Storage.getUser();
                const uname = u && u.username ? u.username : '';
                if (uname) {
                    this.dom.authBtnLabel.textContent = uname;
                    if (this.dom.dropdownUsernameDisplay) this.dom.dropdownUsernameDisplay.textContent = uname;
                }
                this.dom.authBtn.classList.add('logged-in');
                if (this.dom.authDropdownArrow) this.dom.authDropdownArrow.classList.remove('hidden');

                if (u && u.avatar) {
                    if (this.dom.authBtnAvatar) {
                        this.dom.authBtnAvatar.src = u.avatar;
                        this.dom.authBtnAvatar.classList.remove('hidden');
                    }
                    if (this.dom.authBtnIcon) this.dom.authBtnIcon.classList.add('hidden');
                } else {
                    if (this.dom.authBtnAvatar) this.dom.authBtnAvatar.classList.add('hidden');
                    if (this.dom.authBtnIcon) this.dom.authBtnIcon.classList.remove('hidden');
                }
            } else if (Storage.isGuest()) {
                this.dom.authBtnLabel.textContent = 'Invité';
                this.dom.authBtn.classList.remove('logged-in');
                if (this.dom.authDropdownArrow) this.dom.authDropdownArrow.classList.add('hidden');
                if (this.dom.authBtnAvatar) this.dom.authBtnAvatar.classList.add('hidden');
                if (this.dom.authBtnIcon) this.dom.authBtnIcon.classList.remove('hidden');
                if (this.dom.dropdownUsernameDisplay) this.dom.dropdownUsernameDisplay.textContent = 'Invité';
            } else {
                this.dom.authBtnLabel.textContent = 'Connexion';
                this.dom.authBtn.classList.remove('logged-in');
                if (this.dom.authDropdownArrow) this.dom.authDropdownArrow.classList.add('hidden');
                if (this.dom.authBtnAvatar) this.dom.authBtnAvatar.classList.add('hidden');
                if (this.dom.authBtnIcon) this.dom.authBtnIcon.classList.remove('hidden');
                if (this.dom.dropdownUsernameDisplay) this.dom.dropdownUsernameDisplay.textContent = 'Connexion';
            }
        },

        openMyProfile(e) {
            if (e) e.preventDefault();
            this.closeUserDropdown();
            const u = Storage.getUser();
            if (!u || !u.username) {
                this.openAuthModal();
                return;
            }
            this.openUserProfile(u.username);
        },

        async openUserProfile(username) {
            this.updateURL(`/user/${encodeURIComponent(username)}`);

            // Load profile info from NeonDB API
            try {
                const token = Storage.getToken();
                const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                const res = await fetch(`/api/user/profile/${encodeURIComponent(username)}`, { headers });
                if (!res.ok) {
                    this.showErrorView('Utilisateur introuvable', `L'utilisateur "${this.escapeHtml(username)}" n'existe pas ou a été supprimé.`);
                    return;
                }
                const { profile } = await res.json();
                if (!profile) {
                    this.showErrorView('Utilisateur introuvable', `L'utilisateur "${this.escapeHtml(username)}" n'existe pas ou a été supprimé.`);
                    return;
                }

                this.currentProfileUser = profile;
                this.switchView('profile', false);

                this.dom.profileDisplayUsername.textContent = profile.username;
                this.dom.profileBioText.textContent = profile.bio || 'Passionné de musique sur YouTube Music Maison.';
                this.dom.profileStatLikes.textContent = profile.stats ? profile.stats.likesCount : 0;
                this.dom.profileStatPlaylists.textContent = profile.stats ? profile.stats.playlistsCount : 0;
                if (this.dom.profileStatHistory) {
                    this.dom.profileStatHistory.textContent = profile.stats ? (profile.stats.historyCount || 0) : 0;
                }

                if (profile.avatar) {
                    this.dom.profileAvatarImg.src = profile.avatar;
                    if (this.dom.profileBannerBg) {
                        this.dom.profileBannerBg.style.backgroundImage = `url('${profile.avatar}')`;
                    }
                } else {
                    const fallbackAvatar = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(profile.username)}`;
                    this.dom.profileAvatarImg.src = fallbackAvatar;
                    if (this.dom.profileBannerBg) {
                        this.dom.profileBannerBg.style.backgroundImage = `url('${fallbackAvatar}')`;
                    }
                }

                // Render Badges
                if (this.dom.profileBadgesRow) {
                    const badges = profile.badges || [];
                    this.dom.profileBadgesRow.innerHTML = badges.map(b => `
                        <div class="loyalty-badge-pill" title="${this.escapeHtml(b.desc)}">
                            <span class="badge-icon">${b.icon}</span>
                            <span class="badge-title">${this.escapeHtml(b.title)}</span>
                        </div>
                    `).join('');
                }

                // Render Top Artists of the user
                const topArtistsSec = document.getElementById('profile-top-artists-section');
                if (this.dom.profileTopArtistsGrid) {
                    const topArtists = profile.topArtists || [];
                    if (topArtists.length === 0) {
                        if (topArtistsSec) topArtistsSec.classList.add('hidden');
                        this.dom.profileTopArtistsGrid.innerHTML = '';
                    } else {
                        if (topArtistsSec) topArtistsSec.classList.remove('hidden');
                        this.dom.profileTopArtistsGrid.innerHTML = topArtists.map((a, i) => `
                            <div class="profile-artist-card" data-artist-name="${this.escapeHtml(a.name)}">
                                <img src="${a.avatar}" alt="${this.escapeHtml(a.name)}" class="profile-artist-avatar" loading="lazy">
                                <span class="profile-artist-name">${this.escapeHtml(a.name)}</span>
                                <span class="profile-artist-rank">#${i + 1} • ${a.plays} titre${a.plays > 1 ? 's' : ''}</span>
                            </div>
                        `).join('');

                        this.dom.profileTopArtistsGrid.querySelectorAll('.profile-artist-card').forEach(card => {
                            card.addEventListener('click', () => {
                                const name = card.getAttribute('data-artist-name');
                                this.openArtistView(name);
                            });
                        });
                    }
                }

                // Toggle edit profile button depending on whether viewer is owner
                const currentUser = Storage.getUser();
                const isOwner = currentUser && currentUser.username.toLowerCase() === profile.username.toLowerCase();
                const editBtn = document.querySelector('#profile-actions-block .profile-edit-btn') || document.querySelector('#profile-actions-block button[onclick*="openSettings"]');
                if (editBtn) editBtn.classList.toggle('hidden', !isOwner);

                // Handle Follow Button
                const followBtn = document.getElementById('profile-follow-btn');
                if (followBtn) {
                    if (isOwner) {
                        followBtn.classList.add('hidden');
                    } else {
                        followBtn.classList.remove('hidden');
                        this.updateProfileFollowBtnUI(profile.isFollowing);
                    }
                }

                // Handle Followers & Following Visibility based on isPublic setting
                const isPublicProfile = profile.isPublic !== false;
                const followersWrap = document.getElementById('profile-stat-followers-wrap');
                const followingWrap = document.getElementById('profile-stat-following-wrap');
                const statFollowers = document.getElementById('profile-stat-followers');
                const statFollowing = document.getElementById('profile-stat-following');

                if (followersWrap && followingWrap) {
                    if (isPublicProfile || isOwner) {
                        followersWrap.classList.remove('hidden');
                        followingWrap.classList.remove('hidden');
                        if (statFollowers) statFollowers.textContent = profile.stats ? (profile.stats.followersCount || 0) : 0;
                        if (statFollowing) statFollowing.textContent = profile.stats ? (profile.stats.followingCount || 0) : 0;
                    } else {
                        // User chose not to make profile public
                        followersWrap.classList.add('hidden');
                        followingWrap.classList.add('hidden');
                    }
                }

                // Render user public playlists
                if (!profile.playlists || profile.playlists.length === 0) {
                    this.dom.profilePlaylistsGrid.innerHTML = '<p class="empty-msg">Aucune playlist créée pour le moment.</p>';
                } else {
                    this.dom.profilePlaylistsGrid.innerHTML = profile.playlists.map(p => `
            <div class="music-card" data-playlist-id="${p.id}">
              <div class="card-thumb-wrapper" style="background: linear-gradient(135deg, #2b2b2b, #111);">
                ${p.cover ? `<img src="${p.cover}" alt="">` : `
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--accent-red);">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                </div>`}
              </div>
              <span class="card-title">${this.escapeHtml(p.name)}</span>
              <span class="card-artist">${p.trackCount} titres</span>
            </div>
          `).join('');

                    this.dom.profilePlaylistsGrid.querySelectorAll('[data-playlist-id]').forEach(el => {
                        el.onclick = () => this.openPlaylistView(el.getAttribute('data-playlist-id'), profile.username);
                    });
                }
            } catch (e) {
                this.showErrorView('Utilisateur introuvable', `Impossible de charger le profil de l'utilisateur "${this.escapeHtml(username)}".`);
            }
        },

        updateProfileFollowBtnUI(isFollowing) {
            const followBtn = document.getElementById('profile-follow-btn');
            if (!followBtn) return;
            followBtn.classList.toggle('following', Boolean(isFollowing));
            if (isFollowing) {
                followBtn.innerHTML = `
                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    <span class="follow-btn-text">Abonné(e) ✓</span>
                `;
            } else {
                followBtn.innerHTML = `
                    <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    <span class="follow-btn-text">S'abonner</span>
                `;
            }
        },

        async toggleFollowCurrentProfile() {
            if (!this.currentProfileUser) return;
            if (!Storage.isLoggedIn()) {
                this.showToast('Connectez-vous pour vous abonner !');
                this.openAuthModal();
                return;
            }
            const username = this.currentProfileUser.username;
            try {
                const token = Storage.getToken();
                const res = await fetch(`/api/user/${encodeURIComponent(username)}/follow`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await res.json();
                if (!res.ok) {
                    this.showToast(data.error || 'Erreur lors de l\'abonnement');
                    return;
                }

                this.currentProfileUser.isFollowing = data.isFollowing;
                if (!this.currentProfileUser.stats) this.currentProfileUser.stats = {};
                this.currentProfileUser.stats.followersCount = data.followersCount;
                this.currentProfileUser.stats.followingCount = data.followingCount;

                this.updateProfileFollowBtnUI(data.isFollowing);
                const statFollowers = document.getElementById('profile-stat-followers');
                if (statFollowers) statFollowers.textContent = data.followersCount;

                if (data.isFollowing) {
                    this.showToast(`Abonné à ${username} ! 🔔`);
                } else {
                    this.showToast(`Désabonné de ${username}`);
                }
            } catch (e) {
                console.error('Follow toggle error:', e);
                this.showToast('Erreur de connexion');
            }
        },

        async openArtistView(artistName) {
            if (!artistName) return;
            this.updateURL(`/artist/${encodeURIComponent(artistName)}`);
            this.switchView('artist', false);

            this.currentArtistData = { name: artistName };
            this.updateArtistSubscribeUI(artistName);

            // Loading state
            if (this.dom.artistName) this.dom.artistName.textContent = artistName;
            if (this.dom.artistSubscribers) this.dom.artistSubscribers.textContent = 'Chargement des titres et albums...';
            if (this.dom.artistBioText) this.dom.artistBioText.textContent = `Chargement de la biographie de ${artistName}...`;
            if (this.dom.artistAvatar) this.dom.artistAvatar.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(artistName)}`;
            if (this.dom.artistTracksList) {
                this.dom.artistTracksList.innerHTML = `
          <div class="home-loading" style="padding: 30px 0;">
            <div class="spinner"></div>
            <p>Chargement des titres de ${this.escapeHtml(artistName)}...</p>
          </div>
        `;
            }
            if (this.dom.artistAlbumsGrid) this.dom.artistAlbumsGrid.innerHTML = '';

            try {
                const data = await API.getArtist(artistName);
                if (!data || !data.artist) {
                    if (this.dom.artistSubscribers) this.dom.artistSubscribers.textContent = 'Artiste YouTube Music';
                    return;
                }

                const artist = data.artist;
                this.currentArtistData = artist;
                this.updateArtistSubscribeUI(artist.name || artistName);
                if (this.dom.artistName) this.dom.artistName.textContent = artist.name || artistName;
                if (this.dom.artistSubscribers) this.dom.artistSubscribers.textContent = artist.subscribers || 'Artiste officiel';
                if (this.dom.artistBioText) {
                    this.dom.artistBioText.textContent = artist.bio || `${artist.name} est un artiste de musique officiel.`;
                }
                if (this.dom.artistAvatar) {
                    if (artist.avatar) {
                        this.dom.artistAvatar.src = artist.avatar;
                        this.dom.artistAvatar.onerror = () => {
                            this.dom.artistAvatar.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(artist.name || artistName)}`;
                        };
                    } else {
                        this.dom.artistAvatar.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(artist.name || artistName)}`;
                    }
                }
                if (this.dom.artistHeroGlow && artist.avatar) {
                    this.dom.artistHeroGlow.style.backgroundImage = `radial-gradient(circle at 30% 30%, var(--accent-red) 0%, transparent 65%), url('${artist.avatar}')`;
                }
                document.title = `${artist.name || artistName} - YouTube Music`;

                const topTracks = data.topTracks || [];
                const albums = data.albums || [];

                // Render popular tracks
                if (topTracks.length === 0) {
                    if (this.dom.artistTracksList) {
                        this.dom.artistTracksList.innerHTML = '<p class="empty-msg">Aucun titre populaire trouvé pour cet artiste.</p>';
                    }
                } else {
                    if (this.dom.artistTracksList) {
                        this.dom.artistTracksList.innerHTML = topTracks
                            .map((track, idx) => this.createTrackRowHTML(track, idx))
                            .join('');
                        this.attachTrackClickHandlers(this.dom.artistTracksList);
                    }
                }

                // Render albums
                if (albums.length === 0) {
                    if (this.dom.artistAlbumsGrid) {
                        this.dom.artistAlbumsGrid.innerHTML = '<p class="empty-msg" style="grid-column: 1 / -1;">Aucun album répertorié pour le moment.</p>';
                    }
                } else {
                    if (this.dom.artistAlbumsGrid) {
                        this.dom.artistAlbumsGrid.innerHTML = albums
                            .map((album) => `
                <div class="music-card" data-album-id="${album.id || ''}" data-album-title="${this.escapeHtml(album.title)}" data-album-artist="${this.escapeHtml(artist.name)}">
                  <div class="card-thumb-wrapper">
                    <img src="${album.thumbnail || '/icons/icon.svg'}" alt="${this.escapeHtml(album.title)}" loading="lazy">
                    <div class="card-play-overlay" title="Explorer cet album">
                      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                  <span class="card-title" title="${this.escapeHtml(album.title)}">${this.escapeHtml(album.title)}</span>
                  <span class="card-artist">${this.escapeHtml(album.trackCountText || album.year || 'Album')}</span>
                </div>
              `)
                            .join('');

                        this.dom.artistAlbumsGrid.querySelectorAll('.music-card').forEach((card) => {
                            card.addEventListener('click', () => {
                                const albumId = card.getAttribute('data-album-id');
                                const albumTitle = card.getAttribute('data-album-title');
                                const albumArtist = card.getAttribute('data-album-artist');
                                this.openAlbumView(albumId, albumTitle, albumArtist);
                            });
                        });
                    }
                }

                // Action Buttons: Tout écouter, Lancer la Radio, Lecture Aléatoire
                if (this.dom.artistPlayAllBtn) {
                    this.dom.artistPlayAllBtn.onclick = () => {
                        if (topTracks.length > 0) {
                            Player.playTrack(topTracks[0], topTracks);
                            this.showToast(`Lecture des titres de ${artist.name}`);
                        }
                    };
                }

                if (this.dom.artistRadioBtn) {
                    this.dom.artistRadioBtn.onclick = () => {
                        if (topTracks.length > 0) {
                            Player.playTrack(topTracks[0], topTracks);
                            Player.autoplayRadio = true;
                            this.showToast(`Radio ${artist.name} lancée !`);
                        }
                    };
                }

                if (this.dom.artistShuffleBtn) {
                    this.dom.artistShuffleBtn.onclick = () => {
                        if (topTracks.length > 0) {
                            const shuffled = [...topTracks].sort(() => Math.random() - 0.5);
                            Player.playTrack(shuffled[0], shuffled);
                            this.showToast(`Lecture aléatoire des titres de ${artist.name}`);
                        }
                    };
                }
            } catch (err) {
                console.error('Error loading artist view:', err);
                if (this.dom.artistSubscribers) this.dom.artistSubscribers.textContent = 'Erreur lors du chargement';
            }
        },

        async openAlbumView(albumId, albumTitle, artistName) {
            if (!albumId && !albumTitle) return;
            const targetTitle = albumTitle || albumId;
            this.updateURL(`/album/${encodeURIComponent(albumId || targetTitle)}`);
            this.switchView('album', false);

            // Loading state
            if (this.dom.albumDisplayTitle) this.dom.albumDisplayTitle.textContent = targetTitle;
            if (this.dom.albumArtistName) this.dom.albumArtistName.textContent = artistName || 'Artiste';
            if (this.dom.albumReleaseYear) this.dom.albumReleaseYear.textContent = 'Album';
            if (this.dom.albumTracksCountText) this.dom.albumTracksCountText.textContent = 'Chargement des titres...';
            if (this.dom.albumTotalDurationText) this.dom.albumTotalDurationText.textContent = '... min';
            if (this.dom.albumDescriptionText) this.dom.albumDescriptionText.textContent = 'Récupération des pistes de l\'album en cours...';
            if (this.dom.albumCoverImg) this.dom.albumCoverImg.src = '/icons/icon.svg';
            if (this.dom.albumTracksList) {
                this.dom.albumTracksList.innerHTML = `
          <div class="home-loading" style="padding: 30px 0;">
            <div class="spinner"></div>
            <p>Chargement des pistes de l'album ${this.escapeHtml(targetTitle)}...</p>
          </div>
        `;
            }

            try {
                const data = await API.getAlbum(albumId, targetTitle);
                if (!data || !data.album) {
                    this.showErrorView('Album introuvable', `Impossible de charger l'album "${this.escapeHtml(targetTitle)}".`);
                    return;
                }

                const album = data.album;
                const tracks = data.tracks || [];

                if (this.dom.albumDisplayTitle) this.dom.albumDisplayTitle.textContent = album.title || targetTitle;
                if (this.dom.albumArtistName) {
                    const author = album.artist || artistName || 'Artiste';
                    this.dom.albumArtistName.textContent = author;
                    this.dom.albumArtistName.onclick = () => {
                        if (author && author !== 'Artiste') this.openArtistView(author);
                    };
                }
                if (this.dom.albumReleaseYear) this.dom.albumReleaseYear.textContent = album.year || 'Album';
                if (this.dom.albumTracksCountText) this.dom.albumTracksCountText.textContent = `${album.trackCount || tracks.length} titres`;
                if (this.dom.albumTotalDurationText) this.dom.albumTotalDurationText.textContent = `Durée totale : ${album.totalDuration || '30 min'}`;
                if (this.dom.albumDescriptionText) this.dom.albumDescriptionText.textContent = album.description || '';

                if (this.dom.albumCoverImg && album.thumbnail) {
                    this.dom.albumCoverImg.src = album.thumbnail;
                }
                if (this.dom.albumHeroGlow && album.thumbnail) {
                    this.dom.albumHeroGlow.style.backgroundImage = `radial-gradient(circle at 25% 30%, var(--accent-red) 0%, transparent 65%), url('${album.thumbnail}')`;
                }
                document.title = `${album.title} - ${album.artist || ''} - YouTube Music`;

                // Back to artist button
                if (this.dom.albumBackArtistBtn) {
                    this.dom.albumBackArtistBtn.onclick = () => {
                        const author = album.artist || artistName;
                        if (author && author !== 'Artiste') {
                            this.openArtistView(author);
                        } else {
                            this.switchView('home');
                        }
                    };
                }

                // Render tracks
                if (tracks.length === 0) {
                    if (this.dom.albumTracksList) {
                        this.dom.albumTracksList.innerHTML = '<p class="empty-msg">Aucun titre disponible dans cet album.</p>';
                    }
                } else {
                    if (this.dom.albumTracksList) {
                        this.dom.albumTracksList.innerHTML = tracks
                            .map((track, idx) => this.createTrackRowHTML(track, idx))
                            .join('');
                        this.attachTrackClickHandlers(this.dom.albumTracksList);
                    }
                }

                // Action Buttons: Tout écouter, Lecture Aléatoire
                if (this.dom.albumPlayAllBtn) {
                    this.dom.albumPlayAllBtn.onclick = () => {
                        if (tracks.length > 0) {
                            Player.playTrack(tracks[0], tracks);
                            this.showToast(`Lecture de l'album "${album.title}"`);
                        }
                    };
                }

                if (this.dom.albumShuffleBtn) {
                    this.dom.albumShuffleBtn.onclick = () => {
                        if (tracks.length > 0) {
                            const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                            Player.playTrack(shuffled[0], shuffled);
                            this.showToast(`Lecture aléatoire de l'album "${album.title}"`);
                        }
                    };
                }
            } catch (err) {
                console.error('Error loading album view:', err);
                if (this.dom.albumTracksList) {
                    this.dom.albumTracksList.innerHTML = '<p class="empty-msg">Erreur lors de la récupération des titres de l\'album.</p>';
                }
            }
        },

        openSettings(e) {
            if (e) e.preventDefault();
            this.closeUserDropdown();
            const u = Storage.getUser();
            if (u) {
                if (this.dom.settingsAvatarInput) this.dom.settingsAvatarInput.value = u.avatar || '';
                if (this.dom.settingsBioInput) {
                    this.dom.settingsBioInput.value = u.bio || '';
                    const counter = document.getElementById('bio-char-count');
                    if (counter) counter.textContent = `${this.dom.settingsBioInput.value.length} / 500`;
                }
                const avatarPreview = document.getElementById('settings-avatar-preview');
                if (avatarPreview) {
                    avatarPreview.src = u.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(u.username)}`;
                }
                const usernameDisp = document.getElementById('settings-username-display');
                if (usernameDisp) {
                    usernameDisp.textContent = u.username;
                }
                const pubCheckbox = document.getElementById('settings-profile-public');
                if (pubCheckbox) {
                    pubCheckbox.checked = u.isPublic !== false;
                }
            }

            // Sync settings UI with current settings
            const currentSettings = Storage.getSettings();
            const glowInput = document.getElementById('settings-ambient-glow');
            if (glowInput && typeof currentSettings.ambientGlow === 'boolean') {
                glowInput.checked = currentSettings.ambientGlow;
            }

            // Sync Last.fm settings UI
            const lastFmCfg = Storage.getLastFmConfig ? Storage.getLastFmConfig() : null;
            if (lastFmCfg) {
                const lfmToggle = document.getElementById('settings-lastfm-toggle');
                if (lfmToggle) lfmToggle.checked = !!lastFmCfg.enabled;
                const lfmUser = document.getElementById('settings-lastfm-username');
                if (lfmUser) lfmUser.value = lastFmCfg.username || '';
            }

            // Highlight current accent dot
            const currentAccent = currentSettings.accentColor || localStorage.getItem('ytm_accent_color') || '#ff0033';
            document.querySelectorAll('.theme-color-dot').forEach(dot => {
                dot.classList.toggle('active', dot.getAttribute('data-color') === currentAccent);
            });
            this.switchView('settings');
        },

        selectAvatarPreset(url) {
            if (this.dom.settingsAvatarInput) {
                this.dom.settingsAvatarInput.value = url;
            }
            const preview = document.getElementById('settings-avatar-preview');
            if (preview) {
                preview.src = url;
            }
            this.showToast('Avatar sélectionné ! Cliquez sur Enregistrer pour valider.');
        },

        setAccentTheme(color, hoverColor, name) {
            if (!color) return;
            this.applyAccentThemeDirect(color, hoverColor);
            Storage.saveSetting('accentColor', color);
            Storage.saveSetting('accentHoverColor', hoverColor || color);
            this.showToast(`Thème d'accentuation activé : ${name || color} ✨`);
        },

        applyAccentThemeDirect(color, hoverColor) {
            if (!color) return;
            const hex = color.replace('#', '');
            let r = 255, g = 0, b = 51;
            if (hex.length === 6) {
                r = parseInt(hex.substring(0, 2), 16) || 0;
                g = parseInt(hex.substring(2, 4), 16) || 0;
                b = parseInt(hex.substring(4, 6), 16) || 0;
            }
            const root = document.documentElement;
            root.style.setProperty('--accent-red', color);
            root.style.setProperty('--primary-red', color);
            root.style.setProperty('--accent-red-hover', hoverColor || color);
            root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.45)`);
            root.style.setProperty('--accent-subtle', `rgba(${r}, ${g}, ${b}, 0.16)`);
            root.style.setProperty('--accent-subtle-hover', `rgba(${r}, ${g}, ${b}, 0.28)`);
            root.style.setProperty('--accent-light', color);
            root.style.setProperty('--accent-gradient-liked', `linear-gradient(135deg, ${color}, rgba(${r}, ${g}, ${b}, 0.35))`);

            try {
                localStorage.setItem('ytm_accent_color', color);
                localStorage.setItem('ytm_accent_hover', hoverColor || color);
            } catch (e) { }

            document.querySelectorAll('.theme-color-dot').forEach(dot => {
                dot.classList.toggle('active', dot.getAttribute('data-color') === color);
            });
        },

        toggleAmbientGlow(enabled) {
            const glowEl = document.getElementById('ambient-glow');
            if (glowEl) glowEl.classList.toggle('disabled', !enabled);
            Storage.saveSetting('ambientGlow', enabled);
            this.showToast(enabled ? 'Ambiance lumineuse activée ✨' : 'Ambiance lumineuse désactivée');
        },

        async saveProfileSettings() {
            const avatar = (this.dom.settingsAvatarInput.value || '').trim();
            const bio = (this.dom.settingsBioInput.value || '').trim();
            const pubInput = document.getElementById('settings-profile-public');
            const isPublic = pubInput ? pubInput.checked : true;
            const token = Storage.getToken();

            if (!token) {
                this.openAuthModal();
                return;
            }

            if (bio.length > 500) {
                this.showToast('La biographie ne peut pas dépasser 500 caractères');
                return;
            }

            try {
                const res = await fetch('/api/user/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ avatar, bio, isPublic })
                });
                const json = await res.json();
                if (res.ok && json.success && json.user) {
                    Storage.setSession(token, json.user);
                    this.updateAuthUI();
                    const preview = document.getElementById('settings-avatar-preview');
                    if (preview && json.user.avatar) preview.src = json.user.avatar;
                    this.showToast('Profil mis à jour avec succès sur NeonDB ! 🎉');
                } else {
                    this.showToast(json.error || 'Erreur lors de la sauvegarde du profil');
                }
            } catch (e) {
                this.showToast('Erreur de connexion au serveur');
            }
        },

        switchProfileAvatarTab(tab) {
            const uploadBtn = document.getElementById('profile-tab-upload-btn');
            const urlBtn = document.getElementById('profile-tab-url-btn');
            const uploadSec = document.getElementById('profile-avatar-upload-section');
            const urlSec = document.getElementById('profile-avatar-url-section');

            if (uploadBtn) uploadBtn.classList.toggle('active', tab === 'upload');
            if (urlBtn) urlBtn.classList.toggle('active', tab === 'url');
            if (uploadSec) uploadSec.classList.toggle('active', tab === 'upload');
            if (urlSec) urlSec.classList.toggle('active', tab === 'url');
        },

        initProfileAvatarUpload() {
            const fileInput = document.getElementById('settings-avatar-file-input');
            if (!fileInput) return;

            fileInput.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (loadEvent) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const maxSize = 240;
                        let width = img.width;
                        let height = img.height;
                        if (width > height) {
                            if (width > maxSize) {
                                height = Math.round((height * maxSize) / width);
                                width = maxSize;
                            }
                        } else {
                            if (height > maxSize) {
                                width = Math.round((width * maxSize) / height);
                                height = maxSize;
                            }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

                        const preview = document.getElementById('settings-avatar-preview');
                        if (preview) preview.src = compressedDataUrl;
                        if (this.dom.settingsAvatarInput) this.dom.settingsAvatarInput.value = compressedDataUrl;
                        this.showToast('Photo de profil chargée ! Cliquez sur "Enregistrer le profil". 📸');
                    };
                    img.src = loadEvent.target.result;
                };
                reader.readAsDataURL(file);
                fileInput.value = '';
            };
        },

        openPlaylistCoverModal() {
            if (!this.currentOpenPlaylist || this.currentOpenPlaylist.id === 'liked_tracks') return;
            const modal = document.getElementById('modal-playlist-cover');
            if (!modal) return;

            const preview = document.getElementById('playlist-cover-modal-preview');
            const urlInput = document.getElementById('playlist-modal-url-input');
            const currentCover = this.currentOpenPlaylist.customCover || 
                (this.currentOpenPlaylist.tracks && this.currentOpenPlaylist.tracks[0] ? this.currentOpenPlaylist.tracks[0].thumbnail : '/icons/icon.svg');

            if (preview) preview.src = currentCover;
            if (urlInput) urlInput.value = (this.currentOpenPlaylist.customCover && !this.currentOpenPlaylist.customCover.startsWith('data:')) ? this.currentOpenPlaylist.customCover : '';
            this.tempPlaylistCoverData = this.currentOpenPlaylist.customCover || null;

            modal.classList.remove('hidden');
        },

        switchCoverTab(tab) {
            const uploadBtn = document.getElementById('cover-tab-upload-btn');
            const urlBtn = document.getElementById('cover-tab-url-btn');
            const uploadSec = document.getElementById('cover-section-upload');
            const urlSec = document.getElementById('cover-section-url');

            if (uploadBtn) uploadBtn.classList.toggle('active', tab === 'upload');
            if (urlBtn) urlBtn.classList.toggle('active', tab === 'url');
            if (uploadSec) uploadSec.classList.toggle('active', tab === 'upload');
            if (urlSec) urlSec.classList.toggle('active', tab === 'url');
        },

        previewCoverUrl(url) {
            const preview = document.getElementById('playlist-cover-modal-preview');
            const trimmed = (url || '').trim();
            if (trimmed && preview) {
                preview.src = trimmed;
                this.tempPlaylistCoverData = trimmed;
            }
        },

        initPlaylistModalFileUpload() {
            const fileInput = document.getElementById('playlist-modal-file-input');
            if (!fileInput) return;

            fileInput.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (loadEvent) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const maxSize = 500;
                        let width = img.width;
                        let height = img.height;
                        if (width > height) {
                            if (width > maxSize) {
                                height = Math.round((height * maxSize) / width);
                                width = maxSize;
                            }
                        } else {
                            if (height > maxSize) {
                                width = Math.round((width * maxSize) / height);
                                height = maxSize;
                            }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

                        const preview = document.getElementById('playlist-cover-modal-preview');
                        if (preview) preview.src = compressedDataUrl;
                        this.tempPlaylistCoverData = compressedDataUrl;
                        this.showToast('Image chargée, cliquez sur "Enregistrer" ! 🖼️');
                    };
                    img.src = loadEvent.target.result;
                };
                reader.readAsDataURL(file);
                fileInput.value = '';
            };
        },

        savePlaylistCoverModal() {
            if (!this.currentOpenPlaylist || !this.tempPlaylistCoverData) {
                document.getElementById('modal-playlist-cover')?.classList.add('hidden');
                return;
            }
            Storage.updatePlaylist(this.currentOpenPlaylist.id, { customCover: this.tempPlaylistCoverData });
            this.currentOpenPlaylist.customCover = this.tempPlaylistCoverData;
            document.getElementById('modal-playlist-cover')?.classList.add('hidden');
            this.renderPlaylists();
            this.openPlaylistView(this.currentOpenPlaylist.id);
            this.showToast('Couverture de la playlist enregistrée ! 🖼️');
        },

        removePlaylistCustomCover() {
            if (!this.currentOpenPlaylist) return;
            Storage.updatePlaylist(this.currentOpenPlaylist.id, { customCover: null });
            this.currentOpenPlaylist.customCover = null;
            document.getElementById('modal-playlist-cover')?.classList.add('hidden');
            this.renderPlaylists();
            this.openPlaylistView(this.currentOpenPlaylist.id);
            this.showToast('Couverture réinitialisée au 1er titre ! 🔄');
        },

        toggleArtistSubscription() {
            if (!this.currentArtistData || !this.currentArtistData.name) return;
            const artist = this.currentArtistData;
            const isSub = Storage.toggleSubscription({
                id: artist.name,
                name: artist.name,
                avatar: artist.avatar,
                type: 'artist',
                subscribers: artist.subscribers || ''
            });

            this.updateArtistSubscribeUI(artist.name);
            this.showToast(isSub ? `Abonné à ${artist.name} ! 🎉` : `Désabonné de ${artist.name}`);
        },

        updateArtistSubscribeUI(artistName) {
            const btn = document.getElementById('artist-subscribe-btn');
            const txt = document.getElementById('artist-subscribe-btn-text');
            if (!btn) return;
            const isSub = Storage.isSubscribed(artistName);
            btn.classList.toggle('subscribed', isSub);
            if (txt) txt.textContent = isSub ? '✓ Abonné' : "S'abonner";
        },

        renderSubscriptions() {
            const container = document.getElementById('subscriptions-grid');
            if (!container) return;

            const subs = Storage.getSubscriptions();
            if (!subs || subs.length === 0) {
                container.innerHTML = '<p class="empty-msg" style="grid-column: 1/-1; padding: 24px 0;">Vous n\'êtes abonné à aucun artiste pour le moment. Explorez et abonnez-vous depuis la page d\'un artiste !</p>';
                return;
            }

            container.innerHTML = subs.map(sub => `
                <div class="artist-sub-card" onclick="window.App && window.App.openArtistView('${this.escapeHtml(sub.name)}')">
                    <img src="${sub.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(sub.name)}" alt="" class="artist-sub-avatar">
                    <span class="artist-sub-name">${this.escapeHtml(sub.name)}</span>
                    <span class="artist-sub-badge">${sub.subscribers ? this.escapeHtml(sub.subscribers) : 'Artiste'}</span>
                </div>
            `).join('');
        },

        closeUserDropdown() {
            if (this.dom.userDropdownMenu) this.dom.userDropdownMenu.classList.add('hidden');
            if (this.dom.userMenuWrapper) this.dom.userMenuWrapper.classList.remove('open');
        },

        logoutUser() {
            this.closeUserDropdown();
            Storage.logout();
            this.showToast('Vous avez été déconnecté.');
        },

        shareCurrentPlaylist() {
            if (!this.currentOpenPlaylist) {
                const plId = this.currentActivePlaylistId;
                if (plId) {
                    const pl = Storage.getPlaylists().find(p => String(p.id) === String(plId));
                    if (pl) this.currentOpenPlaylist = pl;
                }
            }
            const pl = this.currentOpenPlaylist;
            const plName = pl?.name || document.getElementById('playlist-detail-title')?.textContent || 'Playlist';
            const currentUser = Storage.getUser();
            const owner = pl?.ownerUsername || (currentUser ? currentUser.username : 'user');
            const shareUrl = pl?.id ? `${window.location.origin}/playlist/${encodeURIComponent(pl.id)}` : `${window.location.origin}/user/${encodeURIComponent(owner)}/playlist/${encodeURIComponent(plName)}`;

            if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
                navigator.share({
                    title: plName,
                    text: `Écoute la playlist "${plName}" sur YouTube Music ! 🎶`,
                    url: shareUrl
                }).catch(() => {
                    this.openShareModal(plName, shareUrl);
                });
            } else {
                this.openShareModal(plName, shareUrl);
            }
        },

        openShareModal(title, url) {
            const modal = document.getElementById('modal-share');
            if (!modal) return;
            const linkInput = document.getElementById('share-link-input');

            this.currentShareUrl = url;
            this.currentShareTitle = title;
            if (linkInput) {
                linkInput.textContent = url;
                if ('value' in linkInput) linkInput.value = url;
            }

            // Bind social buttons
            const encodedUrl = encodeURIComponent(url);
            const encodedTitle = encodeURIComponent(`Écoute la playlist "${title}" sur YouTube Music ! 🎶`);

            const linkedinBtn = document.getElementById('share-btn-linkedin');
            if (linkedinBtn) linkedinBtn.onclick = () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`, '_blank');

            const whatsappBtn = document.getElementById('share-btn-whatsapp');
            if (whatsappBtn) whatsappBtn.onclick = () => window.open(`https://api.whatsapp.com/send?text=${encodedTitle}%20${encodedUrl}`, '_blank');

            const fbBtn = document.getElementById('share-btn-facebook');
            if (fbBtn) fbBtn.onclick = () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank');

            const xBtn = document.getElementById('share-btn-x');
            if (xBtn) xBtn.onclick = () => window.open(`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`, '_blank');

            const emailBtn = document.getElementById('share-btn-email');
            if (emailBtn) emailBtn.onclick = () => window.open(`mailto:?subject=${encodedTitle}&body=${encodedUrl}`, '_blank');

            const redditBtn = document.getElementById('share-btn-reddit');
            if (redditBtn) redditBtn.onclick = () => window.open(`https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`, '_blank');

            this.openModal(modal);
        },

        closeShareModal() {
            this.closeModal('modal-share');
        },

        async copyShareModalUrl() {
            if (!this.currentShareUrl) return;
            try {
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(this.currentShareUrl);
                    this.showToast('Lien copié dans le presse-papier ! 📋');
                    return;
                }
            } catch (e) {}
            await this.showModalPrompt('Copiez le lien ci-dessous :', this.currentShareUrl, 'Lien de partage');
        },

        async inviteCollaborators() {
            if (!this.currentShareUrl) return;
            try {
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(this.currentShareUrl);
                    this.showToast('Lien d\'invitation collaborateur copié ! Partagez-le avec vos amis 👥');
                    return;
                }
            } catch (e) {}
            await this.showModalPrompt('Copiez le lien d\'invitation ci-dessous :', this.currentShareUrl, 'Lien d\'invitation collaborateur');
        },

        // ==========================================================================
        // Visual Story / Instagram Share Generator (Canvas 9:16)
        // ==========================================================================
        openStoryGenerator() {
            const track = Player.currentTrack || (this.currentSearchResults && this.currentSearchResults[0]) || (Storage.getFavorites()[0]);
            this.storyTrack = track || {
                id: 'default',
                title: 'YouTube Music Maison',
                artist: this.currentProfileUser ? this.currentProfileUser.username : 'Vibe du moment',
                thumbnail: this.currentProfileUser ? this.currentProfileUser.avatar : '/icons/icon.svg'
            };

            const modal = document.getElementById('modal-story-generator');
            if (!modal) return;

            // Default lyric or quote
            const lyricsInput = document.getElementById('story-lyrics-input');
            if (lyricsInput) {
                // If synced lyrics line exists from LyricsManager, prefill it!
                let activeLyric = '';
                const activeEl = document.querySelector('.lyric-line.active');
                if (activeEl) {
                    activeLyric = `"${activeEl.textContent.trim()}"`;
                }
                if (activeLyric) {
                    lyricsInput.value = activeLyric;
                } else if (this.storyTrack.title) {
                    lyricsInput.value = `En boucle sur "${this.storyTrack.title}" 🎶`;
                }
            }

            this.storyTheme = 'gradient-dark';

            // Bind theme buttons
            document.querySelectorAll('.story-theme-btn').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.story-theme-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.storyTheme = btn.getAttribute('data-theme') || 'gradient-dark';
                    this.renderStoryCanvas();
                };
            });

            if (lyricsInput) {
                lyricsInput.oninput = () => this.renderStoryCanvas();
            }

            this.openModal(modal);
            this.renderStoryCanvas();
        },

        closeStoryGenerator() {
            this.closeModal('modal-story-generator');
        },

        renderStoryCanvas() {
            const canvas = document.getElementById('story-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width; // 720
            const h = canvas.height; // 1280

            // 1. Background Theme Gradients
            let grad;
            switch (this.storyTheme) {
                case 'gradient-red':
                    grad = ctx.createLinearGradient(0, 0, w, h);
                    grad.addColorStop(0, '#ff0033');
                    grad.addColorStop(0.5, '#7b001a');
                    grad.addColorStop(1, '#110508');
                    break;
                case 'gradient-purple':
                    grad = ctx.createLinearGradient(0, 0, w, h);
                    grad.addColorStop(0, '#8a2387');
                    grad.addColorStop(0.5, '#e94057');
                    grad.addColorStop(1, '#1a0526');
                    break;
                case 'gradient-cyan':
                    grad = ctx.createLinearGradient(0, 0, w, h);
                    grad.addColorStop(0, '#00f2fe');
                    grad.addColorStop(0.5, '#4facfe');
                    grad.addColorStop(1, '#051329');
                    break;
                case 'gradient-dark':
                default:
                    grad = ctx.createLinearGradient(0, 0, 0, h);
                    grad.addColorStop(0, '#26262c');
                    grad.addColorStop(0.4, '#151518');
                    grad.addColorStop(1, '#09090b');
                    break;
            }

            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // Ambient background particles/glow
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.beginPath();
            ctx.arc(w / 2, h * 0.35, 260, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-red').trim() || '#ff0033';

            // Brand Header at top
            ctx.save();
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.arc(w / 2 - 110, 95, 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 26px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('YouTube Music', w / 2 - 85, 104);
            ctx.restore();

            // Cover Image
            const track = this.storyTrack || { title: 'Titre', artist: 'Artiste' };
            const coverImg = new Image();
            coverImg.crossOrigin = 'anonymous';
            const coverSrc = track.thumbnail || (track.cover) || '/icons/icon.svg';

            const drawContent = () => {
                // Drop shadow for cover
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                ctx.shadowBlur = 40;
                ctx.shadowOffsetY = 20;

                const coverSize = 420;
                const coverX = (w - coverSize) / 2;
                const coverY = 170;
                const radius = 24;

                // Rounded Rect clipping
                ctx.beginPath();
                ctx.moveTo(coverX + radius, coverY);
                ctx.lineTo(coverX + coverSize - radius, coverY);
                ctx.quadraticCurveTo(coverX + coverSize, coverY, coverX + coverSize, coverY + radius);
                ctx.lineTo(coverX + coverSize, coverY + coverSize - radius);
                ctx.quadraticCurveTo(coverX + coverSize, coverY + coverSize, coverX + coverSize - radius, coverY + coverSize);
                ctx.lineTo(coverX + radius, coverY + coverSize);
                ctx.quadraticCurveTo(coverX, coverY + coverSize, coverX, coverY + coverSize - radius);
                ctx.lineTo(coverX, coverY + radius);
                ctx.quadraticCurveTo(coverX, coverY, coverX + radius, coverY);
                ctx.closePath();
                ctx.clip();

                try {
                    ctx.drawImage(coverImg, coverX, coverY, coverSize, coverSize);
                } catch (e) {
                    ctx.fillStyle = '#222';
                    ctx.fillRect(coverX, coverY, coverSize, coverSize);
                }
                ctx.restore();

                // Track Title & Artist
                ctx.save();
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 36px sans-serif';
                const titleStr = track.title.length > 32 ? track.title.substring(0, 30) + '...' : track.title;
                ctx.fillText(titleStr, w / 2, 650);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
                ctx.font = '500 24px sans-serif';
                ctx.fillText(track.artist || 'Artiste', w / 2, 695);
                ctx.restore();

                // Lyrics / Quote Bubble Card
                const lyricsInput = document.getElementById('story-lyrics-input');
                const lyricText = lyricsInput && lyricsInput.value ? lyricsInput.value.trim() : '';
                if (lyricText) {
                    ctx.save();
                    const cardW = 560;
                    const cardH = 200;
                    const cardX = (w - cardW) / 2;
                    const cardY = 770;
                    const cardR = 24;

                    // Glassmorphism card
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
                    ctx.beginPath();
                    ctx.roundRect(cardX, cardY, cardW, cardH, cardR);
                    ctx.fill();
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.stroke();

                    // Music quote icon
                    ctx.fillStyle = accentColor;
                    ctx.font = 'bold 40px serif';
                    ctx.textAlign = 'left';
                    ctx.fillText('“', cardX + 30, cardY + 60);

                    // Lyric text with word wrap
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'italic 600 26px sans-serif';
                    ctx.textAlign = 'center';

                    // Simple word wrap
                    const words = lyricText.split(' ');
                    let line = '';
                    let lineY = cardY + 95;
                    for (let n = 0; n < words.length; n++) {
                        const testLine = line + words[n] + ' ';
                        const metrics = ctx.measureText(testLine);
                        if (metrics.width > cardW - 80 && n > 0) {
                            ctx.fillText(line, w / 2, lineY);
                            line = words[n] + ' ';
                            lineY += 38;
                        } else {
                            line = testLine;
                        }
                    }
                    ctx.fillText(line, w / 2, lineY);

                    ctx.restore();
                }

                // Waveform / Audio bars indicator at bottom
                ctx.save();
                ctx.fillStyle = '#ff0033';
                const totalBars = 32;
                const barW = 6;
                const gap = 8;
                const startX = (w - (totalBars * (barW + gap))) / 2;
                for (let i = 0; i < totalBars; i++) {
                    const hBar = Math.sin(i * 0.4) * 20 + 28;
                    ctx.beginPath();
                    ctx.roundRect(startX + i * (barW + gap), 1080 - hBar / 2, barW, hBar, 3);
                    ctx.fill();
                }
                ctx.restore();

                // User tag / Watermark
                const currentUser = this.currentProfileUser || Storage.getUser();
                const userName = currentUser ? currentUser.username : 'Écouté sur l\'app';
                ctx.save();
                ctx.textAlign = 'center';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.font = '500 20px sans-serif';
                ctx.fillText(`Partagé par @${userName} ⚡`, w / 2, 1160);
                ctx.restore();
            };

            coverImg.onload = drawContent;
            coverImg.onerror = drawContent;
            coverImg.src = coverSrc;
        },

        downloadStoryImage() {
            const canvas = document.getElementById('story-canvas');
            if (!canvas) return;
            const dataUrl = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `story-${this.storyTrack ? this.storyTrack.title.replace(/[^a-zA-Z0-9]/g, '_') : 'music'}.png`;
            link.href = dataUrl;
            link.click();
            this.showToast('Image Story téléchargée ! Prête pour Instagram / TikTok 📸');
        },

        shareUserProfile() {
            const targetUser = this.currentProfileUser || Storage.getUser();
            const username = targetUser ? targetUser.username : (Storage.getUser() ? Storage.getUser().username : null);
            if (!username) {
                this.showToast('Connectez-vous pour partager votre profil.');
                return;
            }
            const shareUrl = `${window.location.origin}/user/${encodeURIComponent(username)}`;
            const title = `Profil de ${username}`;

            // Open share modal if present, or copy to clipboard
            if (typeof this.openShareModal === 'function') {
                this.openShareModal(title, shareUrl);
            } else if (navigator.clipboard) {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    this.showToast(`Lien du profil copié ! 📋`);
                }).catch(async () => {
                    await this.showModalPrompt('Lien du profil :', shareUrl, 'Partager le profil');
                });
            } else {
                this.showModalPrompt('Lien du profil :', shareUrl, 'Partager le profil');
            }
        },

        updateAuthModalView() {
            if (Storage.isLoggedIn()) {
                const u = Storage.getUser();
                this.dom.authStatusBox.classList.remove('hidden');
                this.dom.authStatusMsg.textContent = `Connecté en tant que "${u ? u.username : 'utilisateur'}" • Synchronisation Cloud active ☁️`;
                this.dom.authForm.classList.add('hidden');
            } else {
                this.dom.authStatusBox.classList.add('hidden');
                this.dom.authForm.classList.remove('hidden');
            }
            this.dom.authErrorMsg.classList.add('hidden');
        },

        switchAuthTab(mode) {
            this.authMode = mode;
            const isLogin = mode === 'login';
            if (this.dom.authTabLogin) this.dom.authTabLogin.classList.toggle('active', isLogin);
            if (this.dom.authTabRegister) this.dom.authTabRegister.classList.toggle('active', !isLogin);
            if (this.dom.authModalTitle) this.dom.authModalTitle.textContent = isLogin ? '🔐 Connexion' : '✨ Créer un compte';
            if (this.dom.authModeDesc) {
                this.dom.authModeDesc.textContent = isLogin
                    ? 'Connectez-vous pour synchroniser vos playlists et favoris automatiquement sur la base de données.'
                    : 'Créez un compte rapide (juste pseudo & mot de passe, aucun email requis) avec sauvegarde BDD.';
            }
            if (this.dom.authSubmitLabel) this.dom.authSubmitLabel.textContent = isLogin ? 'Se connecter' : 'Créer mon compte';
            if (this.dom.authErrorMsg) this.dom.authErrorMsg.classList.add('hidden');
        },

        async handleAuthSubmit() {
            const username = (this.dom.authUsernameInput.value || '').trim();
            const password = (this.dom.authPasswordInput.value || '').trim();

            if (!username || !password) {
                this.showAuthError('Veuillez remplir le pseudo et le mot de passe.');
                return;
            }

            this.dom.authErrorMsg.classList.add('hidden');
            const submitBtn = document.getElementById('auth-submit-btn');
            if (submitBtn) submitBtn.disabled = true;

            try {
                let res;
                if (this.authMode === 'register') {
                    res = await API.register(username, password);
                    this.showToast(`Bienvenue ${res.user.username} ! Compte créé avec succès 🎉`);
                } else {
                    res = await API.login(username, password);
                    this.showToast(`Ravi de vous revoir ${res.user.username} ! 👋`);
                }

                // Save session & pull data
                Storage.setSession(res.token, res.user);
                await Storage.pullFromCloud();
                this.closeAuthModal();
            } catch (err) {
                this.showAuthError(err.message || 'Erreur lors de l\'authentification');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        },

        continueAsGuest() {
            Storage.setGuestMode();
            this.closeAuthModal();
            this.showToast('Mode invité activé. Bon visionnage/écoute ! 🎵');
        },

        showAuthError(msg) {
            if (this.dom.authErrorMsg) {
                this.dom.authErrorMsg.textContent = msg;
                this.dom.authErrorMsg.classList.remove('hidden');
            }
        },

        // ==========================================================================
        // Crossfade Settings Prompt
        // ==========================================================================
        async openCrossfadePrompt() {
            const current = window.Player?.crossfadeDuration || 4;
            const input = await this.showModalPrompt(
                'Réglez la durée du Fondu Enchaîné (Crossfade en secondes, entre 0 et 8) :',
                String(current),
                'Fondu Enchaîné (Crossfade)',
                '4'
            );
            if (input !== null && input !== undefined) {
                const val = Math.max(0, Math.min(8, parseInt(input, 10) || 0));
                if (window.Player) window.Player.crossfadeDuration = val;
                Storage.saveSetting('crossfade', val);
                this.showToast(`Fondu enchaîné configuré à ${val}s`);
            }
        },

        openLibraryTab(tabName) {
            this.switchView('library');
            const targetTab = document.querySelector(`.library-tab[data-tab="${tabName}"]`);
            if (targetTab) {
                targetTab.click();
            } else if (tabName === 'downloads') {
                this.openPlaylistView('downloaded_tracks');
            }
        },

        shuffleCurrentPlaylist() {
            if (!this.currentOpenPlaylist || !this.currentOpenPlaylist.tracks || this.currentOpenPlaylist.tracks.length === 0) {
                this.showToast('Aucun titre à jouer en mode aléatoire dans cette playlist');
                return;
            }
            const tracks = [...this.currentOpenPlaylist.tracks];
            // Fisher-Yates shuffle
            for (let i = tracks.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
            }
            if (window.Player) {
                window.Player.isShuffle = true;
                window.Player.playTrack(tracks[0], tracks);
                this.showToast('Lecture aléatoire lancée 🔀');
            }
        },

        // -------------------------------------------------------------
        // CUSTOM HTML DIALOG MODALS (ALERT / CONFIRM / PROMPT)
        // -------------------------------------------------------------
        _dialogResolver: null,

        showModalAlert(message, title = 'Notification') {
            return new Promise((resolve) => {
                this._dialogResolver = resolve;
                const modal = document.getElementById('modal-app-dialog');
                if (!modal) {
                    alert(message);
                    return resolve(true);
                }
                const iconEl = document.getElementById('app-dialog-icon');
                const titleEl = document.getElementById('app-dialog-title-text');
                const msgEl = document.getElementById('app-dialog-message');
                const inputCont = document.getElementById('app-dialog-input-container');
                const cancelBtn = document.getElementById('app-dialog-cancel-btn');
                const confirmBtn = document.getElementById('app-dialog-confirm-btn');

                if (iconEl) iconEl.textContent = 'ℹ️';
                if (titleEl) titleEl.textContent = title;
                if (msgEl) msgEl.textContent = message;
                if (inputCont) inputCont.classList.add('hidden');
                if (cancelBtn) cancelBtn.classList.add('hidden');
                if (confirmBtn) {
                    confirmBtn.textContent = 'Compris';
                    confirmBtn.focus();
                }
                modal.classList.remove('hidden');
            });
        },

        showModalConfirm(message, title = 'Confirmation', confirmText = 'Confirmer', cancelText = 'Annuler') {
            return new Promise((resolve) => {
                this._dialogResolver = resolve;
                const modal = document.getElementById('modal-app-dialog');
                if (!modal) {
                    return resolve(confirm(message));
                }
                const iconEl = document.getElementById('app-dialog-icon');
                const titleEl = document.getElementById('app-dialog-title-text');
                const msgEl = document.getElementById('app-dialog-message');
                const inputCont = document.getElementById('app-dialog-input-container');
                const cancelBtn = document.getElementById('app-dialog-cancel-btn');
                const confirmBtn = document.getElementById('app-dialog-confirm-btn');

                if (iconEl) iconEl.textContent = '❓';
                if (titleEl) titleEl.textContent = title;
                if (msgEl) msgEl.textContent = message;
                if (inputCont) inputCont.classList.add('hidden');
                if (cancelBtn) {
                    cancelBtn.classList.remove('hidden');
                    cancelBtn.textContent = cancelText;
                }
                if (confirmBtn) {
                    confirmBtn.textContent = confirmText;
                    confirmBtn.focus();
                }
                modal.classList.remove('hidden');
            });
        },

        showModalPrompt(message, defaultValue = '', title = 'Saisie requise', placeholder = '') {
            return new Promise((resolve) => {
                this._dialogResolver = resolve;
                const modal = document.getElementById('modal-app-dialog');
                if (!modal) {
                    return resolve(prompt(message, defaultValue));
                }
                const iconEl = document.getElementById('app-dialog-icon');
                const titleEl = document.getElementById('app-dialog-title-text');
                const msgEl = document.getElementById('app-dialog-message');
                const inputCont = document.getElementById('app-dialog-input-container');
                const input = document.getElementById('app-dialog-input');
                const cancelBtn = document.getElementById('app-dialog-cancel-btn');
                const confirmBtn = document.getElementById('app-dialog-confirm-btn');

                if (iconEl) iconEl.textContent = '✏️';
                if (titleEl) titleEl.textContent = title;
                if (msgEl) msgEl.textContent = message;
                if (inputCont) inputCont.classList.remove('hidden');
                if (input) {
                    input.value = defaultValue;
                    input.placeholder = placeholder;
                }
                if (cancelBtn) {
                    cancelBtn.classList.remove('hidden');
                    cancelBtn.textContent = 'Annuler';
                }
                if (confirmBtn) confirmBtn.textContent = 'Valider';

                modal.classList.remove('hidden');
                if (input) {
                    setTimeout(() => {
                        input.focus();
                        input.select();
                    }, 50);
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') {
                            this.confirmAppDialog();
                        } else if (e.key === 'Escape') {
                            this.closeAppDialog(null);
                        }
                    };
                }
            });
        },

        closeAppDialog(result = null) {
            const modal = document.getElementById('modal-app-dialog');
            if (modal) modal.classList.add('hidden');
            if (this._dialogResolver) {
                const cb = this._dialogResolver;
                this._dialogResolver = null;
                cb(result);
            }
        },

        confirmAppDialog() {
            const inputCont = document.getElementById('app-dialog-input-container');
            const isPrompt = inputCont && !inputCont.classList.contains('hidden');
            let value = true;
            if (isPrompt) {
                const input = document.getElementById('app-dialog-input');
                value = input ? input.value : '';
            }
            this.closeAppDialog(value);
        },

        // -------------------------------------------------------------
        // TRASH & VERSION HISTORY MANAGER
        // -------------------------------------------------------------
        openTrashModal() {
            const modal = document.getElementById('modal-trash-manager');
            if (!modal) return;
            this.renderTrashModal();
            modal.classList.remove('hidden');
        },

        renderTrashModal() {
            const container = document.getElementById('trash-items-list');
            if (!container) return;
            const trash = Storage.getTrash ? Storage.getTrash() : [];
            if (trash.length === 0) {
                container.innerHTML = `
                    <div style="padding: 30px; text-align: center; color: var(--text-tertiary);">
                        <div style="font-size: 32px; margin-bottom: 8px;">🗑️</div>
                        <p style="font-size: 14px; font-weight: 500;">La corbeille est vide</p>
                        <p style="font-size: 12px; margin-top: 4px;">Les playlists et morceaux supprimés apparaîtront ici pour être restaurés facilement en 1 clic.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = trash.map((item) => {
                const date = new Date(item.deletedAt).toLocaleString('fr-FR', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                });
                const isPl = item.type === 'playlist';
                const label = isPl
                    ? `Playlist "${this.escapeHtml(item.data.name)}" (${item.data.tracks ? item.data.tracks.length : 0} titres)`
                    : `Morceau "${this.escapeHtml(item.data.title)}" (${this.escapeHtml(item.data.artist || 'Artiste inconnu')})`;
                return `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); padding:10px 14px; border-radius:8px;">
                        <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden; margin-right:12px;">
                            <span style="font-size:13px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${isPl ? '📁' : '🎵'} ${label}
                            </span>
                            <span style="font-size:11px; color:var(--text-tertiary);">Supprimé le ${date}</span>
                        </div>
                        <button type="button" class="btn primary small" style="font-size:12px; padding:6px 12px; flex-shrink:0;" onclick="window.App && window.App.restoreTrashItem('${item.id}')">
                            Restaurer
                        </button>
                    </div>
                `;
            }).join('');
        },

        restoreTrashItem(trashId) {
            if (!Storage.restoreFromTrash) return;
            const res = Storage.restoreFromTrash(trashId);
            if (res && res.success) {
                this.showToast('Élément restauré avec succès ! 🎉');
                this.renderTrashModal();
                this.renderPlaylists();
                if (this.currentView === 'library') this.renderLibrary();
                if (this.currentView === 'playlist' && this.currentActivePlaylistId) {
                    this.openPlaylistView(this.currentActivePlaylistId);
                }
            } else {
                this.showToast('Impossible de restaurer l\'élément.', 'error');
            }
        },

        async emptyTrash() {
            const confirmed = await this.showModalConfirm(
                'Voulez-vous vider définitivement toute la corbeille ? Tous les éléments sauvegardés seront supprimés.',
                'Vider la corbeille',
                'Vider définitivement',
                'Annuler'
            );
            if (confirmed) {
                if (Storage.emptyTrash) Storage.emptyTrash();
                this.renderTrashModal();
                this.showToast('Corbeille vidée 🗑️');
            }
        },

        // -------------------------------------------------------------
        // DISCORD RICH STATUS & LAST.FM SCROBBLING
        // -------------------------------------------------------------
        async copyDiscordStatus() {
            const track = Player.currentTrack;
            if (!track) {
                await this.showModalAlert('Aucun morceau n\'est actuellement en cours de lecture.', 'Discord Rich Status');
                return;
            }
            const listenUrl = `${window.location.origin}/?play=${track.id}`;
            const discordText = `🎧 Écoute actuellement **${track.title}** de *${track.artist}* sur YouTube Music Clone !\n▶ Écouter avec moi : ${listenUrl}`;
            try {
                if (navigator.clipboard) {
                    await navigator.clipboard.writeText(discordText);
                    this.showToast('Statut Discord copié dans le presse-papier !');
                    return;
                }
            } catch (e) {}
            await this.showModalPrompt('Copiez votre message de statut Discord :', discordText, 'Statut Discord');
        },

        toggleLastFm(enabled) {
            const cfg = Storage.getLastFmConfig ? Storage.getLastFmConfig() : { enabled: false, username: '' };
            cfg.enabled = !!enabled;
            if (Storage.saveLastFmConfig) Storage.saveLastFmConfig(cfg);
            this.showToast(enabled ? 'Scrobbling Last.fm activé ✅' : 'Scrobbling Last.fm désactivé');
        },

        saveLastFmUsername() {
            const input = document.getElementById('settings-lastfm-username');
            const username = input ? input.value.trim() : '';
            const cfg = Storage.getLastFmConfig ? Storage.getLastFmConfig() : { enabled: false, username: '' };
            cfg.username = username;
            if (username) cfg.enabled = true;
            if (Storage.saveLastFmConfig) Storage.saveLastFmConfig(cfg);
            const toggle = document.getElementById('settings-lastfm-toggle');
            if (toggle && username) toggle.checked = true;
            this.showToast(username ? `Compte Last.fm "${username}" configuré ! 🎵` : 'Nom d\'utilisateur Last.fm effacé');
        },

        // -------------------------------------------------------------
        // ENTITY SEPARATION: VIBESTREAM (Music) vs VIBETUBE (Video)
        // -------------------------------------------------------------
        setAppMode(mode, save = true) {
            this.currentAppMode = mode;
            if (save) {
                try { localStorage.setItem('vibe_app_mode', mode); } catch (e) {}
            }

            const isTube = mode === 'vibetube';
            const container = document.querySelector('.app-container');
            if (container) {
                container.classList.toggle('vibetube-mode-active', isTube);
            }

            // Sidebars separation: each entity has its own dedicated sidebar
            const musicSidebar = document.getElementById('vibestream-sidebar');
            const tubeSidebar = document.getElementById('vibetube-sidebar');
            if (musicSidebar) musicSidebar.classList.toggle('hidden', isTube);
            if (tubeSidebar) tubeSidebar.classList.toggle('hidden', !isTube);

            // Audio Player Bar STRICT SEPARATION: never visible on VibeTube, never plays during videos
            const desktopPlayer = document.getElementById('desktop-player-bar');
            const mobilePlayer = document.getElementById('mobile-mini-player');
            if (isTube) {
                if (Player.isPlaying) Player.pause();
                if (desktopPlayer) desktopPlayer.style.setProperty('display', 'none', 'important');
                if (mobilePlayer) mobilePlayer.style.setProperty('display', 'none', 'important');
            } else {
                if (desktopPlayer) desktopPlayer.style.removeProperty('display');
                if (mobilePlayer) mobilePlayer.style.removeProperty('display');
                if (typeof this.closeVibeTubePlayer === 'function') {
                    this.closeVibeTubePlayer();
                }
            }

            // Mobile Bottom Navs toggle
            const streamMobileNav = document.getElementById('vibestream-mobile-nav');
            const tubeMobileNav = document.getElementById('vibetube-mobile-nav');
            if (streamMobileNav) streamMobileNav.classList.toggle('hidden', isTube);
            if (tubeMobileNav) tubeMobileNav.classList.toggle('hidden', !isTube);

            // Header Quick Switch Pill
            const headerUnivBtn = document.getElementById('header-universe-btn');
            const headerUnivIcon = document.getElementById('header-universe-icon');
            const headerUnivText = document.getElementById('header-universe-text');
            if (headerUnivBtn) {
                if (isTube) {
                    headerUnivBtn.classList.add('tube-mode');
                    if (headerUnivIcon) headerUnivIcon.textContent = '🎵';
                    if (headerUnivText) headerUnivText.textContent = 'VibeStream';
                } else {
                    headerUnivBtn.classList.remove('tube-mode');
                    if (headerUnivIcon) headerUnivIcon.textContent = '🎬';
                    if (headerUnivText) headerUnivText.textContent = 'VibeTube';
                }
            }

            // Header Branding & Universe Switcher Button
            const logoImg = document.getElementById('brand-logo-img');
            const logoName = document.getElementById('brand-logo-name');
            const logoBadge = document.getElementById('brand-logo-badge');
            const switchBtn = document.getElementById('switch-mode-btn');
            const switchIcon = document.getElementById('switch-mode-icon');
            const switchText = document.getElementById('switch-mode-text');
            const switchBadge = document.getElementById('switch-mode-badge');
            const searchInput = this.dom?.searchInput;
            const mobileSearchInput = this.dom?.mobileSearchInput;

            if (isTube) {
                if (logoName) logoName.textContent = 'VibeTube';
                if (logoBadge) {
                    logoBadge.textContent = 'VIDÉO';
                    logoBadge.style.background = '#ff0033';
                }
                if (switchBtn) switchBtn.classList.add('tube-active');
                if (switchIcon) switchIcon.textContent = '🎵';
                if (switchText) switchText.textContent = 'Passer sur VibeStream';
                if (switchBadge) {
                    switchBadge.textContent = 'MUSIQUE';
                    switchBadge.style.background = 'rgba(255, 0, 85, 0.35)';
                }
                if (searchInput) searchInput.placeholder = 'Rechercher des vidéos, chaînes YouTube...';
                if (mobileSearchInput) mobileSearchInput.placeholder = 'Rechercher des vidéos, chaînes...';
            } else {
                if (logoName) logoName.textContent = 'VibeStream';
                if (logoBadge) {
                    logoBadge.textContent = 'PRO';
                    logoBadge.style.background = 'var(--accent-red)';
                }
                if (switchBtn) switchBtn.classList.remove('tube-active');
                if (switchIcon) switchIcon.textContent = '🎬';
                if (switchText) switchText.textContent = 'Passer sur VibeTube';
                if (switchBadge) {
                    switchBadge.textContent = 'VIDÉO';
                    switchBadge.style.background = 'rgba(255, 50, 50, 0.4)';
                }
                if (searchInput) searchInput.placeholder = 'Rechercher des titres, artistes, albums...';
                if (mobileSearchInput) mobileSearchInput.placeholder = 'Rechercher des titres, artistes, albums...';
            }

            // Route cleanly when user explicitly sets or switches mode
            if (save) {
                if (isTube) {
                    this.switchView('vibetube');
                    this.showToast('🎬 Bienvenue sur VibeTube');
                } else {
                    this.switchView('home');
                    this.showToast('🎵 Bienvenue sur VibeStream');
                }
            }
        },

        toggleAppMode() {
            const nextMode = this.currentAppMode === 'vibetube' ? 'vibestream' : 'vibetube';
            this.setAppMode(nextMode);
        },

        handleBrandLogoClick() {
            if (this.currentAppMode === 'vibetube') {
                this.switchView('vibetube');
            } else {
                this.switchView('home');
                this.loadHome();
            }
        },

        // -------------------------------------------------------------
        // VIBETUBE VIDEO FEED & SECTIONS
        // -------------------------------------------------------------
        filterVibeTube(category) {
            this.currentVibeTubeCategory = category;
            if (this.currentView !== 'vibetube') {
                this.switchView('vibetube');
            }
            const container = document.getElementById('vibetube-chips');
            if (container) {
                container.querySelectorAll('.vibetube-chip').forEach(c => {
                    c.classList.toggle('active', c.getAttribute('data-vibetube-cat') === category);
                });
            }
            const titleMap = {
                cyber: '🛡️ Cybersécurité, Pentest & Hacking Éthique',
                dev: '💻 Développement, Code, Rust, Python & Linux',
                gaming: '🎮 Meilleurs Gameplays, Streams & E-Sport',
                ai: '🧠 Intelligence Artificielle, LLM & SecOps',
                networks: '🌐 Réseaux Informatiques, Cloud & DevOps',
                hardware: '⚡ Hardware Lab, Électronique & IoT',
                podcasts: '🎙️ Podcasts & Conférences Tech',
                trending: '🔥 Vidéos Tendances du Moment',
                shorts: '⚡ Shorts & Vidéos Virales'
            };
            const titleEl = document.getElementById('vibetube-section-title');
            if (titleEl) titleEl.textContent = titleMap[category] || '🎬 Vidéos Recommandées';

            this.loadVibeTubeFeed(category);
        },

        async loadVibeTubeFeed(category = 'cyber') {
            const grid = document.getElementById('vibetube-video-grid');
            const countEl = document.getElementById('vibetube-video-count');
            if (!grid) return;

            // Skeletons
            grid.innerHTML = Array.from({ length: 8 }).map(() => `
                <div class="vibetube-video-card skeleton">
                    <div class="vibetube-thumb-wrap skeleton-box"></div>
                    <div class="vibetube-card-body">
                        <div class="vibetube-avatar-skeleton skeleton-box"></div>
                        <div class="vibetube-meta-skeleton">
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                    </div>
                </div>
            `).join('');
            if (countEl) countEl.textContent = 'Chargement en cours...';

            const res = await API.getVibeTubeFeed(category);
            const videos = (res && Array.isArray(res.videos)) ? res.videos : [];

            if (videos.length === 0) {
                grid.innerHTML = '<p class="empty-msg" style="grid-column: 1/-1; padding: 40px; text-align: center;">Aucune vidéo disponible pour cette catégorie pour le moment.</p>';
                if (countEl) countEl.textContent = '0 vidéo';
                return;
            }

            if (countEl) countEl.textContent = `${videos.length} vidéos disponibles`;

            this.renderVibeTubeVideoGrid(grid, videos);

            // Bind chip clicks in VibeTube
            const chipsWrapper = document.getElementById('vibetube-chips');
            if (chipsWrapper && !chipsWrapper._hasBound) {
                chipsWrapper._hasBound = true;
                chipsWrapper.querySelectorAll('.vibetube-chip').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const cat = btn.getAttribute('data-vibetube-cat');
                        this.filterVibeTube(cat);
                    });
                });
            }
        },

        renderVibeTubeVideoGrid(container, videos) {
            if (!container || !Array.isArray(videos)) return;

            // Cache in memory for quick retrieval
            if (!Array.isArray(this._vibetubeVideosCache)) this._vibetubeVideosCache = [];
            videos.forEach(v => {
                if (v && v.id && !this._vibetubeVideosCache.some(x => x.id === v.id)) {
                    this._vibetubeVideosCache.push(v);
                }
            });

            container.innerHTML = videos.map(v => `
                <div class="vibetube-video-card" data-video-id="${v.id}">
                    <div class="vibetube-thumb-wrap" onclick="window.App && window.App.openVibeTubeVideo('${v.id}')">
                        <img src="${v.thumbnail || 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg'}" alt="${this.escapeHtml(v.title)}" class="vibetube-thumb" loading="lazy">
                        ${v.duration ? `<span class="vibetube-duration-badge">${this.escapeHtml(v.duration)}</span>` : ''}
                        <div class="vibetube-thumb-overlay">
                            <div class="vibetube-play-pill">
                                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
                                <span>Regarder</span>
                            </div>
                        </div>
                    </div>
                    <div class="vibetube-card-body">
                        <img src="${v.channelAvatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(v.channel || v.artist || 'creator')}" alt="" class="vibetube-creator-avatar" onclick="event.stopPropagation(); window.App && window.App.openVibeTubeChannel('${this.escapeHtml(v.channel || v.artist)}', '${v.channelAvatar || ''}')" title="Voir la chaîne">
                        <div class="vibetube-card-info">
                            <h3 class="vibetube-video-title" onclick="window.App && window.App.openVibeTubeVideo('${v.id}')" title="${this.escapeHtml(v.title)}">${this.escapeHtml(v.title)}</h3>
                            <div class="vibetube-channel-row" onclick="event.stopPropagation(); window.App && window.App.openVibeTubeChannel('${this.escapeHtml(v.channel || v.artist)}', '${v.channelAvatar || ''}')">
                                <span class="vibetube-channel-name">${this.escapeHtml(v.channel || v.artist || 'Chaîne YouTube')}</span>
                                <span class="vibetube-verified-icon" title="Chaîne vérifiée">✓</span>
                            </div>
                            <div class="vibetube-stats-row">
                                <span>${v.views ? this.escapeHtml(v.views) : 'Populaire'}</span>
                                ${v.publishedTime ? `<span>• ${this.escapeHtml(v.publishedTime)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="vibetube-card-actions">
                        <button type="button" class="btn primary small vibetube-card-play-btn" onclick="window.App && window.App.openVibeTubeVideo('${v.id}')">
                            <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:currentColor; margin-right:4px;"><path d="M8 5v14l11-7z"/></svg>
                            <span>Regarder la vidéo</span>
                        </button>
                    </div>
                </div>
            `).join('');
        },

        // -------------------------------------------------------------
        // VIBETUBE SEARCH: VIDEOS & CHANNELS
        // -------------------------------------------------------------
        async executeVibeTubeSearch(query, shouldSwitchView = true) {
            if (shouldSwitchView && this.currentView !== 'vibetube-search') {
                this.switchView('vibetube-search');
            }
            this.currentVibeTubeSearchQuery = query;
            Storage.addVibeTubeRecentSearch(query);
            try {
                window.history.pushState({ view: 'vibetube-search', query }, '', `/vibetube/search?q=${encodeURIComponent(query)}`);
            } catch (e) {}

            const titleEl = document.getElementById('vibetube-search-title');
            if (titleEl) titleEl.textContent = `Résultats Vidéos pour "${query}"`;

            const channelBox = document.getElementById('vibetube-search-channel-box');
            const grid = document.getElementById('vibetube-search-results-grid');

            if (channelBox) channelBox.classList.add('hidden');
            if (grid) {
                grid.innerHTML = Array.from({ length: 6 }).map(() => `
                    <div class="vibetube-video-card skeleton">
                        <div class="vibetube-thumb-wrap skeleton-box"></div>
                        <div class="vibetube-card-body">
                            <div class="vibetube-avatar-skeleton skeleton-box"></div>
                            <div class="vibetube-meta-skeleton">
                                <div class="skeleton-line"></div>
                                <div class="skeleton-line short"></div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            const res = await API.searchVibeTube(query);
            const channels = (res && Array.isArray(res.channels)) ? res.channels : [];
            const videos = (res && Array.isArray(res.videos)) ? res.videos : [];
            this.currentVibeTubeSearchResults = { channels, videos };

            // Render matched channel card if present
            if (channels.length > 0 && channelBox) {
                const topChannel = channels[0];
                const isSub = Storage.isSubscribed(topChannel.name);
                channelBox.innerHTML = `
                    <div class="vibetube-channel-hit-card">
                        <img src="${topChannel.avatar}" alt="" class="vibetube-channel-hit-avatar">
                        <div class="vibetube-channel-hit-meta">
                            <div style="display:flex; align-items:center; gap:6px;">
                                <h3 class="vibetube-channel-hit-title">${this.escapeHtml(topChannel.name)}</h3>
                                <span class="vibetube-verified-icon">✓</span>
                            </div>
                            <div class="vibetube-channel-hit-subs">${this.escapeHtml(topChannel.subscribers || 'Chaîne YouTube')}</div>
                            ${topChannel.description ? `<p class="vibetube-channel-hit-desc">${this.escapeHtml(topChannel.description)}</p>` : ''}
                        </div>
                        <div class="vibetube-channel-hit-actions">
                            <button type="button" class="btn ${isSub ? 'secondary' : 'primary'} vibetube-sub-toggle-btn" onclick="window.App && window.App.toggleVibeTubeChannelSub('${this.escapeHtml(topChannel.name)}')">
                                ${isSub ? 'Abonné ✓' : 'S\'abonner'}
                            </button>
                            <button type="button" class="btn secondary small" onclick="window.App && window.App.openVibeTubeChannel('${this.escapeHtml(topChannel.name)}', '${topChannel.avatar}', '${this.escapeHtml(topChannel.subscribers)}')">
                                <span>Voir la chaîne</span>
                            </button>
                        </div>
                    </div>
                `;
                channelBox.classList.remove('hidden');
            }

            // Render video results
            if (videos.length === 0) {
                if (grid) grid.innerHTML = '<p class="empty-msg" style="grid-column: 1/-1; padding: 40px; text-align: center;">Aucune vidéo trouvée pour cette recherche.</p>';
            } else {
                this.renderVibeTubeVideoGrid(grid, videos);
            }

            // Bind filter pill clicks
            const pillsWrap = document.getElementById('vibetube-search-filter-pills');
            if (pillsWrap && !pillsWrap._hasBound) {
                pillsWrap._hasBound = true;
                pillsWrap.querySelectorAll('.filter-pill').forEach(btn => {
                    btn.addEventListener('click', () => {
                        pillsWrap.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const type = btn.getAttribute('data-vibetube-search-type');
                        this.filterVibeTubeSearchResults(type);
                    });
                });
            }
        },

        filterVibeTubeSearchResults(type = 'all') {
            const data = this.currentVibeTubeSearchResults || { channels: [], videos: [] };
            const channelBox = document.getElementById('vibetube-search-channel-box');
            const grid = document.getElementById('vibetube-search-results-grid');
            if (!grid) return;

            if (type === 'channels') {
                if (channelBox) channelBox.classList.toggle('hidden', data.channels.length === 0);
                grid.innerHTML = data.channels.length === 0 ? '<p class="empty-msg" style="grid-column: 1/-1; padding: 40px; text-align: center;">Aucune chaîne trouvée pour cette recherche.</p>' : '';
                return;
            }

            if (type === 'shorts') {
                if (channelBox) channelBox.classList.add('hidden');
                const shorts = data.videos.filter(v => {
                    const dur = v.duration || '';
                    const isShortDur = dur.startsWith('0:') && parseInt(dur.split(':')[1], 10) <= 60;
                    const hasShortTag = (v.title || '').toLowerCase().includes('short');
                    return isShortDur || hasShortTag;
                });
                if (shorts.length === 0) {
                    grid.innerHTML = '<p class="empty-msg" style="grid-column: 1/-1; padding: 40px; text-align: center;">Aucun Short trouvé pour cette recherche.</p>';
                } else {
                    this.renderVibeTubeVideoGrid(grid, shorts);
                }
                return;
            }

            // 'all'
            if (channelBox) channelBox.classList.toggle('hidden', data.channels.length === 0);
            this.renderVibeTubeVideoGrid(grid, data.videos);
        },

        // Channel profile view on VibeTube (Full YouTube Experience with Banner, Socials, Sorting & Pagination)
        async openVibeTubeChannel(channelName, avatar = '', subscribers = '') {
            this.switchView('vibetube-channel');
            try {
                window.history.pushState({ view: 'vibetube-channel', channelName }, '', `/channel/${encodeURIComponent(channelName)}`);
            } catch (e) {}

            const header = document.getElementById('vibetube-channel-profile-header');
            const grid = document.getElementById('vibetube-channel-videos-grid');
            const paginationEl = document.getElementById('vibetube-channel-pagination');
            if (paginationEl) paginationEl.classList.add('hidden');

            const chanAvatar = avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(channelName)}`;

            if (header) {
                header.innerHTML = `
                    <div class="vibetube-channel-banner"></div>
                    <div class="vibetube-channel-info-row">
                        <img src="${chanAvatar}" alt="" class="vibetube-channel-banner-avatar">
                        <div class="vibetube-channel-banner-meta">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <h1 class="vibetube-channel-banner-title">${this.escapeHtml(channelName)}</h1>
                                <span class="vibetube-verified-icon">✓</span>
                            </div>
                            <div class="vibetube-channel-banner-subs">${this.escapeHtml(subscribers || 'Chargement des statistiques...')}</div>
                        </div>
                    </div>
                `;
            }

            if (grid) {
                grid.innerHTML = Array.from({ length: 6 }).map(() => `
                    <div class="vibetube-video-card skeleton">
                        <div class="vibetube-thumb-wrap skeleton-box"></div>
                        <div class="vibetube-card-body">
                            <div class="vibetube-avatar-skeleton skeleton-box"></div>
                            <div class="vibetube-meta-skeleton">
                                <div class="skeleton-line"></div>
                                <div class="skeleton-line short"></div>
                            </div>
                        </div>
                    </div>
                `).join('');
            }

            const data = await API.getVibeTubeChannel(channelName);
            const channel = data?.channel || {
                name: channelName,
                handle: `@${channelName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
                avatar: chanAvatar,
                banner: 'linear-gradient(135deg, #111827 0%, #1f2937 50%, #374151 100%)',
                subscribers: subscribers || '254 k abonnés',
                videoCount: 'Plusieurs vidéos',
                description: `Chaîne officielle de ${channelName}. Retrouvez l'intégralité des vidéos et actualités.`,
                links: [
                    { name: 'YouTube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, icon: '📺' },
                    { name: 'GitHub', url: `https://github.com/search?q=${encodeURIComponent(channelName)}`, icon: '💻' },
                    { name: 'X / Twitter', url: `https://twitter.com/search?q=${encodeURIComponent(channelName)}`, icon: '🐦' }
                ],
                videos: []
            };

            this.currentChannelData = channel;
            this.currentChannelVideos = Array.isArray(channel.videos) ? channel.videos : [];
            this.currentChannelPage = 1;
            this.channelVideosPerPage = 12;
            this.currentChannelSort = 'latest';

            const isSub = Storage.isSubscribed(channel.name);

            if (header) {
                header.innerHTML = `
                    <div class="vibetube-channel-banner" style="background: ${channel.banner};"></div>
                    <div class="vibetube-channel-info-row">
                        <img src="${channel.avatar}" alt="" class="vibetube-channel-banner-avatar">
                        <div class="vibetube-channel-banner-meta">
                            <div class="vibetube-channel-title-row">
                                <h1 class="vibetube-channel-banner-title">${this.escapeHtml(channel.name)}</h1>
                                <span class="vibetube-verified-icon">✓</span>
                            </div>
                            <div class="vibetube-channel-handle-stats">
                                <span class="vibetube-channel-handle">${this.escapeHtml(channel.handle)}</span>
                                <span class="vibetube-channel-dot">•</span>
                                <span>${this.escapeHtml(channel.subscribers)}</span>
                                <span class="vibetube-channel-dot">•</span>
                                <span>${this.escapeHtml(channel.videoCount)}</span>
                            </div>
                            <p class="vibetube-channel-mini-desc">${this.escapeHtml(channel.description)}</p>
                            
                            <!-- Social links badges -->
                            <div class="vibetube-channel-links-row">
                                ${(channel.links || []).map(l => `
                                    <a href="${l.url}" target="_blank" rel="noopener noreferrer" class="channel-social-pill">
                                        <span>${l.icon}</span>
                                        <span>${this.escapeHtml(l.name)}</span>
                                    </a>
                                `).join('')}
                                <button type="button" class="channel-social-pill more-info" onclick="window.App && window.App.toggleChannelAboutModal()">
                                    <span>ℹ️ En savoir plus</span>
                                </button>
                            </div>
                        </div>
                        <div class="vibetube-channel-banner-btn-wrap">
                            <button type="button" class="btn ${isSub ? 'secondary' : 'primary'} vibetube-sub-toggle-btn" onclick="window.App && window.App.toggleVibeTubeChannelSub('${this.escapeHtml(channel.name)}')">
                                ${isSub ? 'Abonné ✓' : 'S\'abonner'}
                            </button>
                        </div>
                    </div>
                `;
            }

            this.renderPaginatedChannelVideos();
        },

        sortChannelVideos(sortType) {
            this.currentChannelSort = sortType;
            document.querySelectorAll('.vibetube-sort-pills .sort-pill').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-sort') === sortType);
            });

            if (!Array.isArray(this.currentChannelVideos)) return;

            if (sortType === 'popular') {
                this.currentChannelVideos.sort((a, b) => {
                    const viewsA = parseFloat(a.views || '0') * (String(a.views).includes('M') ? 1000000 : 1000);
                    const viewsB = parseFloat(b.views || '0') * (String(b.views).includes('M') ? 1000000 : 1000);
                    return viewsB - viewsA;
                });
            } else if (sortType === 'oldest') {
                this.currentChannelVideos.reverse();
            } else {
                // latest - preserve original youtubei recency
                this.currentChannelVideos = [...(this.currentChannelData?.videos || [])];
            }

            this.currentChannelPage = 1;
            this.renderPaginatedChannelVideos();
        },

        renderPaginatedChannelVideos() {
            const grid = document.getElementById('vibetube-channel-videos-grid');
            const paginationEl = document.getElementById('vibetube-channel-pagination');
            const prevBtn = document.getElementById('channel-prev-page-btn');
            const nextBtn = document.getElementById('channel-next-page-btn');
            const pagesContainer = document.getElementById('channel-pagination-pages');
            if (!grid) return;

            const allVideos = this.currentChannelVideos || [];
            if (allVideos.length === 0) {
                grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1; text-align:center; padding:50px;">Aucune vidéo répertoriée pour cette chaîne.</p>';
                if (paginationEl) paginationEl.classList.add('hidden');
                return;
            }

            const totalPages = Math.ceil(allVideos.length / this.channelVideosPerPage) || 1;
            const currentPage = Math.min(Math.max(this.currentChannelPage, 1), totalPages);
            this.currentChannelPage = currentPage;

            const startIndex = (currentPage - 1) * this.channelVideosPerPage;
            const endIndex = startIndex + this.channelVideosPerPage;
            const pageVideos = allVideos.slice(startIndex, endIndex);

            this.renderVibeTubeVideoGrid(grid, pageVideos);

            // Update pagination UI
            if (totalPages > 1) {
                if (paginationEl) paginationEl.classList.remove('hidden');
                if (prevBtn) prevBtn.disabled = currentPage === 1;
                if (nextBtn) nextBtn.disabled = currentPage === totalPages;

                if (pagesContainer) {
                    pagesContainer.innerHTML = Array.from({ length: totalPages }).map((_, i) => {
                        const pageNum = i + 1;
                        return `
                            <button type="button" class="pagination-page-btn ${pageNum === currentPage ? 'active' : ''}" onclick="window.App && window.App.goToChannelPage(${pageNum})">
                                ${pageNum}
                            </button>
                        `;
                    }).join('');
                }
            } else {
                if (paginationEl) paginationEl.classList.add('hidden');
            }
        },

        changeChannelPage(delta) {
            this.currentChannelPage += delta;
            this.renderPaginatedChannelVideos();
            const grid = document.getElementById('vibetube-channel-videos-grid');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        goToChannelPage(pageNum) {
            this.currentChannelPage = pageNum;
            this.renderPaginatedChannelVideos();
            const grid = document.getElementById('vibetube-channel-videos-grid');
            if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },

        toggleChannelAboutModal() {
            const modal = document.getElementById('modal-channel-about');
            if (!modal) return;
            const ch = this.currentChannelData;
            if (!ch) return;

            const nameEl = document.getElementById('channel-about-modal-name');
            const descEl = document.getElementById('channel-about-modal-desc');
            const linksEl = document.getElementById('channel-about-modal-links');
            const statsEl = document.getElementById('channel-about-modal-stats');

            if (nameEl) nameEl.textContent = `À propos de ${ch.name}`;
            if (descEl) descEl.textContent = ch.description || 'Aucune description détaillée renseignée.';
            if (linksEl) {
                linksEl.innerHTML = (ch.links || []).map(l => `
                    <a href="${l.url}" target="_blank" rel="noopener noreferrer" style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:#fff; text-decoration:none;">
                        <span style="font-size:18px;">${l.icon}</span>
                        <span style="font-weight:600;">${this.escapeHtml(l.name)}</span>
                        <span style="margin-left:auto; color:var(--text-muted); font-size:12px;">↗</span>
                    </a>
                `).join('');
            }
            if (statsEl) {
                statsEl.innerHTML = `
                    <div>• <b>Identifiant :</b> ${this.escapeHtml(ch.handle)}</div>
                    <div>• <b>Abonnés :</b> ${this.escapeHtml(ch.subscribers)}</div>
                    <div>• <b>Vidéos :</b> ${this.escapeHtml(ch.videoCount)}</div>
                    <div>• <b>Date d'inscription :</b> ${this.escapeHtml(ch.joinedDate || 'Récemment')}</div>
                `;
            }

            modal.classList.remove('hidden');
        },

        toggleVibeTubeChannelSub(channelName) {
            const isNowSub = Storage.toggleSubscription ? Storage.toggleSubscription(channelName) : false;
            document.querySelectorAll('.vibetube-sub-toggle-btn').forEach(btn => {
                btn.classList.toggle('primary', !isNowSub);
                btn.classList.toggle('secondary', isNowSub);
                btn.textContent = isNowSub ? 'Abonné ✓' : 'S\'abonner';
            });
            this.showToast(isNowSub ? `Abonné à ${channelName} ! 📺` : `Abonnement retiré pour ${channelName}`);
        },

        openVibeTubeSubscriptions() {
            const subs = Storage.getSubscriptions ? Storage.getSubscriptions() : [];
            if (subs.length === 0) {
                this.showToast('Vous n\'êtes abonné à aucune chaîne pour le moment 📺');
                return;
            }
            // Search top videos from subscriptions
            const firstSub = subs[0];
            const name = typeof firstSub === 'string' ? firstSub : (firstSub.name || firstSub.artist || '');
            if (name) {
                this.openVibeTubeChannel(name);
            }
        },

        // -------------------------------------------------------------
        // VIBETUBE WATCH PAGE EXPERIENCE (Full YouTube Cinema & Community)
        // -------------------------------------------------------------
        async openVibeTubeVideo(videoId, trackData = null) {
            if (!videoId) return;
            if (this.currentAppMode !== 'vibetube') {
                this.setAppMode('vibetube', false);
            }

            this.currentWatchVideoId = videoId;
            this.switchView('vibetube-watch');
            try {
                window.history.pushState({ view: 'vibetube-watch', videoId }, '', `/vibetube/watch?v=${videoId}`);
            } catch (e) {}

            // Ensure audio player is paused and hidden
            if (window.Player && Player.isPlaying) Player.pause();
            const desktopPlayer = document.getElementById('desktop-player-bar');
            const mobilePlayer = document.getElementById('mobile-mini-player');
            if (desktopPlayer) desktopPlayer.style.setProperty('display', 'none', 'important');
            if (mobilePlayer) mobilePlayer.style.setProperty('display', 'none', 'important');

            // Load iframe with autoplay & clean embeds
            const iframe = document.getElementById('vibetube-watch-iframe');
            if (iframe) {
                iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
            }

            // Find cached track if any
            let cached = trackData || (this._vibetubeVideosCache || []).find(v => v.id === videoId);

            // Elements
            const titleEl = document.getElementById('vibetube-watch-title');
            const avatarEl = document.getElementById('vibetube-watch-avatar');
            const channelEl = document.getElementById('vibetube-watch-channel');
            const subsEl = document.getElementById('vibetube-watch-subs');
            const viewsEl = document.getElementById('vibetube-watch-views');
            const dateEl = document.getElementById('vibetube-watch-date');
            const descEl = document.getElementById('vibetube-watch-desc-text');
            const relatedList = document.getElementById('vibetube-related-videos-list');
            const commentsList = document.getElementById('vibetube-comments-list');
            const commentsCountTitle = document.getElementById('vibetube-comments-count-title');
            const subBtn = document.getElementById('vibetube-watch-sub-btn');

            if (cached) {
                if (titleEl) titleEl.textContent = cached.title || 'Vidéo YouTube';
                if (channelEl) channelEl.textContent = cached.channel || cached.artist || 'Créateur';
                if (avatarEl && cached.channelAvatar) avatarEl.src = cached.channelAvatar;
                if (viewsEl) viewsEl.textContent = cached.views || '1 M vues';
                if (dateEl) dateEl.textContent = cached.publishedTime || 'Récemment';
            } else {
                if (titleEl) titleEl.textContent = 'Chargement de la vidéo...';
            }

            // Skeleton for related and comments
            if (relatedList) {
                relatedList.innerHTML = Array.from({ length: 8 }).map(() => `
                    <div class="vibetube-related-item skeleton">
                        <div class="vibetube-related-thumb-skeleton skeleton-box"></div>
                        <div class="vibetube-related-meta-skeleton">
                            <div class="skeleton-line"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                    </div>
                `).join('');
            }
            if (commentsList) {
                commentsList.innerHTML = '<div class="home-loading"><div class="spinner"></div><p>Chargement des commentaires...</p></div>';
            }

            // Fetch live watch details
            const data = await API.getVibeTubeWatch(videoId);
            if (data) {
                this.currentWatchData = data;
                if (titleEl) titleEl.textContent = data.title || 'Vidéo';
                if (channelEl) channelEl.textContent = data.owner?.name || 'Créateur';
                if (avatarEl && data.owner?.avatar) avatarEl.src = data.owner.avatar;
                if (subsEl) subsEl.textContent = data.owner?.subscribers || 'Chaîne YouTube';
                if (viewsEl) viewsEl.textContent = data.views || 'Populaire';
                if (dateEl) dateEl.textContent = data.date || 'Récemment';
                if (descEl) descEl.textContent = data.description || 'Aucune description fournie.';

                const isSub = Storage.isSubscribed(data.owner?.name);
                if (subBtn) {
                    subBtn.classList.toggle('primary', !isSub);
                    subBtn.classList.toggle('secondary', isSub);
                    subBtn.textContent = isSub ? 'Abonné ✓' : 'S\'abonner';
                }

                // Record to VibeTube history
                Storage.addVibeTubeHistory({
                    id: videoId,
                    title: data.title || cached?.title || 'Vidéo YouTube',
                    channel: data.owner?.name || cached?.channel || 'Créateur',
                    channelAvatar: data.owner?.avatar || cached?.channelAvatar || '',
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    views: data.views || cached?.views || 'Populaire'
                });

                // Update Like & Watch Later buttons state
                const isLiked = Storage.isVibeTubeLiked(videoId);
                const likeBtn = document.getElementById('vibetube-watch-like-btn');
                const likeCountEl = document.getElementById('vibetube-watch-like-count');
                if (likeBtn) {
                    likeBtn.classList.toggle('liked', isLiked);
                    if (likeCountEl) likeCountEl.textContent = isLiked ? 'Aimé 👍' : 'J\'aime';
                }

                const isLater = Storage.isVibeTubeWatchLater(videoId);
                const laterBtn = document.getElementById('vibetube-watch-later-btn');
                const laterText = document.getElementById('vibetube-watch-later-text');
                if (laterBtn) laterBtn.classList.toggle('active', isLater);
                if (laterText) laterText.textContent = isLater ? 'Enregistré ✓' : 'Plus tard';

                // Render related videos
                const related = Array.isArray(data.related) ? data.related : [];
                this.renderVibeTubeRelatedVideos(relatedList, related);
            }

            // Load comments
            this.loadVibeTubeComments(videoId);
        },

        renderVibeTubeRelatedVideos(container, videos) {
            if (!container) return;
            if (!videos || videos.length === 0) {
                container.innerHTML = '<p class="empty-msg" style="padding: 20px 0; text-align: center;">Aucune recommandation disponible.</p>';
                return;
            }

            // Cache for quick retrieval
            if (!Array.isArray(this._vibetubeVideosCache)) this._vibetubeVideosCache = [];
            videos.forEach(v => {
                if (v && v.id && !this._vibetubeVideosCache.some(x => x.id === v.id)) {
                    this._vibetubeVideosCache.push(v);
                }
            });

            container.innerHTML = videos.map(v => `
                <div class="vibetube-related-item" onclick="window.App && window.App.openVibeTubeVideo('${v.id}')">
                    <div class="vibetube-related-thumb-wrap">
                        <img src="${v.thumbnail || 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg'}" alt="" class="vibetube-related-thumb" loading="lazy">
                        ${v.duration ? `<span class="vibetube-related-duration">${this.escapeHtml(v.duration)}</span>` : ''}
                    </div>
                    <div class="vibetube-related-meta">
                        <h4 class="vibetube-related-title" title="${this.escapeHtml(v.title)}">${this.escapeHtml(v.title)}</h4>
                        <span class="vibetube-related-channel">${this.escapeHtml(v.channel || 'Créateur')}</span>
                        <div class="vibetube-related-stats">
                            <span>${this.escapeHtml(v.views || '')}</span>
                            ${v.publishedTime ? `<span>• ${this.escapeHtml(v.publishedTime)}</span>` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        },

        async loadVibeTubeComments(videoId) {
            const commentsList = document.getElementById('vibetube-comments-list');
            const countTitle = document.getElementById('vibetube-comments-count-title');
            if (!commentsList) return;

            const res = await API.getVibeTubeComments(videoId);
            const comments = (res && Array.isArray(res.comments)) ? res.comments : [];
            if (countTitle) countTitle.textContent = `Commentaires (${comments.length})`;

            if (comments.length === 0) {
                commentsList.innerHTML = '<p class="empty-msg" style="padding: 24px 0; text-align: center;">Soyez le premier à commenter cette vidéo !</p>';
                return;
            }

            commentsList.innerHTML = comments.map(c => `
                <div class="vibetube-comment-item" id="comment-${c.id}">
                    <img src="${c.authorAvatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(c.authorName || 'user')}" alt="" class="vibetube-comment-avatar">
                    <div class="vibetube-comment-body">
                        <div class="vibetube-comment-header">
                            <span class="vibetube-comment-author">${this.escapeHtml(c.authorName || 'Utilisateur')}</span>
                            <span class="vibetube-comment-date">${this.formatCommentTime(c.createdAt)}</span>
                        </div>
                        <p class="vibetube-comment-text">${this.escapeHtml(c.content)}</p>
                        <div class="vibetube-comment-actions">
                            <button type="button" class="vibetube-comment-like-btn" onclick="window.App && window.App.likeComment('${c.id}')">
                                <svg viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="currentColor"/></svg>
                                <span class="like-counter">${c.likes || 0}</span>
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        },

        async submitVibeTubeComment() {
            const input = document.getElementById('vibetube-comment-input');
            const videoId = this.currentWatchVideoId;
            if (!input || !videoId) return;
            const text = input.value.trim();
            if (!text) {
                this.showToast('Veuillez saisir un commentaire.');
                return;
            }

            const currentUser = Storage.getUser ? Storage.getUser() : null;
            const authorName = currentUser?.username || 'Vous';
            const authorAvatar = currentUser?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(authorName);

            const res = await API.postVibeTubeComment({
                videoId,
                content: text,
                authorName,
                authorAvatar,
                userId: currentUser?.id || null
            });

            if (res && res.comment) {
                input.value = '';
                this.cancelCommentInput();
                this.showToast('Commentaire publié avec succès ! 💬');
                const commentsList = document.getElementById('vibetube-comments-list');
                const countTitle = document.getElementById('vibetube-comments-count-title');
                if (commentsList) {
                    const emptyMsg = commentsList.querySelector('.empty-msg');
                    if (emptyMsg) emptyMsg.remove();
                    const newHtml = `
                        <div class="vibetube-comment-item new-comment" id="comment-${res.comment.id}">
                            <img src="${res.comment.authorAvatar}" alt="" class="vibetube-comment-avatar">
                            <div class="vibetube-comment-body">
                                <div class="vibetube-comment-header">
                                    <span class="vibetube-comment-author">${this.escapeHtml(res.comment.authorName)}</span>
                                    <span class="vibetube-comment-date">À l'instant</span>
                                </div>
                                <p class="vibetube-comment-text">${this.escapeHtml(res.comment.content)}</p>
                                <div class="vibetube-comment-actions">
                                    <button type="button" class="vibetube-comment-like-btn" onclick="window.App && window.App.likeComment('${res.comment.id}')">
                                        <svg viewBox="0 0 24 24"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="currentColor"/></svg>
                                        <span class="like-counter">0</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                    commentsList.insertAdjacentHTML('afterbegin', newHtml);
                    if (countTitle) {
                        const currentCount = commentsList.querySelectorAll('.vibetube-comment-item').length;
                        countTitle.textContent = `Commentaires (${currentCount})`;
                    }
                }
            } else {
                this.showToast('Erreur lors de la publication du commentaire.');
            }
        },

        cancelCommentInput() {
            const input = document.getElementById('vibetube-comment-input');
            const actions = document.getElementById('vibetube-comment-input-actions');
            if (input) input.value = '';
            if (actions) actions.classList.remove('visible');
        },

        closeVibeTubePlayer() {
            // Close modal player if present
            const modal = document.getElementById('modal-vibetube-player');
            if (modal) modal.classList.add('hidden');
            const iframe = document.getElementById('vibetube-iframe');
            if (iframe) iframe.src = '';
            // Close in-page watch view if active
            const watchIframe = document.getElementById('vibetube-watch-iframe');
            if (watchIframe) watchIframe.src = '';
            this.currentWatchVideoId = null;
        },

        closeWatchView() {
            this.closeVibeTubePlayer();
            if (this.currentVibeTubeSearchQuery) {
                this.switchView('vibetube-search');
            } else {
                this.switchView('vibetube');
            }
        },

        toggleWatchDescExpand() {
            const desc = document.getElementById('vibetube-watch-desc-text');
            const btn = document.getElementById('vibetube-watch-desc-toggle-btn');
            if (desc && btn) {
                const isCollapsed = desc.classList.toggle('collapsed');
                btn.textContent = isCollapsed ? 'Plus' : 'Moins';
            }
        },

        toggleWatchLike() {
            const btn = document.getElementById('vibetube-watch-like-btn');
            const countEl = document.getElementById('vibetube-watch-like-count');
            const vid = this.currentWatchVideoId;
            if (!vid) return;
            const currentVideo = {
                id: vid,
                title: this.currentWatchData?.title || 'Vidéo YouTube',
                channel: this.currentWatchData?.owner?.name || 'Créateur',
                thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                views: this.currentWatchData?.views || 'Populaire'
            };
            const isLiked = Storage.toggleVibeTubeLiked(currentVideo);
            if (btn) {
                btn.classList.toggle('liked', isLiked);
                if (countEl) countEl.textContent = isLiked ? 'Aimé 👍' : 'J\'aime';
            }
            this.showToast(isLiked ? 'Ajouté à vos vidéos « J\'aime » VibeTube !' : 'Mention « J\'aime » retirée');
        },

        toggleWatchLater() {
            const btn = document.getElementById('vibetube-watch-later-btn');
            const textEl = document.getElementById('vibetube-watch-later-text');
            const vid = this.currentWatchVideoId;
            if (!vid) return;
            const currentVideo = {
                id: vid,
                title: this.currentWatchData?.title || 'Vidéo YouTube',
                channel: this.currentWatchData?.owner?.name || 'Créateur',
                thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                views: this.currentWatchData?.views || 'Populaire'
            };
            const isSaved = Storage.toggleVibeTubeWatchLater(currentVideo);
            if (btn) btn.classList.toggle('active', isSaved);
            if (textEl) textEl.textContent = isSaved ? 'Enregistré ✓' : 'Plus tard';
            this.showToast(isSaved ? 'Ajouté à « À regarder plus tard » 🕒' : 'Retiré de « À regarder plus tard »');
        },

        likeComment(commentId) {
            const el = document.getElementById(`comment-${commentId}`);
            if (el) {
                const counter = el.querySelector('.like-counter');
                const btn = el.querySelector('.vibetube-comment-like-btn');
                if (counter && btn) {
                    const isLiked = btn.classList.toggle('liked');
                    let num = parseInt(counter.textContent, 10) || 0;
                    counter.textContent = isLiked ? num + 1 : Math.max(0, num - 1);
                }
            }
        },

        formatCommentTime(timestamp) {
            if (!timestamp) return 'Récemment';
            const diffSec = Math.floor((Date.now() - timestamp) / 1000);
            if (diffSec < 60) return 'À l\'instant';
            if (diffSec < 3600) return `Il y a ${Math.floor(diffSec / 60)} min`;
            if (diffSec < 86400) return `Il y a ${Math.floor(diffSec / 3600)} h`;
            return `Il y a ${Math.floor(diffSec / 86400)} j`;
        },

        escapeHtml(str) {
            if (!str) return '';
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        // -------------------------------------------------------------
        // VIBETUBE YOU / LIBRARY SECTIONS (History, Watch Later, Liked, Playlists)
        // -------------------------------------------------------------
        openVibeTubeLibrarySection(section = 'history', updatePath = true) {
            this.currentVibeTubeLibSection = section;
            this.switchView('vibetube-library', updatePath);

            const iconEl = document.getElementById('vibetube-lib-icon');
            const titleEl = document.getElementById('vibetube-lib-title');
            const subEl = document.getElementById('vibetube-lib-subtitle');
            const clearBtn = document.getElementById('vibetube-lib-clear-btn');
            const grid = document.getElementById('vibetube-library-grid');
            const emptyEl = document.getElementById('vibetube-library-empty');
            const emptyTitle = document.getElementById('vibetube-empty-title');
            const emptySub = document.getElementById('vibetube-empty-sub');
            const emptyIcon = document.getElementById('vibetube-empty-icon');

            // Highlight sidebar item
            document.querySelectorAll('#vibetube-sidebar .vibetube-nav-item').forEach(el => {
                el.classList.toggle('active', el.getAttribute('data-vibetube-nav') === section);
            });

            let videos = [];
            let icon = '🕒';
            let title = 'Historique';
            let sub = 'Vos vidéos récemment visionnées sur VibeTube';
            let showClear = true;

            if (section === 'history') {
                videos = Storage.getVibeTubeHistory();
                icon = '🕒';
                title = 'Historique des vidéos';
                sub = 'Vos vidéos récemment visionnées sur VibeTube';
                showClear = true;
                if (clearBtn) clearBtn.querySelector('span').textContent = 'Effacer l\'historique';
                if (emptyTitle) emptyTitle.textContent = 'Aucun historique vidéo';
                if (emptySub) emptySub.textContent = 'Les vidéos que vous regardez sur VibeTube apparaîtront ici.';
                if (emptyIcon) emptyIcon.textContent = '🕒';
            } else if (section === 'watch-later') {
                videos = Storage.getVibeTubeWatchLater();
                icon = '⏳';
                title = 'À regarder plus tard';
                sub = 'Vos vidéos mises de côté pour plus tard';
                showClear = false;
                if (emptyTitle) emptyTitle.textContent = 'Aucune vidéo mise de côté';
                if (emptySub) emptySub.textContent = 'Cliquez sur « Plus tard » sous une vidéo pour la retrouver ici.';
                if (emptyIcon) emptyIcon.textContent = '⏳';
            } else if (section === 'liked') {
                videos = Storage.getVibeTubeLiked();
                icon = '👍';
                title = 'Vidéos « J\'aime »';
                sub = 'Toutes les vidéos auxquelles vous avez attribué un pouce bleu';
                showClear = false;
                if (emptyTitle) emptyTitle.textContent = 'Aucune vidéo aimée pour le moment';
                if (emptySub) emptySub.textContent = 'Vos mentions « J\'aime » sur VibeTube seront sauvegardées ici.';
                if (emptyIcon) emptyIcon.textContent = '❤️';
            } else if (section === 'playlists') {
                icon = '📁';
                title = 'Vos Playlists VibeTube';
                sub = 'Vos sélections et compilations de vidéos personnalisées';
                showClear = false;
                this.renderVibeTubePlaylistsView();
                return;
            }

            if (iconEl) iconEl.textContent = icon;
            if (titleEl) titleEl.textContent = title;
            if (subEl) subEl.textContent = sub;
            if (clearBtn) clearBtn.style.display = showClear ? 'inline-flex' : 'none';

            if (!videos || videos.length === 0) {
                if (grid) grid.innerHTML = '';
                if (emptyEl) emptyEl.classList.remove('hidden');
            } else {
                if (emptyEl) emptyEl.classList.add('hidden');
                if (grid) {
                    grid.innerHTML = videos.map(v => this.createVibeTubeVideoCardHTML(v)).join('');
                    this.attachVibeTubeCardClickHandlers(grid);
                }
            }
        },

        clearCurrentVibeTubeSection() {
            const sec = this.currentVibeTubeLibSection;
            if (sec === 'history') {
                Storage.clearVibeTubeHistory();
                this.showToast('Historique VibeTube effacé ! 🗑️');
                this.openVibeTubeLibrarySection('history', false);
            }
        },

        renderVibeTubePlaylistsView() {
            const playlists = Storage.getVibeTubePlaylists();
            const grid = document.getElementById('vibetube-library-grid');
            const emptyEl = document.getElementById('vibetube-library-empty');
            const clearBtn = document.getElementById('vibetube-lib-clear-btn');
            if (clearBtn) clearBtn.style.display = 'none';

            if (!playlists || playlists.length === 0) {
                if (grid) grid.innerHTML = '';
                const emptyTitle = document.getElementById('vibetube-empty-title');
                const emptySub = document.getElementById('vibetube-empty-sub');
                const emptyIcon = document.getElementById('vibetube-empty-icon');
                if (emptyTitle) emptyTitle.textContent = 'Aucune playlist créée';
                if (emptySub) emptySub.textContent = 'Créez vos playlists en enregistrant des vidéos lors du visionnage.';
                if (emptyIcon) emptyIcon.textContent = '📁';
                if (emptyEl) emptyEl.classList.remove('hidden');
            } else {
                if (emptyEl) emptyEl.classList.add('hidden');
                if (grid) {
                    grid.innerHTML = playlists.map(pl => {
                        const count = pl.videos?.length || 0;
                        const cover = pl.videos?.[0]?.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
                        return `
                            <div class="vibetube-video-card" onclick="window.App && window.App.openVibeTubePlaylistDetail('${pl.id}')">
                                <div class="vibetube-thumb-wrap" style="position:relative;">
                                    <img src="${cover}" alt="" class="vibetube-thumb-img" loading="lazy">
                                    <div style="position:absolute; right:8px; bottom:8px; background:rgba(0,0,0,0.85); color:#fff; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; display:flex; align-items:center; gap:4px;">
                                        <span>📁 ${count} vidéo${count > 1 ? 's' : ''}</span>
                                    </div>
                                </div>
                                <div class="vibetube-card-body" style="padding:10px 4px;">
                                    <div class="vibetube-video-title" style="font-size:14px; font-weight:700;">${this.escapeHtml(pl.name)}</div>
                                    <div class="vibetube-video-channel" style="font-size:12px; color:var(--text-secondary); margin-top:3px;">Playlist privée</div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        },

        openVibeTubePlaylistDetail(playlistId) {
            const playlists = Storage.getVibeTubePlaylists();
            const pl = playlists.find(p => p.id === playlistId);
            if (!pl) return;
            const titleEl = document.getElementById('vibetube-lib-title');
            const subEl = document.getElementById('vibetube-lib-subtitle');
            const grid = document.getElementById('vibetube-library-grid');
            const emptyEl = document.getElementById('vibetube-library-empty');
            if (titleEl) titleEl.textContent = `📁 ${pl.name}`;
            if (subEl) subEl.textContent = `${pl.videos?.length || 0} vidéos dans cette playlist`;

            if (!pl.videos || pl.videos.length === 0) {
                if (grid) grid.innerHTML = '';
                if (emptyEl) emptyEl.classList.remove('hidden');
            } else {
                if (emptyEl) emptyEl.classList.add('hidden');
                if (grid) {
                    grid.innerHTML = pl.videos.map(v => this.createVibeTubeVideoCardHTML(v)).join('');
                    this.attachVibeTubeCardClickHandlers(grid);
                }
            }
        },

        // --- VibeTube Playlist Modal Handlers ---
        openVibeTubePlaylistModal() {
            const modal = document.getElementById('modal-vibetube-playlist');
            const listEl = document.getElementById('vibetube-playlist-list');
            if (!modal) return;
            modal.classList.remove('hidden');

            const playlists = Storage.getVibeTubePlaylists();
            if (listEl) {
                if (playlists.length === 0) {
                    listEl.innerHTML = '<p style="color:var(--text-secondary); font-size:13px; text-align:center; padding:12px 0;">Aucune playlist existante. Créez-en une ci-dessous !</p>';
                } else {
                    listEl.innerHTML = playlists.map(pl => `
                        <div class="vibetube-playlist-item-row" onclick="window.App && window.App.addCurrentWatchToPlaylist('${pl.id}')">
                            <span style="font-weight:600; font-size:14px;">📁 ${this.escapeHtml(pl.name)}</span>
                            <span style="color:var(--text-muted); font-size:12px;">${pl.videos?.length || 0} vidéos</span>
                        </div>
                    `).join('');
                }
            }
        },

        closeVibeTubePlaylistModal() {
            const modal = document.getElementById('modal-vibetube-playlist');
            if (modal) modal.classList.add('hidden');
        },

        createNewVibeTubePlaylist() {
            const input = document.getElementById('vibetube-new-playlist-input');
            const name = input?.value?.trim();
            if (!name) return;
            const newPl = Storage.createVibeTubePlaylist(name);
            if (input) input.value = '';
            this.showToast(`Playlist "${newPl.name}" créée ! 📁`);
            if (this.currentWatchVideoId) {
                this.addCurrentWatchToPlaylist(newPl.id);
            } else {
                this.openVibeTubePlaylistModal();
            }
        },

        addCurrentWatchToPlaylist(playlistId) {
            const vid = this.currentWatchVideoId;
            if (!vid) return;
            const video = {
                id: vid,
                title: this.currentWatchData?.title || 'Vidéo YouTube',
                channel: this.currentWatchData?.owner?.name || 'Créateur',
                thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
                views: this.currentWatchData?.views || 'Populaire'
            };
            const added = Storage.addVideoToVibeTubePlaylist(playlistId, video);
            this.closeVibeTubePlaylistModal();
            this.showToast(added ? 'Vidéo ajoutée à la playlist ! 📁' : 'Cette vidéo est déjà dans la playlist.');
        },

        // -------------------------------------------------------------
        // VIBETUBE SHORTS EXPERIENCE (9:16 Vertical Immersive)
        // -------------------------------------------------------------
        async openVibeTubeShorts(updateUrl = true) {
            this.switchView('vibetube-shorts', updateUrl);
            const feedContainer = document.getElementById('vibetube-shorts-feed');
            if (!feedContainer) return;

            feedContainer.innerHTML = `
                <div class="vibetube-shorts-loading">
                    <div class="spinner"></div>
                    <p style="margin-top:14px; font-weight:600; color:#fff;">Chargement des Shorts tendance...</p>
                </div>
            `;

            try {
                // Fetch high engagement short tech/cyber clips
                const res = await API.searchVibeTube('shorts cyber dev gaming');
                const videos = (res && Array.isArray(res.videos)) ? res.videos : [];
                const shorts = videos.filter(v => {
                    const dur = v.duration || '';
                    const isShortDur = dur.startsWith('0:') && parseInt(dur.split(':')[1], 10) <= 60;
                    return isShortDur || (v.title || '').toLowerCase().includes('short') || true;
                }).slice(0, 15);

                if (shorts.length === 0) {
                    feedContainer.innerHTML = '<p class="empty-msg" style="text-align:center; padding:60px 20px;">Aucun Short disponible pour le moment.</p>';
                    return;
                }

                feedContainer.innerHTML = shorts.map((s, idx) => `
                    <div class="shorts-card" data-short-id="${s.id}" id="short-item-${idx}">
                        <div class="shorts-screen">
                            <iframe src="https://www.youtube-nocookie.com/embed/${s.id}?autoplay=${idx === 0 ? 1 : 0}&loop=1&playlist=${s.id}&controls=1&modestbranding=1&playsinline=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                        </div>
                        <div class="shorts-overlay-meta">
                            <div class="shorts-creator-tag">
                                <img src="${s.channelAvatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(s.channel || 'creator')}" class="shorts-creator-avatar" alt="">
                                <span class="shorts-creator-name">${this.escapeHtml(s.channel || 'Créateur')}</span>
                                <button type="button" class="btn primary small shorts-sub-btn" onclick="window.App && window.App.toggleVibeTubeChannelSub('${this.escapeHtml(s.channel || '')}')">S'abonner</button>
                            </div>
                            <h3 class="shorts-title">${this.escapeHtml(s.title)}</h3>
                        </div>
                        <div class="shorts-side-actions">
                            <button type="button" class="shorts-action-btn" onclick="window.App && window.App.toggleVibeTubeLikeVideo('${s.id}')" title="J'aime">
                                <span class="shorts-action-icon">👍</span>
                                <span class="shorts-action-label">Like</span>
                            </button>
                            <button type="button" class="shorts-action-btn" onclick="window.App && window.App.toggleVibeTubeWatchLaterVideo('${s.id}')" title="À regarder plus tard">
                                <span class="shorts-action-icon">⏱️</span>
                                <span class="shorts-action-label">Plus tard</span>
                            </button>
                            <button type="button" class="shorts-action-btn" onclick="window.App && window.App.openVibeTubeVideo('${s.id}')" title="Mode Grand Écran">
                                <span class="shorts-action-icon">🎬</span>
                                <span class="shorts-action-label">Détails</span>
                            </button>
                            <button type="button" class="shorts-action-btn" onclick="navigator.clipboard && navigator.clipboard.writeText('https://youtu.be/${s.id}'); window.App && window.App.showToast('Lien du Short copié ! 🔗');" title="Partager">
                                <span class="shorts-action-icon">↗️</span>
                                <span class="shorts-action-label">Partager</span>
                            </button>
                        </div>
                    </div>
                `).join('');
            } catch (e) {
                console.warn('Error loading shorts:', e);
                feedContainer.innerHTML = '<p class="empty-msg" style="text-align:center; padding:60px 20px;">Erreur lors du chargement des Shorts.</p>';
            }
        },

        // -------------------------------------------------------------
        // VIBETUBE SUBSCRIPTIONS VIEW (Full Dedicated Feed)
        // -------------------------------------------------------------
        async openVibeTubeSubscriptionsView(updateUrl = true) {
            this.switchView('vibetube-subscriptions', updateUrl);
            const strip = document.getElementById('vibetube-subs-channels-strip');
            const grid = document.getElementById('vibetube-subs-video-grid');
            const emptyEl = document.getElementById('vibetube-subs-empty');

            const subs = Storage.getSubscriptions ? Storage.getSubscriptions() : [];

            if (subs.length === 0) {
                if (strip) strip.innerHTML = '';
                if (grid) grid.innerHTML = '';
                if (emptyEl) emptyEl.classList.remove('hidden');
                return;
            }

            if (emptyEl) emptyEl.classList.add('hidden');

            // Render Channels avatar strip
            if (strip) {
                strip.innerHTML = subs.map(sub => {
                    const name = typeof sub === 'string' ? sub : (sub.name || sub.artist || 'Chaîne');
                    const avatar = (typeof sub === 'object' && sub.avatar) ? sub.avatar : `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`;
                    return `
                        <div class="vibetube-sub-strip-item" onclick="window.App && window.App.openVibeTubeChannel('${this.escapeHtml(name)}', '${avatar}')">
                            <div class="vibetube-sub-strip-avatar-wrap">
                                <img src="${avatar}" alt="" class="vibetube-sub-strip-avatar">
                                <span class="vibetube-sub-strip-dot"></span>
                            </div>
                            <span class="vibetube-sub-strip-name">${this.escapeHtml(name)}</span>
                        </div>
                    `;
                }).join('');
            }

            // Render Feed from subscribed creators
            if (grid) {
                grid.innerHTML = Array.from({ length: 8 }).map(() => `
                    <div class="vibetube-video-card skeleton">
                        <div class="vibetube-thumb-wrap skeleton-box"></div>
                        <div class="vibetube-card-body">
                            <div class="vibetube-avatar-skeleton skeleton-box"></div>
                            <div class="vibetube-meta-skeleton">
                                <div class="skeleton-line"></div>
                                <div class="skeleton-line short"></div>
                            </div>
                        </div>
                    </div>
                `).join('');

                const queryCreator = typeof subs[0] === 'string' ? subs[0] : (subs[0].name || subs[0].artist || '');
                const res = await API.searchVibeTube(queryCreator);
                const videos = (res && Array.isArray(res.videos)) ? res.videos : [];

                if (videos.length === 0) {
                    grid.innerHTML = '<p class="empty-msg" style="grid-column:1/-1; text-align:center; padding:40px;">Aucune vidéo récente pour vos abonnements.</p>';
                } else {
                    this.renderVibeTubeVideoGrid(grid, videos);
                }
            }
        },

        // -------------------------------------------------------------
        // ADMIN PANEL & RBAC MULTI-LEVEL MANAGEMENT (Desktop Only & Permission Check)
        // -------------------------------------------------------------
        async openAdminPanel(updateUrl = true) {
            // 1. Mobile restriction: Prompt warning modal and block navigation
            const isMobileDevice = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
            if (isMobileDevice) {
                const mobileModal = document.getElementById('modal-admin-mobile-block');
                if (mobileModal) {
                    mobileModal.classList.remove('hidden');
                } else {
                    this.showToast('🚫 Accès restreint : Le panel admin est réservé aux écrans de bureau.');
                }
                return;
            }

            // 2. High Role Permission Check: Only admin and mod can enter
            const user = Storage.getUser ? Storage.getUser() : null;
            const userRole = (user?.role || 'user').toLowerCase();
            if (userRole !== 'admin' && userRole !== 'mod') {
                this.showToast('⛔ Accès refusé : Privilèges Administrateur ou Modérateur requis (RBAC).');
                this.switchView('home');
                return;
            }

            this.switchView('admin', updateUrl);

            const roleBadge = document.getElementById('admin-user-role-badge');
            if (roleBadge) {
                roleBadge.textContent = userRole.toUpperCase();
                roleBadge.style.background = userRole === 'admin' ? '#ff0033' : '#ff9900';
            }

            await this.refreshAdminStats();
            await this.loadAdminUsers();
        },

        async refreshAdminStats() {
            try {
                const res = await API.getAdminStats();
                if (res && res.stats) {
                    const stats = res.stats;
                    const elUsers = document.getElementById('admin-stat-users');
                    const elUsersSub = document.getElementById('admin-stat-users-sub');
                    const elStreams = document.getElementById('admin-stat-streams');
                    const elTube = document.getElementById('admin-stat-vibetube');
                    const elLatency = document.getElementById('admin-stat-latency');

                    if (elUsers) elUsers.textContent = stats.totalUsers ?? 0;
                    if (elUsersSub) elUsersSub.textContent = `${stats.totalPlaylists ?? 0} playlists • ${stats.memoryUsage || 0} Mo RAM`;
                    if (elStreams) elStreams.textContent = stats.totalStreams ?? 0;
                    if (elTube) elTube.textContent = stats.totalVibeTubeViews ?? 0;
                    if (elLatency) elLatency.textContent = `${stats.uptimeSeconds ? Math.floor(stats.uptimeSeconds / 60) + ' min up' : '142 ms'}`;
                }
            } catch (e) {
                console.warn('Admin stats error:', e);
            }
        },

        switchAdminTab(tabKey) {
            document.querySelectorAll('.admin-tab-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-admin-tab') === tabKey);
            });
            document.querySelectorAll('.admin-tab-content').forEach(c => {
                c.classList.toggle('hidden', c.id !== `admin-tab-${tabKey}`);
                c.classList.toggle('active', c.id === `admin-tab-${tabKey}`);
            });

            if (tabKey === 'audit') {
                this.loadAdminAuditLogs();
            }
        },

        async loadAdminUsers() {
            const tbody = document.getElementById('admin-users-tbody');
            if (!tbody) return;

            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Chargement des utilisateurs NeonDB...</td></tr>';

            try {
                const res = await API.getAdminUsers(100);
                const users = (res && Array.isArray(res.users)) ? res.users : [];
                this._adminUsersCache = users;

                this.renderAdminUsersTable(users);
            } catch (e) {
                console.warn('Error loading admin users:', e);
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#ff4444;">Privilèges administrateur requis pour voir la liste des utilisateurs.</td></tr>';
            }
        },

        renderAdminUsersTable(users) {
            const tbody = document.getElementById('admin-users-tbody');
            if (!tbody) return;

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-secondary);">Aucun utilisateur correspondant.</td></tr>';
                return;
            }

            const currentUser = Storage.getUser ? Storage.getUser() : null;
            const isAdmin = (currentUser?.role || 'user').toLowerCase() === 'admin';

            tbody.innerHTML = users.map(u => {
                const dateStr = u.createdAt ? new Date(Number(u.createdAt)).toLocaleDateString('fr-FR') : 'Inconnue';
                const role = u.role || 'user';
                return `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <img src="${u.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(u.username)}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;" alt="">
                                <div>
                                    <div style="font-weight:700; color:#fff;">${this.escapeHtml(u.username)}</div>
                                    <div style="font-size:11px; color:var(--text-muted);">ID: ${u.id.substring(0, 8)}...</div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <span class="admin-role-tag role-${role}">${role.toUpperCase()}</span>
                        </td>
                        <td style="color:var(--text-secondary); font-size:13px;">${dateStr}</td>
                        <td><span style="color:#00ff88; font-size:12px;">● Actif</span></td>
                        <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <select class="admin-role-select" ${!isAdmin ? 'disabled' : ''} onchange="window.App && window.App.updateUserRole('${u.id}', this.value)">
                                    <option value="user" ${role === 'user' ? 'selected' : ''}>Utilisateur (user)</option>
                                    <option value="vip" ${role === 'vip' ? 'selected' : ''}>VIP (vip)</option>
                                    <option value="mod" ${role === 'mod' ? 'selected' : ''}>Modérateur (mod)</option>
                                    <option value="admin" ${role === 'admin' ? 'selected' : ''}>Administrateur (admin)</option>
                                </select>
                                ${isAdmin && String(u.id) !== String(currentUser?.id) ? `
                                    <button type="button" class="btn secondary small" style="color:#ff4444; border-color:rgba(255,68,68,0.3); padding:4px 8px; font-size:12px;" onclick="window.App && window.App.confirmDeleteUser('${u.id}', '${this.escapeHtml(u.username)}')" title="Supprimer le compte">
                                        🗑️
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        filterAdminUsersList(query) {
            const q = query.toLowerCase().trim();
            const all = this._adminUsersCache || [];
            if (!q) {
                this.renderAdminUsersTable(all);
                return;
            }
            const filtered = all.filter(u => (u.username || '').toLowerCase().includes(q));
            this.renderAdminUsersTable(filtered);
        },

        filterAdminUsersByRole(role) {
            document.querySelectorAll('.admin-role-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-role') === role);
            });
            const all = this._adminUsersCache || [];
            if (role === 'all') {
                this.renderAdminUsersTable(all);
            } else {
                const filtered = all.filter(u => (u.role || 'user').toLowerCase() === role);
                this.renderAdminUsersTable(filtered);
            }
        },

        async confirmDeleteUser(userId, username) {
            if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement le compte de "${username}" ? Cette action est irréversible.`)) {
                return;
            }
            try {
                await API.deleteAdminUser(userId);
                this.showToast(`Utilisateur "${username}" supprimé avec succès. 🗑️`);
                await this.refreshAdminStats();
                await this.loadAdminUsers();
            } catch (e) {
                this.showToast(e.message || 'Erreur lors de la suppression de l\'utilisateur');
            }
        },

        async purgeAdminCache() {
            const btn = document.getElementById('admin-purge-cache-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>⏳ Purge en cours...</span>';
            }
            try {
                const res = await API.purgeAdminStreamCache();
                this.showToast(`Cache de streaming purgé ! (${res.purgedCount || 0} flux CDN nettoyés) ⚡`);
                await this.refreshAdminStats();
            } catch (e) {
                this.showToast(e.message || 'Erreur lors de la purge du cache');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<span>⚡ Vider le cache de streaming</span>';
                }
            }
        },

        async updateUserRole(userId, newRole) {
            try {
                await API.updateAdminUserRole(userId, newRole);
                this.showToast(`Rôle mis à jour: ${newRole.toUpperCase()} 🛡️`);
                await this.refreshAdminStats();
            } catch (e) {
                this.showToast(e.message || 'Erreur lors de la mise à jour du rôle RBAC');
                await this.loadAdminUsers();
            }
        },

        async loadAdminAuditLogs() {
            const listEl = document.getElementById('admin-audit-logs-list');
            if (!listEl) return;
            listEl.innerHTML = '<div style="padding:15px; text-align:center; color:var(--text-secondary);">Chargement du journal de sécurité...</div>';

            try {
                const res = await API.getAdminAuditLogs(50);
                const logs = (res && Array.isArray(res.logs)) ? res.logs : [];

                if (logs.length === 0) {
                    listEl.innerHTML = '<div style="padding:15px; text-align:center; color:var(--text-secondary);">Aucun événement d\'audit enregistré pour le moment.</div>';
                    return;
                }

                listEl.innerHTML = logs.map(l => {
                    const dateStr = l.createdAt ? new Date(Number(l.createdAt)).toLocaleString('fr-FR') : '';
                    return `
                        <div class="admin-log-row">
                            <span class="admin-log-time">${dateStr}</span>
                            <span class="admin-log-action">[${this.escapeHtml(l.action)}]</span>
                            <span class="admin-log-user">${this.escapeHtml(l.username || l.userId || 'Système')}</span>
                            <span class="admin-log-details">${this.escapeHtml(typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details || ''))}</span>
                        </div>
                    `;
                }).join('');
            } catch (e) {
                listEl.innerHTML = '<div style="padding:15px; text-align:center; color:#ff4444;">Erreur de chargement du journal d\'audit.</div>';
            }
        }
    };

window.App = App;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}
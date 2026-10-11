// Main Application Controller
document.addEventListener('DOMContentLoaded', () => {
  const App = {
    currentView: 'home',
    currentFilter: 'all',
    selectedTrackForPlaylist: null,
    searchDebounceTimer: null,

    init() {
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

      // Initialize volume UI from saved settings
      if (Player.audio) {
        this.updateVolumeUI(Player.audio.volume, Player.audio.muted);
      }

      // Handle routing from both pathname (/user/:username, /user/:username/playlist/:name, /library, /explore) and hash
      this.handleRoute();
      window.addEventListener('popstate', () => this.handleRoute());
    },

    handleRoute() {
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

      // 5. Standard views (/explore, /library, /settings, /profile)
      if (path === '/explore') {
        this.switchView('explore', false);
      } else if (path === '/library' || path === '/library/liked') {
        if (path === '/library/liked') {
          this.openPlaylistView('liked_tracks');
        } else {
          this.switchView('library', false);
        }
      } else if (path === '/settings') {
        this.openSettings(null, false);
      } else if (path === '/profile') {
        this.openMyProfile();
      } else {
        this.switchView('home', false);
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
        if (this.dom.modalImportPlaylist) {
          this.dom.modalImportPlaylist.classList.remove('hidden');
        }
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
        if (val.length >= 2) {
          this.searchDebounceTimer = setTimeout(() => this.fetchSuggestions(val), 200);
        } else if (!val) {
          this.showRecentSearchSuggestions();
        } else {
          this.dom.suggestionsDropdown.classList.add('hidden');
        }
      });

      this.dom.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = this.dom.searchInput.value.trim();
          if (val) {
            this.dom.suggestionsDropdown.classList.add('hidden');
            this.executeSearch(val);
          }
        }
      });

      this.dom.searchClearBtn.addEventListener('click', () => {
        this.dom.searchInput.value = '';
        this.dom.searchClearBtn.classList.add('hidden');
        this.dom.suggestionsDropdown.classList.add('hidden');
      });

      // Close dropdowns on outside click
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box-wrapper')) {
          this.dom.suggestionsDropdown.classList.add('hidden');
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
        const pos = (e.clientX - rect.left) / rect.width;
        if (Player.audio.duration) {
          Player.seek(pos * Player.audio.duration);
        }
      });

      this.dom.scrubberWrapper.addEventListener('mousemove', (e) => {
        const rect = this.dom.scrubberWrapper.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (Player.audio.duration) {
          const previewSec = pos * Player.audio.duration;
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
        if (Player.audio.duration) {
          const sec = (parseFloat(e.target.value) / 100) * Player.audio.duration;
          this.dom.mobileCurrentTime.textContent = this.formatTime(sec);
        }
      });
      this.dom.mobileSeekSlider.addEventListener('change', (e) => {
        if (Player.audio.duration) {
          const sec = (parseFloat(e.target.value) / 100) * Player.audio.duration;
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
      this.dom.mobileFullscreenPlayer.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });
      this.dom.mobileFullscreenPlayer.addEventListener('touchend', (e) => {
        const touchEndY = e.changedTouches[0].clientY;
        if (touchEndY - touchStartY > 90) {
          this.closeMobileFullscreenPlayer();
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
            LyricsManager.setContainer(this.dom.mobileLyricsContainer);
            LyricsManager.render();
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
      const openSleepModal = () => this.dom.modalSleepTimer.classList.remove('hidden');
      this.dom.sleepTimerBtn.addEventListener('click', openSleepModal);
      this.dom.mobileSleepBtn.addEventListener('click', openSleepModal);

      document.querySelectorAll('.timer-option-btn[data-minutes]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const raw = btn.getAttribute('data-minutes');
          const val = raw === 'end_of_track' ? 'end_of_track' : parseInt(raw, 10);
          Player.setSleepTimer(val);
          this.dom.modalSleepTimer.classList.add('hidden');
          this.showToast(`Minuterie activée : ${raw === 'end_of_track' ? 'Fin du titre' : raw + ' min'}`);
        });
      });

      this.dom.cancelTimerBtn.addEventListener('click', () => {
        Player.cancelSleepTimer();
        this.dom.modalSleepTimer.classList.add('hidden');
        this.showToast('Minuterie annulée');
      });

      // Equalizer Modal
      const openEqModal = () => this.dom.modalEqualizer.classList.remove('hidden');
      this.dom.eqBtn.addEventListener('click', openEqModal);
      this.dom.mobileEqBtn.addEventListener('click', openEqModal);

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

      // Fullscreen Toggle
      this.dom.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });

      // Playlists Management
      const openCreatePl = () => {
        const name = prompt('Nom de la nouvelle playlist :');
        if (name && name.trim()) {
          const pl = Storage.createPlaylist(name.trim());
          this.showToast(`Playlist "${pl.name}" créée !`);
          this.renderPlaylists();
        }
      };
      this.dom.createPlaylistBtn.addEventListener('click', openCreatePl);
      this.dom.createPlaylistBtn2.addEventListener('click', openCreatePl);

      this.dom.createAndAddPlBtn.addEventListener('click', () => {
        const name = this.dom.newPlaylistInput.value.trim();
        if (name && this.selectedTrackForPlaylist) {
          const pl = Storage.createPlaylist(name);
          Storage.addTrackToPlaylist(pl.id, this.selectedTrackForPlaylist);
          this.dom.modalPlaylistPicker.classList.add('hidden');
          this.dom.newPlaylistInput.value = '';
          this.showToast(`Ajouté à "${pl.name}"`);
        }
      });

      // Library Sub-tabs
      document.querySelectorAll('.library-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.library-tab-content').forEach(c => c.classList.remove('active'));
          tab.classList.add('active');
          const target = tab.getAttribute('data-tab');
          document.getElementById(`library-tab-${target}`).classList.add('active');
        });
      });

      this.dom.playAllFavoritesBtn.addEventListener('click', () => {
        const favs = Storage.getFavorites();
        if (favs.length > 0) Player.playTrack(favs[0], favs);
      });

      this.dom.shuffleFavoritesBtn.addEventListener('click', () => {
        const favs = Storage.getFavorites();
        if (favs.length > 0) {
          Player.playTrack(favs[0], favs);
          if (!Player.isShuffled) Player.toggleShuffle();
        }
      });

      this.dom.clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Effacer tout l\'historique d\'écoute ?')) {
          Storage.clearHistory();
          this.showToast('Historique effacé');
        }
      });

      this.dom.playlistBackBtn.addEventListener('click', () => {
        this.switchView('library');
      });

      // Export / Import
      this.dom.exportDataBtn.addEventListener('click', () => Storage.exportData());
      this.dom.importDataBtn.addEventListener('click', () => this.dom.importFileInput.click());
      this.dom.importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            if (Storage.importData(evt.target.result)) {
              this.showToast('Données restaurées !');
            } else {
              alert('Erreur lors de la lecture du fichier JSON.');
            }
          };
          reader.readAsText(file);
        }
      });

      // Clear queue button
      if (this.dom.clearQueueBtn) this.dom.clearQueueBtn.addEventListener('click', () => Player.clearQueue());
      if (this.dom.mobileClearQueueBtn) this.dom.mobileClearQueueBtn.addEventListener('click', () => Player.clearQueue());

      // Global Event Delegation for Cards, Hero buttons & Shelves
      document.addEventListener('click', (e) => {
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
    },

    bindPlayerEvents() {
      // Track Change
      window.addEventListener('player_track_change', (e) => {
        const { track } = e.detail;
        if (!track) return;
        this.updateNowPlayingUI(track);
        this.renderQueueUI();
        this.updateAmbientGlow(track.thumbnail);
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

      // Queue change
      window.addEventListener('player_queue_change', () => {
        this.renderQueueUI();
      });

      // Sleep Timer Events
      window.addEventListener('player_sleep_timer_set', () => {
        this.dom.sleepTimerBadge.classList.remove('hidden');
        this.dom.cancelTimerBtn.classList.remove('hidden');
      });

      window.addEventListener('player_sleep_timer_tick', (e) => {
        const mins = Math.ceil(e.detail.remainingSeconds / 60);
        this.dom.sleepTimerBadge.textContent = `${mins}m`;
      });

      window.addEventListener('player_sleep_timer_ended', () => {
        this.dom.sleepTimerBadge.classList.add('hidden');
        this.dom.cancelTimerBtn.classList.add('hidden');
        this.showToast('Minuterie de veille terminée, musique mise en pause.');
      });

      window.addEventListener('player_sleep_timer_cancelled', () => {
        this.dom.sleepTimerBadge.classList.add('hidden');
        this.dom.cancelTimerBtn.classList.add('hidden');
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
          case 'KeyM':
            Player.toggleMute();
            break;
          case 'KeyL':
            this.toggleSidePanel('lyrics');
            break;
          case 'KeyQ':
            this.toggleSidePanel('queue');
            break;
          case 'KeyF':
            this.dom.fullscreenBtn.click();
            break;
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
      if (updatePath) {
        const pathMap = {
          home: '/',
          explore: '/explore',
          library: '/library',
          settings: '/settings',
          search: '/search',
          album: '/album',
          error: '/error'
        };
        const newPath = pathMap[viewName] || `/${viewName}`;
        this.updateURL(newPath);
      }

      // Hide mood/filter chips on any page that is NOT home
      if (this.dom.chipsContainer) {
        this.dom.chipsContainer.classList.toggle('hidden', viewName !== 'home');
      }

      // Update Nav links
      document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-view') === viewName);
      });
      document.querySelectorAll('.mobile-nav-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-view') === viewName);
      });

      // Update View sections
      document.querySelectorAll('.view-section').forEach(sec => {
        sec.classList.remove('active');
      });

      const activeView = document.getElementById(`view-${viewName}`);
      if (activeView) activeView.classList.add('active');

      // Scroll to top
      const appMain = document.getElementById('app-main');
      if (appMain) appMain.scrollTop = 0;

      // Always render sidebar playlists so they are visible and up to date on all pages
      this.renderPlaylists();

      if (viewName === 'home') {
        if (!this.dom.homeSectionsContainer || !this.dom.homeSectionsContainer.hasChildNodes() || this.dom.homeSectionsContainer.children.length === 0) {
          this.loadHome();
        }
      }

      if (viewName === 'library') {
        this.renderFavorites();
        this.renderHistory();
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

      // 1. History Shelf (Titres déjà écoutés) - displayed if user has listening history
      let historyShelfHTML = '';
      if (hasHistory) {
        const recentTracks = history.slice(0, 15);
        historyShelfHTML = `
          <div class="home-shelf" data-shelf-id="recent-history">
            <div class="shelf-header">
              <h2 class="shelf-title">🕒 Titres déjà écoutés</h2>
              <div class="shelf-actions">
                <button class="btn primary small" id="home-play-all-recent-btn">
                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  <span>Tout écouter</span>
                </button>
              </div>
            </div>
            <div class="shelf-carousel" id="home-history-carousel">
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
            <h2 class="shelf-title">🎲 Titres aléatoires & Découvertes</h2>
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
          <div class="shelf-carousel" id="home-random-carousel">
            ${initialRandom.map(item => this.createMusicCardHTML(item)).join('')}
          </div>
        </div>
      `;

      // 3. Additional rich shelves for rich browsing experience
      const topHitsShelfHTML = `
        <div class="home-shelf" data-shelf-id="top-hits">
          <div class="shelf-header">
            <h2 class="shelf-title">🔥 Hits du Moment & Tendances</h2>
            <div class="shelf-actions">
              <button class="btn secondary small" id="home-play-all-tophits-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Écouter</span>
              </button>
            </div>
          </div>
          <div class="shelf-carousel" id="home-tophits-carousel">
            ${topHits.map(item => this.createMusicCardHTML(item)).join('')}
          </div>
        </div>
      `;

      const rapShelfHTML = `
        <div class="home-shelf" data-shelf-id="rap-fr">
          <div class="shelf-header">
            <h2 class="shelf-title">⚡ Rap Français & Urbain</h2>
            <div class="shelf-actions">
              <button class="btn secondary small" id="home-play-all-rap-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Écouter</span>
              </button>
            </div>
          </div>
          <div class="shelf-carousel" id="home-rap-carousel">
            ${rapHits.map(item => this.createMusicCardHTML(item)).join('')}
          </div>
        </div>
      `;

      const chillShelfHTML = `
        <div class="home-shelf" data-shelf-id="chill-lofi">
          <div class="shelf-header">
            <h2 class="shelf-title">☕ Chill, Lo-Fi & Détente</h2>
            <div class="shelf-actions">
              <button class="btn secondary small" id="home-play-all-chill-btn">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>Écouter</span>
              </button>
            </div>
          </div>
          <div class="shelf-carousel" id="home-chill-carousel">
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
        }).catch(() => {});
      }

      // Bind additional shelf play buttons
      const playTopHits = document.getElementById('home-play-all-tophits-btn');
      if (playTopHits) playTopHits.onclick = () => Player.playTrack(topHits[0], topHits);

      const playRap = document.getElementById('home-play-all-rap-btn');
      if (playRap) playRap.onclick = () => Player.playTrack(rapHits[0], rapHits);

      const playChill = document.getElementById('home-play-all-chill-btn');
      if (playChill) playChill.onclick = () => Player.playTrack(chillHits[0], chillHits);
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
          if (e.target.closest('.row-fav-btn') || e.target.closest('.row-add-pl-btn') || e.target.closest('.row-remove-track-btn') || e.target.closest('.row-artist') || e.target.closest('.card-artist')) return;
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
    showRecentSearchSuggestions() {
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
        this.dom.suggestionsDropdown.innerHTML = `
          <div style="padding: 16px; color: var(--text-muted); font-size: 13px; text-align: center;">
            Recherchez des morceaux, artistes ou albums
          </div>
        `;
        this.dom.suggestionsDropdown.classList.remove('hidden');
        return;
      }

      let html = '';

      // 1. Recent query searches (Image 2: Clock icon + Query + Delete icon)
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

      // 2. Recent track results with direct play button (Image 3: Cover + Title + Artist + Play Button)
      if (trackItems.length > 0) {
        html += trackItems.slice(0, 4).map(item => `
          <div class="suggestion-track-item" data-track-id="${item.id}">
            <img src="${item.thumbnail}" alt="" class="suggestion-track-thumb">
            <div class="suggestion-track-meta">
              <span class="suggestion-track-title">${this.escapeHtml(item.title)}</span>
              <span class="suggestion-track-sub">${this.escapeHtml(item.artist || 'Artiste')} • ${item.duration || ''}</span>
            </div>
            <div class="suggestion-play-icon" title="Écouter maintenant">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <button class="suggestion-delete-btn" data-delete-id="${item.id}" title="Supprimer">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        `).join('');
      }

      this.dom.suggestionsDropdown.innerHTML = html;
      this.dom.suggestionsDropdown.classList.remove('hidden');

      // Bind events
      this.dom.suggestionsDropdown.querySelectorAll('.suggestion-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const delId = btn.getAttribute('data-delete-id');
          Storage.removeRecentSearch(delId);
          this.showRecentSearchSuggestions();
          this.renderRecentSearches();
        });
      });

      this.dom.suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const q = item.getAttribute('data-query');
          this.dom.searchInput.value = q;
          this.dom.suggestionsDropdown.classList.add('hidden');
          this.executeSearch(q);
        });
      });

      this.dom.suggestionsDropdown.querySelectorAll('.suggestion-track-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.suggestion-delete-btn')) return;
          const trackId = item.getAttribute('data-track-id');
          const track = this.findTrackInMemory(trackId) || trackItems.find(t => t.id === trackId);
          if (track) {
            Player.playTrack(track);
            this.dom.suggestionsDropdown.classList.add('hidden');
          }
        });
      });
    },

    async fetchSuggestions(query) {
      const data = await API.getSuggestions(query);
      const suggestions = (data && data.suggestions) ? data.suggestions : [];
      const artist = (data && data.artist) ? data.artist : null;

      if ((!suggestions || suggestions.length === 0) && !artist) {
        this.dom.suggestionsDropdown.classList.add('hidden');
        return;
      }

      // Check matching recent or history tracks (like YouTube Music image 3)
      const allRecent = [...Storage.getRecentSearches(), ...Storage.getHistory()];
      const matchingRecentTracks = allRecent.filter(t => 
        typeof t === 'object' && t !== null && t.title && (
          t.title.toLowerCase().includes(query.toLowerCase()) ||
          (t.artist && t.artist.toLowerCase().includes(query.toLowerCase()))
        )
      ).slice(0, 3);

      let html = '';

      // 1. Artist Suggestion Row (Image 1 style with circular avatar and "Artiste" badge)
      if (artist && artist.name) {
        html += `
          <div class="suggestion-artist-item" data-artist-name="${this.escapeHtml(artist.name)}">
            <img src="${artist.avatar || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(artist.name)}" alt="" class="suggestion-artist-avatar">
            <div class="suggestion-artist-info">
              <span class="suggestion-artist-name">${this.escapeHtml(artist.name)}</span>
              <span class="suggestion-artist-badge">Artiste ${artist.subscribers ? '• ' + this.escapeHtml(artist.subscribers) : ''}</span>
            </div>
          </div>
        `;
      }

      // 2. Playable track at top with direct play button (Image 3)
      if (matchingRecentTracks.length > 0) {
        html += matchingRecentTracks.map(t => `
          <div class="suggestion-track-item" data-track-id="${t.id}">
            <img src="${t.thumbnail}" alt="" class="suggestion-track-thumb">
            <div class="suggestion-track-meta">
              <span class="suggestion-track-title">${this.escapeHtml(t.title)}</span>
              <span class="suggestion-track-sub">${this.escapeHtml(t.artist || 'Artiste')} • ${t.duration || ''}</span>
            </div>
            <div class="suggestion-play-icon" title="Écouter maintenant">
              <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        `).join('');
      }

      // 3. Query suggestions
      html += suggestions.slice(0, 6).map(s => `
        <div class="suggestion-item" data-query="${this.escapeHtml(s)}">
          <div class="suggestion-left">
            <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
            <span class="suggestion-text">${this.escapeHtml(s)}</span>
          </div>
        </div>
      `).join('');

      this.dom.suggestionsDropdown.innerHTML = html;
      this.dom.suggestionsDropdown.classList.remove('hidden');

      // Click on Artist Suggestion
      this.dom.suggestionsDropdown.querySelectorAll('.suggestion-artist-item').forEach((item) => {
        item.addEventListener('click', () => {
          const artistName = item.getAttribute('data-artist-name');
          this.dom.suggestionsDropdown.classList.add('hidden');
          this.dom.searchInput.value = artistName;
          this.openArtistView(artistName);
        });
      });

      this.dom.suggestionsDropdown.querySelectorAll('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => {
          const q = item.getAttribute('data-query');
          this.dom.searchInput.value = q;
          this.dom.suggestionsDropdown.classList.add('hidden');
          this.executeSearch(q);
        });
      });

      this.dom.suggestionsDropdown.querySelectorAll('.suggestion-track-item').forEach(item => {
        item.addEventListener('click', () => {
          const trackId = item.getAttribute('data-track-id');
          const track = this.findTrackInMemory(trackId) || matchingRecentTracks.find(t => t.id === trackId);
          if (track) {
            Player.playTrack(track);
            this.dom.suggestionsDropdown.classList.add('hidden');
          }
        });
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

    async executeSearch(query) {
      this.switchView('search');
      this.dom.searchTitle.textContent = `Résultats pour "${query}"`;
      this.dom.searchResultsList.innerHTML = `
        <div class="home-loading">
          <div class="spinner"></div>
          <p>Recherche sur YouTube Music en cours...</p>
        </div>
      `;

      const results = await API.search(query);
      this.currentSearchResults = results;

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

      this.dom.searchResultsList.innerHTML = results
        .map((track, idx) => this.createTrackRowHTML(track, idx))
        .join('');

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
    renderPlaylists() {
      const playlists = Storage.getPlaylists();
      const favs = Storage.getFavorites();

      // Sidebar list (Includes Titres likés + Custom/Imported Playlists)
      const likedSidebarItem = `
        <div class="playlist-nav-item featured" data-playlist-id="liked_tracks" title="Titres likés">
          <span style="color:#ff0033;">❤️ Titres likés (${favs.length})</span>
        </div>
      `;
      this.dom.sidebarPlaylists.innerHTML = likedSidebarItem + playlists
        .map(
          (p) => `
            <div class="playlist-nav-item" data-playlist-id="${p.id}" title="${this.escapeHtml(p.name)}">
              <span>${this.escapeHtml(p.name)} (${p.tracks ? p.tracks.length : 0})</span>
            </div>
          `
        )
        .join('');

      this.dom.sidebarPlaylists.querySelectorAll('.playlist-nav-item').forEach((item) => {
        item.addEventListener('click', () => {
          const id = item.getAttribute('data-playlist-id');
          this.openPlaylistView(id);
        });
      });

      // Library grid: Show Titres likés card first + all user/imported playlists
      const likedCardHTML = `
        <div class="music-card featured-liked-card" data-playlist-id="liked_tracks">
          <div class="card-thumb-wrapper" style="background: linear-gradient(135deg, #ff0033, #66001a);">
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ffffff;">
              <svg viewBox="0 0 24 24" width="56" height="56" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
          </div>
          <span class="card-title">❤️ Titres likés</span>
          <span class="card-artist">${favs.length} titres sauvegardés</span>
        </div>
      `;

      this.dom.playlistsGrid.innerHTML = likedCardHTML + playlists
        .map(
          (p) => {
            const cover = p.customCover || (p.tracks && p.tracks[0] ? p.tracks[0].thumbnail : null);
            return `
            <div class="music-card" data-playlist-id="${p.id}">
              <div class="card-thumb-wrapper" style="background: linear-gradient(135deg, #2b2b2b, #111);">
                ${cover ? `<img src="${cover}" alt="${this.escapeHtml(p.name)}" loading="lazy">` : `
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff0033;">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                </div>`}
                <div class="card-play-overlay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
              </div>
              <span class="card-title">${this.escapeHtml(p.name)}</span>
              <span class="card-artist">${p.tracks ? p.tracks.length : 0} titres</span>
            </div>
          `;
          }
        )
        .join('');

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
          this.dom.playlistCoverBig.style.background = 'linear-gradient(135deg, #ff0033, #66001a)';
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

        this.switchView('playlist', false);
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
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff0033;">
              <svg viewBox="0 0 24 24" width="72" height="72" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
            </div>
            ${isOwner ? `
            <div class="playlist-cover-edit-badge" id="playlist-cover-edit-badge" title="Changer l'image de couverture">
              <svg viewBox="0 0 24 24"><path d="M3 4V1h2v3h3v2H5v3H3V6H0V4h3zm3 6V7h3V4h7l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3zm7 9c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-3.2-5c0 1.77 1.43 3.2 3.2 3.2s3.2-1.43 3.2-3.2-1.43-3.2-3.2-3.2-3.2 1.43-3.2 3.2z"/></svg>
            </div>` : ''}
          `;
        }

        if (isOwner && this.dom.playlistCoverFileInput) {
          this.dom.playlistCoverBig.onclick = () => {
            this.dom.playlistCoverFileInput.click();
          };
        } else {
          this.dom.playlistCoverBig.onclick = null;
        }
      }

      // Privacy Badge & Toggle Button
      const isPub = pl.isPublic !== false;
      if (this.dom.playlistPrivacyBadge) {
        this.dom.playlistPrivacyBadge.className = `badge-status ${isPub ? 'public' : 'private'}`;
        this.dom.playlistPrivacyBadge.textContent = isPub ? '🌐 Public' : '🔒 Privé';
      }
      if (this.dom.playlistPrivacyLabel) {
        this.dom.playlistPrivacyLabel.textContent = isPub ? 'Rendre Privée' : 'Rendre Publique';
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

      this.dom.playlistDeleteBtn.onclick = () => {
        if (confirm(`Supprimer définitivement la playlist "${pl.name}" ?`)) {
          Storage.deletePlaylist(pl.id);
          this.switchView('library');
          this.showToast('Playlist supprimée de votre compte');
        }
      };

      this.switchView('playlist', false);
      const ownerName = pl.ownerUsername || (currentUser ? currentUser.username : 'user');
      this.updateURL(`/user/${encodeURIComponent(ownerName)}/playlist/${encodeURIComponent(pl.name)}`);
    },

    toggleCurrentPlaylistPrivacy() {
      if (!this.currentOpenPlaylist || this.currentOpenPlaylist.id === 'liked_tracks') return;
      const isPub = Storage.togglePlaylistPrivacy(this.currentOpenPlaylist.id);
      this.currentOpenPlaylist.isPublic = isPub;
      if (this.dom.playlistPrivacyBadge) {
        this.dom.playlistPrivacyBadge.className = `badge-status ${isPub ? 'public' : 'private'}`;
        this.dom.playlistPrivacyBadge.textContent = isPub ? '🌐 Public' : '🔒 Privé';
      }
      if (this.dom.playlistPrivacyLabel) {
        this.dom.playlistPrivacyLabel.textContent = isPub ? 'Rendre Privée' : 'Rendre Publique';
      }
      this.showToast(isPub ? 'Playlist maintenant Publique (accessible via le lien) 🌐' : 'Playlist maintenant Privée (visible uniquement par vous) 🔒');
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
        item.addEventListener('click', () => {
          const plId = item.getAttribute('data-pl-id');
          Storage.addTrackToPlaylist(plId, track);
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

      // Mobile mini player
      this.dom.miniCover.src = track.thumbnail;
      this.dom.miniTitle.textContent = track.title;
      this.dom.miniArtist.textContent = track.artist;

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
      this.dom.volumeSlider.value = muted ? 0 : vol;
      const volHigh = this.dom.muteBtn.querySelector('.vol-high');
      const volMuted = this.dom.muteBtn.querySelector('.vol-muted');
      volHigh.classList.toggle('hidden', muted || vol === 0);
      volMuted.classList.toggle('hidden', !muted && vol > 0);
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
      this.dom.playerFavBtn.classList.toggle('favorited', isFav);
      this.dom.mobilePlayerFavBtn.classList.toggle('favorited', isFav);
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
        LyricsManager.setContainer(this.dom.sideLyricsContainer);
        LyricsManager.render();
      } else if (panelName === 'queue') {
        this.renderQueueUI();
      }
    },

    renderQueueUI() {
      const queue = Player.queue || [];
      const curIdx = Player.currentIndex;

      const containers = [this.dom.sideQueueList, this.dom.mobileQueueList].filter(Boolean);
      if (containers.length === 0) return;

      // Check if queue items are already rendered and only active index needs updating
      let canJustUpdateActive = true;
      containers.forEach(container => {
        const renderedCount = container.querySelectorAll('.queue-item').length;
        if (renderedCount !== queue.length) canJustUpdateActive = false;
      });

      if (canJustUpdateActive && queue.length > 0) {
        containers.forEach(container => {
          const items = container.querySelectorAll('.queue-item');
          items.forEach((item, idx) => {
            const isCur = idx === curIdx;
            item.classList.toggle('active', isCur);
            if (isCur) {
              item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
        });
        return;
      }

      const html = queue.length === 0
        ? '<p class="empty-msg" style="padding: 20px 0; text-align: center; color: var(--text-muted);">La file d\'attente est vide.</p>'
        : queue
          .map((track, idx) => {
            const isCurrent = idx === curIdx;
            return `
              <div class="queue-item ${isCurrent ? 'active' : ''}" data-queue-index="${idx}">
                <img src="${track.thumbnail || '/icons/icon.svg'}" alt="" class="queue-thumb" loading="lazy">
                <div class="queue-info">
                  <div class="queue-title" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</div>
                  <div class="queue-artist">${this.escapeHtml(track.artist)}</div>
                </div>
                <button class="icon-btn small remove-queue-btn" data-index="${idx}" title="Retirer de la file">
                  <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
            `;
          })
          .join('');

      containers.forEach(container => {
        container.innerHTML = html;

        // Click on queue item
        container.querySelectorAll('.queue-item').forEach((item) => {
          item.addEventListener('click', (e) => {
            if (e.target.closest('.remove-queue-btn')) return;
            const idx = parseInt(item.getAttribute('data-queue-index'), 10);
            if (!isNaN(idx) && Player.queue[idx]) {
              Player.currentIndex = idx;
              Player.playTrack(Player.queue[idx]);
              this.renderQueueUI();
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

    openImportModal() {
      const modal = document.getElementById('modal-import-playlist');
      if (modal) {
        modal.classList.remove('hidden');
      }
    },

    closeImportModal() {
      const modal = document.getElementById('modal-import-playlist');
      if (modal) {
        modal.classList.add('hidden');
      }
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
        alert('Veuillez entrer une URL de playlist YouTube ou YouTube Music (ex: https://www.youtube.com/playlist?list=...)');
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
        alert(`Erreur d'importation : ${err.message || 'Impossible de charger la playlist'}`);
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
        alert('Veuillez coller au moins un titre de morceau (ex: Daft Punk - One More Time).');
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
        alert(`Erreur d'importation : ${err.message}`);
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
      document.getElementById('modal-equalizer')?.classList.remove('hidden');
    },

    closeEqualizerModal() {
      document.getElementById('modal-equalizer')?.classList.add('hidden');
    },

    openSleepModal() {
      document.getElementById('modal-sleep-timer')?.classList.remove('hidden');
    },

    closeSleepModal() {
      document.getElementById('modal-sleep-timer')?.classList.add('hidden');
    },

    openCreatePlaylistPrompt() {
      const name = prompt('Nom de la nouvelle playlist :');
      if (name && name.trim()) {
        const pl = Storage.createPlaylist(name.trim());
        this.showToast(`Playlist "${pl.name}" créée !`);
        this.renderPlaylists();
        this.openPlaylistView(pl.id);
      }
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
      if (!this.dom.modalAuth) return;
      this.dom.modalAuth.classList.remove('hidden');
      this.authMode = 'login';
      this.switchAuthTab('login');
      this.updateAuthModalView();
    },

    closeAuthModal() {
      if (this.dom.modalAuth) this.dom.modalAuth.classList.add('hidden');
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

        this.switchView('profile', false);

        this.dom.profileDisplayUsername.textContent = profile.username;
        this.dom.profileBioText.textContent = profile.bio || 'Passionné de musique sur YouTube Music Maison.';
        this.dom.profileStatLikes.textContent = profile.stats ? profile.stats.likesCount : 0;
        this.dom.profileStatPlaylists.textContent = profile.stats ? profile.stats.playlistsCount : 0;

        if (profile.avatar) {
          this.dom.profileAvatarImg.src = profile.avatar;
        } else {
          this.dom.profileAvatarImg.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(profile.username)}`;
        }

        // Toggle edit profile button depending on whether viewer is owner
        const currentUser = Storage.getUser();
        const isOwner = currentUser && currentUser.username.toLowerCase() === profile.username.toLowerCase();
        const editBtn = document.querySelector('#profile-actions-block button[onclick*="openSettings"]');
        if (editBtn) editBtn.classList.toggle('hidden', !isOwner);

        // Render user public playlists
        if (!profile.playlists || profile.playlists.length === 0) {
          this.dom.profilePlaylistsGrid.innerHTML = '<p class="empty-msg">Aucune playlist créée pour le moment.</p>';
        } else {
          this.dom.profilePlaylistsGrid.innerHTML = profile.playlists.map(p => `
            <div class="music-card" data-playlist-id="${p.id}">
              <div class="card-thumb-wrapper" style="background: linear-gradient(135deg, #2b2b2b, #111);">
                ${p.cover ? `<img src="${p.cover}" alt="">` : `
                <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff0033;">
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

    async openArtistView(artistName) {
      if (!artistName) return;
      this.updateURL(`/artist/${encodeURIComponent(artistName)}`);
      this.switchView('artist', false);

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
          if (counter) counter.textContent = `${this.dom.settingsBioInput.value.length} / 250`;
        }
        const avatarPreview = document.getElementById('settings-avatar-preview');
        if (avatarPreview) {
          avatarPreview.src = u.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(u.username)}`;
        }
        const usernameDisp = document.getElementById('settings-username-display');
        if (usernameDisp) {
          usernameDisp.textContent = u.username;
        }
      }
      // Highlight current accent dot
      const currentAccent = localStorage.getItem('ytm_accent_color') || '#ff0033';
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
      document.documentElement.style.setProperty('--accent-red', color);
      document.documentElement.style.setProperty('--accent-red-hover', hoverColor || color);
      try {
        localStorage.setItem('ytm_accent_color', color);
        localStorage.setItem('ytm_accent_hover', hoverColor || color);
      } catch (e) {}

      document.querySelectorAll('.theme-color-dot').forEach(dot => {
        dot.classList.toggle('active', dot.getAttribute('data-color') === color);
      });

      this.showToast(`Thème d'accentuation activé : ${name || color} ✨`);
    },

    async saveProfileSettings() {
      const avatar = (this.dom.settingsAvatarInput.value || '').trim();
      const bio = (this.dom.settingsBioInput.value || '').trim();
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
          body: JSON.stringify({ avatar, bio })
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
      if (!this.currentOpenPlaylist) return;
      const currentUser = Storage.getUser();
      const owner = this.currentOpenPlaylist.ownerUsername || (currentUser ? currentUser.username : 'user');
      const shareUrl = `${window.location.origin}/user/${encodeURIComponent(owner)}/playlist/${encodeURIComponent(this.currentOpenPlaylist.name)}`;
      this.openShareModal(this.currentOpenPlaylist.name, shareUrl);
    },

    openShareModal(title, url) {
      const modal = document.getElementById('modal-share');
      const linkInput = document.getElementById('share-link-input');
      if (!modal) return;

      this.currentShareUrl = url;
      this.currentShareTitle = title;
      if (linkInput) linkInput.textContent = url;

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

      modal.classList.remove('hidden');
    },

    copyShareModalUrl() {
      if (!this.currentShareUrl) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(this.currentShareUrl).then(() => {
          this.showToast('Lien copié dans le presse-papier ! 📋');
        }).catch(() => {
          prompt('Lien :', this.currentShareUrl);
        });
      } else {
        prompt('Lien :', this.currentShareUrl);
      }
    },

    inviteCollaborators() {
      if (!this.currentShareUrl) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(this.currentShareUrl).then(() => {
          this.showToast('Lien d\'invitation collaborateur copié ! Partagez-le avec vos amis 👥');
        }).catch(() => {
          prompt('Lien d\'invitation :', this.currentShareUrl);
        });
      } else {
        prompt('Lien d\'invitation :', this.currentShareUrl);
      }
    },

    shareUserProfile() {
      const u = Storage.getUser();
      if (!u) return;
      const shareUrl = `${window.location.origin}/user/${encodeURIComponent(u.username)}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(() => {
          this.showToast(`Lien de votre profil copié ! 📋`);
        }).catch(() => {
          prompt('Lien de votre profil :', shareUrl);
        });
      } else {
        prompt('Lien de votre profil :', shareUrl);
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
    openCrossfadePrompt() {
      const current = window.Player?.crossfadeDuration || 4;
      const input = prompt('Réglez la durée du Fondu Enchaîné (Crossfade en secondes, entre 0 et 8) :', current);
      if (input !== null) {
        const val = Math.max(0, Math.min(8, parseInt(input, 10) || 0));
        if (window.Player) window.Player.crossfadeDuration = val;
        Storage.saveSetting('crossfade', val);
        this.showToast(val > 0 ? `Fondu enchaîné réglé à ${val}s (transitions fluides) ⏳` : 'Fondu enchaîné désactivé');
      }
    },

    escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  };

  window.App = App;
  App.init();
});

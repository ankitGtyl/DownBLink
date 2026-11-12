// DownBLink Client Application Logic

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const urlInput = document.getElementById('url-input');
    const extractForm = document.getElementById('extract-form');
    const submitBtn = document.getElementById('submit-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const clearBtn = document.getElementById('clear-btn');
    const platformBadge = document.getElementById('platform-badge');
    const platformIcon = document.getElementById('platform-icon');
    const platformName = document.getElementById('platform-name');
    
    // Result sections
    const loaderSection = document.getElementById('loader-section');
    const resultSection = document.getElementById('result-section');
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');

    // Video details elements
    const videoTitle = document.getElementById('video-title');
    const videoUploader = document.getElementById('video-uploader');
    const videoDuration = document.getElementById('video-duration');
    const videoViews = document.getElementById('video-views');
    const videoPlatformTag = document.getElementById('video-platform-tag');
    
    // Player
    const playerContainer = document.getElementById('player-container');
    let videoPlayer = document.getElementById('main-video-player');
    let plyrInstance = null;

    // Tabs, Filter Bar & Lists
    const tabVideo = document.getElementById('tab-video');
    const tabAudio = document.getElementById('tab-audio');
    const filterPillsBar = document.getElementById('filter-pills-bar');
    const listVideo = document.getElementById('list-video');
    const listAudio = document.getElementById('list-audio');

    // Merge Progress Modal
    const progressModal = document.getElementById('progress-modal');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    const progressCancelBtn = document.getElementById('progress-cancel-btn');
    const modalQrContainer = document.getElementById('modal-qr-container');
    const modalQrTransferBtn = document.getElementById('modal-qr-transfer-btn');

    // Thumbnail & QR Code Elements
    const btnDownloadThumb = document.getElementById('btn-download-thumb');
    const btnQuickQr = document.getElementById('btn-quick-qr');
    const qrModal = document.getElementById('qr-modal');
    const qrCloseBtn = document.getElementById('qr-close-btn');
    const qrDoneBtn = document.getElementById('qr-done-btn');
    const qrCopyBtn = document.getElementById('qr-copy-btn');
    const qrContainer = document.getElementById('qr-container');
    const qrImg = document.getElementById('qr-img');
    const qrLinkInput = document.getElementById('qr-link-input');

    // DownBLink Media Player Elements
    const playerFrameBox = document.getElementById('player-frame-box');
    const playerAndDetails = document.getElementById('player-and-details');
    const playerPlatformBadge = document.getElementById('player-platform-badge');
    const btnShortcutsModal = document.getElementById('btn-shortcuts-modal');
    const btnPipToggle = document.getElementById('btn-pip-toggle');
    const btnTheaterToggle = document.getElementById('btn-theater-toggle');
    const theaterIcon = document.getElementById('theater-icon');
    const theaterText = document.getElementById('theater-text');
    const playerActiveMode = document.getElementById('player-active-mode');
    const playerSpeedIndicator = document.getElementById('player-speed-indicator');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');
    const shortcutsDoneBtn = document.getElementById('shortcuts-done-btn');

    let currentExtraction = null;
    let activePollInterval = null;
    let lastCompletedDownloadUrl = null;
    let cachedLanIp = null;
    let activeTab = 'video'; // 'video' | 'audio'
    let currentVideoFilter = 'all';
    let currentAudioFilter = 'all';
    let isTheaterMode = false;
    let currentActiveProvider = 'html5';

    // Maximum YouTube-grade Player Controls
    const PLAYER_CONTROLS = [
        'play-large',
        'restart',
        'rewind',
        'play',
        'fast-forward',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'captions',
        'settings',
        'pip',
        'airplay',
        'fullscreen'
    ];

    function createPlyrInstance(el) {
        if (!el || typeof Plyr === 'undefined') return null;
        const player = new Plyr(el, {
            ratio: '16:9',
            controls: PLAYER_CONTROLS,
            settings: ['captions', 'quality', 'speed', 'loop'],
            speed: { selected: 1, options: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
            seekTime: 10,
            keyboard: { focused: true, global: true },
            tooltips: { controls: true, seek: true },
            invertTime: true,
            autoplay: true,
            youtube: {
                noCookie: true,
                rel: 0,
                showinfo: 0,
                iv_load_policy: 3,
                modestbranding: 1
            }
        });

        player.on('ratechange', () => {
            if (playerSpeedIndicator) {
                playerSpeedIndicator.textContent = `${player.speed}x`;
            }
        });

        return player;
    }

    // Initialize Plyr if video element is present
    if (typeof Plyr !== 'undefined' && videoPlayer) {
        plyrInstance = createPlyrInstance(videoPlayer);
        attachDoubleTapSeek();
    }

    // Platform detection regex patterns
    const PLATFORMS = [
        { regex: /(?:terabox\.com|1024tera\.com|teraboxapp\.com|teraboxlink\.com|terasharelink\.com|terafileshare\.com|4funbox\.com|mirrobox\.com|nephobox\.com|freeterabox\.com|tibibox\.com)/i, name: 'TeraBox', icon: 'fas fa-cube', color: '#00B0FF' },
        { regex: /(?:diskwala\.com|thediskwala\.com|diskwala\.link|diskwala\.in)/i, name: 'DiskWala', icon: 'fas fa-compact-disc', color: '#00FF87' },
        { regex: /(?:youtube\.com|youtu\.be)/i, name: 'YouTube', icon: 'fab fa-youtube', color: '#FF0000' },
        { regex: /instagram\.com/i, name: 'Instagram', icon: 'fab fa-instagram', color: '#E1306C' },
        { regex: /tiktok\.com/i, name: 'TikTok', icon: 'fab fa-tiktok', color: '#00F2FE' },
        { regex: /(?:twitter\.com|x\.com)/i, name: 'X / Twitter', icon: 'fab fa-x-twitter', color: '#FFFFFF' },
        { regex: /(?:facebook\.com|fb\.watch)/i, name: 'Facebook', icon: 'fab fa-facebook', color: '#1877F2' },
        { regex: /(?:reddit\.com|v\.redd\.it)/i, name: 'Reddit', icon: 'fab fa-reddit', color: '#FF4500' },
        { regex: /vimeo\.com/i, name: 'Vimeo', icon: 'fab fa-vimeo', color: '#1AB7EA' },
        { regex: /(?:pinterest\.com|pin\.it)/i, name: 'Pinterest', icon: 'fab fa-pinterest', color: '#E60023' },
        { regex: /twitch\.tv/i, name: 'Twitch', icon: 'fab fa-twitch', color: '#9146FF' },
        { regex: /dailymotion\.com/i, name: 'Dailymotion', icon: 'fas fa-play-circle', color: '#0066DC' },
        { regex: /soundcloud\.com/i, name: 'SoundCloud', icon: 'fab fa-soundcloud', color: '#FF5500' },
        { regex: /threads\.net/i, name: 'Threads', icon: 'fas fa-at', color: '#FFFFFF' },
        { regex: /bilibili\.com/i, name: 'Bilibili', icon: 'fas fa-tv', color: '#00A1D6' }
    ];

    function updatePlatformIndicator(url) {
        if (!url || !url.trim()) {
            platformBadge.classList.add('hidden');
            clearBtn.classList.add('hidden');
            return;
        }

        clearBtn.classList.remove('hidden');

        let matched = null;
        for (const p of PLATFORMS) {
            if (p.regex.test(url)) {
                matched = p;
                break;
            }
        }

        if (matched) {
            platformIcon.className = matched.icon;
            platformIcon.style.color = matched.color;
            platformName.textContent = matched.name;
            platformBadge.classList.remove('hidden');
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
            platformIcon.className = 'fas fa-globe';
            platformIcon.style.color = '#00FF87';
            platformName.textContent = 'Universal Video';
            platformBadge.classList.remove('hidden');
        } else {
            platformBadge.classList.add('hidden');
        }
    }

    urlInput.addEventListener('input', (e) => {
        updatePlatformIndicator(e.target.value);
    });

    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        updatePlatformIndicator('');
        urlInput.focus();
    });

    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                updatePlatformIndicator(urlInput.value);
                triggerExtract();
            }
        } catch (err) {
            urlInput.focus();
        }
    });

    extractForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerExtract();
    });

    async function triggerExtract() {
        const url = urlInput.value.trim();
        if (!url) return;

        if (url.includes('youtube.com/watch') && url.includes('v=') && url.split('v=')[1].split('&')[0].length < 10) {
            errorMessage.textContent = 'Incomplete YouTube video link. Please copy and paste the entire video URL.';
            errorSection.classList.remove('hidden');
            errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        resultSection.classList.add('hidden');
        errorSection.classList.add('hidden');
        loaderSection.classList.remove('hidden');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Analyzing...`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);

        try {
            const res = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || 'Failed to extract video information.');
            }

            currentExtraction = data;
            renderResults(data);
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                errorMessage.textContent = 'Extraction timed out. The video host is responding slowly, please try again.';
            } else {
                errorMessage.textContent = err.message || 'Unable to fetch video. Please check the link.';
            }
            errorSection.classList.remove('hidden');
            errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } finally {
            loaderSection.classList.add('hidden');
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Get Video</span> <i class="fas fa-arrow-down ml-2"></i>`;
        }
    }

    function renderResults(data) {
        currentExtraction = data;
        videoTitle.textContent = data.title;
        videoUploader.textContent = data.uploader;
        videoDuration.textContent = data.duration_formatted;
        videoViews.textContent = data.view_count ? Number(data.view_count).toLocaleString() + ' views' : '';
        videoPlatformTag.textContent = data.platform.name;

        // Load media into DownBLink Media Player with live playback
        loadMediaIntoPlayer(
            data.platform.key,
            data.id,
            data.preview_stream_url,
            data.thumbnail,
            data.title
        );

        renderFormatLists(data.formats);

        resultSection.classList.remove('hidden');
        
        // Auto-scroll directly to the player
        setTimeout(() => {
            playerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
    }

    function loadMediaIntoPlayer(platformKey, mediaId, streamUrl, poster, title) {
        const isYouTube = platformKey === 'youtube';
        const isVimeo = platformKey === 'vimeo';
        const targetProvider = isYouTube ? 'youtube' : (isVimeo ? 'vimeo' : 'html5');

        // Update player badge
        if (playerPlatformBadge) {
            playerPlatformBadge.innerHTML = `<i class="fas fa-play text-[10px]"></i> <span>${platformKey.toUpperCase()} LIVE</span>`;
        }

        // If provider changed or instance is missing, recreate container element cleanly
        if (currentActiveProvider !== targetProvider || !plyrInstance) {
            if (plyrInstance) {
                try { plyrInstance.destroy(); } catch (e) {}
                plyrInstance = null;
            }

            if (playerFrameBox) {
                playerFrameBox.innerHTML = `
                    <video id="main-video-player" playsinline controls preload="auto" class="w-full"></video>
                    <div id="skip-overlay-left" class="pointer-events-none absolute left-0 top-0 bottom-0 w-1/3 flex items-center justify-center opacity-0 transition-opacity duration-300 z-30">
                      <div class="bg-black/80 backdrop-blur-md text-neon px-4 py-2 rounded-full font-black text-sm flex items-center gap-2 border border-neon/40 shadow-2xl">
                        <i class="fas fa-backward text-xs"></i>
                        <span>-10s</span>
                      </div>
                    </div>
                    <div id="skip-overlay-right" class="pointer-events-none absolute right-0 top-0 bottom-0 w-1/3 flex items-center justify-center opacity-0 transition-opacity duration-300 z-30">
                      <div class="bg-black/80 backdrop-blur-md text-neon px-4 py-2 rounded-full font-black text-sm flex items-center gap-2 border border-neon/40 shadow-2xl">
                        <span>+10s</span>
                        <i class="fas fa-forward text-xs"></i>
                      </div>
                    </div>
                `;
                videoPlayer = document.getElementById('main-video-player');
                attachDoubleTapSeek();
                plyrInstance = createPlyrInstance(videoPlayer);
                currentActiveProvider = targetProvider;
            }
        }

        if (!plyrInstance) return;

        // Set player source based on platform provider
        if (isYouTube && mediaId) {
            plyrInstance.source = {
                type: 'video',
                title: title,
                sources: [
                    {
                        src: mediaId,
                        provider: 'youtube',
                    }
                ]
            };
        } else if (isVimeo && mediaId) {
            plyrInstance.source = {
                type: 'video',
                title: title,
                sources: [
                    {
                        src: mediaId,
                        provider: 'vimeo',
                    }
                ]
            };
        } else if (streamUrl) {
            const streamProxyUrl = `/api/stream?stream_url=${encodeURIComponent(streamUrl)}`;
            
            // HLS stream support
            if (typeof Hls !== 'undefined' && Hls.isSupported() && streamUrl.includes('.m3u8')) {
                const hls = new Hls();
                hls.loadSource(streamProxyUrl);
                hls.attachMedia(videoPlayer);
            } else {
                plyrInstance.source = {
                    type: 'video',
                    title: title,
                    poster: poster,
                    sources: [
                        {
                            src: streamProxyUrl,
                            type: 'video/mp4'
                        }
                    ]
                };
            }
        } else {
            plyrInstance.poster = poster;
        }

        // Auto-play immediately (with muted policy fallback)
        setTimeout(() => {
            if (plyrInstance) {
                plyrInstance.play().catch(() => {
                    plyrInstance.muted = true;
                    plyrInstance.play().catch(() => {});
                });
            }
        }, 400);
    }

    function attachDoubleTapSeek() {
        const box = document.getElementById('player-frame-box');
        if (!box) return;

        let clickTimer = null;
        let clickCount = 0;

        box.addEventListener('click', (e) => {
            // Ignore click if clicking Plyr control buttons or menu
            if (e.target.closest('.plyr__controls') || e.target.closest('.plyr__menu')) {
                return;
            }

            clickCount++;
            if (clickCount === 1) {
                clickTimer = setTimeout(() => {
                    clickCount = 0;
                }, 300);
            } else if (clickCount === 2) {
                clearTimeout(clickTimer);
                clickCount = 0;

                const rect = box.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const width = rect.width;

                // Left 35% -> Rewind 10s
                if (clickX < width * 0.35) {
                    if (plyrInstance) {
                        plyrInstance.rewind(10);
                        showSkipAnimation('left');
                    }
                } 
                // Right 35% -> Forward 10s
                else if (clickX > width * 0.65) {
                    if (plyrInstance) {
                        plyrInstance.forward(10);
                        showSkipAnimation('right');
                    }
                }
                // Center -> Toggle Fullscreen
                else {
                    if (plyrInstance) {
                        plyrInstance.fullscreen.toggle();
                    }
                }
            }
        });
    }

    function showSkipAnimation(direction) {
        const el = document.getElementById(direction === 'left' ? 'skip-overlay-left' : 'skip-overlay-right');
        if (!el) return;
        el.classList.add('skip-ripple-active');
        setTimeout(() => {
            el.classList.remove('skip-ripple-active');
        }, 600);
    }

    function toggleTheaterMode() {
        isTheaterMode = !isTheaterMode;
        if (!playerAndDetails) return;

        if (isTheaterMode) {
            playerAndDetails.classList.add('theater-active');
            if (theaterIcon) theaterIcon.className = 'fas fa-compress text-xs text-neon';
            if (theaterText) theaterText.textContent = 'Default';
            if (playerActiveMode) playerActiveMode.textContent = 'Theater Cinema View (100%)';
        } else {
            playerAndDetails.classList.remove('theater-active');
            if (theaterIcon) theaterIcon.className = 'fas fa-expand text-xs text-neon';
            if (theaterText) theaterText.textContent = 'Theater';
            if (playerActiveMode) playerActiveMode.textContent = 'Standard 16:9 View';
        }

        playerContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderFormatLists(formats) {
        // Build Video Cards
        listVideo.innerHTML = '';
        const allVideoOptions = [];

        if (formats.video_merged && formats.video_merged.length > 0) {
            formats.video_merged.forEach(item => {
                allVideoOptions.push({
                    ...item,
                    is_merge: true,
                    badge: 'High Definition'
                });
            });
        }

        if (formats.progressive && formats.progressive.length > 0) {
            formats.progressive.forEach(item => {
                allVideoOptions.push({
                    ...item,
                    is_merge: false,
                    badge: 'Instant Download'
                });
            });
        }

        allVideoOptions.sort((a, b) => (b.height || 0) - (a.height || 0));

        if (allVideoOptions.length === 0) {
            listVideo.innerHTML = `<div class="p-6 text-center text-gray-500">No video formats found for this media.</div>`;
        } else {
            allVideoOptions.forEach(opt => {
                const card = document.createElement('div');
                card.className = "video-item-card flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#0A0E0C] hover:bg-[#121B16] border border-[#16241D] rounded-xl transition duration-200 gap-3";
                
                const extClean = (opt.ext || 'mp4').toLowerCase();
                const isHD = (opt.height || 0) >= 1080;
                
                // Set data attributes for instant filtering
                card.dataset.ext = extClean;
                card.dataset.isHd = isHD ? 'true' : 'false';
                card.dataset.height = String(opt.height || 0);

                const qualityColor = isHD ? 'text-[#00FF87]' : 'text-gray-300';
                const tagColor = opt.is_merge ? 'bg-emerald-950/80 text-[#00FF87] border border-emerald-500/30' : 'bg-green-950/80 text-[#00E676] border border-green-500/30';
                const btnLabel = opt.is_merge ? `Download ${extClean.toUpperCase()}` : `Download ${extClean.toUpperCase()}`;

                const isLocked = !opt.direct_url && currentExtraction && currentExtraction.bot_url;

                card.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-[#0D1411] flex items-center justify-center text-[#00FF87] border border-[#16241D]">
                            <i class="fas ${isLocked ? 'fa-lock text-yellow-400' : 'fa-video'}"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-base ${qualityColor}">${opt.resolution}</span>
                                <span class="text-xs px-2 py-0.5 rounded font-mono uppercase ${tagColor}">${extClean}</span>
                                ${isHD ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-[#00FF87] text-[#070A08] font-black uppercase">HD</span>' : ''}
                                ${isLocked ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold uppercase"><i class="fas fa-shield-alt mr-1"></i>App Protected</span>' : ''}
                                ${!opt.is_merge && !isLocked ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-neon font-bold uppercase"><i class="fas fa-bolt mr-1"></i>Instant</span>' : ''}
                            </div>
                            <div class="text-xs text-[#8E9E96] mt-0.5">
                                <span>${opt.filesize_formatted}</span>
                                <span class="mx-1.5">•</span>
                                <span>${isLocked ? 'DiskWala App/Telegram Delivery' : (opt.is_merge ? 'Audio + Video (Auto-Merged)' : 'Direct Stream (Instant)')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${isLocked ? `
                            <a href="${currentExtraction.bot_url}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold bg-[#0088cc] hover:bg-[#0077b5] text-white shadow-lg transition">
                                <i class="fab fa-telegram-plane"></i>
                                <span>Get on Telegram Bot</span>
                            </a>
                        ` : `
                            <button class="qr-card-btn p-2 sm:px-3 sm:py-2 rounded-lg text-xs font-semibold bg-[#131D18] hover:bg-[#1A2922] text-[#00FF87] border border-neon/30 flex items-center gap-1.5 transition" title="Scan QR Code to download to phone">
                                <i class="fas fa-qrcode"></i>
                                <span class="hidden sm:inline">QR</span>
                            </button>
                            <button class="download-action-btn flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold btn-neon transition">
                                <i class="fas fa-download"></i>
                                <span>${btnLabel}</span>
                            </button>
                        `}
                    </div>
                `;

                const btn = card.querySelector('.download-action-btn');
                if (btn) {
                    btn.addEventListener('click', () => {
                        handleDownloadRequest(opt);
                    });
                }

                const qrBtn = card.querySelector('.qr-card-btn');
                if (qrBtn) {
                    qrBtn.addEventListener('click', () => {
                        handleQrRequest(opt);
                    });
                }

                listVideo.appendChild(card);
            });
        }

        // Build Audio Cards
        listAudio.innerHTML = '';
        if (formats.audio_only && formats.audio_only.length > 0) {
            formats.audio_only.forEach(opt => {
                const card = document.createElement('div');
                card.className = "audio-item-card flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#0A0E0C] hover:bg-[#121B16] border border-[#16241D] rounded-xl transition duration-200 gap-3";
                
                const extClean = (opt.ext || 'm4a').toLowerCase();
                card.dataset.ext = extClean;
                card.dataset.bitrate = String(opt.bitrate || 0);

                card.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-[#0D1411] flex items-center justify-center text-[#00FF87] border border-[#16241D]">
                            <i class="fas fa-music"></i>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-base text-white">${opt.quality_label}</span>
                                <span class="text-xs px-2 py-0.5 rounded font-mono uppercase bg-emerald-950/80 text-[#00FF87] border border-emerald-500/30">${extClean}</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-neon font-bold uppercase"><i class="fas fa-bolt mr-1"></i>Instant</span>
                            </div>
                            <div class="text-xs text-[#8E9E96] mt-0.5">
                                <span>${opt.filesize_formatted}</span>
                                <span class="mx-1.5">•</span>
                                <span>Audio Track (Instant Download)</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="qr-audio-btn p-2 sm:px-3 sm:py-2 rounded-lg text-xs font-semibold bg-[#131D18] hover:bg-[#1A2922] text-[#00FF87] border border-neon/30 flex items-center gap-1.5 transition" title="Scan QR Code to download audio to phone">
                            <i class="fas fa-qrcode"></i>
                            <span class="hidden sm:inline">QR</span>
                        </button>
                        <button class="audio-download-btn flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold btn-neon transition">
                            <i class="fas fa-bolt"></i>
                            <span>Instant ${extClean.toUpperCase()}</span>
                        </button>
                    </div>
                `;

                const btn = card.querySelector('.audio-download-btn');
                btn.addEventListener('click', () => {
                    handleAudioExtract(opt);
                });

                const qrBtn = card.querySelector('.qr-audio-btn');
                qrBtn.addEventListener('click', () => {
                    handleQrRequest(opt);
                });

                listAudio.appendChild(card);
            });
        } else {
            listAudio.innerHTML = `<div class="p-6 text-center text-gray-500">No standalone audio tracks extracted.</div>`;
        }

        // Render Filter Pills Bar
        renderFilterPills();
    }

    // Render Dynamic Format Filter Buttons Bar
    function renderFilterPills() {
        filterPillsBar.innerHTML = '';

        if (activeTab === 'video') {
            const cards = Array.from(listVideo.querySelectorAll('.video-item-card'));
            if (cards.length === 0) return;

            const mp4Count = cards.filter(c => c.dataset.ext === 'mp4').length;
            const webmCount = cards.filter(c => c.dataset.ext === 'webm').length;
            const hdCount = cards.filter(c => c.dataset.isHd === 'true').length;

            const filters = [
                { id: 'all', label: 'All Videos', count: cards.length, icon: 'fa-globe' },
            ];

            if (mp4Count > 0) {
                filters.push({ id: 'mp4', label: 'MP4 Only', count: mp4Count, icon: 'fa-file-video' });
            }
            if (webmCount > 0) {
                filters.push({ id: 'webm', label: 'WEBM Only', count: webmCount, icon: 'fa-film' });
            }
            if (hdCount > 0) {
                filters.push({ id: 'hd', label: '1080p+ HD', count: hdCount, icon: 'fa-tv' });
            }

            filters.forEach(f => {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isActive = currentVideoFilter === f.id;
                
                btn.className = `filter-pill px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    isActive 
                    ? 'bg-neon text-[#070A08] shadow-[0_0_12px_rgba(0,255,135,0.4)]' 
                    : 'bg-[#0D1410] text-[#8E9E96] border border-[#16241D] hover:text-white hover:border-neon/40'
                }`;
                btn.innerHTML = `<i class="fas ${f.icon}"></i> <span>${f.label}</span> <span class="text-[10px] opacity-75 font-mono">(${f.count})</span>`;

                btn.addEventListener('click', () => {
                    currentVideoFilter = f.id;
                    applyFilterToCards('video', f.id);
                    renderFilterPills();
                });

                filterPillsBar.appendChild(btn);
            });

            applyFilterToCards('video', currentVideoFilter);

        } else {
            // Audio Tab Filters
            const cards = Array.from(listAudio.querySelectorAll('.audio-item-card'));
            if (cards.length === 0) return;

            const m4aCount = cards.filter(c => ['m4a', 'mp3'].includes(c.dataset.ext)).length;
            const webmCount = cards.filter(c => ['webm', 'opus'].includes(c.dataset.ext)).length;

            const filters = [
                { id: 'all', label: 'All Audio', count: cards.length, icon: 'fa-music' },
            ];

            if (m4aCount > 0) {
                filters.push({ id: 'm4a', label: 'M4A / MP3', count: m4aCount, icon: 'fa-headphones' });
            }
            if (webmCount > 0) {
                filters.push({ id: 'webm', label: 'WEBM / Opus', count: webmCount, icon: 'fa-wave-square' });
            }

            filters.forEach(f => {
                const btn = document.createElement('button');
                btn.type = 'button';
                const isActive = currentAudioFilter === f.id;

                btn.className = `filter-pill px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    isActive 
                    ? 'bg-neon text-[#070A08] shadow-[0_0_12px_rgba(0,255,135,0.4)]' 
                    : 'bg-[#0D1410] text-[#8E9E96] border border-[#16241D] hover:text-white hover:border-neon/40'
                }`;
                btn.innerHTML = `<i class="fas ${f.icon}"></i> <span>${f.label}</span> <span class="text-[10px] opacity-75 font-mono">(${f.count})</span>`;

                btn.addEventListener('click', () => {
                    currentAudioFilter = f.id;
                    applyFilterToCards('audio', f.id);
                    renderFilterPills();
                });

                filterPillsBar.appendChild(btn);
            });

            applyFilterToCards('audio', currentAudioFilter);
        }
    }

    // Filter Logic to toggle card visibility
    function applyFilterToCards(tabType, filterId) {
        if (tabType === 'video') {
            const cards = listVideo.querySelectorAll('.video-item-card');
            cards.forEach(card => {
                const ext = card.dataset.ext;
                const isHd = card.dataset.isHd === 'true';

                let visible = true;
                if (filterId === 'mp4') visible = (ext === 'mp4');
                else if (filterId === 'webm') visible = (ext === 'webm');
                else if (filterId === 'hd') visible = isHd;

                if (visible) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        } else {
            const cards = listAudio.querySelectorAll('.audio-item-card');
            cards.forEach(card => {
                const ext = card.dataset.ext;

                let visible = true;
                if (filterId === 'm4a') visible = ['m4a', 'mp3'].includes(ext);
                else if (filterId === 'webm') visible = ['webm', 'opus'].includes(ext);

                if (visible) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        }
    }

    // Tab Switchers
    tabVideo.addEventListener('click', () => {
        activeTab = 'video';
        tabVideo.classList.add('active');
        tabAudio.classList.remove('active');
        listVideo.classList.remove('hidden');
        listAudio.classList.add('hidden');
        renderFilterPills();
    });

    tabAudio.addEventListener('click', () => {
        activeTab = 'audio';
        tabAudio.classList.add('active');
        tabVideo.classList.remove('active');
        listAudio.classList.remove('hidden');
        listVideo.classList.add('hidden');
        renderFilterPills();
    });

    // Handle Download for Video
    function handleDownloadRequest(opt) {
        if (!opt.direct_url) {
            if (currentExtraction && currentExtraction.bot_url) {
                window.open(currentExtraction.bot_url, '_blank');
            } else {
                alert('This specific video is token-protected by the host and requires an active session or API key.');
            }
            return;
        }

        if (!opt.is_merge && opt.direct_url) {
            triggerInstantStreamDownload(opt.direct_url, currentExtraction.title, opt.ext || 'mp4', opt.filesize);
            return;
        }

        initiateMergeJob({
            url: urlInput.value.trim(),
            format_id: opt.format_id,
            audio_id: opt.best_audio_id,
            is_audio_only: false,
            ext: opt.ext || 'mp4'
        }, `Fast remuxing ${opt.resolution} ${opt.ext ? opt.ext.toUpperCase() : 'MP4'} with FFmpeg...`);
    }

    // Handle Download for Audio -> INSTANT download
    function handleAudioExtract(opt) {
        if (opt.direct_url) {
            triggerInstantStreamDownload(opt.direct_url, currentExtraction.title, opt.ext || 'm4a', opt.filesize);
            return;
        }

        initiateMergeJob({
            url: urlInput.value.trim(),
            format_id: opt.format_id,
            audio_id: null,
            is_audio_only: true
        }, `Extracting MP3 audio...`);
    }

    // Instant Direct Stream Download via streaming proxy (Starts in 0.1s in browser)
    function triggerInstantStreamDownload(streamUrl, filename, ext, filesize) {
        let downloadEndpoint = `/api/download-stream?stream_url=${encodeURIComponent(streamUrl)}&filename=${encodeURIComponent(filename)}&ext=${encodeURIComponent(ext)}`;
        if (filesize && filesize > 0) {
            downloadEndpoint += `&filesize=${filesize}`;
        }
        window.location.href = downloadEndpoint;
    }

    // LAN IP Fetcher for Phone Transfer
    async function getLanIp() {
        if (cachedLanIp) return cachedLanIp;
        try {
            const res = await fetch('/api/info/lan-ip');
            if (res.ok) {
                const data = await res.json();
                cachedLanIp = data.lan_ip || window.location.hostname;
                return cachedLanIp;
            }
        } catch (e) {}
        return window.location.hostname;
    }

    // Open QR Code Phone Transfer Modal
    async function openQrModal(targetUrl, title) {
        if (!targetUrl) return;

        const lanIp = await getLanIp();
        const port = window.location.port ? `:${window.location.port}` : '';
        const protocol = window.location.protocol;
        
        let fullPhoneUrl = targetUrl;
        if (fullPhoneUrl.startsWith('/')) {
            fullPhoneUrl = `${protocol}//${lanIp}${port}${fullPhoneUrl}`;
        } else if (fullPhoneUrl.includes('127.0.0.1') || fullPhoneUrl.includes('localhost')) {
            fullPhoneUrl = fullPhoneUrl.replace('127.0.0.1', lanIp).replace('localhost', lanIp);
        }

        qrLinkInput.value = fullPhoneUrl;
        
        // Render QR Code
        qrContainer.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            try {
                new QRCode(qrContainer, {
                    text: fullPhoneUrl,
                    width: 192,
                    height: 192,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.M
                });
            } catch (err) {
                renderQrViaBackend(fullPhoneUrl);
            }
        } else {
            renderQrViaBackend(fullPhoneUrl);
        }

        qrModal.classList.remove('hidden');
    }

    function renderQrViaBackend(fullPhoneUrl) {
        qrContainer.innerHTML = '';
        const img = document.createElement('img');
        img.src = `/api/qr?text=${encodeURIComponent(fullPhoneUrl)}`;
        img.alt = 'QR Code';
        img.className = 'w-48 h-48 object-contain';
        qrContainer.appendChild(img);
    }

    // Handle QR Click on Format Cards
    function handleQrRequest(opt) {
        if (!opt.direct_url) {
            alert('To transfer this format via QR code, please click the green download button first to prepare the video stream.');
            return;
        }

        const ext = opt.ext || 'mp4';
        const title = currentExtraction ? currentExtraction.title : 'video';
        let phoneEndpoint = `/api/download-stream?stream_url=${encodeURIComponent(opt.direct_url)}&filename=${encodeURIComponent(title)}&ext=${encodeURIComponent(ext)}`;
        if (opt.filesize && opt.filesize > 0) {
            phoneEndpoint += `&filesize=${opt.filesize}`;
        }
        openQrModal(phoneEndpoint, title);
    }

    // Thumbnail Download Button Event
    if (btnDownloadThumb) {
        btnDownloadThumb.addEventListener('click', () => {
            if (!currentExtraction || !currentExtraction.thumbnail) {
                alert('No thumbnail available for this video.');
                return;
            }
            const thumbUrl = currentExtraction.thumbnail;
            const title = currentExtraction.title || 'video';
            const downloadUrl = `/api/download-thumbnail?thumb_url=${encodeURIComponent(thumbUrl)}&filename=${encodeURIComponent(title)}`;
            window.location.href = downloadUrl;
        });
    }

    // Quick QR Button in Metadata Header
    if (btnQuickQr) {
        btnQuickQr.addEventListener('click', () => {
            if (!currentExtraction) return;
            // Find best progressive stream if available
            const prog = currentExtraction.formats && currentExtraction.formats.progressive;
            if (prog && prog.length > 0 && prog[0].direct_url) {
                handleQrRequest(prog[0]);
            } else if (currentExtraction.preview_stream_url) {
                handleQrRequest({ direct_url: currentExtraction.preview_stream_url, ext: 'mp4' });
            } else {
                // If only merged video available, guide user to pick format
                alert('Please click the QR icon on your preferred quality format below to scan!');
            }
        });
    }

    // QR Modal Controls
    if (qrCloseBtn) qrCloseBtn.addEventListener('click', () => qrModal.classList.add('hidden'));
    if (qrDoneBtn) qrDoneBtn.addEventListener('click', () => qrModal.classList.add('hidden'));
    if (qrCopyBtn) {
        qrCopyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(qrLinkInput.value);
                const originalHtml = qrCopyBtn.innerHTML;
                qrCopyBtn.innerHTML = `<i class="fas fa-check"></i> <span>Copied!</span>`;
                setTimeout(() => {
                    qrCopyBtn.innerHTML = originalHtml;
                }, 2000);
            } catch (err) {
                qrLinkInput.select();
                document.execCommand('copy');
            }
        });
    }

    // Start background merge & monitor progress
    async function initiateMergeJob(payload, initialMsg) {
        progressModal.classList.remove('hidden');
        if (modalQrContainer) modalQrContainer.classList.add('hidden');
        progressBar.style.width = '15%';
        progressBar.style.backgroundColor = '';
        progressPercent.textContent = '15%';
        progressStatus.textContent = initialMsg;

        try {
            const res = await fetch('/api/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Could not queue download job');

            const jobId = data.job_id;
            pollMergeProgress(jobId);
        } catch (err) {
            alert('Error starting download: ' + err.message);
            closeProgressModal();
        }
    }

    function pollMergeProgress(jobId) {
        if (activePollInterval) clearInterval(activePollInterval);

        activePollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/merge/status/${jobId}`);
                if (!res.ok) throw new Error('Status check failed');

                const data = await res.json();

                if (data.status === 'downloading') {
                    const p = data.progress || 35;
                    progressBar.style.width = `${p}%`;
                    progressPercent.textContent = `${p}%`;
                    progressStatus.textContent = 'Multi-threaded streaming chunks from CDN...';
                } else if (data.status === 'merging') {
                    progressBar.style.width = '92%';
                    progressPercent.textContent = '92%';
                    progressStatus.textContent = 'Finalizing audio & video remuxing with FFmpeg...';
                } else if (data.status === 'completed') {
                    clearInterval(activePollInterval);
                    progressBar.style.width = '100%';
                    progressPercent.textContent = '100%';
                    progressStatus.textContent = 'Download ready! Starting file transfer...';
                    lastCompletedDownloadUrl = data.download_url;

                    if (modalQrContainer && modalQrTransferBtn) {
                        modalQrContainer.classList.remove('hidden');
                        modalQrTransferBtn.onclick = () => {
                            openQrModal(data.download_url, currentExtraction ? currentExtraction.title : 'video');
                        };
                    }

                    setTimeout(() => {
                        window.location.href = data.download_url;
                    }, 800);
                } else if (data.status === 'failed') {
                    clearInterval(activePollInterval);
                    progressStatus.textContent = `Error: ${data.error || 'Failed to process video.'}`;
                    progressBar.style.backgroundColor = '#EF4444';
                }
            } catch (err) {
                clearInterval(activePollInterval);
            }
        }, 1200);
    }

    function closeProgressModal() {
        if (activePollInterval) clearInterval(activePollInterval);
        progressModal.classList.add('hidden');
        if (modalQrContainer) modalQrContainer.classList.add('hidden');
        progressBar.style.width = '0%';
    }

    // DownBLink Media Player Toolbar Event Listeners
    if (btnTheaterToggle) {
        btnTheaterToggle.addEventListener('click', toggleTheaterMode);
    }

    if (btnPipToggle) {
        btnPipToggle.addEventListener('click', () => {
            if (plyrInstance) {
                try {
                    plyrInstance.pip = !plyrInstance.pip;
                } catch (e) {
                    alert('Picture-in-Picture is not supported in this browser mode.');
                }
            }
        });
    }

    if (btnShortcutsModal) {
        btnShortcutsModal.addEventListener('click', () => {
            if (shortcutsModal) shortcutsModal.classList.remove('hidden');
        });
    }

    if (shortcutsCloseBtn) {
        shortcutsCloseBtn.addEventListener('click', () => {
            if (shortcutsModal) shortcutsModal.classList.add('hidden');
        });
    }

    if (shortcutsDoneBtn) {
        shortcutsDoneBtn.addEventListener('click', () => {
            if (shortcutsModal) shortcutsModal.classList.add('hidden');
        });
    }

    // Global YouTube-style Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Do not trigger shortcuts when typing in inputs
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable)) {
            return;
        }

        const key = e.key.toLowerCase();

        // Shortcuts modal trigger (? or Shift+/)
        if (key === '?' || (e.shiftKey && key === '/')) {
            e.preventDefault();
            if (shortcutsModal) shortcutsModal.classList.toggle('hidden');
            return;
        }

        // Close modals on Escape
        if (e.key === 'Escape') {
            if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) shortcutsModal.classList.add('hidden');
            if (qrModal && !qrModal.classList.contains('hidden')) qrModal.classList.add('hidden');
            return;
        }

        if (!plyrInstance) return;

        // Space or K: Play / Pause
        if (e.code === 'Space' || key === 'k') {
            e.preventDefault();
            plyrInstance.togglePlay();
        }
        // J: Rewind 10s
        else if (key === 'j') {
            e.preventDefault();
            plyrInstance.rewind(10);
            showSkipAnimation('left');
        }
        // L: Fast forward 10s
        else if (key === 'l') {
            e.preventDefault();
            plyrInstance.forward(10);
            showSkipAnimation('right');
        }
        // Left Arrow: Rewind 5s
        else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            plyrInstance.rewind(5);
            showSkipAnimation('left');
        }
        // Right Arrow: Forward 5s
        else if (e.code === 'ArrowRight') {
            e.preventDefault();
            plyrInstance.forward(5);
            showSkipAnimation('right');
        }
        // Up Arrow: Volume Up
        else if (e.code === 'ArrowUp') {
            e.preventDefault();
            plyrInstance.volume = Math.min(1, Number((plyrInstance.volume + 0.05).toFixed(2)));
        }
        // Down Arrow: Volume Down
        else if (e.code === 'ArrowDown') {
            e.preventDefault();
            plyrInstance.volume = Math.max(0, Number((plyrInstance.volume - 0.05).toFixed(2)));
        }
        // M: Mute toggle
        else if (key === 'm') {
            e.preventDefault();
            plyrInstance.muted = !plyrInstance.muted;
        }
        // F: Fullscreen
        else if (key === 'f') {
            e.preventDefault();
            plyrInstance.fullscreen.toggle();
        }
        // T: Theater Mode
        else if (key === 't') {
            e.preventDefault();
            toggleTheaterMode();
        }
        // P: Picture in Picture
        else if (key === 'p') {
            e.preventDefault();
            try {
                plyrInstance.pip = !plyrInstance.pip;
            } catch (err) {}
        }
        // C: Captions
        else if (key === 'c') {
            e.preventDefault();
            plyrInstance.toggleCaptions();
        }
        // 0 - 9: Jump to 0% - 90%
        else if (key >= '0' && key <= '9') {
            e.preventDefault();
            const pct = parseInt(key) / 10;
            if (plyrInstance.duration) {
                plyrInstance.currentTime = pct * plyrInstance.duration;
            }
        }
        // Shift + > or Shift + .: Increase speed
        else if (e.shiftKey && (e.key === '>' || e.key === '.')) {
            e.preventDefault();
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
            const currentSpeed = plyrInstance.speed || 1;
            const nextIdx = speeds.findIndex(s => s > currentSpeed);
            if (nextIdx !== -1) {
                plyrInstance.speed = speeds[nextIdx];
            }
        }
        // Shift + < or Shift + ,: Decrease speed
        else if (e.shiftKey && (e.key === '<' || e.key === ',')) {
            e.preventDefault();
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
            const currentSpeed = plyrInstance.speed || 1;
            const prevIdx = speeds.slice().reverse().findIndex(s => s < currentSpeed);
            if (prevIdx !== -1) {
                plyrInstance.speed = speeds[speeds.length - 1 - prevIdx];
            }
        }
    });

    // Footer Dynamic Year
    const currentYearEl = document.getElementById('current-year');
    if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

    progressCancelBtn.addEventListener('click', closeProgressModal);
});

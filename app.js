// Ensure PDFJS worker scale points to dynamic CDN dependencies
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ==========================================
// 1. App Configuration Matrix
// ==========================================
const CONFIG = {
    // Fill in your GitHub details to bypass auto-detection, ensuring it works on localhost too
    githubOwner: "SkyPlay-Code", 
    githubRepo: "manhwa",
    
    // Offline / Local fallback data
    fallbackData: [
        {
            id: "the-crows-prince",
            title: "The Crow's Prince",
            folder: "The_Crow's_Prince",
            description: "A young woman undergoes a surreal transition after an unexpected death, waking up in the body of a humble crow in a fantasy realm where empires and magic collide.",
            chapters: ["Chapter_001.pdf", "Chapter_002.pdf", "Chapter_003.pdf"]
        }
    ]
};

// ==========================================
// 2. Main Memory State
// ==========================================
const state = {
    currentView: 'home',
    currentBranch: 'master',
    manhwas: [], 
    activeManhwa: null,
    activeChapterIndex: 0,
    currentPageNum: 1,
    currentPDFDoc: null,
    renderObserver: null,
    favorites: JSON.parse(localStorage.getItem('starlight_favorites')) || [],
    history: JSON.parse(localStorage.getItem('starlight_history')) || {},
    settings: JSON.parse(localStorage.getItem('starlight_settings')) || {
        mode: 'scroll',       // scroll (continuous) vs paged (single page slide)
        filter: 'default',    // default, dimmed, sepia, warm, invert
        width: 'medium',      // narrow, medium, wide
        gap: 'none',          // none, small, medium, large
        quality: 'medium'     // low, medium, high
    }
};

// DOM targets
const views = {
    home: document.getElementById('home-view'),
    details: document.getElementById('details-view'),
    reader: document.getElementById('reader-view')
};

const elements = {
    manhwaGrid: document.getElementById('manhwa-grid'),
    favoritesSection: document.getElementById('favorites-section'),
    favoritesGrid: document.getElementById('favorites-grid'),
    detailTitle: document.getElementById('detail-title'),
    detailCover: document.getElementById('detail-cover'),
    detailDesc: document.getElementById('detail-description'),
    detailFavBtn: document.getElementById('detail-fav-btn'),
    btnContinueReading: document.getElementById('btn-continue-reading'),
    chapterGrid: document.getElementById('chapter-grid'),
    navLogo: document.getElementById('nav-logo'),
    btnHome: document.getElementById('btn-home'),
    themeToggle: document.getElementById('theme-toggle'),
    detailsBackBtn: document.getElementById('details-back-btn'),
    readerBackBtn: document.getElementById('reader-back-btn'),
    readerTitleDisplay: document.getElementById('reader-title-display'),
    readerSelect: document.getElementById('reader-chapter-select'),
    readerRenderArea: document.getElementById('reader-render-area'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    prevChapBtn: document.getElementById('prev-chap-btn'),
    nextChapBtn: document.getElementById('next-chap-btn'),
    btnToggleSettings: document.getElementById('btn-toggle-settings'),
    settingsDrawer: document.getElementById('reader-settings-drawer'),
    pageFloatingNav: document.getElementById('page-floating-nav'),
    pageJumpSelect: document.getElementById('page-jump-select'),
    pageFloatingMax: document.getElementById('page-floating-max')
};

// ==========================================
// 3. GitHub Pages Repository Discovery
// ==========================================
function getRepoDetails() {
    if (CONFIG.githubOwner && CONFIG.githubRepo) {
        return { owner: CONFIG.githubOwner, repo: CONFIG.githubRepo };
    }
    const host = window.location.hostname;
    const path = window.location.pathname;
    if (host.includes("github.io")) {
        const owner = host.split(".")[0];
        const repo = path.split("/").filter(Boolean)[0];
        if (owner && repo) return { owner, repo };
    }
    return null;
}

// Convert folder names with underscores to clean display titles
function formatTitle(name) {
    return name.replace(/_/g, ' ').replace(/-/g, ' ');
}

// Natively fast natural alphabetical/numerical collator (sorts 00, 2.5, 10 in correct reading order)
function naturalSort(array, getVal = (v) => v) {
    return array.sort((a, b) => {
        return getVal(a).localeCompare(getVal(b), undefined, { numeric: true, sensitivity: 'base' });
    });
}

// ==========================================
// 4. Ultra-Fast CDN Directory Scraping Engine
// ==========================================
async function loadDynamicLibrary() {
    showLoading("Scanning repository folders...");
    const repoInfo = getRepoDetails();
    
    if (!repoInfo) {
        console.warn("Using offline fallback mode.");
        state.manhwas = CONFIG.fallbackData;
        hideLoading();
        return;
    }

    try {
        let response;
        let branch = "master";
        
        // Attempt to fetch the file tree from master branch, fallback to main if master fails
        try {
            response = await fetch(`https://data.jsdelivr.net/v1/packages/gh/${repoInfo.owner}/${repoInfo.repo}@master?structure=flat`);
            if (!response.ok) throw new Error("master failed");
            state.currentBranch = "master";
        } catch(e) {
            branch = "main";
            response = await fetch(`https://data.jsdelivr.net/v1/packages/gh/${repoInfo.owner}/${repoInfo.repo}@main?structure=flat`);
            state.currentBranch = "main";
        }

        if (!response.ok) {
            throw new Error(`Failed to load repository tree from master/main.`);
        }

        const data = await response.json();
        const files = data.files || [];
        const manhwaMap = {};

        // Parse flat file paths into directories and chapters in a single loop
        files.forEach(file => {
            const path = file.name.replace(/^\//, ''); // Clean leading slash
            const parts = path.split('/');
            
            // Files nested inside a root folder (e.g. FolderName/Chapter.pdf)
            if (parts.length === 2) {
                const folderName = parts[0];
                const fileName = parts[1];

                // Exclude system directories
                if (['css', 'js', 'images', 'assets', '.github'].includes(folderName)) {
                    return;
                }

                if (!manhwaMap[folderName]) {
                    manhwaMap[folderName] = {
                        id: folderName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                        title: formatTitle(folderName),
                        folder: folderName,
                        description: `Chapters inside the "${formatTitle(folderName)}" folder. Read PDFs dynamically directly from your repository.`,
                        chapters: [],
                        hasMetadata: false
                    };
                }

                if (fileName.toLowerCase().endsWith('.pdf')) {
                    manhwaMap[folderName].chapters.push(fileName);
                } else if (fileName.toLowerCase() === 'metadata.json') {
                    manhwaMap[folderName].hasMetadata = true;
                }
            }
        });

        // Convert mapped directories to list array and sort naturally
        const scrapedLibrary = Object.values(manhwaMap).filter(m => m.chapters.length > 0);
        scrapedLibrary.forEach(manhwa => {
            manhwa.chapters = naturalSort(manhwa.chapters);
        });

        // Sort overall series list alphabetically
        state.manhwas = naturalSort(scrapedLibrary, (m) => m.title);

    } catch(err) {
        console.error("Scraping failed, using fallback.", err);
        state.manhwas = CONFIG.fallbackData;
    } finally {
        hideLoading();
    }
}

// ==========================================
// 5. Page Cover Extraction Engine
// ==========================================
async function tryGenerateCover(manhwa, callback) {
    const cacheKey = `starlight_cov_${manhwa.id}`;
    const cachedImg = localStorage.getItem(cacheKey);
    if (cachedImg) {
        callback(cachedImg);
        return;
    }

    try {
        const targetChapter = manhwa.chapters[0];
        const docPath = `${manhwa.folder}/${targetChapter}`;
        
        const loadingTask = pdfjsLib.getDocument(encodeURI(docPath));
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = 150 / viewport.width; 
        const targetViewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        canvas.width = targetViewport.width;
        canvas.height = targetViewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport: targetViewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        localStorage.setItem(cacheKey, dataUrl);
        callback(dataUrl);
    } catch(e) {
        callback(null);
    }
}

// ==========================================
// 6. Library Rendering Engines
// ==========================================
function renderHomeGrid() {
    elements.manhwaGrid.innerHTML = '';
    elements.favoritesGrid.innerHTML = '';
    
    let hasFavorites = false;

    if (!state.manhwas || state.manhwas.length === 0) {
        state.manhwas = CONFIG.fallbackData;
    }

    state.manhwas.forEach(m => {
        const isFav = state.favorites.includes(m.id);
        const readingRecord = state.history[m.id];
        let progressHTML = '';
        let progressWidth = 0;
        
        if (readingRecord) {
            const chapCount = m.chapters.length;
            const currentIdx = readingRecord.chapterIndex + 1;
            progressHTML = `<span class="progress-indicator">Ch. ${currentIdx}/${chapCount}</span>`;
            progressWidth = (currentIdx / chapCount) * 100;
        }

        const card = document.createElement('div');
        card.className = 'manhwa-card';
        card.innerHTML = `
            <div class="card-cover" id="cover-bin-${m.id}">
                <div class="card-cover-fallback">${m.title.charAt(0)}</div>
            </div>
            <div class="card-content">
                <div class="card-title-row">
                    <span class="card-title" title="${m.title}">${m.title}</span>
                    <button class="btn-star ${isFav ? 'active' : ''}" data-id="${m.id}">★</button>
                </div>
                <p class="card-desc">${m.description}</p>
                <div class="card-footer">
                    <span class="chapter-count-badge">${m.chapters.length} Chapters</span>
                    ${progressHTML}
                </div>
            </div>
            <div class="card-progress-bar" style="width: ${progressWidth}%"></div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-star')) {
                e.stopPropagation();
                toggleFavorite(m.id);
                return;
            }
            loadDetailsView(m);
        });

        tryGenerateCover(m, (dataUrl) => {
            const holder = document.getElementById(`cover-bin-${m.id}`);
            if (holder && dataUrl) {
                holder.innerHTML = `<img src="${dataUrl}" alt="cover">`;
            }
        });

        if (isFav) {
            hasFavorites = true;
            elements.favoritesGrid.appendChild(card);
        } else {
            elements.manhwaGrid.appendChild(card);
        }
    });

    if (hasFavorites) {
        elements.favoritesSection.classList.remove('hidden');
    } else {
        elements.favoritesSection.classList.add('hidden');
    }
}

function toggleFavorite(id) {
    if (state.favorites.includes(id)) {
        state.favorites = state.favorites.filter(x => x !== id);
    } else {
        state.favorites.push(id);
    }
    localStorage.setItem('starlight_favorites', JSON.stringify(state.favorites));
    renderHomeGrid();
}

async function loadDetailsView(manhwa) {
    state.activeManhwa = manhwa;
    elements.detailTitle.textContent = manhwa.title;
    elements.detailDesc.textContent = manhwa.description;

    const isFav = state.favorites.includes(manhwa.id);
    elements.detailFavBtn.innerHTML = isFav ? '★' : '☆';
    elements.detailFavBtn.className = `btn-star ${isFav ? 'active' : ''}`;

    elements.detailCover.innerHTML = `<div class="card-cover-fallback">${manhwa.title.charAt(0)}</div>`;
    tryGenerateCover(manhwa, (dataUrl) => {
        if (dataUrl) {
            elements.detailCover.innerHTML = `<img src="${dataUrl}" alt="cover">`;
        }
    });

    // Lazy load metadata.json for this specific series only when opened
    if (manhwa.hasMetadata) {
        try {
            const metaPath = `${manhwa.folder}/metadata.json`;
            const metaRes = await fetch(encodeURI(metaPath));
            if (metaRes.ok) {
                const metaData = await metaRes.json();
                if (metaData.title) {
                    manhwa.title = metaData.title;
                    elements.detailTitle.textContent = metaData.title;
                }
                if (metaData.description) {
                    manhwa.description = metaData.description;
                    elements.detailDesc.textContent = metaData.description;
                }
            }
        } catch(e) {
            console.warn("Lazy load metadata failed", e);
        }
    }

    const record = state.history[manhwa.id];
    if (record && record.chapterIndex < manhwa.chapters.length) {
        elements.btnContinueReading.classList.remove('hidden');
        elements.btnContinueReading.querySelector('span').textContent = `Continue Ch. ${record.chapterIndex + 1}`;
        elements.btnContinueReading.onclick = () => openReader(record.chapterIndex, record.pageNum);
    } else {
        elements.btnContinueReading.onclick = () => openReader(0, 1);
        elements.btnContinueReading.querySelector('span').textContent = "Start Reading";
    }

    elements.chapterGrid.innerHTML = '';
    manhwa.chapters.forEach((chapter, index) => {
        const cleanedName = chapter.replace('.pdf', '').replace(/_/g, ' ');
        const isRead = record && record.chapterIndex >= index;
        
        const row = document.createElement('div');
        row.className = 'chapter-row';
        row.innerHTML = `
            <div class="chapter-left">
                <span class="chapter-name">${cleanedName}</span>
                ${isRead ? '<span class="chapter-read-badge">Read</span>' : ''}
            </div>
            <button class="btn-read-action">Read</button>
        `;
        row.querySelector('.btn-read-action').addEventListener('click', () => openReader(index, 1));
        elements.chapterGrid.appendChild(row);
    });

    switchView('details');
}

// ==========================================
// 7. Reader Engine
// ==========================================
async function openReader(chapterIdx, pageNumToLoad = 1) {
    if (!state.activeManhwa) return;
    
    state.activeChapterIndex = chapterIdx;
    const chapName = state.activeManhwa.chapters[chapterIdx];
    const docPath = `${state.activeManhwa.folder}/${chapName}`;

    showLoading(`Rendering ${state.activeManhwa.title}...`);
    switchView('reader');

    elements.readerTitleDisplay.textContent = state.activeManhwa.title;
    setupReaderDropdown();

    elements.readerRenderArea.innerHTML = '';
    if (state.renderObserver) state.renderObserver.disconnect();

    try {
        const loadingTask = pdfjsLib.getDocument(encodeURI(docPath));
        const pdf = await loadingTask.promise;
        state.currentPDFDoc = pdf;

        const numPages = pdf.numPages;
        const firstPage = await pdf.getPage(1);
        const viewPort = firstPage.getViewport({ scale: 1.0 });
        const estimatedRatio = viewPort.height / viewPort.width;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            createPagePlaceholder(pageNum, estimatedRatio);
        }

        setupPageSelectors(numPages);
        initLazyRecycler(pdf);
        updateNavButtons();

        saveProgress(chapterIdx, pageNumToLoad);

        if (pageNumToLoad > 1) {
            setTimeout(() => jumpToPage(pageNumToLoad), 400);
        }

    } catch (err) {
        console.error("PDF engine crash: ", err);
        elements.readerRenderArea.innerHTML = `
            <div style="text-align:center; padding: 4rem 1rem; color: var(--text-muted)">
                <h3 style="font-family: var(--font-heading); font-size:1.2rem; color:var(--text-main);">Error Loading Chapter</h3>
                <p style="margin-top:0.5rem; font-size:0.85rem;">Make sure the file exists at <strong>${docPath}</strong></p>
            </div>
        `;
    } finally {
        hideLoading();
    }
}

function setupReaderDropdown() {
    elements.readerSelect.innerHTML = '';
    state.activeManhwa.chapters.forEach((chap, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = chap.replace('.pdf', '').replace(/_/g, ' ');
        if (idx === state.activeChapterIndex) option.selected = true;
        elements.readerSelect.appendChild(option);
    });
}

function setupPageSelectors(maxPages) {
    elements.pageJumpSelect.innerHTML = '';
    for(let i = 1; i <= maxPages; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        elements.pageJumpSelect.appendChild(opt);
    }
    elements.pageFloatingMax.textContent = `/ ${maxPages}`;
}

function createPagePlaceholder(pageNum, ratio) {
    const pageContainer = document.createElement('div');
    pageContainer.className = 'page-container';
    pageContainer.id = `page-wrapper-${pageNum}`;
    pageContainer.setAttribute('data-page-num', pageNum);

    const estHeight = `calc(${getEstimateWidth()} * ${ratio})`;
    pageContainer.style.minHeight = estHeight;
    pageContainer.setAttribute('data-est-height', estHeight);

    pageContainer.innerHTML = `
        <div class="page-placeholder" id="placeholder-${pageNum}">
            <div class="page-placeholder-spinner"></div>
            <span>Page ${pageNum}</span>
        </div>
    `;

    elements.readerRenderArea.appendChild(pageContainer);
}

function getEstimateWidth() {
    const sel = state.settings.width;
    if (sel === 'narrow') return '600px';
    if (sel === 'wide') return '1050px';
    return '800px';
}

// ==========================================
// 8. Virtual Canvas Recycler (Performance Tuning)
// ==========================================
function initLazyRecycler(pdf) {
    const options = {
        root: null,
        rootMargin: '1200px 0px 1200px 0px', // Preloads up to 1.5 screens ahead for seamless scrolling
        threshold: 0.01
    };

    state.renderObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const pageNum = parseInt(entry.target.getAttribute('data-page-num'), 10);
            if (entry.isIntersecting) {
                renderPageCanvas(pdf, pageNum, entry.target);
            } else {
                recyclePageCanvas(pageNum, entry.target);
            }
        });
    }, options);

    document.querySelectorAll('.page-container').forEach(el => {
        state.renderObserver.observe(el);
    });

    setupActivePageScrollTracker();
}

async function renderPageCanvas(pdf, pageNum, container) {
    if (container.querySelector('canvas')) return; 

    try {
        const page = await pdf.getPage(pageNum);
        const qualityLevel = state.settings.quality;
        
        // Use crisp absolute scales instead of device ratios to prevent huge slow-to-render canvases
        let targetScaleFactor = 1.4; // default medium
        if (qualityLevel === 'low') targetScaleFactor = 0.95;
        if (qualityLevel === 'high') targetScaleFactor = 2.0;

        const baseViewport = page.getViewport({ scale: 1.0 });
        const realWidth = container.clientWidth || 800;
        const targetScale = (realWidth / baseViewport.width) * targetScaleFactor;
        const viewport = page.getViewport({ scale: targetScale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        const ctx = canvas.getContext('2d');
        const renderTask = page.render({ canvasContext: ctx, viewport: viewport });
        
        container.activeRenderTask = renderTask;
        await renderTask.promise;

        container.innerHTML = '';
        container.appendChild(canvas);
        container.style.minHeight = 'auto'; 
        container.activeRenderTask = null;

        preloadNextPage(pdf, pageNum);

    } catch (err) {
        if (err.name === 'RenderingCancelledException') return;
        console.error(`Render fail page ${pageNum}`, err);
    }
}

function recyclePageCanvas(pageNum, container) {
    if (container.activeRenderTask) {
        container.activeRenderTask.cancel();
        container.activeRenderTask = null;
    }

    if (container.querySelector('canvas')) {
        container.innerHTML = `
            <div class="page-placeholder" id="placeholder-${pageNum}">
                <div class="page-placeholder-spinner"></div>
                <span>Page ${pageNum}</span>
            </div>
        `;
        container.style.minHeight = container.getAttribute('data-est-height');
    }
}

function preloadNextPage(pdf, pageNum) {
    const nextNum = pageNum + 1;
    if (nextNum > pdf.numPages) return;

    const nextContainer = document.getElementById(`page-wrapper-${nextNum}`);
    if (nextContainer && !nextContainer.querySelector('canvas') && !nextContainer.activeRenderTask) {
        renderPageCanvas(pdf, nextNum, nextContainer);
    }
}

function setupActivePageScrollTracker() {
    const trackerOptions = {
        root: null,
        rootMargin: '-20% 0px -60% 0px', 
        threshold: 0
    };

    const tracker = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageNum = parseInt(entry.target.getAttribute('data-page-num'), 10);
                state.currentPageNum = pageNum;
                elements.pageJumpSelect.value = pageNum;
                saveProgress(state.activeChapterIndex, pageNum);
            }
        });
    }, trackerOptions);

    document.querySelectorAll('.page-container').forEach(el => tracker.observe(el));
}

// ==========================================
// 9. Progress and UI Configuration Controls
// ==========================================
function saveProgress(chapIdx, pageNum) {
    if (!state.activeManhwa) return;
    state.history[state.activeManhwa.id] = {
        chapterIndex: chapIdx,
        pageNum: pageNum,
        timestamp: Date.now()
    };
    localStorage.setItem('starlight_history', JSON.stringify(state.history));
}

function jumpToPage(pageNum) {
    const el = document.getElementById(`page-wrapper-${pageNum}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateNavButtons() {
    elements.prevChapBtn.disabled = state.activeChapterIndex === 0;
    elements.nextChapBtn.disabled = state.activeChapterIndex === (state.activeManhwa.chapters.length - 1);
}

function applyRenderingSettings() {
    const settings = state.settings;
    const renderArea = elements.readerRenderArea;

    renderArea.className = `reader-render-area width-${settings.width} gap-${settings.gap} filter-${settings.filter}`;
    
    const isPaged = settings.mode === 'paged';
    document.querySelectorAll('.page-container').forEach(wrap => {
        const pageNum = parseInt(wrap.getAttribute('data-page-num'), 10);
        if (isPaged) {
            if (pageNum === state.currentPageNum) {
                wrap.style.display = 'flex';
                if (state.currentPDFDoc && !wrap.querySelector('canvas')) {
                    renderPageCanvas(state.currentPDFDoc, pageNum, wrap);
                }
            } else {
                wrap.style.display = 'none';
            }
        } else {
            wrap.style.display = 'flex';
        }
    });

    localStorage.setItem('starlight_settings', JSON.stringify(settings));
}

// ==========================================
// 10. Interactive Settings Handlers
// ==========================================
function setupDrawerButtons() {
    const mapSetting = (groupId, stateKey) => {
        const buttons = document.querySelectorAll(`#${groupId} .settings-option`);
        buttons.forEach(btn => {
            if (btn.getAttribute('data-value') === state.settings[stateKey]) {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            }

            btn.addEventListener('click', (e) => {
                buttons.forEach(b => b.classList.remove('active'));
                const val = e.target.getAttribute('data-value');
                e.target.classList.add('active');
                state.settings[stateKey] = val;
                applyRenderingSettings();
            });
        });
    };

    mapSetting('setting-mode', 'mode');
    mapSetting('setting-filter', 'filter');
    mapSetting('setting-width', 'width');
    mapSetting('setting-gap', 'gap');
    mapSetting('setting-quality', 'quality');
}

function setupKeybindings() {
    window.addEventListener('keydown', (e) => {
        if (state.currentView !== 'reader') return;

        if (state.settings.mode === 'paged') {
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                if (state.currentPageNum < state.currentPDFDoc.numPages) {
                    state.currentPageNum++;
                    applyRenderingSettings();
                    elements.pageJumpSelect.value = state.currentPageNum;
                }
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (state.currentPageNum > 1) {
                    state.currentPageNum--;
                    applyRenderingSettings();
                    elements.pageJumpSelect.value = state.currentPageNum;
                }
            }
        } else {
            if (e.key === 'ArrowDown') {
                window.scrollBy({ top: 120, behavior: 'smooth' });
            } else if (e.key === 'ArrowUp') {
                window.scrollBy({ top: -120, behavior: 'smooth' });
            }
        }
    });
}

function switchView(target) {
    state.currentView = target;
    Object.keys(views).forEach(key => {
        if (key === target) {
            views[key].classList.remove('hidden');
        } else {
            views[key].classList.add('hidden');
        }
    });

    window.scrollTo({ top: 0 });

    if (target === 'home') {
        elements.btnHome.classList.add('active');
    } else {
        elements.btnHome.classList.remove('active');
    }
}

function showLoading(text) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

// ==========================================
// 11. Initialization Bootstrapping
// ==========================================
function initEvents() {
    elements.navLogo.addEventListener('click', () => {
        renderHomeGrid();
        switchView('home');
    });
    elements.btnHome.addEventListener('click', () => {
        renderHomeGrid();
        switchView('home');
    });

    elements.themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
    });

    elements.detailsBackBtn.addEventListener('click', () => {
        renderHomeGrid();
        switchView('home');
    });

    elements.readerBackBtn.addEventListener('click', () => {
        if (state.renderObserver) state.renderObserver.disconnect();
        loadDetailsView(state.activeManhwa);
    });

    elements.readerSelect.addEventListener('change', (e) => {
        openReader(parseInt(e.target.value, 10), 1);
    });

    elements.pageJumpSelect.addEventListener('change', (e) => {
        const page = parseInt(e.target.value, 10);
        if (state.settings.mode === 'paged') {
            state.currentPageNum = page;
            applyRenderingSettings();
        } else {
            jumpToPage(page);
        }
    });

    elements.prevChapBtn.addEventListener('click', () => {
        if (state.activeChapterIndex > 0) openReader(state.activeChapterIndex - 1, 1);
    });

    elements.nextChapBtn.addEventListener('click', () => {
        if (state.activeChapterIndex < state.activeManhwa.chapters.length - 1) {
            openReader(state.activeChapterIndex + 1, 1);
        }
    });

    elements.btnToggleSettings.addEventListener('click', () => {
        elements.settingsDrawer.classList.toggle('hidden');
        elements.btnToggleSettings.classList.toggle('active');
    });

    elements.detailFavBtn.addEventListener('click', () => {
        if (state.activeManhwa) {
            toggleFavorite(state.activeManhwa.id);
            const isFav = state.favorites.includes(state.activeManhwa.id);
            elements.detailFavBtn.innerHTML = isFav ? '★' : '☆';
            elements.detailFavBtn.className = `btn-star ${isFav ? 'active' : ''}`;
        }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.currentView === 'reader' && state.currentPDFDoc) {
                document.querySelectorAll('.page-container').forEach(container => {
                    const canvas = container.querySelector('canvas');
                    if (canvas) {
                        const pageNum = parseInt(container.getAttribute('data-page-num'), 10);
                        renderPageCanvas(state.currentPDFDoc, pageNum, container);
                    }
                });
            }
        }, 150);
    });

    setupDrawerButtons();
    setupKeybindings();
}

document.addEventListener('DOMContentLoaded', async () => {
    initEvents();
    await loadDynamicLibrary();
    renderHomeGrid();
    switchView('home');
});
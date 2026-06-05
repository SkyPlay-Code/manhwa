// Ensure PDF.js Worker is loaded globally
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ==========================================
// 1. Manhwa Data Configuration
// ==========================================
// Since JS cannot directly index your system folders, customize this array matching your local files.
const manhwaData = [
    {
        id: "the-crows-prince",
        title: "The Crow's Prince",
        folder: "The_Crow's_Prince",
        description: "A young woman undergoes a surreal transition after an unexpected death, waking up in the body of a humble crow in a fantasy realm where empires and magic collide.",
        // Map the array of filenames matching what is inside your local folders:
        chapters: [
            "Chapter_001.pdf",
            "Chapter_002.pdf",
            "Chapter_003.pdf"
        ]
    },
    {
        id: "the-empresses-two-wolves",
        title: "The Empresses Two Wolves",
        folder: "The_Empresses_Two_Wolves",
        description: "An elegant court story rich with intrigue and powerful shape-shifting guardians. Follow the delicate alliance formed to protect the throne.",
        chapters: [
            "Chapter_001.pdf",
            "Chapter_002.pdf",
            "Chapter_003.pdf"
        ]
    },
    {
        id: "the-price-of-a-broken-engagement",
        title: "The Price of a Broken Engagement",
        folder: "The_Price_of_a_Broken_Engagement",
        description: "Betrayal forces a proud noblewoman to rewrite her destiny. A tale of absolute resolve, romance, and demanding payment for a shattered vow.",
        chapters: [
            "Chapter_000.pdf",
            "Chapter_001.pdf",
            "Chapter_002.pdf",
            "Chapter_003.pdf"
        ]
    }
];

// ==========================================
// 2. Application State
// ==========================================
const state = {
    currentView: 'home', // 'home', 'details', 'reader'
    activeManhwa: null,
    activeChapterIndex: 0,
    theme: 'dark',
    renderObserver: null,
    currentPDFDoc: null
};

// ==========================================
// 3. Dom Selection Elements
// ==========================================
const views = {
    home: document.getElementById('home-view'),
    details: document.getElementById('details-view'),
    reader: document.getElementById('reader-view')
};

const elements = {
    manhwaGrid: document.getElementById('manhwa-grid'),
    detailTitle: document.getElementById('detail-title'),
    detailCover: document.getElementById('detail-cover'),
    detailDesc: document.getElementById('detail-description'),
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
    nextChapBtn: document.getElementById('next-chap-btn')
};

// ==========================================
// 4. View Controller Navigation
// ==========================================
function switchView(targetView) {
    state.currentView = targetView;
    Object.keys(views).forEach(key => {
        if (key === targetView) {
            views[key].classList.remove('hidden');
        } else {
            views[key].classList.add('hidden');
        }
    });

    // Reset window offset when toggling views
    window.scrollTo({ top: 0 });

    if (targetView === 'home') {
        elements.btnHome.classList.add('active');
    } else {
        elements.btnHome.classList.remove('active');
    }
}

function showLoading(text = 'Loading Pages...') {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

// ==========================================
// 5. Data Rendering Engines
// ==========================================
function renderHomeGrid() {
    elements.manhwaGrid.innerHTML = '';
    manhwaData.forEach(manhwa => {
        const card = document.createElement('div');
        card.className = 'manhwa-card';
        card.innerHTML = `
            <div class="card-cover">
                <h3>${manhwa.title}</h3>
            </div>
            <div class="card-content">
                <p class="card-desc">${manhwa.description}</p>
                <div class="card-meta">${manhwa.chapters.length} Chapters Available</div>
            </div>
        `;
        card.addEventListener('click', () => loadDetailsView(manhwa));
        elements.manhwaGrid.appendChild(card);
    });
}

function loadDetailsView(manhwa) {
    state.activeManhwa = manhwa;
    elements.detailTitle.textContent = manhwa.title;
    elements.detailDesc.textContent = manhwa.description;
    
    // Style placeholder cover similarly
    elements.detailCover.innerHTML = `<h3 style="color:#ffffff; text-align:center; padding:1.5rem;">${manhwa.title}</h3>`;

    // Render chapters
    elements.chapterGrid.innerHTML = '';
    manhwa.chapters.forEach((chapterName, idx) => {
        const cleanName = chapterName.replace('.pdf', '').replace('_', ' ');
        const btn = document.createElement('button');
        btn.className = 'chapter-btn';
        btn.innerHTML = `
            <span>${cleanName}</span>
            <span class="badge">PDF</span>
        `;
        btn.addEventListener('click', () => openReader(idx));
        elements.chapterGrid.appendChild(btn);
    });

    switchView('details');
}

// ==========================================
// 6. Reader Engine (Intersection Observer & PDF Canvas)
// ==========================================
async function openReader(chapterIndex) {
    if (!state.activeManhwa) return;
    state.activeChapterIndex = chapterIndex;
    
    const chapterName = state.activeManhwa.chapters[chapterIndex];
    const manhwaPath = `${state.activeManhwa.folder}/${chapterName}`;

    showLoading(`Loading ${state.activeManhwa.title}...`);
    switchView('reader');

    // Display updates
    elements.readerTitleDisplay.textContent = state.activeManhwa.title;
    setupReaderDropdown();

    // Reset layout area
    elements.readerRenderArea.innerHTML = '';
    if (state.renderObserver) {
        state.renderObserver.disconnect();
    }

    try {
        // Load target PDF using PDFJS
        const loadingTask = pdfjsLib.getDocument(manhwaPath);
        const pdf = await loadingTask.promise;
        state.currentPDFDoc = pdf;

        // Build container boundaries first for continuous scrolling layout
        const numPages = pdf.numPages;
        
        // Fetch first page to estimate aspect ratios
        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1.5 });
        const aspectRatio = viewport.height / viewport.width;

        // Build out container shells
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            createPagePlaceholder(pageNum, aspectRatio);
        }

        // Initialize lazy loader Observer
        initLazyLoader(pdf);
        updateNavButtons();

    } catch (error) {
        console.error("Error loading PDF chapter:", error);
        elements.readerRenderArea.innerHTML = `
            <div style="text-align:center; padding: 4rem 1rem; color: var(--text-muted)">
                <h3>Failed to load PDF file.</h3>
                <p style="margin-top: 1rem;">Please make sure the file exists at <strong>/${manhwaPath}</strong> and that you are using a local web server.</p>
            </div>
        `;
    } finally {
        hideLoading();
    }
}

// Setup the Select dropdown menu
function setupReaderDropdown() {
    elements.readerSelect.innerHTML = '';
    state.activeManhwa.chapters.forEach((chap, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.textContent = chap.replace('.pdf', '').replace('_', ' ');
        if (idx === state.activeChapterIndex) {
            option.selected = true;
        }
        elements.readerSelect.appendChild(option);
    });
}

// Setup placeholders before viewport loads pages
function createPagePlaceholder(pageNum, aspectRatio) {
    const pageDiv = document.createElement('div');
    pageDiv.className = 'page-container';
    pageDiv.id = `page-wrapper-${pageNum}`;
    pageDiv.setAttribute('data-page-num', pageNum);
    
    // Set explicit proportional height to prevent screen jump during scroll
    pageDiv.style.minHeight = `calc(var(--reader-width, 850px) * ${aspectRatio})`;

    // Placeholder inside structure
    pageDiv.innerHTML = `
        <div class="page-placeholder" id="placeholder-${pageNum}">
            <div class="page-placeholder-spinner"></div>
            <span>Page ${pageNum}</span>
        </div>
    `;

    elements.readerRenderArea.appendChild(pageDiv);
}

// Viewport intersection dynamic loader
function initLazyLoader(pdf) {
    const observerOptions = {
        root: null, // screen viewport
        rootMargin: '400px 0px', // start loading before the user scrolls directly onto it
        threshold: 0.01
    };

    state.renderObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageNum = parseInt(entry.target.getAttribute('data-page-num'), 10);
                renderPageCanvas(pdf, pageNum, entry.target);
                observer.unobserve(entry.target); // Unobserve once loaded
            }
        });
    }, observerOptions);

    // Observe each container
    document.querySelectorAll('.page-container').forEach(container => {
        state.renderObserver.observe(container);
    });
}

// Convert individual PDF Page matrix onto canvas
async function renderPageCanvas(pdf, pageNum, container) {
    try {
        const page = await pdf.getPage(pageNum);
        
        // Generate high resolution using 2x device scale layout
        const baseViewport = page.getViewport({ scale: 1.0 });
        const containerWidth = container.clientWidth;
        const scale = (containerWidth / baseViewport.width) * 2; 
        const viewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Visual append
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // Clear placeholders and load Canvas output safely
        container.innerHTML = '';
        container.appendChild(canvas);
        container.style.minHeight = 'auto'; // release strict spacer

    } catch (err) {
        console.error(`Page ${pageNum} render fail:`, err);
        const placeholder = document.getElementById(`placeholder-${pageNum}`);
        if (placeholder) {
            placeholder.innerHTML = `<span style="color:red">Page ${pageNum} Load Failed</span>`;
        }
    }
}

// Nav Buttons active/disable logic
function updateNavButtons() {
    elements.prevChapBtn.disabled = state.activeChapterIndex === 0;
    elements.nextChapBtn.disabled = state.activeChapterIndex === (state.activeManhwa.chapters.length - 1);
}

// ==========================================
// 7. Event Handlers & Core Init
// ==========================================
function initEvents() {
    // Nav Logos
    elements.navLogo.addEventListener('click', () => switchView('home'));
    elements.btnHome.addEventListener('click', () => switchView('home'));

    // Theme Switch System
    elements.themeToggle.addEventListener('click', () => {
        if (document.body.classList.contains('dark-theme')) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            state.theme = 'light';
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            state.theme = 'dark';
        }
    });

    // Details Back Button
    elements.detailsBackBtn.addEventListener('click', () => switchView('home'));

    // Reader Back Button
    elements.readerBackBtn.addEventListener('click', () => {
        if (state.renderObserver) state.renderObserver.disconnect();
        switchView('details');
    });

    // Reader Chapter Select Change
    elements.readerSelect.addEventListener('change', (e) => {
        openReader(parseInt(e.target.value, 10));
    });

    // Width Adjustments Control
    const widthButtons = document.querySelectorAll('.width-btn');
    widthButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            widthButtons.forEach(b => b.classList.remove('active'));
            const selection = e.target.getAttribute('data-width');
            e.target.classList.add('active');

            // Apply style classes
            elements.readerRenderArea.className = `reader-render-area width-${selection}`;

            // Adjust responsive sizing scale variables
            let widthValue = '850px';
            if (selection === 'narrow') widthValue = '650px';
            if (selection === 'wide') widthValue = '1100px';
            document.documentElement.style.setProperty('--reader-width', widthValue);

            // Trigger window resize event to redraw currently visible lazy canvas boundaries
            window.dispatchEvent(new Event('resize'));
        });
    });

    // Chapter Pagination Arrows
    elements.prevChapBtn.addEventListener('click', () => {
        if (state.activeChapterIndex > 0) {
            openReader(state.activeChapterIndex - 1);
        }
    });

    elements.nextChapBtn.addEventListener('click', () => {
        if (state.activeChapterIndex < state.activeManhwa.chapters.length - 1) {
            openReader(state.activeChapterIndex + 1);
        }
    });

    // Handle Window Resize (re-adjust rendering bounds dynamically)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (state.currentView === 'reader' && state.currentPDFDoc) {
                // Keep the current reader states but update lazy boundaries safely
                const renderArea = elements.readerRenderArea;
                const visibleContainers = renderArea.querySelectorAll('.page-container');
                
                visibleContainers.forEach(container => {
                    const canvas = container.querySelector('canvas');
                    if (canvas) {
                        const pageNum = parseInt(container.getAttribute('data-page-num'), 10);
                        renderPageCanvas(state.currentPDFDoc, pageNum, container);
                    }
                });
            }
        }, 300);
    });
}

// Boot up Site Grid// Ensure PDFJS worker scale points to dynamic CDN dependencies
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ==========================================
// 1. App Configuration Matrix
// ==========================================
const CONFIG = {
    // If testing on localhost, optionally hardcode your GitHub owner/repo to load files via API:
    githubOwner: "", 
    githubRepo: "",
    
    // Fallback static schema if offline or running in an isolated network environment
    fallbackData: [
        {
            id: "the-crows-prince",
            title: "The Crow's Prince",
            folder: "The_Crow's_Prince",
            description: "A young woman undergoes a surreal transition after an unexpected death, waking up in the body of a humble crow in a fantasy realm where empires and magic collide.",
            chapters: ["Chapter_001.pdf", "Chapter_002.pdf", "Chapter_003.pdf"]
        },
        {
            id: "the-empresses-two-wolves",
            title: "The Empresses Two Wolves",
            folder: "The_Empresses_Two_Wolves",
            description: "An elegant court story rich with intrigue and powerful shape-shifting guardians. Follow the delicate alliance formed to protect the throne.",
            chapters: ["Chapter_001.pdf", "Chapter_002.pdf", "Chapter_003.pdf"]
        },
        {
            id: "the-price-of-a-broken-engagement",
            title: "The Price of a Broken Engagement",
            folder: "The_Price_of_a_Broken_Engagement",
            description: "Betrayal forces a proud noblewoman to rewrite her destiny. A tale of absolute resolve, romance, and demanding payment for a shattered vow.",
            chapters: ["Chapter_000.pdf", "Chapter_001.pdf", "Chapter_002.pdf", "Chapter_003.pdf"]
        }
    ]
};

// ==========================================
// 2. Main Memory State
// ==========================================
const state = {
    currentView: 'home',
    manhwas: [], // Populated dynamically
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
// 3. GitHub API Directory Scraping Layer
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

// Memory-saving local storage fetch wrapper
async function fetchCachedAPI(url) {
    const cacheKey = `starlight_api_${url}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 300000) { // 5-minute Cache TTL
            return parsed.data;
        }
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
}

// Convert folder name to Title
function formatTitle(name) {
    return name.replace(/_/g, ' ').replace(/-/g, ' ');
}

// Handles folders named with chapters, versions, or extra segments (e.g. Chapter_2.5.pdf)
function naturalSort(array, getVal = (v) => v) {
    return array.sort((a, b) => {
        const valA = getVal(a);
        const valB = getVal(b);
        const numA = parseFloat(valA.match(/\d+(\.\d+)?/)?.[0] || 0);
        const numB = parseFloat(valB.match(/\d+(\.\d+)?/)?.[0] || 0);
        if (numA !== numB) return numA - numB;
        return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    });
}

async function loadDynamicLibrary() {
    showLoading("Parsing repository folders...");
    const repoInfo = getRepoDetails();
    
    if (!repoInfo) {
        console.warn("Not hosted on GitHub Pages and CONFIG is empty. Using local fallback.");
        state.manhwas = CONFIG.localFallback;
        hideLoading();
        return;
    }

    try {
        const apiRoot = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/`;
        const rootItems = await fetchCachedAPI(apiRoot);
        const folders = rootItems.filter(item => item.type === 'dir' && !item.name.startsWith('.') && !['css', 'js', 'images', 'assets'].includes(item.name));

        const scrapedLibrary = [];
        for (const f of folders) {
            const folderApi = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${f.path}`;
            const folderItems = await fetchCachedAPI(folderApi);
            
            // Collect PDFs and sort them naturally
            const pdfFiles = folderItems.filter(item => item.name.endsWith('.pdf'));
            if (pdfFiles.length === 0) continue;
            
            const sortedPDFs = naturalSort(pdfFiles, (x) => x.name).map(x => x.name);

            // Fetch metadata file if it exists, otherwise generate fallback
            let desc = "No description provided.";
            let title = formatTitle(f.name);
            const metadataFile = folderItems.find(item => item.name.toLowerCase() === 'metadata.json');
            if (metadataFile) {
                try {
                    const metaData = await (await fetch(metadataFile.download_url)).json();
                    if (metaData.description) desc = metaData.description;
                    if (metaData.title) title = metaData.title;
                } catch(e) {
                    console.warn("Metadata load failed for", f.name);
                }
            }

            scrapedLibrary.push({
                id: f.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                title: title,
                folder: f.path,
                description: desc,
                chapters: sortedPDFs
            });
        }
        state.manhwas = scrapedLibrary;
    } catch(err) {
        console.error("Failed parsing GitHub repo structure. Using fallback.", err);
        state.manhwas = CONFIG.localFallback;
    } finally {
        hideLoading();
    }
}

// ==========================================
// 4. Page Cover Extraction Engine
// ==========================================
async function tryGenerateCover(manhwa, callback) {
    const cacheKey = `starlight_cov_${manhwa.id}`;
    const cachedImg = localStorage.getItem(cacheKey);
    if (cachedImg) {
        callback(cachedImg);
        return;
    }

    try {
        // Build path relative to site execution root
        const targetChapter = manhwa.chapters[0];
        const docPath = `${manhwa.folder}/${targetChapter}`;
        
        const loadingTask = pdfjsLib.getDocument(docPath);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = 150 / viewport.width; // Small high-density thumbnail size
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
        // Fallback to stylized character title
        callback(null);
    }
}

// ==========================================
// 5. Library Rendering Engines
// ==========================================
function renderHomeGrid() {
    elements.manhwaGrid.innerHTML = '';
    elements.favoritesGrid.innerHTML = '';
    
    let hasFavorites = false;

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

        // Load card actions
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-star')) {
                e.stopPropagation();
                toggleFavorite(m.id);
                return;
            }
            loadDetailsView(m);
        });

        // Lazy-render PDF cover frame
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
            elements.manhwaGrid.appendChild(card.cloneNode(true));
        }
    });

    // Rebind cloned grid items
    if (hasFavorites) {
        elements.favoritesSection.classList.remove('hidden');
    } else {
        elements.favoritesSection.classList.add('hidden');
    }

    // Re-attach listeners for standard grid cloned items
    Array.from(elements.manhwaGrid.children).forEach((node, idx) => {
        const originalIndex = state.manhwas.filter(m => !state.favorites.includes(m.id))[idx];
        if (originalIndex) {
            node.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-star')) {
                    e.stopPropagation();
                    toggleFavorite(originalIndex.id);
                    return;
                }
                loadDetailsView(originalIndex);
            });
        }
    });
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

function loadDetailsView(manhwa) {
    state.activeManhwa = manhwa;
    elements.detailTitle.textContent = manhwa.title;
    elements.detailDesc.textContent = manhwa.description;

    const isFav = state.favorites.includes(manhwa.id);
    elements.detailFavBtn.innerHTML = isFav ? '★' : '☆';
    elements.detailFavBtn.className = `btn-star ${isFav ? 'active' : ''}`;

    // Set cover preview on details view
    elements.detailCover.innerHTML = `<div class="card-cover-fallback">${manhwa.title.charAt(0)}</div>`;
    tryGenerateCover(manhwa, (dataUrl) => {
        if (dataUrl) {
            elements.detailCover.innerHTML = `<img src="${dataUrl}" alt="cover">`;
        }
    });

    // Track "Continue reading" index records
    const record = state.history[manhwa.id];
    if (record && record.chapterIndex < manhwa.chapters.length) {
        elements.btnContinueReading.classList.remove('hidden');
        elements.btnContinueReading.querySelector('span').textContent = `Continue Ch. ${record.chapterIndex + 1}`;
        elements.btnContinueReading.onclick = () => openReader(record.chapterIndex, record.pageNum);
    } else {
        elements.btnContinueReading.onclick = () => openReader(0, 1);
        elements.btnContinueReading.querySelector('span').textContent = "Start Reading";
    }

    // Render detailed rows
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
// 6. Reader Engine (Intersection Observer & Canvas Recycling)
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

    // Reset rendering frames
    elements.readerRenderArea.innerHTML = '';
    if (state.renderObserver) state.renderObserver.disconnect();

    try {
        const loadingTask = pdfjsLib.getDocument(docPath);
        const pdf = await loadingTask.promise;
        state.currentPDFDoc = pdf;

        const numPages = pdf.numPages;
        
        // Use first page height metrics to pre-calculate layout boundaries
        const firstPage = await pdf.getPage(1);
        const viewPort = firstPage.getViewport({ scale: 1.0 });
        const estimatedRatio = viewPort.height / viewPort.width;

        // Build continuous shell layout
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            createPagePlaceholder(pageNum, estimatedRatio);
        }

        // Initialize drop selectors
        setupPageSelectors(numPages);
        initLazyRecycler(pdf);
        updateNavButtons();

        // Save progress history state
        saveProgress(chapterIdx, pageNumToLoad);

        // Jump to target page layout
        if (pageNumToLoad > 1) {
            setTimeout(() => jumpToPage(pageNumToLoad), 400);
        }

    } catch (err) {
        console.error("PDF engine crash: ", err);
        elements.readerRenderArea.innerHTML = `
            <div style="text-align:center; padding: 4rem 1rem; color: var(--text-muted)">
                <h3 style="font-family: var(--font-heading); font-size:1.2rem; color:var(--text-main);">Error Loading Chapter</h3>
                <p style="margin-top:0.5rem; font-size:0.85rem;">Make sure file exits at <strong>${docPath}</strong></p>
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

    // Save height metric to prevent screen jump when canvases load/unload
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
// 7. Advanced Intersection Observer (Virtual Canvas Recycler)
// ==========================================
function initLazyRecycler(pdf) {
    // Render adjacent pages to make scrolling smooth and fast
    const options = {
        root: null,
        rootMargin: '600px 0px 600px 0px', // Pre-renders elements 600px above/below viewport
        threshold: 0.01
    };

    state.renderObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const pageNum = parseInt(entry.target.getAttribute('data-page-num'), 10);
            
            if (entry.isIntersecting) {
                // Render visible page canvas
                renderPageCanvas(pdf, pageNum, entry.target);
            } else {
                // Destroy off-screen canvas to free up GPU and browser memory
                recyclePageCanvas(pageNum, entry.target);
            }
        });
    }, options);

    // Monitor all pages
    document.querySelectorAll('.page-container').forEach(el => {
        state.renderObserver.observe(el);
    });

    // Setup active viewport tracker
    setupActivePageScrollTracker();
}

// Convert PDF page vector stream directly to HTML5 Canvas
async function renderPageCanvas(pdf, pageNum, container) {
    if (container.querySelector('canvas')) return; // Already rendered

    try {
        const page = await pdf.getPage(pageNum);
        const qualityLevel = state.settings.quality;
        
        let multiplier = window.devicePixelRatio || 1;
        if (qualityLevel === 'low') multiplier = 0.8;
        if (qualityLevel === 'medium') multiplier = 1.3;
        if (qualityLevel === 'high') multiplier = 2.0;

        const baseViewport = page.getViewport({ scale: 1.0 });
        const realWidth = container.clientWidth || 800;
        const targetScale = (realWidth / baseViewport.width) * multiplier;
        const viewport = page.getViewport({ scale: targetScale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

        const ctx = canvas.getContext('2d');
        const renderTask = page.render({ canvasContext: ctx, viewport: viewport });
        
        // Store task to safely cancel if unobserved mid-render
        container.activeRenderTask = renderTask;

        await renderTask.promise;

        container.innerHTML = '';
        container.appendChild(canvas);
        container.style.minHeight = 'auto'; // Remove placeholder spacing
        container.activeRenderTask = null;

        // Proactive background preloader
        preloadNextPage(pdf, pageNum);

    } catch (err) {
        if (err.name === 'RenderingCancelledException') return;
        console.error(`Render fail page ${pageNum}`, err);
    }
}

function recyclePageCanvas(pageNum, container) {
    // Cancel active task safely
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
        // Run pre-render lazily in parallel threads
        renderPageCanvas(pdf, nextNum, nextContainer);
    }
}

// Real-time active page identification while scrolling
function setupActivePageScrollTracker() {
    const trackerOptions = {
        root: null,
        rootMargin: '-20% 0px -60% 0px', // Focus window on upper center screen
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
// 8. Progress and UI Configuration Controls
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

    // Apply viewport sizes
    renderArea.className = `reader-render-area width-${settings.width} gap-${settings.gap} filter-${settings.filter}`;
    
    // Manage Reading Modes
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
// 9. Interactive Settings Handlers
// ==========================================
function setupDrawerButtons() {
    const mapSetting = (groupId, stateKey) => {
        const buttons = document.querySelectorAll(`#${groupId} .settings-option`);
        buttons.forEach(btn => {
            // Apply loaded states
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

// Keyboard arrow controls for navigation
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
            // Standard smooth scroll step controls
            if (e.key === 'ArrowDown') {
                window.scrollBy({ top: 120, behavior: 'smooth' });
            } else if (e.key === 'ArrowUp') {
                window.scrollBy({ top: -120, behavior: 'smooth' });
            }
        }
    });
}

// Navigation helpers
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
// 10. Initialization Bootstrapping
// ==========================================
function initEvents() {
    elements.navLogo.addEventListener('click', () => switchView('home'));
    elements.btnHome.addEventListener('click', () => switchView('home'));

    // Theme toggle
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

    // Resize optimization throttler
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.currentView === 'reader' && state.currentPDFDoc) {
                // Readjust sizes on active viewport frames
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
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    renderHomeGrid();
    switchView('home');
});
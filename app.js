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

// Boot up Site Grid
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    renderHomeGrid();
    switchView('home');
});
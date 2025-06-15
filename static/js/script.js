// --- GLOBAL CONSTANTS & SETTINGS ---
const APP_SETTINGS_KEY = 'finvestikCalculatorSettings';
const THEME_KEY = 'finvestikTheme';
const ACTIVE_VIEW_KEY = 'finvestikActiveView';
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOqNgqIvbKgZ2SNvOAGkhW6iXxm1xXK_R1xCorTNDQkWRxod8-8G8x0isl1zTVHDVeHsfwfZfJLlkh/pub?output=csv";
const CUSTOM_INDEX_CACHE_KEY = 'finvestikCustomIndexCache';
const CUSTOM_INDEX_CACHE_DURATION_MS = 15 * 60 * 1000;

// --- DOM ELEMENTS (will be assigned later) ---
let themeToggle, navCalculator, navCustomIndex, calculatorView, customIndexView,
    customIndexLoading, customIndexError, customIndexMessage,
    customIndexTableHead, customIndexTableBody, customIndexLastUpdated,
    customIndexRefreshButton, allCalculatorInputs = [];

// --- HELPER FUNCTIONS (Theme, View Switching, etc.) ---
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-.386 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591" /></svg>`;
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>`;
function applyTheme(theme) { if (theme === 'light') { document.documentElement.classList.add('light'); if (themeToggle) themeToggle.innerHTML = moonIcon; } else { document.documentElement.classList.remove('light'); if (themeToggle) themeToggle.innerHTML = sunIcon; } }
function loadTheme() { const p=localStorage.getItem(THEME_KEY),s=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches; let c='dark'; if(p){c=p;}else if(!s && p === null){c='light';} applyTheme(c); return c; }
function saveTheme(theme) { window.localStorage.setItem(THEME_KEY, theme); }
function switchView(viewId) {
    if (calculatorView) calculatorView.classList.add('hidden');
    if (customIndexView) customIndexView.classList.add('hidden');
    if (navCalculator) navCalculator.classList.remove('active');
    if (navCustomIndex) navCustomIndex.classList.remove('active');
    const capitalInputContainer = document.querySelector('[role="region"][aria-labelledby="capital-heading"]');
    if (viewId === 'calculator-view' && calculatorView && navCalculator) {
        calculatorView.classList.remove('hidden'); navCalculator.classList.add('active');
        if (capitalInputContainer) capitalInputContainer.classList.remove('hidden');
    } else if (viewId === 'custom-index-view' && customIndexView && navCustomIndex) {
        customIndexView.classList.remove('hidden'); navCustomIndex.classList.add('active');
        if (capitalInputContainer) capitalInputContainer.classList.add('hidden');
        fetchAndRenderCustomIndexData();
    }
    localStorage.setItem(ACTIVE_VIEW_KEY, viewId);
}

// --- CSV PARSING ---
function parseCSV(csvText) {
    console.log("DEBUG: Entering parseCSV function.");
    if (!csvText || typeof csvText !== 'string') {
        console.error("DEBUG: parseCSV received invalid input:", csvText);
        return [];
    }
    const lines = csvText.replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) {
        console.warn("DEBUG: CSV has less than 2 lines (no data rows).");
        return [];
    }
    const headers = lines[0].split(',').map(h => h.trim());
    console.log("DEBUG: Parsed headers:", headers);
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length !== headers.length) {
            console.warn(`DEBUG: Skipping malformed row ${i+1}. Expected ${headers.length} values, got ${values.length}. Row content:`, lines[i]);
            continue;
        }
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = values[j];
        }
        result.push(obj);
    }
    console.log(`DEBUG: parseCSV finished. Parsed ${result.length} rows.`);
    return result;
}

// --- DATA FETCHING & RENDERING (with DEBUG logs) ---
async function fetchAndRenderCustomIndexData(options = { force: false }) {
    console.log(`DEBUG: fetchAndRenderCustomIndexData called. Force refresh: ${options.force}`);
    
    // Check for cached data
    try {
        const cachedDataJSON = localStorage.getItem(CUSTOM_INDEX_CACHE_KEY);
        if (cachedDataJSON && !options.force) {
            const cache = JSON.parse(cachedDataJSON);
            const isCacheFresh = (Date.now() - cache.timestamp) < CUSTOM_INDEX_CACHE_DURATION_MS;
            if (isCacheFresh) {
                console.log("DEBUG: Using fresh data from cache.");
                renderCustomIndexTable(cache.data, `Cached at: ${new Date(cache.timestamp).toLocaleString()}`);
                return;
            } else {
                console.log("DEBUG: Cache found but is stale.");
            }
        } else {
             console.log("DEBUG: No cache found or refresh is forced.");
        }
    } catch (e) {
        console.error("DEBUG: Error reading from cache:", e);
    }

    // UI updates for loading state
    customIndexLoading.classList.remove('hidden');
    customIndexError.classList.add('hidden');
    customIndexMessage.classList.remove('hidden');
    customIndexMessage.textContent = 'Fetching latest data...';

    try {
        console.log("DEBUG: Fetching from URL:", GOOGLE_SHEET_CSV_URL);
        const response = await fetch(GOOGLE_SHEET_CSV_URL, { cache: "no-store" });
        console.log("DEBUG: Fetch response received:", response);

        if (!response.ok) {
            throw new Error(`Network response was not ok. Status: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        console.log("--- START RAW CSV TEXT ---");
        console.log(csvText);
        console.log("--- END RAW CSV TEXT ---");

        if (!csvText || csvText.trim().length < 10) { // Check for meaningful content
             throw new Error("Received empty or invalid data from the sheet.");
        }

        const data = parseCSV(csvText);
        
        // Cache the new data
        try {
            const timestamp = Date.now();
            localStorage.setItem(CUSTOM_INDEX_CACHE_KEY, JSON.stringify({ data, timestamp }));
            console.log("DEBUG: Successfully saved new data to cache.");
            renderCustomIndexTable(data, `Fetched at: ${new Date(timestamp).toLocaleString()}`);
        } catch (e) {
            console.error("DEBUG: Failed to save to cache:", e);
             renderCustomIndexTable(data, `Fetched at: ${new Date().toLocaleString()} (caching failed)`);
        }
        
    } catch (err) {
        console.error("DEBUG: CATCH BLOCK - An error occurred during fetch/render:", err);
        customIndexLoading.classList.add('hidden');
        customIndexError.textContent = `Error: ${err.message}. Check the console for more details.`;
        customIndexError.classList.remove('hidden');
        customIndexMessage.classList.add('hidden');
        customIndexTableBody.innerHTML = `<tr><td colspan="2" class="text-center p-4">${err.message}</td></tr>`;
    }
}

function renderCustomIndexTable(data, timestampText) {
    console.log("DEBUG: Rendering table with", data ? data.length : 0, "rows.");
    customIndexLoading.classList.add('hidden');
    customIndexError.classList.add('hidden');
    customIndexMessage.classList.add('hidden');
    customIndexLastUpdated.textContent = timestampText;
    
    // Clear previous content
    customIndexTableHead.innerHTML = '';
    customIndexTableBody.innerHTML = '';

    if (!data || data.length === 0) {
        customIndexTableBody.innerHTML = '<tr><td colspan="2" class="text-center p-4">No data to display.</td></tr>';
        return;
    }
    
    const headers = Object.keys(data[0]);
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        headerRow.appendChild(th);
    });
    customIndexTableHead.appendChild(headerRow);
    
    data.forEach(item => {
        const row = document.createElement('tr');
        headers.forEach(header => {
            const cell = document.createElement('td');
            cell.textContent = item[header] || 'N/A';
            row.appendChild(cell);
        });
        customIndexTableBody.appendChild(row);
    });
    console.log("DEBUG: Table rendering complete.");
}


// --- DOMContentLoaded (Initial Setup) ---
document.addEventListener('DOMContentLoaded', () => {
    // Assign all DOM elements
    themeToggle = document.getElementById('theme-toggle');
    navCalculator = document.getElementById('nav-calculator');
    navCustomIndex = document.getElementById('nav-custom-index');
    calculatorView = document.getElementById('calculator-view');
    customIndexView = document.getElementById('custom-index-view');
    customIndexLoading = document.getElementById('custom-index-loading');
    customIndexError = document.getElementById('custom-index-error');
    customIndexMessage = document.getElementById('custom-index-message');
    customIndexTableHead = document.querySelector('#custom-index-table thead');
    customIndexTableBody = document.querySelector('#custom-index-table tbody');
    customIndexLastUpdated = document.getElementById('custom-index-last-updated');
    customIndexRefreshButton = document.getElementById('custom-index-refresh-button');
    
    // Add event listeners
    if (themeToggle) themeToggle.addEventListener('click', () => { const nT = document.documentElement.classList.contains('light') ? 'dark' : 'light'; applyTheme(nT); saveTheme(nT); });
    if (navCalculator) navCalculator.addEventListener('click', () => switchView('calculator-view'));
    if (navCustomIndex) navCustomIndex.addEventListener('click', () => switchView('custom-index-view'));
    if (customIndexRefreshButton) customIndexRefreshButton.addEventListener('click', () => fetchAndRenderCustomIndexData({ force: true }));
    // Other event listeners for calculator, copy, export etc. would go here

    // Initial load
    loadTheme();
    const lastView = localStorage.getItem(ACTIVE_VIEW_KEY) || 'calculator-view';
    switchView(lastView);
});
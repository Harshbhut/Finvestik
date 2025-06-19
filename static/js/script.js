// --- GLOBAL CONSTANTS & SETTINGS ---
const APP_SETTINGS_KEY = 'finvestikCalculatorSettings';
const THEME_KEY = 'finvestikTheme';
const ACTIVE_VIEW_KEY = 'finvestikActiveView';
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOqNgqIvbKgZ2SNvOAGkhW6iXxm1xXK_R1xCorTNDQkWRxod8-8G8x0isl1zTVHDVeHsfwfZfJLlkh/pub?output=csv";
// UPDATED: Path to the JSON file
const STOCK_UNIVERSE_DATA_PATH = "static/data/stock_universe.json"; 
const CUSTOM_INDEX_CACHE_KEY = 'finvestikCustomIndexCache';
const CUSTOM_INDEX_CACHE_DURATION_MS = 15 * 60 * 1000;
const SU_COLUMN_ORDER_KEY = 'finvestikSUColumnOrderKey';
const SU_COLUMN_WIDTHS_KEY = 'finvestikSUColumnWidthsKey';


// --- DOM ELEMENTS ---
let finvestikLogo, themeToggle, hamburgerMenuButton, mobileMenu,
    navCalculator, navStockUniverse, navCustomIndex,
    mobileNavCalculator, mobileNavStockUniverse, mobileNavCustomIndex,
    calculatorView, customIndexView, stockUniverseView,
    capitalInputContainer, capitalInput, capitalError, riskRiskPercentInput, riskEntryPriceInput,
    riskSlPriceInput, riskRiskPercentError, riskEntryPriceError, riskSlPriceError, riskResultsContainer,
    riskCalculationWarning, riskErrorSummary, riskResultQty, riskResultRiskAmount, riskResultSlPercent,
    riskResultAllocationPercent, riskResultTotalCost, allocAllocationPercentInput, allocEntryPriceInput,
    allocSlPriceInput, allocAllocationPercentError, allocEntryPriceError, allocSlPriceError,
    allocResultsContainer, allocCalculationWarning, allocErrorSummary,
    customIndexTable, customIndexTableHead, customIndexTableBody, customIndexLoading, customIndexError, customIndexMessage, customIndexLastUpdated, customIndexCopyButton, customIndexExportButton, customIndexRefreshButton,
    suLoading, suError, suRowCount, suTable, suTableHeadElement, suTableBodyElement, suHeaderRow, suFilterRow, suExportButton,
    chartPopup, chartPopupContainer,
    allCalculatorInputs = [], currentYearElement;

// --- STATE MANAGEMENT ---
let currentCustomIndexData = [];
let fullStockData = [];
let suDefaultColumnHeaders = []; 
let suCurrentColumnOrder = []; 
let suColumnWidths = {}; 
let currentlyDisplayedSUData = [];
let isStockDataLoaded = false;
let suCurrentSort = { key: 'Market Cap', order: 'desc' };
let suFilters = { marketCap: { query: '' }, columns: {} };
let chartPopupTimeout;
let sortableInstance = null; 
let currentResizing = { th: null, startX: 0, startWidth: 0 };


// --- THEME & VIEW MANAGEMENT ---
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-.386 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591" /></svg>`;
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>`;

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.classList.add('light');
        if (themeToggle) themeToggle.innerHTML = moonIcon;
    } else {
        document.documentElement.classList.remove('light');
        if (themeToggle) themeToggle.innerHTML = sunIcon;
    }
    if (chartPopup && !chartPopup.classList.contains('hidden') && chartPopupContainer.querySelector('iframe')) {
       const symbol = chartPopupContainer.dataset.currentSymbol;
       if (symbol) createTradingViewWidget(symbol, theme);
    }
}
function loadTheme() { const p = localStorage.getItem(THEME_KEY); const s = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; let c = 'dark'; if (p) { c = p; } else if (!s) { c = 'light'; } applyTheme(c); }
function toggleAndSaveTheme() { const newTheme = document.documentElement.classList.contains('light') ? 'dark' : 'light'; applyTheme(newTheme); localStorage.setItem(THEME_KEY, newTheme); }

function switchView(viewId) {
    [calculatorView, customIndexView, stockUniverseView].forEach(v => {
        if (v) { v.classList.add('hidden'); } 
        else { console.warn(`switchView: A main view element is null when trying to hide all views.`);}
    });
    [navCalculator, navStockUniverse, navCustomIndex].forEach(n => n?.classList.remove('active'));
    [mobileNavCalculator, mobileNavStockUniverse, mobileNavCustomIndex].forEach(n => n?.classList.remove('active'));

    let targetView, targetNav, targetMobileNav;
    if (viewId === 'calculator-view') {
        targetView = calculatorView; targetNav = navCalculator; targetMobileNav = mobileNavCalculator;
        if (capitalInputContainer) capitalInputContainer.style.display = 'flex';
    } else if (viewId === 'custom-index-view') {
        targetView = customIndexView; targetNav = navCustomIndex; targetMobileNav = mobileNavCustomIndex;
        if (capitalInputContainer) capitalInputContainer.style.display = 'none';
        if(typeof fetchAndRenderCustomIndexData === 'function') fetchAndRenderCustomIndexData(); else console.error("fetchAndRenderCustomIndexData is not defined");
    } else if (viewId === 'stock-universe-view') {
        targetView = stockUniverseView; targetNav = navStockUniverse; targetMobileNav = mobileNavStockUniverse;
        if (capitalInputContainer) capitalInputContainer.style.display = 'none';
        if(typeof displayStockUniverse === 'function') displayStockUniverse(); else console.error("displayStockUniverse is not defined");
    } else {
        console.warn(`switchView: Unknown viewId '${viewId}'`);
    }

    if (targetView) { targetView.classList.remove('hidden'); } 
    else { console.warn(`switchView: No targetView found or assigned for viewId '${viewId}'. Ensure the view element exists and viewId is correct.`); }
    if (targetNav) { targetNav.classList.add('active'); } 
    else { console.warn(`switchView: No targetNav found for viewId '${viewId}'. Desktop nav button might be missing or ID mismatch.`);}
    if (targetMobileNav) { targetMobileNav.classList.add('active'); } 
    else { console.warn(`switchView: No targetMobileNav found for viewId '${viewId}'. Mobile nav button might be missing or ID mismatch.`); }

    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.add('hidden');
        if (hamburgerMenuButton) {
            hamburgerMenuButton.setAttribute('aria-expanded', 'false');
            const icons = hamburgerMenuButton.querySelectorAll('svg');
            if (icons.length === 2) { icons[0].classList.remove('hidden'); icons[1].classList.add('hidden'); }
        }
    }
    localStorage.setItem(ACTIVE_VIEW_KEY, viewId);
}

function toggleMobileMenu() {
    if (!hamburgerMenuButton || !mobileMenu) return;
    const isExpanded = hamburgerMenuButton.getAttribute('aria-expanded') === 'true' || false;
    hamburgerMenuButton.setAttribute('aria-expanded', !isExpanded);
    mobileMenu.classList.toggle('hidden');
    const icons = hamburgerMenuButton.querySelectorAll('svg');
    if (icons.length === 2) { icons[0].classList.toggle('hidden'); icons[1].classList.toggle('hidden'); }
}

// =========== CHART POPUP LOGIC ===========
function createTradingViewWidget(symbol, theme) {
    if (!chartPopupContainer) return;
    chartPopupContainer.innerHTML = ''; 
    chartPopupContainer.dataset.currentSymbol = symbol; 
    
    const widgetConfig = {
        "width": "680", "height": "480", "symbol": symbol, "interval": "D", "timezone": "Asia/Kolkata",
        "theme": theme, "style": "1", "locale": "en", "withdateranges": true,
        "range": "YTD","hide_side_toolbar": true, "allow_symbol_change": false,
        "support_host": "https://www.tradingview.com"
    };
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify(widgetConfig);
    chartPopupContainer.appendChild(script);
}
function showChartPopup(event) {
    if (!chartPopup) return;
    clearTimeout(chartPopupTimeout);

    const cell = event.target.closest('.symbol-cell'); // Robust cell selection
    if (!cell || !cell.dataset.symbol) { // Ensure cell and symbol exist
        console.warn("[showChartPopup] Could not find symbol data on hovered element or its parent cell.");
        return;
    }
    const symbol = cell.dataset.symbol;
    const tradingViewSymbol = `BSE:${symbol}`; // Assuming BSE, adjust if needed

    const currentTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    createTradingViewWidget(tradingViewSymbol, currentTheme);

    // Use actual rendered dimensions of the popup element for positioning
    const popupWidth = chartPopup.offsetWidth; 
    const popupHeight = chartPopup.offsetHeight;
    const offset = 15; // User's preferred offset

    const cellRect = cell.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Vertical positioning: try to center it with the cell, then clamp
    let top = cellRect.top + (cellRect.height / 2) - (popupHeight / 2);
    top = Math.max(10, Math.min(top, viewportHeight - popupHeight - 10 - offset)); // Added offset to bottom clamp

    // Horizontal positioning: prefer right side, fallback to left, then clamp
    let left = (cellRect.right + popupWidth + offset) < viewportWidth 
               ? cellRect.right + offset 
               : cellRect.left - popupWidth - offset;
    left = Math.max(10, Math.min(left, viewportWidth - popupWidth - 10 - offset)); // Added clamp for right edge and ensure min left

    chartPopup.style.left = `${left}px`;
    chartPopup.style.top = `${top}px`;
    chartPopup.classList.remove('hidden');
}
function hideChartPopup() { if (!chartPopup) return; chartPopupTimeout = setTimeout(() => { chartPopup.classList.add('hidden'); if (chartPopupContainer) { chartPopupContainer.innerHTML = ''; delete chartPopupContainer.dataset.currentSymbol; } }, 300);  }

// --- STOCK UNIVERSE ---
function loadSUColumnSettings() {
    const savedOrder = localStorage.getItem(SU_COLUMN_ORDER_KEY);
    if (savedOrder) {
        try { suCurrentColumnOrder = JSON.parse(savedOrder); } 
        catch (e) { suCurrentColumnOrder = [...suDefaultColumnHeaders.map(h => h.key)]; }
    } else {
        suCurrentColumnOrder = suDefaultColumnHeaders.length > 0 ? [...suDefaultColumnHeaders.map(h => h.key)] : [];
    }
    const savedWidths = localStorage.getItem(SU_COLUMN_WIDTHS_KEY);
    if (savedWidths) {
        try { suColumnWidths = JSON.parse(savedWidths); }
        catch (e) { suColumnWidths = {};}
    } else {
        suColumnWidths = {};
    }
}
function saveSUColumnOrder() { localStorage.setItem(SU_COLUMN_ORDER_KEY, JSON.stringify(suCurrentColumnOrder)); }
function saveSUColumnWidths() { localStorage.setItem(SU_COLUMN_WIDTHS_KEY, JSON.stringify(suColumnWidths)); }

// REWRITTEN: preloadStockUniverseData to fetch JSON directly
async function preloadStockUniverseData() {
    if (isStockDataLoaded) return Promise.resolve();
    console.log("[preloadSU] Starting SU data load from JSON...");
    try {
        const response = await fetch(STOCK_UNIVERSE_DATA_PATH); // Uses updated constant for .json
        if (!response.ok) {
            throw new Error(`Network error loading SU JSON data: ${response.status} ${response.statusText}`);
        }
        const jsonData = await response.json(); // Directly parse the response as JSON

        if (jsonData && Array.isArray(jsonData) && jsonData.length > 0) {
            suDefaultColumnHeaders = Object.keys(jsonData[0]).map(key => ({
                key: key,
                displayName: (key === 'Market Cap') ? 'Market Cap (Cr.)' : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            }));
            
            fullStockData = jsonData.map(row => {
                const newRow = { ...row }; 
                newRow["Market Cap"] = parseFloat(row["Market Cap"]) || 0;
                return newRow;
            });

        } else if (jsonData && Array.isArray(jsonData) && jsonData.length === 0) {
            console.warn("[preloadSU] stock_universe.json was fetched but is an empty array.");
            suDefaultColumnHeaders = [];
            fullStockData = [];
        } else {
            console.error("[preloadSU] stock_universe.json data is not in the expected array format or is empty/null after parsing.");
            suDefaultColumnHeaders = [];
            fullStockData = [];
        }

        isStockDataLoaded = true;
        loadSUColumnSettings(); 
        console.log("[preloadSU] Stock universe JSON data loaded and processed successfully.");

        if (stockUniverseView && !stockUniverseView.classList.contains('hidden')) { 
            displayStockUniverse();
        }
        return Promise.resolve();
    } catch (err) {
        console.error("[preloadSU] Failed to load or process stock_universe.json:", err);
        if(suError) suError.textContent = `Error: Could not load SU data. ${err.message}`;
        isStockDataLoaded = false;
        suDefaultColumnHeaders = []; 
        fullStockData = [];      
        return Promise.reject(err);
    }
}

function displayStockUniverse() {
    if (isStockDataLoaded) {
        if (suLoading) suLoading.classList.add('hidden');
        if (suError) suError.classList.add('hidden');
        applyAndRenderSU(); 
    } else {
        if (suLoading) suLoading.classList.remove('hidden'); 
        if (suError && !suError.textContent) suError.classList.add('hidden'); else if(suError) suError.classList.remove('hidden');
        
        preloadStockUniverseData().then(() => { 
            if (isStockDataLoaded) {
                 displayStockUniverse(); 
            } else {
                 if (suLoading) suLoading.classList.add('hidden');
                 if (suError && !suError.textContent) suError.textContent = "Stock data could not be loaded."; suError.classList.remove('hidden');
            }
        }).catch(err => {
            if (suLoading) suLoading.classList.add('hidden');
            if (suError) suError.textContent = `Error loading stock data: ${err.message || 'Unknown error'}`; suError.classList.remove('hidden');
            console.error("Caught error during SU display->preload: ", err);
        });
    }
}
function parseMarketCapFilter(value) { const filter = { gt: null, lt: null }; if (!value || typeof value !== 'string') return filter; const expressions = value.trim().match(/([<>]=?)\s*(\d+\.?\d*)/g) || []; if (expressions.length > 0) { expressions.forEach(expr => { const num = parseFloat(expr.replace(/[<>=]/g, '')); if (isNaN(num)) return; if (expr.startsWith('>=')) filter.gt = num - 0.001; else if (expr.startsWith('>')) filter.gt = num; else if (expr.startsWith('<=')) filter.lt = num + 0.001; else if (expr.startsWith('<')) filter.lt = num; }); } else if (!isNaN(parseFloat(value))) { const num = parseFloat(value); filter.gt = num * 0.9 - 0.001; filter.lt = num * 1.1 + 0.001; } return filter; }
function applyAndRenderSU() {
    if (!isStockDataLoaded) { displayStockUniverse(); return; } 
    let filteredData = [...fullStockData];
    Object.entries(suFilters.columns).forEach(([key, value]) => { if (value && value !== 'ALL') { filteredData = filteredData.filter(row => String(row[key]) === String(value)); } });
    const { gt, lt } = parseMarketCapFilter(suFilters.marketCap.query);
    if (gt !== null) filteredData = filteredData.filter(row => row['Market Cap'] > gt);
    if (lt !== null) filteredData = filteredData.filter(row => row['Market Cap'] < lt);
    if (suCurrentSort.key) { filteredData.sort((a, b) => { const valA = a[suCurrentSort.key]; const valB = b[suCurrentSort.key]; let comparison = 0; if (typeof valA === 'number' && typeof valB === 'number') { comparison = valA - valB; } else { comparison = String(valA ?? '').localeCompare(String(valB ?? '')); } return suCurrentSort.order === 'asc' ? comparison : -comparison; }); }
    currentlyDisplayedSUData = filteredData;
    renderStockUniverseTable(filteredData);
}
function createSUHeaderAndFilterRows() {
    if (!suTableHeadElement) { console.error("SU Table Head Element not found!"); return;}
    suTableHeadElement.innerHTML = ''; 
    suHeaderRow = document.createElement('tr');
    suFilterRow = document.createElement('tr');
    suFilterRow.id = 'su-filter-row';
    const columnsWithDropdownFilter = ["SME Stock ?", "Sector Name", "Industry Name"];
    let columnsToRender = suCurrentColumnOrder.length > 0 ? suCurrentColumnOrder : suDefaultColumnHeaders.map(h => h.key);
    if (columnsToRender.length === 0 && suDefaultColumnHeaders.length > 0) { 
        columnsToRender = [...suDefaultColumnHeaders.map(h => h.key)];
        suCurrentColumnOrder = [...columnsToRender]; 
    } 
    if(columnsToRender.length === 0){ console.error("[createSUHeader] No columns to render for Stock Universe table headers!"); return; } 
    columnsToRender.forEach(key => {
        const headerInfo = suDefaultColumnHeaders.find(h => h.key === key) || { key: key, displayName: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) };
        const th = document.createElement('th'); th.className = 'sortable-header resizable'; th.dataset.key = headerInfo.key; th.innerHTML = `${headerInfo.displayName} <span class="sort-icon"></span><div class="resize-handle"></div>`;
        if (suColumnWidths[headerInfo.key]) { th.style.width = suColumnWidths[headerInfo.key]; } 
        else { if (headerInfo.key === 'Stock Name') th.style.width = '200px'; else if (headerInfo.key === 'Symbol') th.style.width = '100px'; else if (headerInfo.key === 'Market Cap') th.style.width = '120px'; else th.style.width = '150px'; }
        suHeaderRow.appendChild(th);
        const filterTd = document.createElement('td');
        if (headerInfo.key === 'Market Cap') { const input = document.createElement('input'); input.type = 'text'; input.placeholder = '>100 <5000...'; input.className = 'form-input text-xs p-1 w-full'; input.value = suFilters.marketCap.query || ''; input.addEventListener('input', (e) => { suFilters.marketCap.query = e.target.value; applyAndRenderSU(); }); filterTd.appendChild(input); } 
        else if (columnsWithDropdownFilter.includes(headerInfo.key)) { const select = document.createElement('select'); select.className = 'form-input text-xs p-1 w-full'; select.dataset.filterKey = headerInfo.key; select.addEventListener('change', (e) => { suFilters.columns[headerInfo.key] = e.target.value; if (headerInfo.key === 'Sector Name') { updateDependentDropdowns(); } applyAndRenderSU(); }); filterTd.appendChild(select); }
        suFilterRow.appendChild(filterTd);
    });
    suTableHeadElement.appendChild(suHeaderRow);
    suTableHeadElement.appendChild(suFilterRow);
    populateTopLevelDropdowns(); updateSortIcons(); initializeSortable(); initializeResizeHandles();
}
function initializeSortable() {
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; } 
    if (suHeaderRow && typeof Sortable !== 'undefined') {
        sortableInstance = Sortable.create(suHeaderRow, {
            animation: 150, ghostClass: 'sortable-ghost', dragClass: 'sortable-drag',
            onEnd: function (evt) {
                const newOrder = Array.from(suHeaderRow.children).map(th => th.dataset.key);
                suCurrentColumnOrder = newOrder; saveSUColumnOrder();
                const oldFilterValues = {};
                if (suFilterRow) { suFilterRow.querySelectorAll('input, select').forEach(el => { let keyForFilter = el.dataset.filterKey; const cellIndex = Array.from(el.parentElement.parentElement.children).indexOf(el.parentElement); if (suHeaderRow && suHeaderRow.children[cellIndex] && suHeaderRow.children[cellIndex].dataset.key) { keyForFilter = suHeaderRow.children[cellIndex].dataset.key; } if(keyForFilter) oldFilterValues[keyForFilter] = el.value; }); }
                createSUHeaderAndFilterRows(); 
                if (suFilterRow){ suFilterRow.querySelectorAll('input, select').forEach(el => { let keyForFilter = el.dataset.filterKey; const cellIndex = Array.from(el.parentElement.parentElement.children).indexOf(el.parentElement); if (suHeaderRow && suHeaderRow.children[cellIndex] && suHeaderRow.children[cellIndex].dataset.key) { keyForFilter = suHeaderRow.children[cellIndex].dataset.key; } if(keyForFilter && oldFilterValues[keyForFilter]) el.value = oldFilterValues[keyForFilter]; }); }
                renderStockUniverseTableBody(currentlyDisplayedSUData); 
            }
        });
    } else if (suHeaderRow && typeof Sortable === 'undefined') { console.warn("Sortable library not loaded, column reordering disabled."); }
}
function initializeResizeHandles() { if (!suHeaderRow) return; suHeaderRow.querySelectorAll('.resize-handle').forEach(handle => { handle.addEventListener('mousedown', onResizeMouseDown); }); }
function onResizeMouseDown(e) { if (e.button !== 0) return; currentResizing.th = e.target.parentElement; currentResizing.startX = e.pageX; currentResizing.startWidth = currentResizing.th.offsetWidth; document.addEventListener('mousemove', onResizeMouseMove); document.addEventListener('mouseup', onResizeMouseUp); e.target.classList.add('active');  if (suTable) suTable.classList.add('resizing');  e.preventDefault();  }
function onResizeMouseMove(e) { if (!currentResizing.th) return; const diffX = e.pageX - currentResizing.startX; let newWidth = currentResizing.startWidth + diffX; newWidth = Math.max(50, newWidth);  currentResizing.th.style.width = `${newWidth}px`; }
function onResizeMouseUp() { if (currentResizing.th) { suColumnWidths[currentResizing.th.dataset.key] = currentResizing.th.style.width; saveSUColumnWidths(); const handle = currentResizing.th.querySelector('.resize-handle'); if (handle) handle.classList.remove('active'); } document.removeEventListener('mousemove', onResizeMouseMove); document.removeEventListener('mouseup', onResizeMouseUp); if (suTable) suTable.classList.remove('resizing'); currentResizing.th = null; }
function updateSortIcons() { if (!suHeaderRow) return; suHeaderRow.querySelectorAll('.sortable-header .sort-icon').forEach(iconSpan => iconSpan.innerHTML = ''); const activeHeaderIcon = suHeaderRow.querySelector(`.sortable-header[data-key="${suCurrentSort.key}"] .sort-icon`); if (activeHeaderIcon) { activeHeaderIcon.innerHTML = suCurrentSort.order === 'asc' ? '▲' : '▼'; } }
function renderStockUniverseTable(data) {  if (!isStockDataLoaded && suLoading) { suLoading.classList.remove('hidden'); return; } else if (!isStockDataLoaded) { displayStockUniverse(); return; } if (!suTableHeadElement || !suTableBodyElement) { return; } if (!suHeaderRow || !suFilterRow || suHeaderRow.children.length === 0 || (suCurrentColumnOrder.length > 0 && suCurrentColumnOrder.length !== suHeaderRow.children.length) ) { createSUHeaderAndFilterRows(); if(!suHeaderRow || suHeaderRow.children.length === 0){ return; } } updateSortIcons(); renderStockUniverseTableBody(data); if (suRowCount) suRowCount.textContent = `Showing ${data.length} of ${fullStockData.length} stocks.`;}
function renderStockUniverseTableBody(data) { if (!suTableBodyElement) { return; } if (!suCurrentColumnOrder || suCurrentColumnOrder.length === 0) { if(suDefaultColumnHeaders.length > 0) { suCurrentColumnOrder = suDefaultColumnHeaders.map(h => h.key); } else {  suTableBodyElement.innerHTML = `<tr><td class="text-center p-4">Table structure not ready.</td></tr>`;  return; } } suTableBodyElement.innerHTML = ''; if (data.length === 0) { const colspan = suCurrentColumnOrder.length || 1; suTableBodyElement.innerHTML = `<tr><td colspan="${colspan}" class="text-center p-4">No stocks match the current filters.</td></tr>`; } else { data.forEach(row => { const tr = document.createElement('tr'); suCurrentColumnOrder.forEach(key => { const td = document.createElement('td'); let value = row[key]; if (key === 'Market Cap' && typeof value === 'number') { value = value.toLocaleString('en-IN'); } td.textContent = value !== undefined && value !== null ? String(value) : 'N/A';  if (key === 'Symbol') { td.classList.add('symbol-cell'); td.dataset.symbol = value; } tr.appendChild(td); }); suTableBodyElement.appendChild(tr); }); } }
function populateTopLevelDropdowns() { if (!suFilterRow || fullStockData.length === 0) { return;} const dropdownKeys = ["SME Stock ?", "Sector Name"]; dropdownKeys.forEach(key => { const select = suFilterRow.querySelector(`select[data-filter-key="${key}"]`); if (select) { const uniqueValues = [...new Set(fullStockData.map(item => item[key]).filter(v => v !== undefined && v !== null))].sort((a,b) => String(a).localeCompare(String(b), undefined, {numeric: true})); const currentValue = suFilters.columns[key] || select.value || 'ALL'; select.innerHTML = `<option value="ALL">ALL</option>` + uniqueValues.map(val => `<option value="${String(val)}" ${String(val) === String(currentValue) ? 'selected' : ''}>${val}</option>`).join(''); if(!uniqueValues.some(v => String(v) === String(currentValue)) && String(currentValue) !== "ALL"){ select.value = "ALL";  suFilters.columns[key] = "ALL"; } else { select.value = currentValue; } } else {console.warn(`[populateDropdowns] Select element for key '${key}' not found.`);} }); updateDependentDropdowns(); }
function updateDependentDropdowns() { if (!suFilterRow || fullStockData.length === 0) return; const selectedSector = suFilters.columns['Sector Name'] || 'ALL'; const industryDropdown = suFilterRow.querySelector('select[data-filter-key="Industry Name"]'); if (!industryDropdown) { return; } let relevantIndustries; if (selectedSector === 'ALL') { relevantIndustries = [...new Set(fullStockData.map(item => item['Industry Name']).filter(v => v !== undefined && v !== null))]; }  else { relevantIndustries = [...new Set(fullStockData.filter(row => row['Sector Name'] === selectedSector).map(item => item['Industry Name']).filter(v => v !== undefined && v !== null))]; }  const currentIndustryValue = suFilters.columns['Industry Name'] || industryDropdown.value || 'ALL'; industryDropdown.innerHTML = `<option value="ALL">ALL</option>` + relevantIndustries.sort().map(val => `<option value="${String(val)}" ${String(val) === String(currentIndustryValue) ? 'selected':''}>${val}</option>`).join(''); if (relevantIndustries.some(v => String(v) === String(currentIndustryValue))) { industryDropdown.value = currentIndustryValue; }  else { industryDropdown.value = 'ALL'; suFilters.columns['Industry Name'] = 'ALL'; } }
function exportStockUniverseAsZip() { if (!currentlyDisplayedSUData || currentlyDisplayedSUData.length === 0) { alert("No data to export."); return; } if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') { alert("Required libraries (JSZip, FileSaver) are not loaded. Add them back if this export feature is needed."); console.error("JSZip or FileSaver not loaded. Cannot export as ZIP."); return; } const sectors = {}; currentlyDisplayedSUData.forEach(stock => { const sector = stock['Sector Name']; const industry = stock['Industry Name']; const symbol = stock['Symbol']; if (!sectors[sector]) { sectors[sector] = {}; } if (!sectors[sector][industry]) { sectors[sector][industry] = []; } sectors[sector][industry].push(symbol); }); const zip = new JSZip(); Object.keys(sectors).sort().forEach(sectorName => { let fileContent = ''; Object.keys(sectors[sectorName]).sort().forEach(industryName => { const symbols = sectors[sectorName][industryName].join(','); fileContent += `###${industryName},${symbols}\n`; }); zip.file(`${sectorName}.txt`, fileContent.trim()); }); zip.generateAsync({ type: "blob" }).then(content => saveAs(content, "TV Sector Data.zip")); }
const safeParseFloat = (str) => { if (typeof str !== 'string' && typeof str !== 'number') return 0; const num = parseFloat(String(str).replace(/,/g, '')); return isNaN(num) ? 0 : num; };
const formatCurrency = (value, symbol = '₹') => { if (isNaN(value) || !isFinite(value)) return `${symbol}0.00`; return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
const formatPercentage = (value) => { if (isNaN(value) || !isFinite(value)) return '0.00%'; return `${value.toFixed(2)}%`; };
const formatNumber = (value) => { if (isNaN(value) || !isFinite(value)) return '0'; return Math.floor(value).toLocaleString('en-IN'); };
const defaultSettings = { capital: '100000', risk_riskPercent: '0.5', risk_entryPrice: '305', risk_slPrice: '300', alloc_allocationPercent: '20', alloc_entryPrice: '305', alloc_slPrice: '300',};
function loadCalculatorSettings() { try { const sS=localStorage.getItem(APP_SETTINGS_KEY); const s=sS?JSON.parse(sS):{...defaultSettings}; if(capitalInput) capitalInput.value=s.capital||defaultSettings.capital; if(riskRiskPercentInput) riskRiskPercentInput.value=s.risk_riskPercent||defaultSettings.risk_riskPercent; if(riskEntryPriceInput) riskEntryPriceInput.value=s.risk_entryPrice||defaultSettings.risk_entryPrice; if(riskSlPriceInput) riskSlPriceInput.value=s.risk_slPrice||defaultSettings.risk_slPrice; if(allocAllocationPercentInput) allocAllocationPercentInput.value=s.alloc_allocationPercent||defaultSettings.alloc_allocationPercent; if(allocEntryPriceInput) allocEntryPriceInput.value=s.alloc_entryPrice||defaultSettings.alloc_entryPrice; if(allocSlPriceInput) allocSlPriceInput.value=s.alloc_slPrice||defaultSettings.alloc_slPrice; } catch (e) { console.error('Error loading calc settings:',e); }};
function saveCalculatorSettings() { if (!capitalInput) return; const cS={capital:capitalInput.value, risk_riskPercent:riskRiskPercentInput.value, risk_entryPrice:riskEntryPriceInput.value, risk_slPrice:riskSlPriceInput.value, alloc_allocationPercent:allocAllocationPercentInput.value, alloc_entryPrice:allocEntryPriceInput.value, alloc_slPrice:allocSlPriceInput.value }; try{localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(cS));}catch(e){console.error('Error saving calc settings:',e);} };
function sanitizeNumericInput(iE){if(!iE)return; let v=iE.value; let sV=v.replace(/[^0-9.]/g,''); const p=sV.split('.'); if(p.length>2){sV=p[0]+'.'+p.slice(1).join('');} if(sV.length>1&&sV.startsWith('0')&&!sV.startsWith('0.')){sV=sV.substring(1);} if(sV==='.')sV='0.'; if(sV!==v){iE.value=sV;}}
function calculateRiskBased() { if (!riskRiskPercentError) return; [riskRiskPercentError,riskEntryPriceError,riskSlPriceError,capitalError].forEach(e=>{ if(e) e.textContent='';}); [riskRiskPercentInput,riskEntryPriceInput,riskSlPriceInput,capitalInput].forEach(e=>{if(e) e.classList.remove('error');}); if(riskCalculationWarning) riskCalculationWarning.classList.add('hidden'); const cap=safeParseFloat(capitalInput.value); const rP=safeParseFloat(riskRiskPercentInput.value); const eP=safeParseFloat(riskEntryPriceInput.value); const sP=safeParseFloat(riskSlPriceInput.value); let hE=false; if(cap<=0){if(capitalError) capitalError.textContent='Must be > 0.';if(capitalInput)capitalInput.classList.add('error');hE=true;} if(rP<=0){if(riskRiskPercentError) riskRiskPercentError.textContent='Must be > 0.';if(riskRiskPercentInput)riskRiskPercentInput.classList.add('error');hE=true;} if(eP<=0){if(riskEntryPriceError) riskEntryPriceError.textContent='Must be > 0.';if(riskEntryPriceInput)riskEntryPriceInput.classList.add('error');hE=true;} if(sP<0||eP>0&&sP>=eP){if(riskSlPriceError)riskSlPriceError.textContent='SL must be < Entry.';if(riskSlPriceInput)riskSlPriceInput.classList.add('error');hE=true;} if(hE || !riskResultQty){return;} const rAA=cap*(rP/100); const rPS=eP-sP; let qty=0; if(rPS>0){qty=Math.floor(rAA/rPS);} riskResultQty.textContent=formatNumber(qty); riskResultRiskAmount.textContent=formatCurrency(rAA); riskResultSlPercent.textContent=formatPercentage(eP>0&&rPS>0?(rPS/eP)*100:0); riskResultAllocationPercent.textContent=formatPercentage(cap>0?(qty*eP/cap)*100:0); riskResultTotalCost.textContent=formatCurrency(qty*eP); }
function calculateAllocationBased() { if (!allocAllocationPercentError) return; const allocResultQty = document.getElementById('alloc_result_qty'); const allocResultRiskOnCapitalPercent = document.getElementById('alloc_result_riskOnCapitalPercent'); const allocResultRiskAmount = document.getElementById('alloc_result_riskAmount'); const allocResultSlPercent = document.getElementById('alloc_result_slPercent'); const allocResultTotalCost = document.getElementById('alloc_result_totalCost'); [allocAllocationPercentError,allocEntryPriceError,allocSlPriceError,capitalError].forEach(eL=>{if(eL)eL.textContent='';}); [allocAllocationPercentInput,allocEntryPriceInput,allocSlPriceInput,capitalInput].forEach(eL=>{if(eL)eL.classList.remove('error');}); if(allocCalculationWarning) allocCalculationWarning.classList.add('hidden'); const cap=safeParseFloat(capitalInput.value); const alloPT=safeParseFloat(allocAllocationPercentInput.value); const eP=safeParseFloat(allocEntryPriceInput.value); const sP=safeParseFloat(allocSlPriceInput.value); let hE=false; if(cap<=0){if(capitalError)capitalError.textContent='Must be > 0.';if(capitalInput)capitalInput.classList.add('error');hE=true;} if(alloPT<=0){if(allocAllocationPercentError)allocAllocationPercentError.textContent='Must be > 0.';if(allocAllocationPercentInput)allocAllocationPercentInput.classList.add('error');hE=true;} if(eP<=0){if(allocEntryPriceError)allocEntryPriceError.textContent='Must be > 0.';if(allocEntryPriceInput)allocEntryPriceInput.classList.add('error');hE=true;} if(sP<0||eP>0&&sP>=eP){if(allocSlPriceError)allocSlPriceError.textContent='SL must be < Entry.';if(allocSlPriceInput)allocSlPriceInput.classList.add('error');hE=true;} if(hE || !allocResultQty){return;} const alloA=cap*(alloPT/100); let qty=0; if(eP>0){qty=Math.floor(alloA/eP);} const rPS=eP-sP; const tARA=(rPS>0&&sP>=0)?qty*rPS:0; const aROCP=(cap>0&&tARA>0)?(tARA/cap)*100:0; const aSP=(eP>0&&rPS>0&&sP>=0)?(rPS/eP)*100:0; const tC=qty*eP; allocResultQty.textContent=formatNumber(qty); allocResultRiskOnCapitalPercent.textContent=formatPercentage(aROCP); allocResultRiskAmount.textContent=formatCurrency(tARA); allocResultSlPercent.textContent=formatPercentage(aSP); allocResultTotalCost.textContent=formatCurrency(tC); }
function updateAllCalculationsAndSave() { if (capitalInput && !capitalInput.classList.contains('error') && capitalError) { capitalError.textContent = ''; } calculateRiskBased(); calculateAllocationBased(); saveCalculatorSettings(); };
function parseCSV(csvText) { const lines = csvText.replace(/\r/g, '').trim().split('\n'); if (lines.length < 2) return []; const headers = lines[0].split(',').map(h => h.trim()); const result = []; for (let i = 1; i < lines.length; i++) { if (!lines[i]) continue; const values = lines[i].split(',').map(v => v.trim()); if (values.length !== headers.length) { console.warn(`CSV line ${i+1} incorrect values. Expected ${headers.length}, got ${values.length}.`); continue; } const obj = {}; for (let j = 0; j < headers.length; j++) { obj[headers[j]] = values[j]; } result.push(obj); } return result; }
async function fetchAndRenderCustomIndexData(options = { force: false }) { if (!customIndexLoading || !customIndexError || !customIndexMessage || !customIndexLastUpdated || !customIndexTableHead || !customIndexTableBody ) { return;} try { const cachedDataJSON = localStorage.getItem(CUSTOM_INDEX_CACHE_KEY); if (cachedDataJSON && !options.force) { const cache = JSON.parse(cachedDataJSON); const isCacheFresh = (Date.now() - cache.timestamp) < CUSTOM_INDEX_CACHE_DURATION_MS; if (isCacheFresh) { renderCustomIndexTable(cache.data, `Cached at: ${new Date(cache.timestamp).toLocaleString()}`); return; } } } catch (e) { console.error("Could not read from custom index cache", e); } customIndexLoading.classList.remove('hidden'); customIndexError.classList.add('hidden'); customIndexMessage.classList.remove('hidden'); customIndexMessage.textContent = 'Fetching latest data...'; try { const response = await fetch(GOOGLE_SHEET_CSV_URL, { cache: "no-store" }); if (!response.ok) throw new Error(`Network error CI: ${response.status}`); const csvText = await response.text(); if (!csvText || csvText.trim().length < 5) throw new Error("Empty/invalid data from CI sheet."); const data = parseCSV(csvText); const timestamp = Date.now(); localStorage.setItem(CUSTOM_INDEX_CACHE_KEY, JSON.stringify({ data, timestamp })); renderCustomIndexTable(data, `Fetched at: ${new Date(timestamp).toLocaleString()}`); } catch (err) { customIndexLoading.classList.add('hidden'); customIndexError.textContent = `Error: ${err.message}`; customIndexError.classList.remove('hidden'); customIndexMessage.classList.add('hidden'); } }
function renderCustomIndexTable(data, timestampText) { if (!customIndexLoading || !customIndexError || !customIndexMessage || !customIndexLastUpdated || !customIndexTableHead || !customIndexTableBody ) {return;} customIndexLoading.classList.add('hidden'); customIndexError.classList.add('hidden'); customIndexMessage.classList.add('hidden'); customIndexLastUpdated.textContent = timestampText; customIndexTableHead.innerHTML = ''; customIndexTableBody.innerHTML = ''; if (!data || data.length === 0) { customIndexTableBody.innerHTML = '<tr><td colspan="2" class="text-center p-4">No data to display.</td></tr>'; currentCustomIndexData = []; return; } currentCustomIndexData = data; const headers = Object.keys(data[0]); const headerRow = document.createElement('tr'); headers.forEach(headerText => { const th = document.createElement('th'); th.textContent = headerText.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); headerRow.appendChild(th); }); customIndexTableHead.appendChild(headerRow); data.forEach(item => { const row = document.createElement('tr'); headers.forEach(header => { const cell = document.createElement('td'); cell.textContent = item[header] || 'N/A'; row.appendChild(cell); }); customIndexTableBody.appendChild(row); }); }
function formatCustomIndexDataForExport(data) { if (!data || data.length === 0) return ""; const firstItemKeys = Object.keys(data[0]); const sectorKey = firstItemKeys.find(key => key.toLowerCase() === 'sector') || firstItemKeys[0]; const symbolKey = firstItemKeys.find(key => key.toLowerCase() === 'symbol') || (firstItemKeys.length > 1 ? firstItemKeys[1] : firstItemKeys[0]); return data.map(item => `###${item[sectorKey] || ''},${item[symbolKey] || ''}`).join(',');}
function exportCustomIndexData() { if (!currentCustomIndexData || currentCustomIndexData.length === 0) { alert("No data to export."); return; } const formattedData = formatCustomIndexDataForExport(currentCustomIndexData); const blob = new Blob([formattedData], { type: 'text/plain;charset=utf-8' }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.setAttribute("href", url); link.setAttribute("download", "custom_index_data.txt"); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); if(customIndexMessage) { customIndexMessage.textContent = "Data exported."; customIndexMessage.classList.remove('hidden'); setTimeout(() => customIndexMessage.classList.add('hidden'), 3000); }}
function copyCustomIndexData() { if (!currentCustomIndexData || currentCustomIndexData.length === 0) { alert("No data to copy."); return; } const formattedData = formatCustomIndexDataForExport(currentCustomIndexData); navigator.clipboard.writeText(formattedData).then(() => { if(customIndexMessage) { customIndexMessage.textContent = "Data copied!"; customIndexMessage.classList.remove('hidden'); setTimeout(() => customIndexMessage.classList.add('hidden'), 3000); }}).catch(err => { console.error('Failed to copy CI data: ', err); if(customIndexError) { customIndexError.textContent = "Copy failed."; customIndexError.classList.remove('hidden'); setTimeout(() => customIndexError.classList.add('hidden'), 3000); }});}

document.addEventListener('DOMContentLoaded', () => {
    finvestikLogo = document.getElementById('finvestik-logo');
    themeToggle = document.getElementById('theme-toggle');
    hamburgerMenuButton = document.getElementById('hamburger-menu-button');
    mobileMenu = document.getElementById('mobile-menu');
    navCalculator = document.getElementById('nav-calculator'); navStockUniverse = document.getElementById('nav-stock-universe'); navCustomIndex = document.getElementById('nav-custom-index');
    mobileNavCalculator = document.getElementById('mobile-nav-calculator'); mobileNavStockUniverse = document.getElementById('mobile-nav-stock-universe'); mobileNavCustomIndex = document.getElementById('mobile-nav-custom-index');
    calculatorView = document.getElementById('calculator-view'); customIndexView = document.getElementById('custom-index-view'); stockUniverseView = document.getElementById('stock-universe-view');
    capitalInputContainer = document.querySelector('[role="region"][aria-labelledby="capital-heading"]');
    currentYearElement = document.getElementById('current-year');
    capitalInput = document.getElementById('capital'); capitalError = document.getElementById('capital-error');
    riskRiskPercentInput = document.getElementById('risk_riskPercent'); riskEntryPriceInput = document.getElementById('risk_entryPrice'); riskSlPriceInput = document.getElementById('risk_slPrice'); riskRiskPercentError = document.getElementById('risk_riskPercent-error'); riskEntryPriceError = document.getElementById('risk_entryPrice-error'); riskSlPriceError = document.getElementById('risk_slPrice-error');
    allocAllocationPercentInput = document.getElementById('alloc_allocationPercent'); allocEntryPriceInput = document.getElementById('alloc_entryPrice'); allocSlPriceInput = document.getElementById('alloc_slPrice'); allocAllocationPercentError = document.getElementById('alloc_allocationPercent-error'); allocEntryPriceError = document.getElementById('alloc_entryPrice-error'); allocSlPriceError = document.getElementById('alloc_slPrice-error');
    riskResultsContainer = document.getElementById('risk_results_container'); riskCalculationWarning = document.getElementById('risk_calculation_warning'); riskErrorSummary = document.getElementById('risk_error_summary'); riskResultQty = document.getElementById('risk_result_qty'); riskResultRiskAmount = document.getElementById('risk_result_riskAmount'); riskResultSlPercent = document.getElementById('risk_result_slPercent'); riskResultAllocationPercent = document.getElementById('risk_result_allocationPercent'); riskResultTotalCost = document.getElementById('risk_result_totalCost');
    allocResultsContainer = document.getElementById('alloc_results_container'); allocCalculationWarning = document.getElementById('alloc_calculation_warning'); allocErrorSummary = document.getElementById('alloc_error_summary');
    customIndexTable = document.getElementById('custom-index-table'); 
    if(customIndexTable) { customIndexTableHead = customIndexTable.querySelector('thead'); customIndexTableBody = customIndexTable.querySelector('tbody');}
    customIndexLoading = document.getElementById('custom-index-loading'); customIndexError = document.getElementById('custom-index-error'); customIndexMessage = document.getElementById('custom-index-message'); customIndexLastUpdated = document.getElementById('custom-index-last-updated');
    customIndexRefreshButton = document.getElementById('custom-index-refresh-button'); customIndexCopyButton = document.getElementById('custom-index-copy-button'); customIndexExportButton = document.getElementById('custom-index-export-button');
    suLoading = document.getElementById('su-loading'); suError = document.getElementById('su-error'); suRowCount = document.getElementById('su-row-count');
    suTable = document.getElementById('su-table');
    if (suTable) { suTableHeadElement = suTable.querySelector('thead'); suTableBodyElement = suTable.querySelector('tbody'); }
    suExportButton = document.getElementById('su-export-button');
    chartPopup = document.getElementById('chart-popup'); chartPopupContainer = document.getElementById('chart-popup-container');
    allCalculatorInputs = [ capitalInput, riskRiskPercentInput, riskEntryPriceInput, riskSlPriceInput, allocAllocationPercentInput, allocEntryPriceInput, allocSlPriceInput ];

    if (finvestikLogo) finvestikLogo.addEventListener('click', () => switchView('calculator-view'));
    if (themeToggle) themeToggle.addEventListener('click', toggleAndSaveTheme);
    if (hamburgerMenuButton) hamburgerMenuButton.addEventListener('click', toggleMobileMenu);
    [[navCalculator, 'calculator-view'], [navStockUniverse, 'stock-universe-view'], [navCustomIndex, 'custom-index-view'],
     [mobileNavCalculator, 'calculator-view'], [mobileNavStockUniverse, 'stock-universe-view'], [mobileNavCustomIndex, 'custom-index-view']
    ].forEach(([navButton, viewName]) => { if (navButton) navButton.addEventListener('click', () => switchView(viewName)); });
    if(suTableHeadElement) { suTableHeadElement.addEventListener('click', (e) => { const header = e.target.closest('.sortable-header'); if (!header || e.target.classList.contains('resize-handle')) return; const key = header.dataset.key; if(!key) return; if (suCurrentSort.key === key) { suCurrentSort.order = suCurrentSort.order === 'asc' ? 'desc' : 'asc'; } else { suCurrentSort.key = key; suCurrentSort.order = 'desc'; } updateSortIcons(); applyAndRenderSU(); }); }
    if(suExportButton) suExportButton.addEventListener('click', exportStockUniverseAsZip);
    if(suTableBodyElement) { suTableBodyElement.addEventListener('mouseover', (e) => { if (e.target.closest('.symbol-cell')) { showChartPopup(e); } }); suTableBodyElement.addEventListener('mouseout', (e) => { if (e.target.closest('.symbol-cell')) { hideChartPopup(); } }); }
    if(chartPopup) { chartPopup.addEventListener('mouseenter', () => clearTimeout(chartPopupTimeout)); chartPopup.addEventListener('mouseleave', hideChartPopup); }
    if (customIndexRefreshButton) customIndexRefreshButton.addEventListener('click', () => fetchAndRenderCustomIndexData({ force: true }));
    if (customIndexCopyButton) customIndexCopyButton.addEventListener('click', copyCustomIndexData);
    if (customIndexExportButton) customIndexExportButton.addEventListener('click', exportCustomIndexData);
    allCalculatorInputs.forEach(input => { if (input) { input.addEventListener('input', () => { sanitizeNumericInput(input); updateAllCalculationsAndSave(); }); input.addEventListener('blur', () => { sanitizeNumericInput(input); if (input.value.endsWith('.')) { input.value = input.value.slice(0, -1); } updateAllCalculationsAndSave(); }); } });
    if(currentYearElement) currentYearElement.textContent = new Date().getFullYear();
    loadTheme(); loadCalculatorSettings(); updateAllCalculationsAndSave(); 
    preloadStockUniverseData().finally(() => { const lastView = localStorage.getItem(ACTIVE_VIEW_KEY) || 'calculator-view'; switchView(lastView); });
});
if (!Element.prototype.matches) { Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector; }
if (!Element.prototype.closest) { Element.prototype.closest = function(s) { var el = this; do { if (Element.prototype.matches.call(el, s)) return el; el = el.parentElement || el.parentNode; } while (el !== null && el.nodeType === 1); return null; }; }
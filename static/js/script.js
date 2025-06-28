// --- GLOBAL CONSTANTS & SETTINGS ---
const APP_SETTINGS_KEY = 'finvestikCalculatorSettings';
const THEME_KEY = 'finvestikTheme';
const ACTIVE_VIEW_KEY = 'finvestikActiveView';
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOqNgqIvbKgZ2SNvOAGkhW6iXxm1xXK_R1xCorTNDQkWRxod8-8G8x0isl1zTVHDVeHsfwfZfJLlkh/pub?output=csv";
const STOCK_UNIVERSE_DATA_PATH = "static/data/stock_universe.json";
const CUSTOM_INDEX_CACHE_KEY = 'finvestikCustomIndexCache';
const CUSTOM_INDEX_CACHE_DURATION_MS = 15 * 60 * 1000;
const SU_COLUMN_ORDER_KEY = 'finvestikSUColumnOrderKey';
const SU_COLUMN_WIDTHS_KEY = 'finvestikSUColumnWidthsKey';
const SU_FILTERS_KEY = 'finvestikSUFiltersKey';
const SU_CHART_PANEL_SETTINGS = 'finvestikSUChartPanel';
const PROFESSIONAL_CHART_COLORS = [ '#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1', '#f59e0b', '#d946ef', '#0ea5e9', '#22c55e', '#ec4899' ];

// --- FORMATTER & HELPER FUNCTIONS ---
const formatValue = (value, fallback = 'N/A') => (value !== null && value !== undefined) ? String(value) : fallback;
const formatPrice = (value) => (typeof value === 'number') ? value.toFixed(2) : formatValue(value);
const formatIntlNumber = (value) => (typeof value === 'number') ? value.toLocaleString('en-IN') : formatValue(value);
const formatChangePercent = (value) => { if (typeof value !== 'number') return formatValue(value); return `${value.toFixed(2)}%`; };
function debounce(func, delay = 300) { let timeoutId; return function(...args) { clearTimeout(timeoutId); timeoutId = setTimeout(() => { func.apply(this, args); }, delay); }; }

// --- CONFIGURATION ---
const suColumnDefinitions = [
    { key: "Symbol", displayName: "Symbol", isVisible: true, isSortable: true, defaultWidth: '100px' },
    { key: "Stock Name", displayName: "Stock Name", isVisible: true, isSortable: true, defaultWidth: '200px' },
    { key: "current_price", displayName: "Close", isVisible: true, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right', isFilterable: true, filterType: 'text' },
    { key: "change_percentage", displayName: "Change %", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text' , formatter: formatChangePercent, defaultWidth: '95px', cellClass: 'text-right font-semibold' },
    { key: "circuitLimit", displayName: "Circuit Limit", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text' , defaultWidth: '95px', cellClass: 'text-right font-semibold' },
    { key: "day_open", displayName: "Open", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right' },
    { key: "day_high", displayName: "High", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right' }, 
    { key: "day_low", displayName: "Low", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right' },
    { key: "day_volume", displayName: "Volume", isVisible: true, isSortable: true, formatter: formatIntlNumber, defaultWidth: '110px', cellClass: 'text-right', isFilterable: true, filterType: 'text' }, 
    { key: "Market Cap", displayName: "Market Cap (Cr.)", isVisible: true, isSortable: true, formatter: formatIntlNumber, defaultWidth: '120px', cellClass: 'text-right', isFilterable: true, filterType: 'text' }, 
    { key: "Turnover", displayName: "Turnover (Cr.)", isVisible: true, isSortable: true, formatter: formatIntlNumber, defaultWidth: '120px', cellClass: 'text-right', isFilterable: true, filterType: 'text' }, 
    { key: "fifty_two_week_high", displayName: "52W High", isVisible: true, isSortable: true, formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right' },
    { key: "fifty_two_week_low", displayName: "52W Low", isVisible: true, isSortable: true, formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right' }, 
    { key: "Down from 52W High (%)", displayName: "52WH ↓ ", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right' },
    { key: "Up from 52W Low (%)", displayName: "52WL ↑", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right' },
    { key: "Sector Name", displayName: "Sector Name", isVisible: true, isSortable: true, isFilterable: true, filterType: 'dropdown', defaultWidth: '160px' }, 
    { key: "Industry Name", displayName: "Industry Name", isVisible: true, isSortable: true, isFilterable: true, filterType: 'dropdown', defaultWidth: '180px' },
    { key: "SecurityID", displayName: "Security ID", isVisible: false }, { key: "ListingID", displayName: "Listing ID", isVisible: false },
    { key: "SME Stock?", displayName: "SME?", isVisible: false }, { key: "previous_close", displayName: "Prev. Close", isVisible: false }
];

// --- DOM ELEMENTS ---
let finvestikLogo, themeToggle, hamburgerMenuButton, mobileMenu,
    navCalculator, navStockUniverse, navCustomIndex, mobileNavCalculator, mobileNavStockUniverse, mobileNavCustomIndex,
    mainContentArea, calculatorView, customIndexView, stockUniverseView,
    capitalInputContainer, capitalInput, capitalError, riskRiskPercentInput, riskEntryPriceInput, riskSlPriceInput, riskRiskPercentError, riskEntryPriceError, riskSlPriceError, riskResultsContainer, riskCalculationWarning, riskErrorSummary, riskResultQty, riskResultRiskAmount, riskResultSlPercent, riskResultAllocationPercent, riskResultTotalCost,
    allocAllocationPercentInput, allocEntryPriceInput, allocSlPriceInput, allocAllocationPercentError, allocEntryPriceError, allocSlPriceError, allocResultsContainer, allocCalculationWarning, allocErrorSummary,
    customIndexTable, customIndexTableHead, customIndexTableBody, customIndexLoading, customIndexError, customIndexMessage, customIndexLastUpdated, customIndexCopyButton, customIndexExportButton, customIndexRefreshButton,
    suLoading, suError, suRowCount, suTable, suTableHeadElement, suTableBodyElement, suHeaderRow, suFilterRow, suExportButton,
    suInsightsToggleButton, suContainer, suTableContainer, suPanelResizer, suChartPanel, suChartContent, suChartStatus, suChartGroupBy, suChartWhRange, suChartMinStocks,
    suChartFilterClose, suChartFilterChange, suChartFilterVolume, suChartFilterMcap, syncedTextFilterInputs = {},
    chartPopup, chartPopupContainer, allCalculatorInputs = [], currentYearElement;

// --- STATE MANAGEMENT ---
let currentCustomIndexData = [], fullStockData = [], suCurrentColumnOrder = [], suColumnWidths = {}, currentlyDisplayedSUData = [], isStockDataLoaded = false;
let suCurrentSort = { key: 'Market Cap', order: 'desc' };
let suFilters = {}; let chartPopupTimeout, sortableInstance; 
let currentResizing = { th: null, startX: 0, startWidth: 0 }, panelResizing = { active: false, startX: 0, startWidth: 0 }; 

// --- THEME & VIEW MANAGEMENT ---
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-.386 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591" /></svg>`;
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>`;
function applyTheme(theme) { if (theme === 'light') { document.documentElement.classList.add('light'); if (themeToggle) themeToggle.innerHTML = moonIcon; } else { document.documentElement.classList.remove('light'); if (themeToggle) themeToggle.innerHTML = sunIcon; } if (chartPopup && !chartPopup.classList.contains('hidden')) { const symbol = chartPopupContainer.dataset.currentSymbol; if (symbol) createTradingViewWidget(symbol, theme); } }
function loadTheme() { const p = localStorage.getItem(THEME_KEY), s = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(p || (s ? 'dark' : 'light')); }
function toggleAndSaveTheme() { const newTheme = document.documentElement.classList.contains('light') ? 'dark' : 'light'; applyTheme(newTheme); localStorage.setItem(THEME_KEY, newTheme); }

function switchView(viewId) {
    [calculatorView, customIndexView, stockUniverseView].forEach(v => v?.classList.add('hidden'));
    [navCalculator, navStockUniverse, navCustomIndex, mobileNavCalculator, mobileNavStockUniverse, mobileNavCustomIndex].forEach(n => n?.classList.remove('active'));

    // Layout Adjustment for Full-Screen
    if (viewId === 'stock-universe-view') {
        mainContentArea.classList.remove('max-w-7xl'); mainContentArea.classList.add('max-w-full');
    } else {
        mainContentArea.classList.remove('max-w-full'); mainContentArea.classList.add('max-w-7xl');
    }

    let targetView, targetNav, targetMobileNav;
    if (viewId === 'calculator-view') { targetView = calculatorView; targetNav = navCalculator; targetMobileNav = mobileNavCalculator; if(capitalInputContainer) capitalInputContainer.style.display = 'flex'; }
    else if (viewId === 'custom-index-view') { targetView = customIndexView; targetNav = navCustomIndex; targetMobileNav = mobileNavCustomIndex; if(capitalInputContainer) capitalInputContainer.style.display = 'none'; fetchAndRenderCustomIndexData(); }
    else if (viewId === 'stock-universe-view') { targetView = stockUniverseView; targetNav = navStockUniverse; targetMobileNav = mobileNavStockUniverse; if(capitalInputContainer) capitalInputContainer.style.display = 'none'; displayStockUniverse(); }
    
    if (targetView) targetView.classList.remove('hidden');
    if (targetNav) targetNav.classList.add('active');
    if(targetMobileNav) targetMobileNav.classList.add('active');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) toggleMobileMenu();
    localStorage.setItem(ACTIVE_VIEW_KEY, viewId);
}
function toggleMobileMenu() { if (!hamburgerMenuButton || !mobileMenu) return; const isExpanded = hamburgerMenuButton.getAttribute('aria-expanded') === 'true'; hamburgerMenuButton.setAttribute('aria-expanded', String(!isExpanded)); mobileMenu.classList.toggle('hidden'); const icons = hamburgerMenuButton.querySelectorAll('svg'); if (icons.length === 2) { icons[0].classList.toggle('hidden'); icons[1].classList.toggle('hidden'); } }

// --- TRADING VIEW WIDGET ---
function createTradingViewWidget(symbol, theme) { if (!chartPopupContainer) return; chartPopupContainer.innerHTML = ''; chartPopupContainer.dataset.currentSymbol = symbol; const widgetConfig = { "width": "680", "height": "480", "symbol": symbol, "interval": "D", "timezone": "Asia/Kolkata", "theme": theme, "style": "1", "locale": "en", "withdateranges": true, "range": "YTD","hide_side_toolbar": true, "allow_symbol_change": false, "support_host": "https://www.tradingview.com" }; const script = document.createElement('script'); script.type = 'text/javascript'; script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; script.async = true; script.innerHTML = JSON.stringify(widgetConfig); chartPopupContainer.appendChild(script); }
function showChartPopup(event) { if (!chartPopup) return; clearTimeout(chartPopupTimeout); const cell = event.target.closest('.symbol-cell'); if (!cell || !cell.dataset.symbol) return; const symbol = cell.dataset.symbol; const tradingViewSymbol = `BSE:${symbol}`; const currentTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark'; createTradingViewWidget(tradingViewSymbol, currentTheme); const popupWidth = chartPopup.offsetWidth, popupHeight = chartPopup.offsetHeight, offset = 15; const cellRect = cell.getBoundingClientRect(), viewportWidth = window.innerWidth, viewportHeight = window.innerHeight; let top = cellRect.top + (cellRect.height / 2) - (popupHeight / 2); top = Math.max(10, Math.min(top, viewportHeight - popupHeight - 10 - offset)); let left = (cellRect.right + popupWidth + offset) < viewportWidth ? cellRect.right + offset : cellRect.left - popupWidth - offset; left = Math.max(10, Math.min(left, viewportWidth - popupWidth - 10 - offset)); chartPopup.style.left = `${left}px`; chartPopup.style.top = `${top}px`; chartPopup.classList.remove('hidden'); }
function hideChartPopup() { if (!chartPopup) return; chartPopupTimeout = setTimeout(() => { chartPopup.classList.add('hidden'); if (chartPopupContainer) { chartPopupContainer.innerHTML = ''; delete chartPopupContainer.dataset.currentSymbol; } }, 300); }

// --- STOCK UNIVERSE STATE & SETTINGS ---
function loadSUColumnSettings() { const allKeys=new Set(suColumnDefinitions.map(d=>d.key)); const savedJSON=localStorage.getItem(SU_COLUMN_ORDER_KEY); let savedOrder=[]; if(savedJSON){try{savedOrder=JSON.parse(savedJSON).filter(k=>allKeys.has(k));}catch(e){}} const savedKeySet=new Set(savedOrder); const missingKeys=suColumnDefinitions.map(d=>d.key).filter(k=>!savedKeySet.has(k)); suCurrentColumnOrder=[...savedOrder, ...missingKeys]; saveSUColumnOrder(); const widthsJSON = localStorage.getItem(SU_COLUMN_WIDTHS_KEY); try{suColumnWidths=widthsJSON?JSON.parse(widthsJSON):{};}catch(e){suColumnWidths={};} }
function saveSUColumnOrder() { localStorage.setItem(SU_COLUMN_ORDER_KEY, JSON.stringify(suCurrentColumnOrder)); }
function saveSUColumnWidths() { localStorage.setItem(SU_COLUMN_WIDTHS_KEY, JSON.stringify(suColumnWidths)); }
function loadSUFilters() { const saved = JSON.parse(localStorage.getItem(SU_FILTERS_KEY) || '{}'); suFilters = { columns: saved.columns || {}, textFilters: saved.textFilters || {}, chart: saved.chart || { groupBy: 'Sector Name', whRange: 25, minStocks: 0 } }; }
function saveSUFilters() { localStorage.setItem(SU_FILTERS_KEY, JSON.stringify(suFilters)); }

// --- STOCK UNIVERSE: DATA LOADING, FILTERING & RENDERING ---
async function preloadStockUniverseData() { if (isStockDataLoaded) return; try { const res=await fetch(STOCK_UNIVERSE_DATA_PATH); if (!res.ok) throw new Error(`${res.status}`); const jsonData=await res.json(); fullStockData=jsonData?.map(r=>({...r,"Market Cap":parseFloat(r["Market Cap"])||0}))||[]; isStockDataLoaded=true; loadSUColumnSettings(); loadSUFilters(); if(stockUniverseView&&!stockUniverseView.classList.contains('hidden')) displayStockUniverse(); } catch(err){ console.error("SU data load failed:", err); if(suError)suError.textContent=`Error loading data.`;isStockDataLoaded=false;fullStockData=[]; throw err;}}
function displayStockUniverse() { if(isStockDataLoaded){if(suLoading)suLoading.classList.add('hidden');if(suError)suError.classList.add('hidden');applyAndRenderSU();} else {if(suLoading)suLoading.classList.remove('hidden');if(suError)suError.classList.add('hidden');preloadStockUniverseData().catch(err=>{if(suLoading)suLoading.classList.add('hidden');if(suError){suError.textContent=`Error: ${err.message}`;suError.classList.remove('hidden');}});}}
function parseNumericFilter(value) {
    const f = { gt: null, lt: null };
    if (!value) return f;
    let v = String(value).trim();
    const multipliers = { 'k': 1e3, 'm': 1e6, 'cr': 1e7 };
    const lastChar = v.slice(-1).toLowerCase();
    const lastTwoChars = v.slice(-2).toLowerCase();

    if (multipliers[lastTwoChars]) {
        v = parseFloat(v.slice(0, -2)) * multipliers[lastTwoChars];
    } else if (multipliers[lastChar]) {
        v = parseFloat(v.slice(0, -1)) * multipliers[lastChar];
    }

    // Regex to match expressions like "< -5", ">=10", ">-2.5"
    const exps = String(v).match(/([<>]=?)\s*(-?\d*\.?\d+)/g) || [];

    if (exps.length > 0) {
        exps.forEach(e => {
            const n = parseFloat(e.replace(/[<>= ]/g, ''));
            if (isNaN(n)) return;
            if (e.startsWith('>=')) f.gt = n - 0.001;
            else if (e.startsWith('>')) f.gt = n;
            else if (e.startsWith('<=')) f.lt = n + 0.001;
            else if (e.startsWith('<')) f.lt = n;
        });
    } else {
        const n = parseFloat(v);
        if (!isNaN(n) && n > 0) {
            // Apply a +/- 10% range for single positive numbers
            f.gt = n * 0.9 - 0.001;
            f.lt = n * 1.1 + 0.001;
        }
    }
    return f;
}
function applyAndRenderSU() {
    if (!isStockDataLoaded) { displayStockUniverse(); return; } 
    let filteredData = [...fullStockData];
    Object.entries(suFilters.columns).forEach(([k, v])=>{if(v && v!=='ALL')filteredData=filteredData.filter(r=>String(r[k])===String(v));});
    Object.entries(suFilters.textFilters).forEach(([k, s])=>{if(s){const{gt,lt}=parseNumericFilter(s);if(gt!==null)filteredData=filteredData.filter(r=>r[k]>gt);if(lt!==null)filteredData=filteredData.filter(r=>r[k]<lt);}});
    if(suCurrentSort.key)filteredData.sort((a,b)=>{const vA=a[suCurrentSort.key],vB=b[suCurrentSort.key];let c=0;if(typeof vA==='number'&&typeof vB==='number')c=vA-vB;else c=String(vA??'').localeCompare(String(vB??''));return suCurrentSort.order==='asc'?c:-c;});
    currentlyDisplayedSUData = filteredData; saveSUFilters();
    renderStockUniverseTable(filteredData); renderInsightChart(filteredData);
}

// --- STOCK UNIVERSE: UI CREATION & EVENT HANDLERS ---
function createSUHeaderAndFilterRows() {
    if (!suTableHeadElement) return; suTableHeadElement.innerHTML='';
    suHeaderRow=document.createElement('tr'); suFilterRow=document.createElement('tr'); suFilterRow.id='su-filter-row';
    const colsToRender=suCurrentColumnOrder.map(k=>suColumnDefinitions.find(d=>d.key===k)).filter(d=>d&&d.isVisible);
    colsToRender.forEach(def=>{const th=document.createElement('th');th.className='sortable-header resizable';th.dataset.key=def.key;th.innerHTML=`${def.displayName} <span class="sort-icon"></span><div class="resize-handle"></div>`;th.style.width=suColumnWidths[def.key]||def.defaultWidth;suHeaderRow.appendChild(th);const filterTd=document.createElement('td');if(def.isFilterable){if(def.filterType==='dropdown'){const select=document.createElement('select');select.className='form-input text-xs p-1 w-full';select.dataset.filterKey=def.key;select.value=suFilters.columns[def.key]||'ALL';select.addEventListener('change',e=>{suFilters.columns[def.key]=e.target.value;if(def.key==='Sector Name')updateDependentDropdowns();applyAndRenderSU();});filterTd.appendChild(select);}else if(def.filterType==='text'){const input=document.createElement('input');input.type='text';input.placeholder='e.g. >100 <1k';input.className='form-input text-xs p-1 w-full';input.dataset.filterKey=def.key;input.value=suFilters.textFilters[def.key]||'';
    syncedTextFilterInputs[def.key] = { table: input, chart: document.getElementById(`su-chart-filter-${def.key.toLowerCase().replace(/[^a-z0-9]/g, '')}`) };
    input.addEventListener('input', debounce(handleSyncedFilterChange, 350));
    filterTd.appendChild(input);}}suFilterRow.appendChild(filterTd);});
    suTableHeadElement.append(suHeaderRow, suFilterRow); populateTopLevelDropdowns();updateSortIcons();initializeSortable();initializeResizeHandles();
}
function handleSyncedFilterChange(event) {
    const input = event.target;
    const key = input.dataset.filterKey;
    const newValue = input.value;
    suFilters.textFilters[key] = newValue; // Update central state
    // Update partner input
    const partners = syncedTextFilterInputs[key];
    if (partners) {
        if (input === partners.table && partners.chart) partners.chart.value = newValue;
        else if (input === partners.chart && partners.table) partners.table.value = newValue;
    }
    applyAndRenderSU();
}
function initializeSortable() { if(sortableInstance)sortableInstance.destroy();if(suHeaderRow)sortableInstance=Sortable.create(suHeaderRow,{animation:150,ghostClass:'sortable-ghost',onEnd:()=>{suCurrentColumnOrder=Array.from(suHeaderRow.children).map(th=>th.dataset.key);saveSUColumnOrder();applyAndRenderSU();}});}
function initializeResizeHandles() { if(!suHeaderRow)return;suHeaderRow.querySelectorAll('.resize-handle').forEach(h=>h.addEventListener('mousedown',onResizeMouseDown));}
function onResizeMouseDown(e){if(e.button!==0)return;currentResizing.th=e.target.parentElement;currentResizing.startX=e.pageX;currentResizing.startWidth=currentResizing.th.offsetWidth;document.addEventListener('mousemove',onResizeMouseMove);document.addEventListener('mouseup',onResizeMouseUp);e.target.classList.add('active');e.preventDefault();}
function onResizeMouseMove(e){if(!currentResizing.th)return;const dx=e.pageX-currentResizing.startX;let w=Math.max(50,currentResizing.startWidth+dx);currentResizing.th.style.width=`${w}px`;}
function onResizeMouseUp(){if(currentResizing.th){suColumnWidths[currentResizing.th.dataset.key]=currentResizing.th.style.width;saveSUColumnWidths();currentResizing.th.querySelector('.resize-handle')?.classList.remove('active');}document.removeEventListener('mousemove',onResizeMouseMove);document.removeEventListener('mouseup',onResizeMouseUp);currentResizing.th=null;}
function initializePanelResizer() {if(!suPanelResizer)return;suPanelResizer.addEventListener('mousedown',e=>{if(e.button!==0)return;panelResizing.active=true;panelResizing.startX=e.pageX;panelResizing.startWidth=suChartPanel.offsetWidth;suPanelResizer.classList.add('active');document.body.style.cursor='col-resize';document.body.style.userSelect='none';document.addEventListener('mousemove',onPanelResizeMouseMove);document.addEventListener('mouseup',onPanelResizeMouseUp,{once:true});e.preventDefault();});}
function onPanelResizeMouseMove(e) {if(!panelResizing.active)return;const dx=e.pageX-panelResizing.startX;let w=Math.max(320,Math.min(panelResizing.startWidth-dx,1000));suChartPanel.style.width=`${w}px`;}
function onPanelResizeMouseUp() {panelResizing.active=false;suPanelResizer.classList.remove('active');document.body.style.cursor='';document.body.style.userSelect='';document.removeEventListener('mousemove',onPanelResizeMouseMove);try{const s=JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS)||'{}');s.width=suChartPanel.style.width;localStorage.setItem(SU_CHART_PANEL_SETTINGS,JSON.stringify(s));}catch(e){}}
function updateSortIcons() {if(!suHeaderRow)return;suHeaderRow.querySelectorAll('.sortable-header .sort-icon').forEach(i=>i.innerHTML='');const h=suHeaderRow.querySelector(`.sortable-header[data-key="${suCurrentSort.key}"] .sort-icon`);if(h)h.innerHTML=suCurrentSort.order==='asc'?'▲':'▼';}
function renderStockUniverseTable(data) { if(!isStockDataLoaded||!suTableHeadElement)return; if(!suHeaderRow)createSUHeaderAndFilterRows(); const cols=suCurrentColumnOrder.map(k=>suColumnDefinitions.find(d=>d.key===k)).filter(d=>d&&d.isVisible); const frag=document.createDocumentFragment(); if(data.length){data.forEach(r=>{const tr=document.createElement('tr');cols.forEach(def=>{const td=document.createElement('td');let v=r[def.key];td.textContent=def.formatter?def.formatter(v):formatValue(v);if(def.cellClass)td.className=def.cellClass;if(def.key==='change_percentage'&&typeof v==='number')td.style.color=v>=0?'var(--result-positive-text)':'var(--result-negative-text)';if(def.key==='Symbol'){td.classList.add('symbol-cell');td.dataset.symbol=v;}tr.appendChild(td);});frag.appendChild(tr);});}else{const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=cols.length||1;td.className='text-center p-4';td.textContent='No stocks match the current filters.';tr.appendChild(td);frag.appendChild(tr);} suTableBodyElement.innerHTML='';suTableBodyElement.appendChild(frag); if(suRowCount)suRowCount.textContent=`Showing ${data.length} of ${fullStockData.length} stocks.`; }
function populateTopLevelDropdowns() { if(!suFilterRow||fullStockData.length===0)return;const ddefs=suColumnDefinitions.filter(d=>d.isFilterable&&d.filterType==='dropdown');ddefs.forEach(def=>{const s=suFilterRow.querySelector(`select[data-filter-key="${def.key}"]`);if(s){const vals=[...new Set(fullStockData.map(i=>i[def.key]).filter(Boolean))].sort();const cur=suFilters.columns[def.key]||'ALL';s.innerHTML=`<option value="ALL">ALL</option>`+vals.map(v=>`<option value="${v}">${v}</option>`).join('');s.value=cur;}});updateDependentDropdowns();}
function updateDependentDropdowns() { if(!suFilterRow||!fullStockData.length)return;const selSec=suFilters.columns['Sector Name']||'ALL';const indDrop=suFilterRow.querySelector(`select[data-filter-key="Industry Name"]`);if(!indDrop)return;let relInd=[...new Set(fullStockData.filter(r=>selSec==='ALL'||r['Sector Name']===selSec).map(i=>i['Industry Name']).filter(Boolean))].sort();const curInd=suFilters.columns['Industry Name']||'ALL';indDrop.innerHTML=`<option value="ALL">ALL</option>`+relInd.map(v=>`<option value="${v}">${v}</option>`).join('');indDrop.value=relInd.includes(curInd)?curInd:'ALL';if(!relInd.includes(curInd))suFilters.columns['Industry Name']='ALL';}

function renderInsightChart(data) {
    if (!suChartContent || !suFilters.chart) return;
    const { groupBy, whRange, minStocks } = suFilters.chart;
    if (suChartStatus) suChartStatus.textContent = `Chart based on ${data.length} filtered stock(s).`;
    
    const groups = data.reduce((acc, stock) => {
        const key = stock[groupBy];
        if (!key) return acc;
        if (!acc[key]) acc[key] = { total: 0, nearHigh: 0 };
        acc[key].total++;
        if (typeof stock['Down from 52W High (%)'] === 'number' && stock['Down from 52W High (%)'] <= whRange) {
            acc[key].nearHigh++;
        }
        return acc;
    }, {});

    const chartData = Object.entries(groups)
        .map(([name, counts]) => ({
            name,
            percentage: counts.total > 0 ? (counts.nearHigh / counts.total) * 100 : 0,
            total: counts.total,
            nearHigh: counts.nearHigh
        }))
        .filter(d => d.total > 0 && d.total >= (minStocks || 0)) // Apply min stocks filter
        .sort((a, b) => b.percentage - a.percentage);

    suChartContent.innerHTML = '';
    if (chartData.length === 0) {
        suChartContent.innerHTML = `<p class="p-4 text-center text-xs" style="color:var(--text-secondary)">No groups meet criteria.</p>`;
        return;
    }
    const frag = document.createDocumentFragment();
    chartData.forEach((item, index) => {
        const barColor = PROFESSIONAL_CHART_COLORS[index % PROFESSIONAL_CHART_COLORS.length];
        const barItem = document.createElement('div');
        barItem.className = 'chart-bar-item';
        if (suFilters.columns[groupBy] === item.name) barItem.classList.add('active');
        barItem.dataset.groupKey = item.name;
        barItem.title = `${item.name}: ${item.nearHigh} of ${item.total} stocks (${item.percentage.toFixed(2)}%) are within ${whRange}% of 52-week high.`;
        
        barItem.innerHTML = `<div class="chart-bar-value">${item.percentage.toFixed(1)}%</div>
                             <div class="chart-bar-container">
                                <div class="chart-bar-fill" style="width: ${item.percentage}%; background-color: ${barColor};"></div>
                                <div class="chart-bar-label">${item.name}</div>
                             </div>`;
        frag.appendChild(barItem);
    });
    suChartContent.appendChild(frag);
}
function handleChartBarClick(event) {
    const bar = event.target.closest('.chart-bar-item'); if(!bar||!bar.dataset.groupKey)return;
    const groupKeyName = suFilters.chart.groupBy, groupValue = bar.dataset.groupKey;
    const dropdown = suFilterRow.querySelector(`select[data-filter-key="${groupKeyName}"]`);
    if(dropdown){
        // Toggle logic
        if (suFilters.columns[groupKeyName] === groupValue) suFilters.columns[groupKeyName] = 'ALL';
        else suFilters.columns[groupKeyName] = groupValue;
        
        dropdown.value = suFilters.columns[groupKeyName]; // Update dropdown UI
        if(groupKeyName === 'Sector Name') updateDependentDropdowns(); applyAndRenderSU();
    }
}
function handleChartControlsChange() {
    if (suChartWhRange) sanitizeNumericInput(suChartWhRange);
    if (suChartMinStocks) sanitizeNumericInput(suChartMinStocks, { allowDecimal: false });

    const whRangeValue = parseFloat(suChartWhRange.value);
    const minStocksValue = parseInt(suChartMinStocks.value, 10);

    suFilters.chart.groupBy = suChartGroupBy.value;
    suFilters.chart.whRange = isNaN(whRangeValue) || whRangeValue < 0 ? 0 : whRangeValue;
    suFilters.chart.minStocks = isNaN(minStocksValue) || minStocksValue < 0 ? 0 : minStocksValue;

    if (suChartWhRange.value !== String(suFilters.chart.whRange)) suChartWhRange.value = suFilters.chart.whRange;
    if (suChartMinStocks.value !== String(suFilters.chart.minStocks)) suChartMinStocks.value = suFilters.chart.minStocks || '';
    
    applyAndRenderSU();
}
function toggleInsightsPanel() { if(!suChartPanel)return; const isHidden=suChartPanel.classList.toggle('hidden'); suPanelResizer.classList.toggle('hidden',isHidden); suInsightsToggleButton.classList.toggle('active',!isHidden); try{const s=JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS)||'{}');s.isOpen=!isHidden;localStorage.setItem(SU_CHART_PANEL_SETTINGS,JSON.stringify(s));}catch(e){}}

// --- EXPORT & OTHER UTILITIES ---
function exportStockUniverseAsMultiFileZip(){if(!currentlyDisplayedSUData||!currentlyDisplayedSUData.length){alert("No data to export.");return}if(typeof JSZip==='undefined'||typeof saveAs==='undefined'){console.error("JSZip or FileSaver not loaded.");return}const sectors={};currentlyDisplayedSUData.forEach(s=>{const sec=s['Sector Name'],ind=s['Industry Name'],sym=s['Symbol'];if(!sectors[sec])sectors[sec]={};if(!sectors[sec][ind])sectors[sec][ind]=[];sectors[sec][ind].push(sym);});const zip=new JSZip();Object.keys(sectors).sort().forEach(sn=>{let fc='';Object.keys(sectors[sn]).sort().forEach(inm=>{const syms=sectors[sn][inm].join(',');fc+=`###${inm},${syms}\n`;});zip.file(`${sn}.txt`,fc.trim());});zip.generateAsync({type:"blob"}).then(c=>saveAs(c,"TV Sector Data.zip"));}
function exportStockUniverseAsSingleFile(){if(!currentlyDisplayedSUData||!currentlyDisplayedSUData.length){alert("No data to export.");return}if(typeof saveAs==='undefined'){console.error("FileSaver library not loaded.");return}const inds={};currentlyDisplayedSUData.forEach(s=>{const ind=s['Industry Name'],sym=s['Symbol'];if(!ind)return;if(!inds[ind]){inds[ind]=[];}inds[ind].push(sym);});let fc='';Object.keys(inds).sort().forEach(inm=>{const syms=inds[inm].join(',');fc+=`###${inm},${syms}\n`;});const blob=new Blob([fc.trim()],{type:"text/plain;charset=utf-8"});saveAs(blob,"stock_universe.txt");}
const safeParseFloat=(str)=>{if(typeof str!=='string'&&typeof str!=='number')return 0;const num=parseFloat(String(str).replace(/,/g,''));return isNaN(num)?0:num;};
const formatCurrency=(value,symbol='₹')=>{if(isNaN(value)||!isFinite(value))return`${symbol}0.00`;return`${symbol}${value.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;};
const formatPercentage=(value)=>{if(isNaN(value)||!isFinite(value))return'0.00%';return`${value.toFixed(2)}%`;};
const formatNumber=(value)=>{if(isNaN(value)||!isFinite(value))return'0';return Math.floor(value).toLocaleString('en-IN');};
const defaultSettings={capital:'100000',risk_riskPercent:'0.5',risk_entryPrice:'305',risk_slPrice:'300',alloc_allocationPercent:'20',alloc_entryPrice:'305',alloc_slPrice:'300'};
function loadCalculatorSettings(){try{const sS=localStorage.getItem(APP_SETTINGS_KEY);const s=sS?JSON.parse(sS):{...defaultSettings};if(capitalInput)capitalInput.value=s.capital||defaultSettings.capital;if(riskRiskPercentInput)riskRiskPercentInput.value=s.risk_riskPercent||defaultSettings.risk_riskPercent;if(riskEntryPriceInput)riskEntryPriceInput.value=s.risk_entryPrice||defaultSettings.risk_entryPrice;if(riskSlPriceInput)riskSlPriceInput.value=s.risk_slPrice||defaultSettings.risk_slPrice;if(allocAllocationPercentInput)allocAllocationPercentInput.value=s.alloc_allocationPercent||defaultSettings.alloc_allocationPercent;if(allocEntryPriceInput)allocEntryPriceInput.value=s.alloc_entryPrice||defaultSettings.alloc_entryPrice;if(allocSlPriceInput)allocSlPriceInput.value=s.alloc_slPrice||defaultSettings.alloc_slPrice;}catch(e){console.error('Error loading calc settings:',e);}};
function saveCalculatorSettings(){if(!capitalInput)return;const cS={capital:capitalInput.value,risk_riskPercent:riskRiskPercentInput.value,risk_entryPrice:riskEntryPriceInput.value,risk_slPrice:riskSlPriceInput.value,alloc_allocationPercent:allocAllocationPercentInput.value,alloc_entryPrice:allocEntryPriceInput.value,alloc_slPrice:allocSlPriceInput.value};try{localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(cS));}catch(e){console.error('Error saving calc settings:',e);}};
function sanitizeNumericInput(iE, options = { allowDecimal: true }) {
    if (!iE) return;
    let v = iE.value;
    let sV = options.allowDecimal ? v.replace(/[^0-9.]/g, '') : v.replace(/[^0-9]/g, '');

    if (options.allowDecimal) {
        const p = sV.split('.');
        if (p.length > 2) {
            sV = p[0] + '.' + p.slice(1).join('');
        }
        if (sV === '.') sV = '0.';
    }
    
    if (sV.length > 1 && sV.startsWith('0') && !sV.startsWith('0.')) {
        sV = sV.substring(1);
    }
    
    if (sV !== v) {
        iE.value = sV;
    }
}
function calculateRiskBased(){if(!riskRiskPercentError)return;[riskRiskPercentError,riskEntryPriceError,riskSlPriceError,capitalError].forEach(e=>{if(e)e.textContent='';});[riskRiskPercentInput,riskEntryPriceInput,riskSlPriceInput,capitalInput].forEach(e=>{if(e)e.classList.remove('error');});if(riskCalculationWarning)riskCalculationWarning.classList.add('hidden');const cap=safeParseFloat(capitalInput.value),rP=safeParseFloat(riskRiskPercentInput.value),eP=safeParseFloat(riskEntryPriceInput.value),sP=safeParseFloat(riskSlPriceInput.value);let hE=false;if(cap<=0){if(capitalError)capitalError.textContent='Must be > 0.';if(capitalInput)capitalInput.classList.add('error');hE=true}if(rP<=0){if(riskRiskPercentError)riskRiskPercentError.textContent='Must be > 0.';if(riskRiskPercentInput)riskRiskPercentInput.classList.add('error');hE=true}if(eP<=0){if(riskEntryPriceError)riskEntryPriceError.textContent='Must be > 0.';if(riskEntryPriceInput)riskEntryPriceInput.classList.add('error');hE=true}if(sP<0||eP>0&&sP>=eP){if(riskSlPriceError)riskSlPriceError.textContent='SL must be < Entry.';if(riskSlPriceInput)riskSlPriceInput.classList.add('error');hE=true}if(hE||!riskResultQty){return}const rAA=cap*(rP/100),rPS=eP-sP,qty=rPS>0?Math.floor(rAA/rPS):0;riskResultQty.textContent=formatNumber(qty);riskResultRiskAmount.textContent=formatCurrency(rAA);riskResultSlPercent.textContent=formatPercentage(eP>0&&rPS>0?(rPS/eP)*100:0);riskResultAllocationPercent.textContent=formatPercentage(cap>0?(qty*eP/cap)*100:0);riskResultTotalCost.textContent=formatCurrency(qty*eP);}
function calculateAllocationBased(){if(!allocAllocationPercentError)return;const allocResultQty=document.getElementById('alloc_result_qty'),allocResultRiskOnCapitalPercent=document.getElementById('alloc_result_riskOnCapitalPercent'),allocResultRiskAmount=document.getElementById('alloc_result_riskAmount'),allocResultSlPercent=document.getElementById('alloc_result_slPercent'),allocResultTotalCost=document.getElementById('alloc_result_totalCost');[allocAllocationPercentError,allocEntryPriceError,allocSlPriceError,capitalError].forEach(eL=>{if(eL)eL.textContent='';});[allocAllocationPercentInput,allocEntryPriceInput,allocSlPriceInput,capitalInput].forEach(eL=>{if(eL)eL.classList.remove('error');});if(allocCalculationWarning)allocCalculationWarning.classList.add('hidden');const cap=safeParseFloat(capitalInput.value),alloPT=safeParseFloat(allocAllocationPercentInput.value),eP=safeParseFloat(allocEntryPriceInput.value),sP=safeParseFloat(allocSlPriceInput.value);let hE=false;if(cap<=0){if(capitalError)capitalError.textContent='Must be > 0.';if(capitalInput)capitalInput.classList.add('error');hE=true}if(alloPT<=0){if(allocAllocationPercentError)allocAllocationPercentError.textContent='Must be > 0.';if(allocAllocationPercentInput)allocAllocationPercentInput.classList.add('error');hE=true}if(eP<=0){if(allocEntryPriceError)allocEntryPriceError.textContent='Must be > 0.';if(allocEntryPriceInput)allocEntryPriceInput.classList.add('error');hE=true}if(sP<0||eP>0&&sP>=eP){if(allocSlPriceError)allocSlPriceError.textContent='SL must be < Entry.';if(allocSlPriceInput)allocSlPriceInput.classList.add('error');hE=true}if(hE||!allocResultQty){return}const alloA=cap*(alloPT/100),qty=eP>0?Math.floor(alloA/eP):0,rPS=eP-sP,tARA=(rPS>0&&sP>=0)?qty*rPS:0,aROCP=(cap>0&&tARA>0)?(tARA/cap)*100:0,aSP=(eP>0&&rPS>0&&sP>=0)?(rPS/eP)*100:0,tC=qty*eP;allocResultQty.textContent=formatNumber(qty);allocResultRiskOnCapitalPercent.textContent=formatPercentage(aROCP);allocResultRiskAmount.textContent=formatCurrency(tARA);allocResultSlPercent.textContent=formatPercentage(aSP);allocResultTotalCost.textContent=formatCurrency(tC);}
function updateAllCalculationsAndSave(){if(capitalInput&&!capitalInput.classList.contains('error')&&capitalError){capitalError.textContent='';}calculateRiskBased();calculateAllocationBased();saveCalculatorSettings();};
function parseCSV(csvText){const lines=csvText.replace(/\r/g,'').trim().split('\n');if(lines.length<2)return[];const headers=lines[0].split(',').map(h=>h.trim());const result=[];for(let i=1;i<lines.length;i++){if(!lines[i])continue;const values=lines[i].split(',').map(v=>v.trim());if(values.length!==headers.length){continue;}const obj={};for(let j=0;j<headers.length;j++){obj[headers[j]]=values[j];}result.push(obj);}return result;}
async function fetchAndRenderCustomIndexData(options={force:false}){if(!customIndexLoading||!customIndexError||!customIndexMessage||!customIndexLastUpdated||!customIndexTableHead||!customIndexTableBody){return;}try{const cachedDataJSON=localStorage.getItem(CUSTOM_INDEX_CACHE_KEY);if(cachedDataJSON&&!options.force){const cache=JSON.parse(cachedDataJSON);const isCacheFresh=(Date.now()-cache.timestamp)<CUSTOM_INDEX_CACHE_DURATION_MS;if(isCacheFresh){renderCustomIndexTable(cache.data,`Cached at: ${new Date(cache.timestamp).toLocaleString()}`);return;}}}catch(e){console.error("Could not read from custom index cache",e);}customIndexLoading.classList.remove('hidden');customIndexError.classList.add('hidden');customIndexMessage.classList.remove('hidden');customIndexMessage.textContent='Fetching latest data...';try{const response=await fetch(GOOGLE_SHEET_CSV_URL,{cache:"no-store"});if(!response.ok)throw new Error(`Network error CI: ${response.status}`);const csvText=await response.text();if(!csvText||csvText.trim().length<5)throw new Error("Empty/invalid data from CI sheet.");const data=parseCSV(csvText);const timestamp=Date.now();localStorage.setItem(CUSTOM_INDEX_CACHE_KEY,JSON.stringify({data,timestamp}));renderCustomIndexTable(data,`Fetched at: ${new Date(timestamp).toLocaleString()}`);}catch(err){customIndexLoading.classList.add('hidden');customIndexError.textContent=`Error: ${err.message}`;customIndexError.classList.remove('hidden');customIndexMessage.classList.add('hidden');}}
function renderCustomIndexTable(data,timestampText){if(!customIndexLoading||!customIndexError||!customIndexMessage||!customIndexLastUpdated||!customIndexTableHead||!customIndexTableBody){return;}customIndexLoading.classList.add('hidden');customIndexError.classList.add('hidden');customIndexMessage.classList.add('hidden');customIndexLastUpdated.textContent=timestampText;customIndexTableHead.innerHTML='';customIndexTableBody.innerHTML='';if(!data||data.length===0){customIndexTableBody.innerHTML='<tr><td colspan="2" class="text-center p-4">No data to display.</td></tr>';currentCustomIndexData=[];return;}currentCustomIndexData=data;const headers=Object.keys(data[0]);const headerRow=document.createElement('tr');headers.forEach(headerText=>{const th=document.createElement('th');th.textContent=headerText.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());headerRow.appendChild(th);});customIndexTableHead.appendChild(headerRow);data.forEach(item=>{const row=document.createElement('tr');headers.forEach(header=>{const cell=document.createElement('td');cell.textContent=item[header]||'N/A';row.appendChild(cell);});customIndexTableBody.appendChild(row);});}
function formatCustomIndexDataForExport(data){if(!data||data.length===0)return"";const firstItemKeys=Object.keys(data[0]);const sectorKey=firstItemKeys.find(key=>key.toLowerCase()==='sector')||firstItemKeys[0];const symbolKey=firstItemKeys.find(key=>key.toLowerCase()==='symbol')||(firstItemKeys.length>1?firstItemKeys[1]:firstItemKeys[0]);return data.map(item=>`###${item[sectorKey]||''},${item[symbolKey]||''}`).join(',');}
function exportCustomIndexData(){if(!currentCustomIndexData||currentCustomIndexData.length===0){alert("No data to export.");return;}const formattedData=formatCustomIndexDataForExport(currentCustomIndexData);const blob=new Blob([formattedData],{type:'text/plain;charset=utf-8'});const link=document.createElement("a");const url=URL.createObjectURL(blob);link.setAttribute("href",url);link.setAttribute("download","custom_index_data.txt");link.style.visibility='hidden';document.body.appendChild(link);link.click();document.body.removeChild(link);URL.revokeObjectURL(url);if(customIndexMessage){customIndexMessage.textContent="Data exported.";customIndexMessage.classList.remove('hidden');setTimeout(()=>customIndexMessage.classList.add('hidden'),3000);}}
function copyCustomIndexData(){if(!currentCustomIndexData||currentCustomIndexData.length===0){alert("No data to copy.");return;}const formattedData=formatCustomIndexDataForExport(currentCustomIndexData);navigator.clipboard.writeText(formattedData).then(()=>{if(customIndexMessage){customIndexMessage.textContent="Data copied!";customIndexMessage.classList.remove('hidden');setTimeout(()=>customIndexMessage.classList.add('hidden'),3000);}}).catch(err=>{console.error('Failed to copy CI data: ',err);if(customIndexError){customIndexError.textContent="Copy failed.";customIndexError.classList.remove('hidden');setTimeout(()=>customIndexError.classList.add('hidden'),3000);}}); }

// --- DOM INITIALIZATION ---
document.addEventListener('DOMContentLoaded',()=>{
    // Select all elements
    finvestikLogo=document.getElementById('finvestik-logo');themeToggle=document.getElementById('theme-toggle');hamburgerMenuButton=document.getElementById('hamburger-menu-button');mobileMenu=document.getElementById('mobile-menu');navCalculator=document.getElementById('nav-calculator');navStockUniverse=document.getElementById('nav-stock-universe');navCustomIndex=document.getElementById('nav-custom-index');mobileNavCalculator=document.getElementById('mobile-nav-calculator');mobileNavStockUniverse=document.getElementById('mobile-nav-stock-universe');mobileNavCustomIndex=document.getElementById('mobile-nav-custom-index');mainContentArea=document.getElementById('main-content-area');calculatorView=document.getElementById('calculator-view');customIndexView=document.getElementById('custom-index-view');stockUniverseView=document.getElementById('stock-universe-view');capitalInputContainer=document.querySelector('[role="region"][aria-labelledby="capital-heading"]');currentYearElement=document.getElementById('current-year');capitalInput=document.getElementById('capital');capitalError=document.getElementById('capital-error');riskRiskPercentInput=document.getElementById('risk_riskPercent');riskEntryPriceInput=document.getElementById('risk_entryPrice');riskSlPriceInput=document.getElementById('risk_slPrice');riskRiskPercentError=document.getElementById('risk_riskPercent-error');riskEntryPriceError=document.getElementById('risk_entryPrice-error');riskSlPriceError=document.getElementById('risk_slPrice-error');allocAllocationPercentInput=document.getElementById('alloc_allocationPercent');allocEntryPriceInput=document.getElementById('alloc_entryPrice');allocSlPriceInput=document.getElementById('alloc_slPrice');allocAllocationPercentError=document.getElementById('alloc_allocationPercent-error');allocEntryPriceError=document.getElementById('alloc_entryPrice-error');allocSlPriceError=document.getElementById('alloc_slPrice-error');riskResultsContainer=document.getElementById('risk_results_container');riskCalculationWarning=document.getElementById('risk_calculation_warning');riskErrorSummary=document.getElementById('risk_error_summary');riskResultQty=document.getElementById('risk_result_qty');riskResultRiskAmount=document.getElementById('risk_result_riskAmount');riskResultSlPercent=document.getElementById('risk_result_slPercent');riskResultAllocationPercent=document.getElementById('risk_result_allocationPercent');riskResultTotalCost=document.getElementById('risk_result_totalCost');allocResultsContainer=document.getElementById('alloc_results_container');allocCalculationWarning=document.getElementById('alloc_calculation_warning');allocErrorSummary=document.getElementById('alloc_error_summary');customIndexTable=document.getElementById('custom-index-table');if(customIndexTable){customIndexTableHead=customIndexTable.querySelector('thead');customIndexTableBody=customIndexTable.querySelector('tbody');}
    customIndexLoading=document.getElementById('custom-index-loading');customIndexError=document.getElementById('custom-index-error');customIndexMessage=document.getElementById('custom-index-message');customIndexLastUpdated=document.getElementById('custom-index-last-updated');customIndexRefreshButton=document.getElementById('custom-index-refresh-button');customIndexCopyButton=document.getElementById('custom-index-copy-button');customIndexExportButton=document.getElementById('custom-index-export-button');
    suLoading=document.getElementById('su-loading');suError=document.getElementById('su-error');suRowCount=document.getElementById('su-row-count');suTable=document.getElementById('su-table');if(suTable){suTableHeadElement=suTable.querySelector('thead');suTableBodyElement=suTable.querySelector('tbody');}suExportButton=document.getElementById('su-export-button');const suExportSingleButton=document.getElementById('su-export-single-button');
    suInsightsToggleButton=document.getElementById('su-insights-toggle-button');suContainer=document.getElementById('su-container');suTableContainer=document.getElementById('su-table-container');suPanelResizer=document.getElementById('su-panel-resizer');suChartPanel=document.getElementById('su-chart-panel');suChartContent=document.getElementById('su-chart-content');suChartStatus=document.getElementById('su-chart-status');suChartGroupBy=document.getElementById('su-chart-group-by');suChartWhRange=document.getElementById('su-chart-wh-range');
    suChartMinStocks=document.getElementById('su-chart-min-stocks');
    suChartFilterClose = document.getElementById('su-chart-filter-close'); suChartFilterChange = document.getElementById('su-chart-filter-change'); suChartFilterVolume = document.getElementById('su-chart-filter-volume'); suChartFilterMcap = document.getElementById('su-chart-filter-mcap');
    chartPopup=document.getElementById('chart-popup');chartPopupContainer=document.getElementById('chart-popup-container');allCalculatorInputs=[capitalInput,riskRiskPercentInput,riskEntryPriceInput,riskSlPriceInput,allocAllocationPercentInput,allocEntryPriceInput,allocSlPriceInput];

    // Attach Event Listeners
    if(finvestikLogo)finvestikLogo.addEventListener('click',()=>switchView('calculator-view'));
    if(themeToggle)themeToggle.addEventListener('click',toggleAndSaveTheme);
    if(hamburgerMenuButton)hamburgerMenuButton.addEventListener('click',toggleMobileMenu);
    [[navCalculator,'calculator-view'],[navStockUniverse,'stock-universe-view'],[navCustomIndex,'custom-index-view'],[mobileNavCalculator,'calculator-view'],[mobileNavStockUniverse,'stock-universe-view'],[mobileNavCustomIndex,'custom-index-view']].forEach(([b,v])=>{if(b)b.addEventListener('click',()=>switchView(v));});
    if(suTableHeadElement){suTableHeadElement.addEventListener('click',e=>{const h=e.target.closest('.sortable-header');if(!h||e.target.classList.contains('resize-handle'))return;const k=h.dataset.key;if(!k)return;if(suCurrentSort.key===k){suCurrentSort.order=suCurrentSort.order==='asc'?'desc':'asc';}else{suCurrentSort.key=k;suCurrentSort.order='desc';}applyAndRenderSU();});}
    if(suExportButton)suExportButton.addEventListener('click',exportStockUniverseAsMultiFileZip);
    if(suExportSingleButton)suExportSingleButton.addEventListener('click',exportStockUniverseAsSingleFile);
    if(suTableBodyElement){suTableBodyElement.addEventListener('mouseover',e=>{if(e.target.closest('.symbol-cell'))showChartPopup(e);});suTableBodyElement.addEventListener('mouseout',e=>{if(e.target.closest('.symbol-cell'))hideChartPopup(e);});}
    if(chartPopup){chartPopup.addEventListener('mouseenter',()=>clearTimeout(chartPopupTimeout));chartPopup.addEventListener('mouseleave',hideChartPopup);}
    if(customIndexRefreshButton)customIndexRefreshButton.addEventListener('click',()=>fetchAndRenderCustomIndexData({force:true}));
    if(customIndexCopyButton)customIndexCopyButton.addEventListener('click',copyCustomIndexData);
    if(customIndexExportButton)customIndexExportButton.addEventListener('click',exportCustomIndexData);
    allCalculatorInputs.forEach(i=>{if(i){i.addEventListener('input',()=>{sanitizeNumericInput(i);updateAllCalculationsAndSave();});i.addEventListener('blur',()=>{sanitizeNumericInput(i);if(i.value.endsWith('.')){i.value=i.value.slice(0,-1);}updateAllCalculationsAndSave();});}});
    if(suInsightsToggleButton)suInsightsToggleButton.addEventListener('click',toggleInsightsPanel);
    if(suChartContent)suChartContent.addEventListener('click',handleChartBarClick);
    if(suChartGroupBy)suChartGroupBy.addEventListener('change',handleChartControlsChange);
    if(suChartWhRange){suChartWhRange.addEventListener('input',debounce(handleChartControlsChange,400));suChartWhRange.addEventListener('blur',()=>{if(suChartWhRange.value.endsWith('.'))suChartWhRange.value=suChartWhRange.value.slice(0,-1);handleChartControlsChange();});}
    if(suChartMinStocks){suChartMinStocks.addEventListener('input',debounce(handleChartControlsChange,400));suChartMinStocks.addEventListener('blur',handleChartControlsChange);}
    [suChartFilterClose, suChartFilterChange, suChartFilterVolume, suChartFilterMcap].forEach(input => {
        if(input) input.addEventListener('input', debounce(handleSyncedFilterChange, 350));
    });

    initializePanelResizer();

    // Initial Load Sequence
    if(currentYearElement)currentYearElement.textContent=new Date().getFullYear();
    loadTheme();loadCalculatorSettings();updateAllCalculationsAndSave();
    preloadStockUniverseData().finally(()=>{
        try{
            const settings=JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS)||'{}');
            if(settings.isOpen){suChartPanel.classList.remove('hidden');suPanelResizer.classList.remove('hidden');suInsightsToggleButton.classList.add('active');if(settings.width)suChartPanel.style.width=settings.width;}
            if(suChartGroupBy)suChartGroupBy.value = suFilters.chart.groupBy;
            if(suChartWhRange)suChartWhRange.value = suFilters.chart.whRange;
            if(suChartMinStocks)suChartMinStocks.value = suFilters.chart.minStocks || '';
            Object.entries(suFilters.textFilters).forEach(([key, value]) => {
                if (syncedTextFilterInputs[key]?.chart) syncedTextFilterInputs[key].chart.value = value;
            });
        }catch(e){console.error("Could not restore panel settings",e);}
        const lastView=localStorage.getItem(ACTIVE_VIEW_KEY)||'calculator-view';
        switchView(lastView);
    });
});
if(!Element.prototype.matches){Element.prototype.matches=Element.prototype.msMatchesSelector||Element.prototype.webkitMatchesSelector;}if(!Element.prototype.closest){Element.prototype.closest=function(s){var el=this;do{if(Element.prototype.matches.call(el,s))return el;el=el.parentElement||el.parentNode;}while(el!==null&&el.nodeType===1);return null;};}
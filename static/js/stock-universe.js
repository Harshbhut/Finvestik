// --- STOCK UNIVERSE SCRIPT (V5.1 - BUG FIXES & STABILITY) --
document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS ---
    const STOCK_UNIVERSE_DATA_PATH = "/static/data/stock_universe.json";
    const DATA_VERSION_PATH = "/static/data/data_version.json";
    const POLLING_INTERVAL = 180000; // 3 minutes

    const SU_LOCAL_STORAGE_DATA_KEY = 'finvestikStockData';
    const SU_LOCAL_STORAGE_VERSION_KEY = 'finvestikDataVersion';
    
    // NEW KEYS FOR NEW FEATURES
    const SU_COLUMN_ORDER_KEY = 'finvestikSUColumnOrderKey';
    const SU_COLUMN_WIDTHS_KEY = 'finvestikSUColumnWidthsKey';
    const SU_COLUMN_VISIBILITY_KEY = 'finvestikSUColumnVisibilityKey';
    const SU_FILTERS_KEY = 'finvestikSUFiltersKey';
    const SU_CHART_PANEL_SETTINGS = 'finvestikSUChartPanel';
    const PROFESSIONAL_CHART_COLORS = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1', '#f59e0b', '#d946ef', '#0ea5e9', '#22c55e', '#ec4899'];

    // --- HELPER FUNCTIONS ---
    const formatValue = (value, fallback = 'N/A') => (value !== null && value !== undefined) ? String(value) : fallback;
    const formatPrice = (value) => (typeof value === 'number') ? value.toFixed(2) : formatValue(value);
    const formatIntlNumber = (value) => (typeof value === 'number') ? value.toLocaleString('en-IN') : formatValue(value);
    const formatChangePercent = (value) => { if (typeof value !== 'number') return formatValue(value); return `${value.toFixed(2)}%`; };
    function debounce(func, delay = 300) { let timeoutId; return function(...args) { clearTimeout(timeoutId); timeoutId = setTimeout(() => { func.apply(this, args); }, delay); }; }
    function sanitizeNumericInput(iE, options = { allowDecimal: true, allowNegative: false }) {
        if (!iE) return; let v = iE.value; let pattern = options.allowDecimal ? (options.allowNegative ? /[^0-9.-]/g : /[^0-9.]/g) : (options.allowNegative ? /[^0-9-]/g : /[^0-9]/g); let sV = v.replace(pattern, ''); if (options.allowNegative) { const minus = sV.match(/-/g) || []; if (minus.length > 1 || (minus.length === 1 && sV.indexOf('-') !== 0)) { sV = v.substring(0, v.length - 1); } } if (options.allowDecimal) { const p = sV.split('.'); if (p.length > 2) { sV = p[0] + '.' + p.slice(1).join(''); } if (sV === '.') sV = '0.'; if (sV === '-.') sV = '-0.'; } if(sV.length > 1 && sV.startsWith('0') && !sV.startsWith('0.')) { sV = sV.substring(1); } if(sV.length > 2 && sV.startsWith('-0') && !sV.startsWith('-0.')) { sV = '-' + sV.substring(2); } if (sV !== v) { iE.value = sV; }
    }
    
    // --- CONFIGURATION ---
    const suColumnDefinitions = [
        { key: "Symbol", displayName: "Symbol", isVisible: true, isSortable: true, defaultWidth: '100px' },
        { key: "Stock Name", displayName: "Stock Name", isVisible: true, isSortable: true, defaultWidth: '200px' },
        { key: "current_price", displayName: "Close", isVisible: true, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right', isFilterable: true, filterType: 'text', placeholder: '>10,<1000' },
        { key: "change_percentage", displayName: "Change %", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text' , formatter: formatChangePercent, defaultWidth: '95px', cellClass: 'text-right font-semibold', placeholder: '>5,<15' },
        { key: "circuitLimit", displayName: "Circuit Limit", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text' , defaultWidth: '95px', cellClass: 'text-right font-semibold', placeholder: '=5,!=20' },
        { key: "day_open", displayName: "Open", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right' },
        { key: "day_high", displayName: "High", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right' }, 
        { key: "day_low", displayName: "Low", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '90px', cellClass: 'text-right' },
        { key: "day_volume", displayName: "Volume", isVisible: true, isSortable: true, formatter: formatIntlNumber, defaultWidth: '110px', cellClass: 'text-right', isFilterable: true, filterType: 'text', placeholder: '>30000' }, 
        { key: "Market Cap", displayName: "Market Cap (Cr.)", isVisible: true, isSortable: true, formatter: formatIntlNumber, defaultWidth: '120px', cellClass: 'text-right', isFilterable: true, filterType: 'text', placeholder: '>500,<20000' }, 
        { key: "TurnoverSMA20", displayName: "20MA Turnover", isVisible: true, isSortable: true, formatter: formatIntlNumber, defaultWidth: '120px', cellClass: 'text-right', isFilterable: true, filterType: 'text',placeholder: '>5,>100' }, 
        { key: "fifty_two_week_high", displayName: "52W High", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right' },
        { key: "fifty_two_week_low", displayName: "52W Low", isVisible: false, isSortable: true, formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right' }, 
        { key: "Down from 52W High (%)", displayName: "52WH ↓ ", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right', placeholder: '<25' },
        { key: "Up from 52W Low (%)", displayName: "52WL ↑", isVisible: false, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right', placeholder: '>50' },
        { key: "Tomcap", displayName: "Tomcap %", isVisible: false, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right', placeholder: '<1,>0.3' },
        { key: "RS_3M", displayName: "RS 3M", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right', placeholder: '>70,>80' },
        { key: "RS_6M", displayName: "RS 6M", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right', placeholder: '>70,>30' },
        { key: "Sector Name", displayName: "Sector Name", isVisible: true, isSortable: true, isFilterable: true, filterType: 'dropdown', defaultWidth: '160px' }, 
        { key: "Industry Name", displayName: "Industry Name", isVisible: true, isSortable: true, isFilterable: true, filterType: 'dropdown', defaultWidth: '180px' },
    ];

    // --- DOM ELEMENT AND STATE VARIABLES ---
    let suLoading, suError, suRowCount, suTable, suTableHeadElement, suTableBodyElement, suHeaderRow, suFilterRow, suExportSingleButton, suClearFiltersButton,
    suInsightsToggleButton, suContainer, suTableContainer, suPanelResizer, suChartPanel, suChartStatus, suLastUpdated, suSkeletonLoader,
    suFiltersButton, suFiltersPanel, suColumnsButton, suColumnsPanel,
    suChartGroupBy, suChartWhRange, suChartMinStocks, suChartMinUp, suChartMinDown, suChartADClearButton,
    suChartAccordionContainer, chart52wHighContainer, chartAvgGainContainer, chartAdRatioContainer,
    chartPopup, chartPopupContainer,chartRsRankContainer;
        
    let fullStockData = [], suCurrentColumnOrder = [], suColumnWidths = {}, suColumnVisibility = {}, currentlyDisplayedSUData = [], isStockDataLoaded = false;
    let suCurrentSort = { key: 'Market Cap', order: 'desc' };
    let suFilters = {}; let chartPopupTimeout, sortableInstance, pollingIntervalId; 
    let localDataVersion = null;
    let currentResizing = { th: null, startX: 0, startWidth: 0 }, panelResizing = { active: false, startX: 0, startWidth: 0 }; 

    // --- STATE MANAGEMENT ---
    const loadSUColumnSettings = () => {
        const allKeys = new Set(suColumnDefinitions.map(d => d.key));
        const savedJSON = localStorage.getItem(SU_COLUMN_ORDER_KEY);
        let savedOrder = [];
        if(savedJSON) { try { savedOrder = JSON.parse(savedJSON).filter(k=>allKeys.has(k)); } catch(e){} }
        const savedKeySet = new Set(savedOrder);
        const missingKeys = suColumnDefinitions.map(d => d.key).filter(k => !savedKeySet.has(k));
        suCurrentColumnOrder = [...savedOrder, ...missingKeys];
        
        const widthsJSON = localStorage.getItem(SU_COLUMN_WIDTHS_KEY);
        try { suColumnWidths = widthsJSON ? JSON.parse(widthsJSON) : {}; } catch(e) { suColumnWidths = {}; }

        const visibilityJSON = localStorage.getItem(SU_COLUMN_VISIBILITY_KEY);
        try { 
            const savedVisibility = visibilityJSON ? JSON.parse(visibilityJSON) : {};
            suColumnDefinitions.forEach(def => {
                suColumnVisibility[def.key] = savedVisibility[def.key] !== undefined ? savedVisibility[def.key] : def.isVisible;
            });
        } catch(e) {
            suColumnDefinitions.forEach(def => { suColumnVisibility[def.key] = def.isVisible; });
        }
    };
    const saveSUColumnVisibility = () => localStorage.setItem(SU_COLUMN_VISIBILITY_KEY, JSON.stringify(suColumnVisibility));
    const loadSUFilters = () => {
        suFilters = JSON.parse(localStorage.getItem(SU_FILTERS_KEY) || '{}');
        if (!suFilters.columns) suFilters.columns = {};
        if (!suFilters.textFilters) suFilters.textFilters = {};
        if (!suFilters.chart) suFilters.chart = { groupBy: 'Sector Name', whRange: 25, minStocks: null, minUp: null, minDown: null };
    };
    const saveSUFilters = () => localStorage.setItem(SU_FILTERS_KEY, JSON.stringify(suFilters));

    const saveSUColumnOrder = () => localStorage.setItem(SU_COLUMN_ORDER_KEY, JSON.stringify(suCurrentColumnOrder));
    const saveSUColumnWidths = () => localStorage.setItem(SU_COLUMN_WIDTHS_KEY, JSON.stringify(suColumnWidths));

    // --- DATA FETCHING & POLLING ---
    async function initDataLoad() {
        loadSUColumnSettings();
        loadSUFilters();
        populateColumnsPanel();
        populateFiltersPanel();

        try {
            const cachedVersion = localStorage.getItem(SU_LOCAL_STORAGE_VERSION_KEY);
            const cachedData = localStorage.getItem(SU_LOCAL_STORAGE_DATA_KEY);
            if (cachedVersion && cachedData) {
                localDataVersion = cachedVersion;
                fullStockData = JSON.parse(cachedData);
                isStockDataLoaded = true;
            } else {
                await fetchInitialData();
            }
        } catch (e) {
            await fetchInitialData();
        } finally {
            displayStockUniverse();
            startPolling();
        }
    }

    async function fetchInitialData() {
        if(suSkeletonLoader) suSkeletonLoader.style.display = 'block';
        if(suContainer) suContainer.classList.add('hidden');
        try {
            const [versionRes, dataRes] = await Promise.all([ fetch(DATA_VERSION_PATH + `?t=${new Date().getTime()}`), fetch(STOCK_UNIVERSE_DATA_PATH + `?t=${new Date().getTime()}`) ]);
            if (!versionRes.ok || !dataRes.ok) throw new Error('Failed to fetch initial data files.');
            const versionData = await versionRes.json();
            const jsonData = await dataRes.json();
            localDataVersion = versionData.timestamp;
            fullStockData = jsonData?.map(r => ({ ...r, "Market Cap": parseFloat(r["Market Cap"]) || 0 })) || [];
            isStockDataLoaded = true;
            localStorage.setItem(SU_LOCAL_STORAGE_VERSION_KEY, localDataVersion);
            localStorage.setItem(SU_LOCAL_STORAGE_DATA_KEY, JSON.stringify(fullStockData));
        } catch (err) {
            if(suError) suError.textContent = `Error loading data.`;
            isStockDataLoaded = false; // Explicitly set to false on error
        }
    }

    function startPolling() {
        if (window.pollingIntervalId) clearInterval(window.pollingIntervalId);
        setTimeout(checkForUpdates, 5000);
        window.pollingIntervalId = setInterval(checkForUpdates, POLLING_INTERVAL);
    }

    async function checkForUpdates() {
        try {
            const res = await fetch(DATA_VERSION_PATH + `?t=${new Date().getTime()}`);
            if (!res.ok) return;
            const versionData = await res.json();
            if (versionData.timestamp && localDataVersion && versionData.timestamp > localDataVersion) {
                if(suLoading) suLoading.classList.remove('hidden');
                await fetchAndApplyUpdates(versionData.timestamp);
            }
        } catch (error) { console.error("Error checking for updates:", error); }
    }

    async function fetchAndApplyUpdates(newVersion) {
        try {
            const res = await fetch(STOCK_UNIVERSE_DATA_PATH + `?t=${new Date().getTime()}`);
            if (!res.ok) return;
            const jsonData = await res.json();
            fullStockData = jsonData?.map(r => ({ ...r, "Market Cap": parseFloat(r["Market Cap"]) || 0 })) || [];
            localDataVersion = newVersion;
            localStorage.setItem(SU_LOCAL_STORAGE_VERSION_KEY, newVersion);
            localStorage.setItem(SU_LOCAL_STORAGE_DATA_KEY, JSON.stringify(fullStockData));
            applyAndRenderSU(); // FIX: Call applyAndRenderSU() directly for more efficient updates
        } finally {
            if(suLoading) suLoading.classList.add('hidden');
        }
    }
    
    // --- CORE LOGIC: FILTERING & RENDERING ---
    function displayStockUniverse() {
        if (suSkeletonLoader) suSkeletonLoader.style.display = 'none';
        
        if (isStockDataLoaded) {
            if (suContainer) suContainer.classList.remove('hidden');
            if (suError) suError.textContent = ''; 
            applyAndRenderSU();
        } else {
            if (suContainer) suContainer.classList.add('hidden');
            if (suError && !suError.textContent) {
                suError.textContent = "Could not load stock data. Please refresh the page to try again.";
            }
        }
    }
    
    const parseNumericFilter = (filterString) => {
        if (!filterString || String(filterString).trim() === '') return [];
        const conditions = String(filterString).split(',').map(s => s.trim()).filter(Boolean);
        const parsedConditions = [];
        const multipliers = { 'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12, 'cr': 1e7 };
        const operatorRegex = /^(>=|<=|!=|>|<|=)/;
        for (const cond of conditions) {
            let opMatch = cond.match(operatorRegex);
            let operator = opMatch ? opMatch[0] : '=';
            let valueStr = opMatch ? cond.substring(opMatch[0].length) : cond;
            const lastChar = valueStr.slice(-1).toLowerCase();
            const lastTwoChars = valueStr.slice(-2).toLowerCase();
            let multiplier = 1;
            if (multipliers[lastTwoChars]) { valueStr = valueStr.slice(0, -2); multiplier = multipliers[lastTwoChars]; } 
            else if (multipliers[lastChar]) { valueStr = valueStr.slice(0, -1); multiplier = multipliers[lastChar]; }
            const numericValue = parseFloat(valueStr);
            if (!isNaN(numericValue)) { parsedConditions.push({ operator, value: numericValue * multiplier }); }
        }
        return parsedConditions;
    };
    
    const applyAndRenderSU = () => {
        if (!isStockDataLoaded) return; 
        let tableData = [...fullStockData];

        Object.entries(suFilters.columns || {}).forEach(([key, value]) => { if (value && value !== 'ALL') { tableData = tableData.filter(row => String(row[key]) === String(value)); } });
        Object.entries(suFilters.textFilters || {}).forEach(([key, filterString]) => {
            if (filterString) {
                const conditions = parseNumericFilter(filterString);
                if (conditions.length > 0) {
                    tableData = tableData.filter(row => {
                        const rowValue = row[key];
                        if (rowValue === null || rowValue === undefined) return false;
                        return conditions.every(cond => {
                            switch (cond.operator) {
                                case '>': return rowValue > cond.value; case '<': return rowValue < cond.value;
                                case '>=': return rowValue >= cond.value; case '<=': return rowValue <= cond.value;
                                case '!=': return rowValue != cond.value; case '=': return rowValue == cond.value;
                                default: return true;
                            }
                        });
                    });
                }
            }
        });
        
        if (suCurrentSort.key) {
            tableData.sort((a,b) => {
                const vA = a[suCurrentSort.key], vB = b[suCurrentSort.key];
                let c = 0;
                if (typeof vA === 'number' && typeof vB === 'number') { c = vA - vB; } 
                else { c = String(vA ?? '').localeCompare(String(vB ?? '')); }
                return suCurrentSort.order === 'asc' ? c : -c;
            });
        }
        
        currentlyDisplayedSUData = tableData;
        saveSUFilters();
        renderStockUniverseTable(tableData);
        if (suChartPanel && !suChartPanel.classList.contains('is-closed')) {
            renderAllInsightCharts(tableData);
        }
    };

        // --- TABLE INTERACTIVITY ---
        // --- TABLE INTERACTIVITY ---
const initializeSortable = () => {
    if(sortableInstance) sortableInstance.destroy();
    if(suHeaderRow) {
        sortableInstance = Sortable.create(suHeaderRow, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: () => {
                // 1. Get the new column order from the dragged headers
                suCurrentColumnOrder = Array.from(suHeaderRow.children).map(th => th.dataset.key);
                saveSUColumnOrder();

                // 2. Re-create BOTH the header and filter rows in the new order
                createSUHeaderAndFilterRows();

                // 3. Re-render the table BODY to match the new column order
                renderStockUniverseTable(currentlyDisplayedSUData);
            }
        });
    }
}
// ... more functions
        const initializeResizeHandles = () => { if(!suHeaderRow)return; suHeaderRow.querySelectorAll('.resize-handle').forEach(h=>h.addEventListener('mousedown',onResizeMouseDown)); }
        function onResizeMouseDown(e){ if(e.button!==0)return; currentResizing.th=e.target.parentElement; currentResizing.startX=e.pageX; currentResizing.startWidth=currentResizing.th.offsetWidth; document.addEventListener('mousemove',onResizeMouseMove); document.addEventListener('mouseup',onResizeMouseUp); e.target.classList.add('active'); e.preventDefault(); }
        function onResizeMouseMove(e){ if(!currentResizing.th)return; const dx=e.pageX-currentResizing.startX; let w=Math.max(50,currentResizing.startWidth+dx); currentResizing.th.style.width=`${w}px`; }
        function onResizeMouseUp(){ if(currentResizing.th){ suColumnWidths[currentResizing.th.dataset.key]=currentResizing.th.style.width; saveSUColumnWidths(); currentResizing.th.querySelector('.resize-handle')?.classList.remove('active');} document.removeEventListener('mousemove',onResizeMouseMove); document.removeEventListener('mouseup',onResizeMouseUp); currentResizing.th=null; }
    
    // --- UI POPULATION & RENDERING ---
        // --- UI POPULATION & RENDERING ---
        const createSUHeaderAndFilterRows = () => {
            if (!suTableHeadElement) return;
            suTableHeadElement.innerHTML = '';
            suHeaderRow = document.createElement('tr');
            suFilterRow = document.createElement('tr');
            suFilterRow.id = 'su-filter-row';
            const colsToRender = suCurrentColumnOrder.map(k => suColumnDefinitions.find(d => d.key === k)).filter(d => d && suColumnVisibility[d.key]);
            colsToRender.forEach(def => {
                const th = document.createElement('th');
                th.className = 'sortable-header resizable'; // Add resizable class
                th.dataset.key = def.key;
                // Add sort icon and resize handle
                th.innerHTML = `${def.displayName} <span class="sort-icon"></span><div class="resize-handle"></div>`;
                th.style.width = suColumnWidths[def.key] || def.defaultWidth;
                suHeaderRow.appendChild(th);
    
                const filterTd = document.createElement('td');
                if (def.isFilterable && def.filterType === 'dropdown') {
                    const select = document.createElement('select');
                    select.className = 'form-input';
                    select.dataset.filterKey = def.key;
                    select.addEventListener('change', e => {
                        suFilters.columns[def.key] = e.target.value;
                        if (def.key === 'Sector Name') updateDependentDropdowns();
                        applyAndRenderSU();
                    });
                    filterTd.appendChild(select);
                }
                suFilterRow.appendChild(filterTd);
            });
            suTableHeadElement.append(suHeaderRow, suFilterRow);
            populateTopLevelDropdowns();
            updateSortIcons();
            // Initialize interactivity
            initializeSortable();
            initializeResizeHandles();
        };

    const renderStockUniverseTable = (data) => {
        if(!suTableBodyElement) return;
        if(!suHeaderRow) createSUHeaderAndFilterRows();
        const cols = suCurrentColumnOrder.map(k => suColumnDefinitions.find(d => d.key === k)).filter(d => d && suColumnVisibility[d.key]);
        suTableBodyElement.innerHTML = '';
        const fragment = document.createDocumentFragment();
        if (data.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = cols.length || 1;
            td.className = 'text-center p-4';
            td.textContent = 'No stocks match the current filters.';
            tr.appendChild(td);
            fragment.appendChild(tr);
        } else {
            data.forEach(stock => {
                const tr = document.createElement('tr');
                tr.dataset.symbol = stock.Symbol;
                cols.forEach(def => {
                    const td = document.createElement('td');
                    let v = stock[def.key];
                    td.textContent = def.formatter ? def.formatter(v) : formatValue(v);
                    if(def.cellClass) td.className=def.cellClass;
                    if(def.key === 'change_percentage' && typeof v === 'number') td.style.color = v >= 0 ? 'var(--text-positive)' : 'var(--text-negative)';
                    if(def.key === 'Symbol'){ td.classList.add('symbol-cell'); td.dataset.symbol=v; }
                    tr.appendChild(td);
                });
                fragment.appendChild(tr);
            });
        }
        suTableBodyElement.appendChild(fragment);
        if(suRowCount) suRowCount.textContent = `Showing ${data.length} of ${fullStockData.length} stocks.`;
    };
    
    // --- ADDED BACK: CHART POPUP FUNCTIONS ---
    const createTradingViewWidget = (symbol, theme) => {
        if (!chartPopupContainer) return;
        chartPopupContainer.innerHTML = '';
        chartPopupContainer.dataset.currentSymbol = symbol;
        const widgetConfig = { "width": "100%", "height": "100%", "symbol": symbol, "interval": "D", "timezone": "Asia/Kolkata", "theme": theme, "style": "1", "locale": "en", "withdateranges": true, "range": "YTD","hide_side_toolbar": true, "allow_symbol_change": false, "support_host": "https://www.tradingview.com" };
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.async = true;
        script.innerHTML = JSON.stringify(widgetConfig);
        chartPopupContainer.appendChild(script);
    };
    
    const showChartPopup = (event) => {
        if (!chartPopup) return;
        clearTimeout(chartPopupTimeout);
        const cell = event.target.closest('.symbol-cell');
        if (!cell || !cell.dataset.symbol) return;
        const symbol = cell.dataset.symbol;
        const tradingViewSymbol = `BSE:${symbol}`;
        const currentTheme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
        createTradingViewWidget(tradingViewSymbol, currentTheme);
        const popupWidth = chartPopup.offsetWidth;
        const popupHeight = chartPopup.offsetHeight;
        const offset = 15;
        const cellRect = cell.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let top = cellRect.top + (cellRect.height / 2) - (popupHeight / 2);
        top = Math.max(10, Math.min(top, viewportHeight - popupHeight - 10 - offset));
        let left = (cellRect.right + popupWidth + offset) < viewportWidth ? cellRect.right + offset : cellRect.left - popupWidth - offset;
        left = Math.max(10, Math.min(left, viewportWidth - popupWidth - 10 - offset));
        chartPopup.style.left = `${left}px`;
        chartPopup.style.top = `${top}px`;
        chartPopup.classList.remove('hidden');
    };
    
    const hideChartPopup = () => {
        if (!chartPopup) return;
        chartPopupTimeout = setTimeout(() => {
            chartPopup.classList.add('hidden');
            if (chartPopupContainer) {
                chartPopupContainer.innerHTML = '';
                delete chartPopupContainer.dataset.currentSymbol;
            }
        }, 300);
    };

    // --- CHART & PANEL FUNCTIONS ---
    const renderAllInsightCharts = (tableData) => {
        if (!suFilters.chart || !chartAdRatioContainer || !isStockDataLoaded) return;
        const { groupBy, minStocks, whRange, minUp, minDown } = suFilters.chart;
        if (suChartStatus) suChartStatus.textContent = `Charts based on ${tableData.length} filtered stocks.`;
        const groupData = (data, key) => data.reduce((acc, stock) => {
            const groupName = stock[key]; if (!groupName) return acc;
            if (!acc[groupName]) acc[groupName] = { name: groupName, stocks: [] };
            acc[groupName].stocks.push(stock); return acc;
        }, {});
        const tableGroups = groupData(tableData, groupBy);
        let chartGroups = Object.values(tableGroups).filter(g => g.stocks.length >= (minStocks || 0));
        chartGroups.forEach(g => {
            g.totalInTable = g.stocks.length; g.sumChange = 0; g.advancers = 0; g.decliners = 0; g.nearHigh = 0; g.sumRsRank = 0;
            g.stocks.forEach(s => { const change = s['change_percentage']; const down52w = s['Down from 52W High (%)']; const rsRank = s['RS_3M']; if (typeof change === 'number') { g.sumChange += change; if (change >= (minUp !== null ? minUp : 0.0001)) g.advancers++; if (change <= (minDown !== null ? minDown : -0.0001)) g.decliners++; } if (typeof down52w === 'number' && (whRange === null || down52w <= whRange)) g.nearHigh++; if (typeof rsRank === 'number') g.sumRsRank += rsRank;  });
            g.avgChange = g.totalInTable > 0 ? g.sumChange / g.totalInTable : 0; g.adRatio = g.decliners > 0 ? g.advancers / g.decliners : (g.advancers > 0 ? Infinity : 1); g.nearHighPercent = g.totalInTable > 0 ? (g.nearHigh / g.totalInTable) * 100 : 0;
            // --- MODIFIED RS LOGIC STARTS HERE ---
            // 1. Create a new list of stocks, excluding any where RS_3M is 100.
            const rsStocks = g.stocks.filter(s => typeof s['RS_3M'] === 'number' && s['RS_3M'] !== 100);
            
            // 2. Get the count and sum from this new, filtered list.
            g.rsStockCount = rsStocks.length;
            g.sumRsRank = rsStocks.reduce((sum, s) => sum + s['RS_3M'], 0);
            
            // 3. Calculate the average using the new count and sum.
            g.avgRsRank = g.rsStockCount > 0 ? g.sumRsRank / g.rsStockCount : 0;
            // --- MODIFIED RS LOGIC ENDS HERE ---
        });
        const adData = [...chartGroups].sort((a, b) => b.adRatio - a.adRatio); const maxAdRatio = Math.max(1, ...adData.filter(d => isFinite(d.adRatio)).map(d => d.adRatio));
        adData.forEach(d => { d.percentageWidth = d.adRatio === Infinity ? 100 : Math.min(100, 10 + (d.adRatio / (maxAdRatio || 1)) * 90) });
        renderBarChart(chartAdRatioContainer, adData, { valueFormatter: d => d.adRatio === Infinity ? 'All Up' : d.adRatio.toFixed(2), titleFormatter: d => `${d.name}: Ratio ${d.adRatio === Infinity ? 'All Up' : d.adRatio.toFixed(2)} (${d.advancers} Up, ${d.decliners} Down)`, subLabelFormatter: d => `(${d.advancers}/${d.decliners})` });
        const avgGainData = [...chartGroups].sort((a, b) => b.avgChange - a.avgChange); const maxGain = Math.max(0.01, ...avgGainData.map(d => Math.abs(d.avgChange)));
        avgGainData.forEach(d => { const p = (Math.abs(d.avgChange) / maxGain) * 100; d.percentageWidth = isNaN(p) ? 0 : p; });
        renderBarChart(chartAvgGainContainer, avgGainData, { valueFormatter: d => `${d.avgChange.toFixed(2)}%`, titleFormatter: d => `${d.name}: Avg. Change ${d.avgChange.toFixed(2)}%`, subLabelFormatter: d => `(${d.totalInTable})` });
        const high52wData = [...chartGroups].sort((a, b) => b.nearHighPercent - a.nearHighPercent); high52wData.forEach(d => d.percentageWidth = d.nearHighPercent);
        renderBarChart(chart52wHighContainer, high52wData, { valueFormatter: d => whRange === null ? 'N/A' : `${d.nearHighPercent.toFixed(1)}%`, titleFormatter: d => whRange === null ? 'Enter a "% From High" value' : `${d.name}: ${d.nearHigh} of ${d.totalInTable} stocks (${d.nearHighPercent.toFixed(2)}%)`, subLabelFormatter: d => whRange === null ? '' : `(${d.nearHigh}/${d.totalInTable})` });
        const rsRankData = [...chartGroups].sort((a, b) => b.avgRsRank - a.avgRsRank);
        rsRankData.forEach(d => d.percentageWidth = d.avgRsRank); 
        renderBarChart(chartRsRankContainer, rsRankData, {
        valueFormatter: d => d.avgRsRank.toFixed(1),
        titleFormatter: d => `${d.name}: Avg. RS Rank ${d.avgRsRank.toFixed(2)} (${d.rsStockCount} stocks)`,
        subLabelFormatter: d => `(${d.rsStockCount})`
        });
    };
    const renderBarChart = (container, chartData, { valueFormatter, titleFormatter, subLabelFormatter }) => {
        container.innerHTML = '';
        if (chartData.length === 0) { container.innerHTML = `<p class="p-4 text-center text-xs" style="color:var(--text-secondary)">No groups meet the filter criteria.</p>`; return; }
        const frag = document.createDocumentFragment();
        chartData.forEach((item, index) => {
            const barColor = PROFESSIONAL_CHART_COLORS[index % PROFESSIONAL_CHART_COLORS.length];
            const barItem = document.createElement('div');
            barItem.className = 'chart-bar-item';
            if (suFilters.columns[suFilters.chart.groupBy] === item.name) barItem.classList.add('active');
            barItem.dataset.groupKey = item.name;
            if(titleFormatter) barItem.title = titleFormatter(item);
            let subLabel = subLabelFormatter ? `<span class="chart-bar-sublabel">${subLabelFormatter(item)}</span>` : '';
            barItem.innerHTML = `<div class="chart-bar-value">${valueFormatter(item)}</div><div class="chart-bar-container"><div class="chart-bar-fill" style="width: ${item.percentageWidth}%; background-color: ${barColor};"></div><div class="chart-bar-label">${item.name} ${subLabel}</div></div>`;
            frag.appendChild(barItem);
        });
        container.appendChild(frag);
    };
    const toggleInsightsPanel = () => {
        if (!suContainer || !suChartPanel || !suPanelResizer || !suInsightsToggleButton) return;
        suContainer.classList.toggle('panel-is-closed');
        suChartPanel.classList.toggle('is-closed');
        suPanelResizer.classList.toggle('is-closed');
        suInsightsToggleButton.classList.toggle('active');
        const isNowVisible = !suChartPanel.classList.contains('is-closed');
        if (isNowVisible && currentlyDisplayedSUData) { renderAllInsightCharts(currentlyDisplayedSUData); }
        try { const settings = JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS) || '{}'); settings.isOpen = isNowVisible; localStorage.setItem(SU_CHART_PANEL_SETTINGS, JSON.stringify(settings)); } catch (e) {}
    };
    const initializePanelResizer = () => { if(!suPanelResizer)return;suPanelResizer.addEventListener('mousedown',e=>{if(e.button!==0)return;panelResizing.active=true;panelResizing.startX=e.pageX;panelResizing.startWidth=suChartPanel.offsetWidth;suPanelResizer.classList.add('active');document.body.style.cursor='col-resize';document.body.style.userSelect='none';document.addEventListener('mousemove',onPanelResizeMouseMove);document.addEventListener('mouseup',onPanelResizeMouseUp,{once:true});e.preventDefault();}); };
    function onPanelResizeMouseMove(e) { if(!panelResizing.active || !suChartPanel)return; const dx = e.pageX - panelResizing.startX; let newWidth = panelResizing.startWidth - dx; if (suTableContainer) { const mainContainerWidth = suTableContainer.parentElement.clientWidth; newWidth = Math.max(0, Math.min(newWidth, mainContainerWidth - 58));} suChartPanel.style.width = `${newWidth}px`; }
    function onPanelResizeMouseUp() { panelResizing.active=false;suPanelResizer.classList.remove('active');document.body.style.cursor='';document.body.style.userSelect='';document.removeEventListener('mousemove',onPanelResizeMouseMove);try{const s=JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS)||'{}');s.width=suChartPanel.style.width;localStorage.setItem(SU_CHART_PANEL_SETTINGS,JSON.stringify(s));}catch(e){}}
    const initializeAccordion = () => {
        if(!suChartAccordionContainer) return;
        suChartAccordionContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.accordion-header');
            if (!header || e.target.closest('.chart-panel-input, .local-clear-button')) return;
            const content = header.nextElementSibling; const isActive = header.classList.contains('active');
            suChartAccordionContainer.querySelectorAll('.accordion-header').forEach(h => { if (h !== header) { h.classList.remove('active'); h.setAttribute('aria-expanded', 'false'); h.nextElementSibling.style.maxHeight = null; h.nextElementSibling.classList.remove('open'); } });
            if (!isActive) { header.classList.add('active'); header.setAttribute('aria-expanded', 'true'); content.classList.add('open'); content.style.maxHeight = content.scrollHeight + "px"; }
            else { header.classList.remove('active'); header.setAttribute('aria-expanded', 'false'); content.style.maxHeight = null; content.classList.remove('open'); }
        });
    };
    const exportStockUniverseAsSingleFile = () => {
        if(!currentlyDisplayedSUData||!currentlyDisplayedSUData.length){alert("No data to export.");return}
        if(typeof saveAs==='undefined'){return} const inds={};
        currentlyDisplayedSUData.forEach(s=>{const ind=s['Sector Name'],sym=s['Symbol'];if(!ind)return;if(!inds[ind]){inds[ind]=[];}inds[ind].push(sym);});
        let fc=''; Object.keys(inds).sort().forEach(inm=>{const syms=inds[inm].join(',');fc+=`###${inm},${syms},\n`;});
        const blob=new Blob([fc.trim()],{type:"text/plain;charset=utf-8"});
        saveAs(blob,"Finvestik_Stocks.txt");
    };
    const handleChartBarClick = (event) => {
        const bar = event.target.closest('.chart-bar-item'); if(!bar||!bar.dataset.groupKey)return;
        const groupKeyName = suFilters.chart.groupBy; const groupValue = bar.dataset.groupKey;
        const dropdown = suFilterRow.querySelector(`select[data-filter-key="${groupKeyName}"]`);
        if(dropdown){
            if (suFilters.columns[groupKeyName] === groupValue) suFilters.columns[groupKeyName] = 'ALL'; else suFilters.columns[groupKeyName] = groupValue;
            dropdown.value = suFilters.columns[groupKeyName];
            if(groupKeyName === 'Sector Name') updateDependentDropdowns();
            applyAndRenderSU();
        }
    };
    
    // --- UI HELPER FUNCTIONS ---
    const populateColumnsPanel = () => {
        if (!suColumnsPanel) return;
        suColumnsPanel.innerHTML = '';
        suColumnDefinitions.forEach(def => {
            if (def.displayName.includes("ID")) return;
            const item = document.createElement('div'); item.className = 'su-columns-item';
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = `col-toggle-${def.key}`; checkbox.dataset.key = def.key; checkbox.checked = !!suColumnVisibility[def.key];
            const label = document.createElement('label'); label.htmlFor = `col-toggle-${def.key}`; label.textContent = def.displayName;
            item.append(checkbox, label); suColumnsPanel.appendChild(item);
        });
    };
    const populateFiltersPanel = () => {
        if (!suFiltersPanel) return;
        suFiltersPanel.innerHTML = '';
        const grid = document.createElement('div'); grid.className = 'su-filters-grid';
        suColumnDefinitions.filter(d => d.isFilterable && d.filterType === 'text').forEach(def => {
            const group = document.createElement('div'); group.className = 'su-filters-group';
            const label = document.createElement('label'); label.htmlFor = `filter-panel-${def.key}`; label.textContent = def.displayName;
            const input = document.createElement('input'); input.type = 'text'; input.id = `filter-panel-${def.key}`; input.className = 'form-input'; input.placeholder = def.placeholder || ''; input.dataset.filterKey = def.key; input.value = suFilters.textFilters[def.key] || '';
            input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('su-filters-panel-apply')?.click(); } });
            group.append(label, input); grid.appendChild(group);
        });
        const footer = document.createElement('div'); footer.className = 'su-filters-footer';
        const clearBtn = document.createElement('button'); clearBtn.className = 'btn btn-secondary'; clearBtn.textContent = 'Clear'; clearBtn.id = 'su-filters-panel-clear';
        const applyBtn = document.createElement('button'); applyBtn.className = 'btn btn-primary'; applyBtn.textContent = 'Apply'; applyBtn.id = 'su-filters-panel-apply';
        footer.append(clearBtn, applyBtn); suFiltersPanel.append(grid, footer);
    };
    const populateTopLevelDropdowns = () => {
        if(!suFilterRow || fullStockData.length === 0) return;
        suColumnDefinitions.filter(d => d.isFilterable && d.filterType === 'dropdown').forEach(def => {
            const s = suFilterRow.querySelector(`select[data-filter-key="${def.key}"]`);
            if(s){
                const vals = [...new Set(fullStockData.map(i => i[def.key]).filter(Boolean))].sort();
                s.innerHTML=`<option value="ALL">ALL</option>`+vals.map(v=>`<option value="${v}">${v}</option>`).join('');
                s.value = suFilters.columns[def.key] || 'ALL';
            }
        });
        updateDependentDropdowns();
    };
    const updateDependentDropdowns = () => {
        if(!suFilterRow || !fullStockData.length) return;
        const selSec = suFilters.columns['Sector Name'] || 'ALL';
        const indDrop = suFilterRow.querySelector(`select[data-filter-key="Industry Name"]`);
        if(!indDrop) return;
        let relInd=[...new Set(fullStockData.filter(r=>selSec === 'ALL' || r['Sector Name'] === selSec).map(i=>i['Industry Name']).filter(Boolean))].sort();
        const curInd = suFilters.columns['Industry Name'] || 'ALL';
        indDrop.innerHTML = `<option value="ALL">ALL</option>`+relInd.map(v=>`<option value="${v}">${v}</option>`).join('');
        indDrop.value = relInd.includes(curInd) ? curInd : 'ALL';
        if(!relInd.includes(curInd)) suFilters.columns['Industry Name'] = 'ALL';
    };
    const updateSortIcons = () => { if(!suHeaderRow)return; suHeaderRow.querySelectorAll('.sort-icon').forEach(i=>i.innerHTML=''); const h=suHeaderRow.querySelector(`[data-key="${suCurrentSort.key}"] .sort-icon`); if(h)h.innerHTML=suCurrentSort.order==='asc'?'▲':'▼'; };
    const clearAllSUFiltersAndSort = () => {
        suFilters.columns = {};
        suFilters.textFilters = {};
        suCurrentSort = { key: 'Market Cap', order: 'desc' };
        if (suFilterRow) { suFilterRow.querySelectorAll('select').forEach(select => select.value = 'ALL'); }
        if (suFiltersPanel) { suFiltersPanel.querySelectorAll('input').forEach(input => input.value = ''); }
        updateDependentDropdowns();
        applyAndRenderSU();
    };

    // --- INITIALIZATION ---
    (function initializePage(){
        suLoading=document.getElementById('su-loading');suError=document.getElementById('su-error');suRowCount=document.getElementById('su-row-count');suTable=document.getElementById('su-table');if(suTable){suTableHeadElement=suTable.querySelector('thead');suTableBodyElement=suTable.querySelector('tbody');}
        suClearFiltersButton=document.getElementById('su-clear-filters-button');suExportSingleButton=document.getElementById('su-export-single-button');
        suInsightsToggleButton=document.getElementById('su-insights-toggle-button');suContainer=document.getElementById('su-container');suTableContainer=document.getElementById('su-table-container');suPanelResizer=document.getElementById('su-panel-resizer');suChartPanel=document.getElementById('su-chart-panel');suChartStatus=document.getElementById('su-chart-status');
        suFiltersButton=document.getElementById('su-filters-button');suFiltersPanel=document.getElementById('su-filters-panel');suColumnsButton=document.getElementById('su-columns-button');suColumnsPanel=document.getElementById('su-columns-panel');
        suChartGroupBy=document.getElementById('su-chart-group-by');suChartMinStocks=document.getElementById('su-chart-min-stocks');
        suChartWhRange=document.getElementById('su-chart-wh-range'); suChartMinUp=document.getElementById('su-chart-min-up'); suChartMinDown=document.getElementById('su-chart-min-down'); suChartADClearButton = document.getElementById('su-chart-ad-clear-button');
        suChartAccordionContainer = document.getElementById('su-chart-accordion-container'); chart52wHighContainer = document.getElementById('su-chart-52w-high'); chartAvgGainContainer = document.getElementById('su-chart-avg-gain'); chartAdRatioContainer = document.getElementById('su-chart-ad-ratio');chartRsRankContainer = document.getElementById('su-chart-rs-rank');
        chartPopup=document.getElementById('chart-popup');chartPopupContainer=document.getElementById('chart-popup-container');
        suSkeletonLoader = document.getElementById('su-skeleton-loader'); suLastUpdated = document.getElementById('su-last-updated');

        if(suTableHeadElement)suTableHeadElement.addEventListener('click',e=>{const h=e.target.closest('.sortable-header');if(!h)return;const k=h.dataset.key;if(!k)return;if(suCurrentSort.key===k){suCurrentSort.order=suCurrentSort.order==='asc'?'desc':'asc';}else{suCurrentSort.key=k;suCurrentSort.order='desc';}updateSortIcons();applyAndRenderSU();});
        if(suClearFiltersButton) suClearFiltersButton.addEventListener('click', clearAllSUFiltersAndSort);
        if(suInsightsToggleButton) suInsightsToggleButton.addEventListener('click', toggleInsightsPanel);
        if(suExportSingleButton) suExportSingleButton.addEventListener('click', exportStockUniverseAsSingleFile);
        if(suTableBodyElement){suTableBodyElement.addEventListener('mouseover',e=>{if(e.target.closest('.symbol-cell'))showChartPopup(e);});suTableBodyElement.addEventListener('mouseout',e=>{if(e.target.closest('.symbol-cell'))hideChartPopup(e);});}
        if(chartPopup){chartPopup.addEventListener('mouseenter',()=>clearTimeout(chartPopupTimeout));chartPopup.addEventListener('mouseleave',hideChartPopup);}
        if(suChartPanel) suChartPanel.addEventListener('click', handleChartBarClick);

        if(suColumnsButton) suColumnsButton.addEventListener('click', () => suColumnsPanel.classList.toggle('hidden'));
        if(suColumnsPanel) suColumnsPanel.addEventListener('change', e => {
            if (e.target.type === 'checkbox') {
                suColumnVisibility[e.target.dataset.key] = e.target.checked;
                saveSUColumnVisibility();
                createSUHeaderAndFilterRows();
                renderStockUniverseTable(currentlyDisplayedSUData);
            }
        });

        if(suFiltersButton) suFiltersButton.addEventListener('click', () => suFiltersPanel.classList.toggle('hidden'));
        if(suFiltersPanel) {
            suFiltersPanel.addEventListener('click', e => {
                if (e.target.id === 'su-filters-panel-apply') {
                    suFiltersPanel.querySelectorAll('input').forEach(i => { suFilters.textFilters[i.dataset.filterKey] = i.value.trim(); });
                    applyAndRenderSU();
                    suFiltersPanel.classList.add('hidden');
                } else if (e.target.id === 'su-filters-panel-clear') {
                    suFiltersPanel.querySelectorAll('input').forEach(i => i.value = '');
                    suFilters.textFilters = {};
                }
            });
        }
        
        document.addEventListener('click', e => {
            if (suColumnsButton && suColumnsPanel && !suColumnsButton.parentElement.contains(e.target)) {
                suColumnsPanel.classList.add('hidden');
            }
            if (suFiltersButton && suFiltersPanel && !suFiltersButton.parentElement.contains(e.target)) {
                suFiltersPanel.classList.add('hidden');
            }
        });
        
        const debouncedChartUpdate = debounce(()=>applyAndRenderSU(), 400);
        [suChartMinStocks, suChartWhRange, suChartMinUp, suChartMinDown].forEach(input => {
            if(input) { input.addEventListener('input', () => { sanitizeNumericInput(input, {allowDecimal:true, allowNegative: input.id.includes('down')}); const getValOrNull = (inp) => { if (!inp) return null; const v = inp.value.trim(); return v === '' ? null : parseFloat(v); }; suFilters.chart.whRange = getValOrNull(suChartWhRange); suFilters.chart.minStocks = getValOrNull(suChartMinStocks); suFilters.chart.minUp = getValOrNull(suChartMinUp); suFilters.chart.minDown = getValOrNull(suChartMinDown); debouncedChartUpdate(); });}
        });
    
        if(suChartGroupBy) { suChartGroupBy.addEventListener('change', (e) => { suFilters.chart.groupBy = e.target.value; applyAndRenderSU(); }); }
        if(suChartADClearButton) { suChartADClearButton.addEventListener('click', () => { if(suChartMinUp) suChartMinUp.value = ''; if(suChartMinDown) suChartMinDown.value = ''; suFilters.chart.minUp = null; suFilters.chart.minDown = null; applyAndRenderSU(); }); }
        
        initializePanelResizer();
        initializeAccordion();
        
        initDataLoad().finally(()=>{
            try {
                const settings=JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS)||'{}');
                if (settings.isOpen) {
                    if(suContainer) suContainer.classList.remove('panel-is-closed');
                    if(suChartPanel) suChartPanel.classList.remove('is-closed');
                    if(suPanelResizer) suPanelResizer.classList.remove('is-closed');
                    if(suInsightsToggleButton) suInsightsToggleButton.classList.add('active');
                    if(settings.width) suChartPanel.style.width = settings.width;
                } else {
                    if(suContainer) suContainer.classList.add('panel-is-closed');
                    if(suChartPanel) suChartPanel.classList.add('is-closed');
                    if(suPanelResizer) suPanelResizer.classList.add('is-closed');
                    if(suInsightsToggleButton) suInsightsToggleButton.classList.remove('active');
                }
            } catch(e) {}
        });
    })();
});
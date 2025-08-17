// --- STOCK UNIVERSE SCRIPT (V2.1 - CACHING & LIVE UPDATES, FILTER FIX) --
document.addEventListener('DOMContentLoaded', () => {
    // --- CONSTANTS ---
    const STOCK_UNIVERSE_DATA_PATH = "/static/data/stock_universe.json";
    const DATA_VERSION_PATH = "/static/data/data_version.json";
    const POLLING_INTERVAL = 180000; // 3 minutes

    const SU_LOCAL_STORAGE_DATA_KEY = 'finvestikStockData';
    const SU_LOCAL_STORAGE_VERSION_KEY = 'finvestikDataVersion';

    const SU_COLUMN_ORDER_KEY = 'finvestikSUColumnOrderKey';
    const SU_COLUMN_WIDTHS_KEY = 'finvestikSUColumnWidthsKey';
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
        if (!iE) return;
        let v = iE.value;
        let pattern = options.allowDecimal ? (options.allowNegative ? /[^0-9.-]/g : /[^0-9.]/g) : (options.allowNegative ? /[^0-9-]/g : /[^0-9]/g);
        let sV = v.replace(pattern, '');
        if (options.allowNegative) {
            const minus = sV.match(/-/g) || [];
            if (minus.length > 1 || (minus.length === 1 && sV.indexOf('-') !== 0)) { sV = v.substring(0, v.length - 1); }
        }
        if (options.allowDecimal) {
            const p = sV.split('.');
            if (p.length > 2) { sV = p[0] + '.' + p.slice(1).join(''); }
            if (sV === '.') sV = '0.';
            if (sV === '-.') sV = '-0.';
        }
        if(sV.length > 1 && sV.startsWith('0') && !sV.startsWith('0.')) { sV = sV.substring(1); }
        if(sV.length > 2 && sV.startsWith('-0') && !sV.startsWith('-0.')) { sV = '-' + sV.substring(2); }
        if (sV !== v) { iE.value = sV; }
    }
    
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
        { key: "Tomcap", displayName: "Tomcap %", isVisible: true, isSortable: true,isFilterable: true, filterType: 'text', formatter: formatPrice, defaultWidth: '100px', cellClass: 'text-right' },
        { key: "Sector Name", displayName: "Sector Name", isVisible: true, isSortable: true, isFilterable: true, filterType: 'dropdown', defaultWidth: '160px' }, 
        { key: "Industry Name", displayName: "Industry Name", isVisible: true, isSortable: true, isFilterable: true, filterType: 'dropdown', defaultWidth: '180px' },
        { key: "SecurityID", displayName: "Security ID", isVisible: false }, { key: "ListingID", displayName: "Listing ID", isVisible: false },
        { key: "SME Stock?", displayName: "SME?", isVisible: false }, { key: "previous_close", displayName: "Prev. Close", isVisible: false }
    ];

    // --- DOM ELEMENT AND STATE VARIABLES ---
    let suLoading, suError, suRowCount, suTable, suTableHeadElement, suTableBodyElement, suHeaderRow, suFilterRow, suExportButton, suExportSingleButton, suClearFiltersButton,
    suInsightsToggleButton, suContainer, suTableContainer, suPanelResizer, suChartPanel, suChartStatus, suLastUpdated, suSkeletonLoader,
    suChartGroupBy, suChartWhRange, suChartMinStocks, suChartMinUp, suChartMinDown, suChartADClearButton,
    suChartAccordionContainer, chart52wHighContainer, chartAvgGainContainer, chartAdRatioContainer,
    chartPopup, chartPopupContainer;
        
    let fullStockData = [], suCurrentColumnOrder = [], suColumnWidths = {}, currentlyDisplayedSUData = [], isStockDataLoaded = false;
    let oldDataMap = new Map();
    let suCurrentSort = { key: 'Market Cap', order: 'desc' };
    let suFilters = {}; let chartPopupTimeout, sortableInstance, pollingIntervalId; 
    let localDataVersion = null;
    let currentResizing = { th: null, startX: 0, startWidth: 0 }, panelResizing = { active: false, startX: 0, startWidth: 0 }; 

    // --- FUNCTION IMPLEMENTATIONS ---

    const loadSUColumnSettings = () => {
        const allKeys = new Set(suColumnDefinitions.map(d => d.key));
        const savedJSON = localStorage.getItem(SU_COLUMN_ORDER_KEY);
        let savedOrder = [];
        if(savedJSON) { try { savedOrder = JSON.parse(savedJSON).filter(k=>allKeys.has(k)); } catch(e){} }
        const savedKeySet = new Set(savedOrder);
        const missingKeys = suColumnDefinitions.map(d => d.key).filter(k => !savedKeySet.has(k));
        suCurrentColumnOrder = [...savedOrder, ...missingKeys];
        saveSUColumnOrder();
        const widthsJSON = localStorage.getItem(SU_COLUMN_WIDTHS_KEY);
        try { suColumnWidths = widthsJSON ? JSON.parse(widthsJSON) : {}; } catch(e) { suColumnWidths = {}; }
    }

    const saveSUColumnOrder = () => localStorage.setItem(SU_COLUMN_ORDER_KEY, JSON.stringify(suCurrentColumnOrder));
    const saveSUColumnWidths = () => localStorage.setItem(SU_COLUMN_WIDTHS_KEY, JSON.stringify(suColumnWidths));
    
    const loadSUFilters = () => {
        const saved = JSON.parse(localStorage.getItem(SU_FILTERS_KEY) || '{}');
        const defaultChartSettings = { groupBy: 'Sector Name', whRange: 25, minStocks: null, minUp: null, minDown: null };
        suFilters = {
            columns: saved.columns || {},
            textFilters: saved.textFilters || {},
            chart: { ...defaultChartSettings, ...(saved.chart || {}) }
        };
        if (suFilters.chart.whRange === null || suFilters.chart.whRange === undefined) {
            suFilters.chart.whRange = 25;
        }
    }

    const saveSUFilters = () => localStorage.setItem(SU_FILTERS_KEY, JSON.stringify(suFilters));

    const syncChartControlsUI = () => {
        if (!suFilters.chart) return;
        if(suChartGroupBy) suChartGroupBy.value = suFilters.chart.groupBy;
        if(suChartWhRange) suChartWhRange.value = suFilters.chart.whRange ?? '';
        if(suChartMinStocks) suChartMinStocks.value = suFilters.chart.minStocks ?? '';
        if(suChartMinUp) suChartMinUp.value = suFilters.chart.minUp ?? '';
        if(suChartMinDown) suChartMinDown.value = suFilters.chart.minDown ?? '';
    }

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

    async function initDataLoad() {
        loadSUColumnSettings();
        loadSUFilters();
        syncChartControlsUI();

        try {
            const cachedVersion = localStorage.getItem(SU_LOCAL_STORAGE_VERSION_KEY);
            const cachedData = localStorage.getItem(SU_LOCAL_STORAGE_DATA_KEY);

            if (cachedVersion && cachedData) {
                localDataVersion = cachedVersion;
                fullStockData = JSON.parse(cachedData);
                isStockDataLoaded = true;
                console.log('Loaded data from cache.');
                displayStockUniverse(false); // isUpdate = false
            } else {
                console.log('No cached data. Fetching initial data.');
                if(suSkeletonLoader) suSkeletonLoader.style.display = 'block';
                if(suContainer) suContainer.classList.add('hidden');
                await fetchInitialData();
            }
        } catch (e) {
            console.error("Failed to load cached data. Fetching fresh.", e);
            if(suSkeletonLoader) suSkeletonLoader.style.display = 'block';
            if(suContainer) suContainer.classList.add('hidden');
            await fetchInitialData();
        } finally {
            startPolling();
        }
    }

    async function fetchInitialData() {
        try {
            const [versionRes, dataRes] = await Promise.all([
                fetch(DATA_VERSION_PATH),
                fetch(STOCK_UNIVERSE_DATA_PATH)
            ]);

            if (!versionRes.ok || !dataRes.ok) throw new Error('Failed to fetch initial data files.');

            const versionData = await versionRes.json();
            const jsonData = await dataRes.json();

            localDataVersion = versionData.timestamp;
            fullStockData = jsonData?.map(r => ({ ...r, "Market Cap": parseFloat(r["Market Cap"]) || 0 })) || [];
            isStockDataLoaded = true;

            localStorage.setItem(SU_LOCAL_STORAGE_VERSION_KEY, localDataVersion);
            localStorage.setItem(SU_LOCAL_STORAGE_DATA_KEY, JSON.stringify(fullStockData));
            
            console.log('Fetched and stored initial data.');
            displayStockUniverse(false);

        } catch (err) {
            if(suError) suError.textContent = `Error loading data.`;
            isStockDataLoaded = false;
            fullStockData = [];
            throw err;
        }
    }

    function startPolling() {
        if (pollingIntervalId) clearInterval(pollingIntervalId);
        setTimeout(checkForUpdates, 5000); // Check shortly after initial load
        pollingIntervalId = setInterval(checkForUpdates, POLLING_INTERVAL);
        console.log(`Polling started. Checking every ${POLLING_INTERVAL / 1000} seconds.`);
    }

    async function checkForUpdates() {
        try {
            const res = await fetch(DATA_VERSION_PATH + `?t=${new Date().getTime()}`); // bust cache
            if (!res.ok) return;
            const versionData = await res.json();
            const remoteVersion = versionData.timestamp;
            
            if (remoteVersion && localDataVersion && remoteVersion > localDataVersion) {
                console.log(`New data version detected. Old: ${localDataVersion}, New: ${remoteVersion}. Fetching updates.`);
                if(suLoading) suLoading.classList.remove('hidden');
                await fetchAndApplyUpdates(remoteVersion);
            } else {
                updateLastUpdatedTimestamp();
            }
        } catch (error) {
            console.error("Error checking for updates:", error);
        } finally {
            if(suLoading) suLoading.classList.add('hidden');
        }
    }

    async function fetchAndApplyUpdates(newVersion) {
        try {
            const res = await fetch(STOCK_UNIVERSE_DATA_PATH + `?t=${new Date().getTime()}`);
            if (!res.ok) throw new Error('Failed to fetch updated stock data');

            const jsonData = await res.json();
            const newData = jsonData?.map(r => ({ ...r, "Market Cap": parseFloat(r["Market Cap"]) || 0 })) || [];

            oldDataMap = new Map(fullStockData.map(stock => [stock.Symbol, stock]));

            fullStockData = newData;
            localDataVersion = newVersion;
            isStockDataLoaded = true;
            
            localStorage.setItem(SU_LOCAL_STORAGE_VERSION_KEY, newVersion);
            localStorage.setItem(SU_LOCAL_STORAGE_DATA_KEY, JSON.stringify(newData));

            console.log("Update successful. Re-rendering table.");
            displayStockUniverse(true); // isUpdate = true

        } catch (error) {
            console.error("Failed to apply updates:", error);
        }
    }
    
    function displayStockUniverse(isUpdate = false) {
        if (suSkeletonLoader && suContainer) {
            suSkeletonLoader.style.display = 'none';
            suContainer.classList.remove('hidden');
        }

        if(isStockDataLoaded) {
            if(suLoading) suLoading.classList.add('hidden');
            if(suError) suError.classList.add('hidden');
            applyAndRenderSU(isUpdate);
        } else {
            if(suSkeletonLoader) suSkeletonLoader.style.display = 'block';
            if(suContainer) suContainer.classList.add('hidden');
            fetchInitialData().catch(err=>{
                if(suError) { suError.textContent = `Error: ${err.message}`; suError.classList.remove('hidden');}
            });
        }
    }
    
    const parseNumericFilter = (filterString) => {
        if (!filterString || String(filterString).trim() === '') return [];
        const conditions = String(filterString).split(',').map(s => s.trim()).filter(s => s !== '');
        const parsedConditions = [];
        const multipliers = { 'k': 1e3, 'm': 1e6, 'b': 1e9, 't': 1e12, 'cr': 1e7 };
        const operatorRegex = /^(>=|<=|!=|>|<|=)/;
        for (const cond of conditions) {
            let opMatch = cond.match(operatorRegex);
            let operator = opMatch ? opMatch[0] : '=';
            let valueStr = opMatch ? cond.substring(opMatch[0].length) : cond;
            valueStr = valueStr.trim();
            let multiplier = 1;
            const lastChar = valueStr.slice(-1).toLowerCase();
            const lastTwoChars = valueStr.slice(-2).toLowerCase();
            if (multipliers[lastTwoChars]) {
                valueStr = valueStr.slice(0, -2);
                multiplier = multipliers[lastTwoChars];
            } else if (multipliers[lastChar]) {
                valueStr = valueStr.slice(0, -1);
                multiplier = multipliers[lastChar];
            }
            const numericValue = parseFloat(valueStr);
            if (!isNaN(numericValue)) {
                parsedConditions.push({ operator: operator, value: numericValue * multiplier });
            }
        }
        return parsedConditions;
    };
    
    const applyAndRenderSU = (isUpdate = false) => {
        if (!isStockDataLoaded) { displayStockUniverse(false); return; } 
        let tableData = [...fullStockData];

        Object.entries(suFilters.columns).forEach(([key, value]) => { if (value && value !== 'ALL') { tableData = tableData.filter(row => String(row[key]) === String(value)); } });
        Object.entries(suFilters.textFilters).forEach(([key, filterString]) => {
            if (filterString) {
                const conditions = parseNumericFilter(filterString);
                if (conditions.length > 0) {
                    tableData = tableData.filter(row => {
                        const rowValue = row[key];
                        if (rowValue === null || rowValue === undefined) return false;
                        return conditions.every(cond => {
                            switch (cond.operator) {
                                case '>': return rowValue > cond.value;
                                case '<': return rowValue < cond.value;
                                case '>=': return rowValue >= cond.value;
                                case '<=': return rowValue <= cond.value;
                                case '!=': return rowValue != cond.value;
                                case '=': return rowValue == cond.value;
                                default: return true;
                            }
                        });
                    });
                }
            }
        });
        
        const { minUp, minDown } = suFilters.chart;
        if(minUp !== null || minDown !== null) {
            tableData = tableData.filter(stock => {
                const change = stock.change_percentage;
                if(typeof change !== 'number') return false;
                const upMatch = (minUp !== null) ? change >= minUp : false;
                const downMatch = (minDown !== null) ? change <= minDown : false;
                return upMatch || downMatch;
            });
        }

        if (suCurrentSort.key) {
            tableData.sort((a,b) => {
                const vA = a[suCurrentSort.key], vB = b[suCurrentSort.key];
                let c = 0;
                if (typeof vA === 'number' && typeof vB === 'number') {
                    c = vA - vB;
                } else {
                    c = String(vA ?? '').localeCompare(String(vB ?? ''));
                }
                return suCurrentSort.order === 'asc' ? c : -c;
            });
        }
        
        currentlyDisplayedSUData = tableData;
        saveSUFilters();
        renderStockUniverseTable(tableData, isUpdate);
        if (suChartPanel && !suChartPanel.classList.contains('is-closed')) {
            renderAllInsightCharts(tableData);
        }
    };
    
    const createSUHeaderAndFilterRows = () => {
        if (!suTableHeadElement) return;
        suTableHeadElement.innerHTML='';
        suHeaderRow=document.createElement('tr');
        suFilterRow=document.createElement('tr');
        suFilterRow.id='su-filter-row';
        const colsToRender=suCurrentColumnOrder.map(k=>suColumnDefinitions.find(d=>d.key===k)).filter(d=>d&&d.isVisible);
        colsToRender.forEach(def=>{
            const th = document.createElement('th');
            th.className = 'sortable-header resizable';
            th.dataset.key = def.key;
            th.innerHTML = `${def.displayName} <span class="sort-icon"></span><div class="resize-handle"></div>`;
            th.style.width = suColumnWidths[def.key] || def.defaultWidth;
            suHeaderRow.appendChild(th);
            const filterTd=document.createElement('td');
            if(def.isFilterable){
                if(def.filterType === 'dropdown'){
                    const select=document.createElement('select');
                    select.className='form-input';
                    select.dataset.filterKey = def.key;
                    select.value = suFilters.columns[def.key] || 'ALL';
                    select.addEventListener('change',e=>{
                        suFilters.columns[def.key] = e.target.value;
                        if(def.key === 'Sector Name') updateDependentDropdowns();
                        applyAndRenderSU(false);
                    });
                    filterTd.appendChild(select);
                } else if(def.filterType === 'text'){
                    const input=document.createElement('input');
                    input.type='text';
                    input.placeholder='>100,!=50';
                    input.className='form-input';
                    input.dataset.filterKey=def.key;
                    input.value=suFilters.textFilters[def.key]||'';
                    input.addEventListener('input', debounce(e => {
                        suFilters.textFilters[def.key] = e.target.value;
                        applyAndRenderSU(false);
                    }, 350));
                    filterTd.appendChild(input);
                }
            }
            suFilterRow.appendChild(filterTd);
        }); 
        suTableHeadElement.append(suHeaderRow, suFilterRow);
        populateTopLevelDropdowns();
        updateSortIcons();
        initializeSortable();
        initializeResizeHandles();
    };
    
    const clearAllSUFiltersAndSort = () => {
        suFilters = { columns: {}, textFilters: {}, chart: { groupBy: 'Sector Name', whRange: 25, minStocks: null, minUp: null, minDown: null } }; 
        suCurrentSort = { key: 'Market Cap', order: 'desc' };
        if(suFilterRow) {
            suFilterRow.querySelectorAll('input[type="text"]').forEach(input => input.value = '');
            suFilterRow.querySelectorAll('select').forEach(select => select.value = 'ALL');
        }
        syncChartControlsUI();
        updateDependentDropdowns();
        applyAndRenderSU(false);
    };
    
    const initializeSortable = () => { if(sortableInstance)sortableInstance.destroy();if(suHeaderRow)sortableInstance=Sortable.create(suHeaderRow,{animation:150,ghostClass:'sortable-ghost',onEnd:()=>{suCurrentColumnOrder=Array.from(suHeaderRow.children).map(th=>th.dataset.key);saveSUColumnOrder();applyAndRenderSU(false);}});}
    const initializeResizeHandles = () => { if(!suHeaderRow)return;suHeaderRow.querySelectorAll('.resize-handle').forEach(h=>h.addEventListener('mousedown',onResizeMouseDown));}
    function onResizeMouseDown(e){if(e.button!==0)return;currentResizing.th=e.target.parentElement;currentResizing.startX=e.pageX;currentResizing.startWidth=currentResizing.th.offsetWidth;document.addEventListener('mousemove',onResizeMouseMove);document.addEventListener('mouseup',onResizeMouseUp);e.target.classList.add('active');e.preventDefault();}
    function onResizeMouseMove(e){if(!currentResizing.th)return;const dx=e.pageX-currentResizing.startX;let w=Math.max(50,currentResizing.startWidth+dx);currentResizing.th.style.width=`${w}px`;}
    function onResizeMouseUp(){if(currentResizing.th){suColumnWidths[currentResizing.th.dataset.key]=currentResizing.th.style.width;saveSUColumnWidths();currentResizing.th.querySelector('.resize-handle')?.classList.remove('active');}document.removeEventListener('mousemove',onResizeMouseMove);document.removeEventListener('mouseup',onResizeMouseUp);currentResizing.th=null;}
    
    const initializePanelResizer = () => {if(!suPanelResizer)return;suPanelResizer.addEventListener('mousedown',e=>{if(e.button!==0)return;panelResizing.active=true;panelResizing.startX=e.pageX;panelResizing.startWidth=suChartPanel.offsetWidth;suPanelResizer.classList.add('active');document.body.style.cursor='col-resize';document.body.style.userSelect='none';document.addEventListener('mousemove',onPanelResizeMouseMove);document.addEventListener('mouseup',onPanelResizeMouseUp,{once:true});e.preventDefault();});}
    function onPanelResizeMouseMove(e) {if(!panelResizing.active || !suChartPanel)return;const dx = e.pageX - panelResizing.startX;let newWidth = panelResizing.startWidth - dx;if (suTableContainer) { const mainContainerWidth = suTableContainer.parentElement.clientWidth; newWidth = Math.max(0, Math.min(newWidth, mainContainerWidth - 58));} suChartPanel.style.width = `${newWidth}px`;}
    function onPanelResizeMouseUp() {panelResizing.active=false;suPanelResizer.classList.remove('active');document.body.style.cursor='';document.body.style.userSelect='';document.removeEventListener('mousemove',onPanelResizeMouseMove);try{const s=JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS)||'{}');s.width=suChartPanel.style.width;localStorage.setItem(SU_CHART_PANEL_SETTINGS,JSON.stringify(s));}catch(e){}}
    
    const updateSortIcons = () => {
        if(!suHeaderRow)return;suHeaderRow.querySelectorAll('.sortable-header .sort-icon').forEach(i=>i.innerHTML='');
        const h=suHeaderRow.querySelector(`.sortable-header[data-key="${suCurrentSort.key}"] .sort-icon`);
        if(h)h.innerHTML=suCurrentSort.order==='asc'?'▲':'▼';
    }

    const updateLastUpdatedTimestamp = () => {
        if (suLastUpdated && localDataVersion) {
            const date = new Date(parseInt(localDataVersion));
            suLastUpdated.textContent = `Last updated: ${date.toLocaleTimeString()}`;
            suLastUpdated.classList.remove('hidden');
        }
    }
    
    const renderStockUniverseTable = (data, isUpdate) => {
        if(!isStockDataLoaded || !suTableBodyElement) return;
        if(!suHeaderRow) createSUHeaderAndFilterRows();
        
        updateLastUpdatedTimestamp();
        const cols = suCurrentColumnOrder.map(k => suColumnDefinitions.find(d => d.key === k)).filter(d => d && d.isVisible);

        // --- BRANCH FOR SURGICAL (LIVE) UPDATE ---
         
    const fragment = document.createDocumentFragment();
    if (data.length > 0) {
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
    } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = cols.length || 1;
        td.className = 'text-center p-4';
        td.textContent = 'No stocks match the current filters.';
        tr.appendChild(td);
        fragment.appendChild(tr);
    }
    suTableBodyElement.innerHTML = '';
    suTableBodyElement.appendChild(fragment);
}

if(suRowCount) suRowCount.textContent = `Showing ${data.length} of ${fullStockData.length} stocks.`;
oldDataMap.clear(); // Clear map after use
    

    const populateTopLevelDropdowns = () => {
        if(!suFilterRow || fullStockData.length === 0) return;
        const ddefs = suColumnDefinitions.filter(d => d.isFilterable && d.filterType === 'dropdown');
        ddefs.forEach(def => {
            const s = suFilterRow.querySelector(`select[data-filter-key="${def.key}"]`);
            if(s){
                const vals = [...new Set(fullStockData.map(i => i[def.key]).filter(Boolean))].sort();
                const cur = suFilters.columns[def.key] || 'ALL';
                s.innerHTML=`<option value="ALL">ALL</option>`+vals.map(v=>`<option value="${v}">${v}</option>`).join('');
                s.value = cur;
            }
        });
        updateDependentDropdowns();
    };

    const updateDependentDropdowns = () => {
        if(!suFilterRow || !fullStockData.length) return;
        const selSec=suFilters.columns['Sector Name'] || 'ALL';
        const indDrop=suFilterRow.querySelector(`select[data-filter-key="Industry Name"]`);
        if(!indDrop) return;
        let relInd=[...new Set(fullStockData.filter(r=>selSec === 'ALL' || r['Sector Name'] === selSec).map(i=>i['Industry Name']).filter(Boolean))].sort();
        const curInd = suFilters.columns['Industry Name'] || 'ALL';
        indDrop.innerHTML = `<option value="ALL">ALL</option>`+relInd.map(v=>`<option value="${v}">${v}</option>`).join('');
        indDrop.value = relInd.includes(curInd) ? curInd : 'ALL';
        if(!relInd.includes(curInd)) suFilters.columns['Industry Name'] = 'ALL';
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
            g.totalInTable = g.stocks.length; g.sumChange = 0; g.advancers = 0; g.decliners = 0; g.nearHigh = 0;
            g.stocks.forEach(s => { const change = s['change_percentage']; const down52w = s['Down from 52W High (%)']; if (typeof change === 'number') { g.sumChange += change; if (change >= (minUp !== null ? minUp : 0.0001)) g.advancers++; if (change <= (minDown !== null ? minDown : -0.0001)) g.decliners++; } if (typeof down52w === 'number' && (whRange === null || down52w <= whRange)) g.nearHigh++; });
            g.avgChange = g.totalInTable > 0 ? g.sumChange / g.totalInTable : 0; g.adRatio = g.decliners > 0 ? g.advancers / g.decliners : (g.advancers > 0 ? Infinity : 1); g.nearHighPercent = g.totalInTable > 0 ? (g.nearHigh / g.totalInTable) * 100 : 0;
        });
        const adData = [...chartGroups].sort((a, b) => b.adRatio - a.adRatio); const maxAdRatio = Math.max(1, ...adData.filter(d => isFinite(d.adRatio)).map(d => d.adRatio));
        adData.forEach(d => { d.percentageWidth = d.adRatio === Infinity ? 100 : Math.min(100, 10 + (d.adRatio / (maxAdRatio || 1)) * 90) });
        renderBarChart(chartAdRatioContainer, adData, { valueFormatter: d => d.adRatio === Infinity ? 'All Up' : d.adRatio.toFixed(2), titleFormatter: d => `${d.name}: Ratio ${d.adRatio === Infinity ? 'All Up' : d.adRatio.toFixed(2)} (${d.advancers} Up, ${d.decliners} Down)`, subLabelFormatter: d => `(${d.advancers}/${d.decliners})` });
        const avgGainData = [...chartGroups].sort((a, b) => b.avgChange - a.avgChange); const maxGain = Math.max(0.01, ...avgGainData.map(d => Math.abs(d.avgChange)));
        avgGainData.forEach(d => { const p = (Math.abs(d.avgChange) / maxGain) * 100; d.percentageWidth = isNaN(p) ? 0 : p; });
        renderBarChart(chartAvgGainContainer, avgGainData, { valueFormatter: d => `${d.avgChange.toFixed(2)}%`, titleFormatter: d => `${d.name}: Avg. Change ${d.avgChange.toFixed(2)}%`, subLabelFormatter: d => `(${d.totalInTable})` });
        const high52wData = [...chartGroups].sort((a, b) => b.nearHighPercent - a.nearHighPercent); high52wData.forEach(d => d.percentageWidth = d.nearHighPercent);
        renderBarChart(chart52wHighContainer, high52wData, { valueFormatter: d => whRange === null ? 'N/A' : `${d.nearHighPercent.toFixed(1)}%`, titleFormatter: d => whRange === null ? 'Enter a "% From High" value' : `${d.name}: ${d.nearHigh} of ${d.totalInTable} stocks (${d.nearHighPercent.toFixed(2)}%)`, subLabelFormatter: d => whRange === null ? '' : `(${d.nearHigh}/${d.totalInTable})` });
    };
    
    function handleChartBarClick(event) {
        const bar = event.target.closest('.chart-bar-item'); if(!bar||!bar.dataset.groupKey)return;
        const groupKeyName = suFilters.chart.groupBy; const groupValue = bar.dataset.groupKey;
        const dropdown = suFilterRow.querySelector(`select[data-filter-key="${groupKeyName}"]`);
        if(dropdown){
            if (suFilters.columns[groupKeyName] === groupValue) suFilters.columns[groupKeyName] = 'ALL'; else suFilters.columns[groupKeyName] = groupValue;
            dropdown.value = suFilters.columns[groupKeyName];
            if(groupKeyName === 'Sector Name') updateDependentDropdowns();
            applyAndRenderSU(false);
        }
    }

    function toggleInsightsPanel() {
        if (!suContainer || !suChartPanel || !suPanelResizer || !suInsightsToggleButton) return;
        suContainer.classList.toggle('panel-is-closed');
        suChartPanel.classList.toggle('is-closed');
        suPanelResizer.classList.toggle('is-closed');
        suInsightsToggleButton.classList.toggle('active');
        const isNowVisible = !suChartPanel.classList.contains('is-closed');
        if (isNowVisible && currentlyDisplayedSUData) { renderAllInsightCharts(currentlyDisplayedSUData); }
        try { const settings = JSON.parse(localStorage.getItem(SU_CHART_PANEL_SETTINGS) || '{}'); settings.isOpen = isNowVisible; localStorage.setItem(SU_CHART_PANEL_SETTINGS, JSON.stringify(settings)); } catch (e) {}
    }
    
    function initializeAccordion() {
        if(!suChartAccordionContainer) return;
        suChartAccordionContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.accordion-header');
            if (!header || e.target.closest('.chart-panel-input, .local-clear-button')) return;
            const content = header.nextElementSibling; const isActive = header.classList.contains('active');
            suChartAccordionContainer.querySelectorAll('.accordion-header').forEach(h => { if (h !== header) { h.classList.remove('active'); h.setAttribute('aria-expanded', 'false'); h.nextElementSibling.style.maxHeight = null; h.nextElementSibling.classList.remove('open'); } });
            if (!isActive) { header.classList.add('active'); header.setAttribute('aria-expanded', 'true'); content.classList.add('open'); content.style.maxHeight = content.scrollHeight + "px"; }
            else { header.classList.remove('active'); header.setAttribute('aria-expanded', 'false'); content.style.maxHeight = null; content.classList.remove('open'); }
        });
    }

    function exportStockUniverseAsMultiFileZip(){
        if(!currentlyDisplayedSUData||!currentlyDisplayedSUData.length){alert("No data to export.");return}
        if(typeof JSZip==='undefined'||typeof saveAs==='undefined'){return}const sectors={};
        currentlyDisplayedSUData.forEach(s=>{const sec=s['Sector Name'],ind=s['Industry Name'],sym=s['Symbol'];if(!sectors[sec])sectors[sec]={};if(!sectors[sec][ind])sectors[sec][ind]=[];sectors[sec][ind].push(sym);});const zip=new JSZip();
        Object.keys(sectors).sort().forEach(sn=>{let fc='';Object.keys(sectors[sn]).sort().forEach(inm=>{const syms=sectors[sn][inm].join(',');fc+=`###${inm},${syms}\n`;});zip.file(`${sn}.txt`,fc.trim());});
        zip.generateAsync({type:"blob"}).then(c=>saveAs(c,"TV Sector Data.zip"));
    }

    function exportStockUniverseAsSingleFile(){
        if(!currentlyDisplayedSUData||!currentlyDisplayedSUData.length){alert("No data to export.");return}
        if(typeof saveAs==='undefined'){return} const inds={};
        currentlyDisplayedSUData.forEach(s=>{const ind=s['Industry Name'],sym=s['Symbol'];if(!ind)return;if(!inds[ind]){inds[ind]=[];}inds[ind].push(sym);});
        let fc=''; Object.keys(inds).sort().forEach(inm=>{const syms=inds[inm].join(',');fc+=`###${inm},${syms}\n`;});
        const blob=new Blob([fc.trim()],{type:"text/plain;charset=utf-8"});
        saveAs(blob,"Finvestik_Stocks.txt");
    }

    // --- INITIALIZATION ---
    (function initializePage(){
        suLoading=document.getElementById('su-loading');suError=document.getElementById('su-error');suRowCount=document.getElementById('su-row-count');suTable=document.getElementById('su-table');if(suTable){suTableHeadElement=suTable.querySelector('thead');suTableBodyElement=suTable.querySelector('tbody');}
        suClearFiltersButton=document.getElementById('su-clear-filters-button');suExportButton=document.getElementById('su-export-button');suExportSingleButton=document.getElementById('su-export-single-button');
        suInsightsToggleButton=document.getElementById('su-insights-toggle-button');suContainer=document.getElementById('su-container');suTableContainer=document.getElementById('su-table-container');suPanelResizer=document.getElementById('su-panel-resizer');suChartPanel=document.getElementById('su-chart-panel');suChartStatus=document.getElementById('su-chart-status');
        suChartGroupBy=document.getElementById('su-chart-group-by');suChartMinStocks=document.getElementById('su-chart-min-stocks');
        suChartWhRange=document.getElementById('su-chart-wh-range'); suChartMinUp=document.getElementById('su-chart-min-up'); suChartMinDown=document.getElementById('su-chart-min-down'); suChartADClearButton = document.getElementById('su-chart-ad-clear-button');
        suChartAccordionContainer = document.getElementById('su-chart-accordion-container'); chart52wHighContainer = document.getElementById('su-chart-52w-high'); chartAvgGainContainer = document.getElementById('su-chart-avg-gain'); chartAdRatioContainer = document.getElementById('su-chart-ad-ratio');
        chartPopup=document.getElementById('chart-popup');chartPopupContainer=document.getElementById('chart-popup-container');
        suSkeletonLoader = document.getElementById('su-skeleton-loader'); suLastUpdated = document.getElementById('su-last-updated');

        if(suTableHeadElement)suTableHeadElement.addEventListener('click',e=>{const h=e.target.closest('.sortable-header');if(!h||e.target.classList.contains('resize-handle'))return;const k=h.dataset.key;if(!k)return;if(suCurrentSort.key===k){suCurrentSort.order=suCurrentSort.order==='asc'?'desc':'asc';}else{suCurrentSort.key=k;suCurrentSort.order='desc';}updateSortIcons();applyAndRenderSU(false);});
        if(suClearFiltersButton) suClearFiltersButton.addEventListener('click', clearAllSUFiltersAndSort);
        if(suExportButton)suExportButton.addEventListener('click',exportStockUniverseAsMultiFileZip);
        if(suExportSingleButton)suExportSingleButton.addEventListener('click',exportStockUniverseAsSingleFile);
        if(suTableBodyElement){suTableBodyElement.addEventListener('mouseover',e=>{if(e.target.closest('.symbol-cell'))showChartPopup(e);});suTableBodyElement.addEventListener('mouseout',e=>{if(e.target.closest('.symbol-cell'))hideChartPopup(e);});}
        if(chartPopup){chartPopup.addEventListener('mouseenter',()=>clearTimeout(chartPopupTimeout));chartPopup.addEventListener('mouseleave',hideChartPopup);}
        if(suInsightsToggleButton)suInsightsToggleButton.addEventListener('click',toggleInsightsPanel);
        if(suChartPanel) suChartPanel.addEventListener('click', handleChartBarClick);
        
        const debouncedChartUpdate = debounce(()=>applyAndRenderSU(false), 400);
        [suChartMinStocks, suChartWhRange, suChartMinUp, suChartMinDown].forEach(input => {
            if(input) { input.addEventListener('input', () => { sanitizeNumericInput(input, {allowDecimal:true, allowNegative: input.id.includes('down')}); const getValOrNull = (inp) => { if (!inp) return null; const v = inp.value.trim(); return v === '' ? null : parseFloat(v); }; suFilters.chart.whRange = getValOrNull(suChartWhRange); suFilters.chart.minStocks = getValOrNull(suChartMinStocks); suFilters.chart.minUp = getValOrNull(suChartMinUp); suFilters.chart.minDown = getValOrNull(suChartMinDown); debouncedChartUpdate(); });}
        });
    
        if(suChartGroupBy) { suChartGroupBy.addEventListener('change', (e) => { suFilters.chart.groupBy = e.target.value; applyAndRenderSU(false); }); }
        if(suChartADClearButton) { suChartADClearButton.addEventListener('click', () => { if(suChartMinUp) suChartMinUp.value = ''; if(suChartMinDown) suChartMinDown.value = ''; suFilters.chart.minUp = null; suFilters.chart.minDown = null; applyAndRenderSU(false); }); }
        
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
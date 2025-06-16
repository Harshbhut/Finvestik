// --- GLOBAL CONSTANTS & SETTINGS ---
const APP_SETTINGS_KEY = 'finvestikCalculatorSettings';
const THEME_KEY = 'finvestikTheme';
const ACTIVE_VIEW_KEY = 'finvestikActiveView';
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTOqNgqIvbKgZ2SNvOAGkhW6iXxm1xXK_R1xCorTNDQkWRxod8-8G8x0isl1zTVHDVeHsfwfZfJLlkh/pub?output=csv";
const CUSTOM_INDEX_CACHE_KEY = 'finvestikCustomIndexCache';
const CUSTOM_INDEX_CACHE_DURATION_MS = 15 * 60 * 1000; // Cache for 15 minutes

// --- DOM ELEMENTS (Declared here, assigned in DOMContentLoaded) ---
let themeToggle, mobileThemeToggle,
    navCalculator, navCustomIndex, mobileNavCalculator, mobileNavCustomIndex,
    mobileMenuButton, mobileMenu, hamburgerIcon, closeIcon,
    calculatorView, customIndexView,
    capitalInputContainer, capitalInput, capitalError, riskRiskPercentInput, riskEntryPriceInput,
    riskSlPriceInput, riskRiskPercentError, riskEntryPriceError, riskSlPriceError, riskResultsContainer,
    riskCalculationWarning, riskErrorSummary, riskResultQty, riskResultRiskAmount, riskResultSlPercent,
    riskResultAllocationPercent, riskResultTotalCost, allocAllocationPercentInput, allocEntryPriceInput,
    allocSlPriceInput, allocAllocationPercentError, allocEntryPriceError, allocSlPriceError,
    allocResultsContainer, allocCalculationWarning, allocErrorSummary, allocResultQty,
    allocResultRiskOnCapitalPercent, allocResultRiskAmount, allocResultSlPercent, allocResultTotalCost,
    customIndexTable, customIndexTableHead,
    customIndexTableBody, customIndexLoading, customIndexError, customIndexMessage,
    customIndexLastUpdated, customIndexCopyButton, customIndexExportButton,
    customIndexRefreshButton,
    currentYearElement;

let currentCustomIndexData = [];
let allCalculatorInputs = [];

// --- HELPER & THEME FUNCTIONS ---
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-.386 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591" /></svg>`;
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 sm:w-6 sm:h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>`;

function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.classList.add('light');
        if (themeToggle) themeToggle.innerHTML = moonIcon;
        if (mobileThemeToggle) mobileThemeToggle.innerHTML = moonIcon;
    } else {
        document.documentElement.classList.remove('light');
        if (themeToggle) themeToggle.innerHTML = sunIcon;
        if (mobileThemeToggle) mobileThemeToggle.innerHTML = sunIcon;
    }
}

function loadTheme() {
    const preferredTheme = localStorage.getItem(THEME_KEY);
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let currentTheme = 'dark';
    if (preferredTheme) {
        currentTheme = preferredTheme;
    } else if (!systemPrefersDark) {
        currentTheme = 'light';
    }
    applyTheme(currentTheme);
}

function toggleAndSaveTheme() {
    const newTheme = document.documentElement.classList.contains('light') ? 'dark' : 'light';
    applyTheme(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
}

function switchView(viewId) {
    if (calculatorView) calculatorView.classList.add('hidden');
    if (customIndexView) customIndexView.classList.add('hidden');
    
    if (navCalculator) navCalculator.classList.remove('active');
    if (navCustomIndex) navCustomIndex.classList.remove('active');
    if (mobileNavCalculator) mobileNavCalculator.classList.remove('active');
    if (mobileNavCustomIndex) mobileNavCustomIndex.classList.remove('active');

    if (viewId === 'calculator-view' && calculatorView) {
        calculatorView.classList.remove('hidden');
        if (navCalculator) navCalculator.classList.add('active');
        if (mobileNavCalculator) mobileNavCalculator.classList.add('active');
        if (capitalInputContainer) capitalInputContainer.classList.remove('hidden');
    } else if (viewId === 'custom-index-view' && customIndexView) {
        customIndexView.classList.remove('hidden');
        if (navCustomIndex) navCustomIndex.classList.add('active');
        if (mobileNavCustomIndex) mobileNavCustomIndex.classList.add('active');
        if (capitalInputContainer) capitalInputContainer.classList.add('hidden');
        fetchAndRenderCustomIndexData();
    }
    localStorage.setItem(ACTIVE_VIEW_KEY, viewId);
}

// --- CALCULATOR LOGIC ---
const safeParseFloat = (str) => { if (typeof str !== 'string' && typeof str !== 'number') return 0; const num = parseFloat(String(str).replace(/,/g, '')); return isNaN(num) ? 0 : num; };
const formatCurrency = (value, symbol = '₹') => { if (isNaN(value) || !isFinite(value)) return `${symbol}0.00`; return `${symbol}${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };
const formatPercentage = (value) => { if (isNaN(value) || !isFinite(value)) return '0.00%'; return `${value.toFixed(2)}%`; };
const formatNumber = (value) => { if (isNaN(value) || !isFinite(value)) return '0'; return Math.floor(value).toLocaleString('en-IN'); };
const defaultSettings = { capital: '100000', risk_riskPercent: '0.5', risk_entryPrice: '305', risk_slPrice: '300', alloc_allocationPercent: '20', alloc_entryPrice: '305', alloc_slPrice: '300',};
function loadCalculatorSettings() { try { const sS=localStorage.getItem(APP_SETTINGS_KEY); const s=sS?JSON.parse(sS):{...defaultSettings}; if(capitalInput)capitalInput.value=s.capital||defaultSettings.capital; if(riskRiskPercentInput)riskRiskPercentInput.value=s.risk_riskPercent||defaultSettings.risk_riskPercent; if(riskEntryPriceInput)riskEntryPriceInput.value=s.risk_entryPrice||defaultSettings.risk_entryPrice; if(riskSlPriceInput)riskSlPriceInput.value=s.risk_slPrice||defaultSettings.risk_slPrice; if(allocAllocationPercentInput)allocAllocationPercentInput.value=s.alloc_allocationPercent||defaultSettings.alloc_allocationPercent; if(allocEntryPriceInput)allocEntryPriceInput.value=s.alloc_entryPrice||defaultSettings.alloc_entryPrice; if(allocSlPriceInput)allocSlPriceInput.value=s.alloc_slPrice||defaultSettings.alloc_slPrice; } catch (e) { console.error('Error loading calc settings:',e); Object.keys(defaultSettings).forEach(k=>{const iE=(k==='capital')?capitalInput:document.getElementById(k); if(iE)iE.value=defaultSettings[k];}); }};
function saveCalculatorSettings() { const cS={capital:capitalInput?capitalInput.value:defaultSettings.capital, risk_riskPercent:riskRiskPercentInput?riskRiskPercentInput.value:defaultSettings.risk_riskPercent, risk_entryPrice:riskEntryPriceInput?riskEntryPriceInput.value:defaultSettings.risk_entryPrice, risk_slPrice:riskSlPriceInput?riskSlPriceInput.value:defaultSettings.risk_slPrice, alloc_allocationPercent:allocAllocationPercentInput?allocAllocationPercentInput.value:defaultSettings.alloc_allocationPercent, alloc_entryPrice:allocEntryPriceInput?allocEntryPriceInput.value:defaultSettings.alloc_entryPrice, alloc_slPrice:allocSlPriceInput?allocSlPriceInput.value:defaultSettings.alloc_slPrice, }; try{localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(cS));}catch(e){console.error('Error saving calc settings:',e);} };
function sanitizeNumericInput(iE){if(!iE)return; let v=iE.value; let sV=v.replace(/[^0-9.]/g,''); const p=sV.split('.'); if(p.length>2){sV=p[0]+'.'+p.slice(1).join('');} if(sV.length>1&&sV.startsWith('0')&&!sV.startsWith('0.')){sV=sV.substring(1);} if(sV==='.')sV='0.'; if(sV!==v){iE.value=sV;}}
function calculateRiskBased() { [riskRiskPercentError,riskEntryPriceError,riskSlPriceError,capitalError].forEach(e=>{if(e)e.textContent='';}); [riskRiskPercentInput,riskEntryPriceInput,riskSlPriceInput,capitalInput].forEach(e=>{if(e)e.classList.remove('error');}); if(riskCalculationWarning){riskCalculationWarning.classList.add('hidden');riskCalculationWarning.textContent='';} const cap=safeParseFloat(capitalInput?capitalInput.value:'0'); const rP=safeParseFloat(riskRiskPercentInput?riskRiskPercentInput.value:'0'); const eP=safeParseFloat(riskEntryPriceInput?riskEntryPriceInput.value:'0'); const sP=safeParseFloat(riskSlPriceInput?riskSlPriceInput.value:'0'); let hE=false; let cW=null; if(cap<=0){if(capitalError)capitalError.textContent='Must be > 0.';if(capitalInput)capitalInput.classList.add('error');hE=true;} if(rP<=0){if(riskRiskPercentError)riskRiskPercentError.textContent='Must be > 0.';if(riskRiskPercentInput)riskRiskPercentInput.classList.add('error');hE=true;} if(rP>100){if(riskRiskPercentError)riskRiskPercentError.textContent='Cannot exceed 100.';if(riskRiskPercentInput)riskRiskPercentInput.classList.add('error');hE=true;} if(eP<=0){if(riskEntryPriceError)riskEntryPriceError.textContent='Must be > 0.';if(riskEntryPriceInput)riskEntryPriceInput.classList.add('error');hE=true;} if(sP<0){if(riskSlPriceError)riskSlPriceError.textContent='Cannot be negative.';if(riskSlPriceInput)riskSlPriceInput.classList.add('error');hE=true;} if(eP>0&&sP>0&&eP<=sP){if(riskSlPriceError)riskSlPriceError.textContent='SL must be < Entry Price.';if(riskSlPriceInput)riskSlPriceInput.classList.add('error');hE=true;} if(hE){if(riskResultsContainer)riskResultsContainer.classList.add('opacity-50','pointer-events-none'); if(riskErrorSummary)riskErrorSummary.classList.remove('hidden'); if(riskResultQty)riskResultQty.textContent=formatNumber(0); if(riskResultRiskAmount)riskResultRiskAmount.textContent=formatCurrency(0); if(riskResultSlPercent)riskResultSlPercent.textContent=formatPercentage(0); if(riskResultAllocationPercent)riskResultAllocationPercent.textContent=formatPercentage(0); if(riskResultTotalCost)riskResultTotalCost.textContent=formatCurrency(0); return;} if(riskErrorSummary)riskErrorSummary.classList.add('hidden'); if(riskResultsContainer)riskResultsContainer.classList.remove('opacity-50','pointer-events-none'); const rAA=cap*(rP/100); const rPS=eP-sP; let qty=0; if(rPS>0){qty=Math.floor(rAA/rPS);}else if(rAA>0&&eP>0&&sP>0&&eP===sP){cW="QTY is 0: SL equals Entry. No risk per share defined.";}else if(rAA>0&&eP>0&&sP>=eP){cW="QTY is 0: SL not protectively below Entry Price.";}else if(eP<=0&&rAA>0){cW="Cannot calculate QTY: Entry Price is 0.";} if(qty===0&&rPS>0&&rAA>0){cW="Calculated QTY is 0. Consider adjusting risk % or price levels.";} if(cW&&riskCalculationWarning){riskCalculationWarning.textContent=cW;riskCalculationWarning.classList.remove('hidden');} const tC=qty*eP; const aP=cap>0?(tC/cap)*100:0; const actSP=eP>0&&rPS>0?(rPS/eP)*100:0; if(riskResultQty)riskResultQty.textContent=formatNumber(qty); if(riskResultRiskAmount)riskResultRiskAmount.textContent=formatCurrency(rAA); if(riskResultSlPercent)riskResultSlPercent.textContent=formatPercentage(actSP); if(riskResultAllocationPercent)riskResultAllocationPercent.textContent=formatPercentage(aP); if(riskResultTotalCost)riskResultTotalCost.textContent=formatCurrency(tC);}
function calculateAllocationBased() { [allocAllocationPercentError,allocEntryPriceError,allocSlPriceError,capitalError].forEach(eL=>{if(eL)eL.textContent='';}); [allocAllocationPercentInput,allocEntryPriceInput,allocSlPriceInput,capitalInput].forEach(eL=>{if(eL)eL.classList.remove('error');}); if(allocCalculationWarning){allocCalculationWarning.classList.add('hidden');allocCalculationWarning.textContent='';} const cap=safeParseFloat(capitalInput?capitalInput.value:'0'); const alloPT=safeParseFloat(allocAllocationPercentInput?allocAllocationPercentInput.value:'0'); const eP=safeParseFloat(allocEntryPriceInput?allocEntryPriceInput.value:'0'); const sP=safeParseFloat(allocSlPriceInput?allocSlPriceInput.value:'0'); let hE=false; let cW=null; if(cap<=0){if(capitalError)capitalError.textContent='Must be > 0.';if(capitalInput)capitalInput.classList.add('error');hE=true;} if(alloPT<=0){if(allocAllocationPercentError)allocAllocationPercentError.textContent='Must be > 0.';if(allocAllocationPercentInput)allocAllocationPercentInput.classList.add('error');hE=true;} if(alloPT>100){if(allocAllocationPercentError)allocAllocationPercentError.textContent='Cannot exceed 100.';if(allocAllocationPercentInput)allocAllocationPercentInput.classList.add('error');hE=true;} if(eP<=0){if(allocEntryPriceError)allocEntryPriceError.textContent='Must be > 0.';if(allocEntryPriceInput)allocEntryPriceInput.classList.add('error');hE=true;} if(sP<0){if(allocSlPriceError)allocSlPriceError.textContent='Cannot be negative.';if(allocSlPriceInput)allocSlPriceInput.classList.add('error');hE=true;} if(eP>0&&sP>0&&eP<=sP){if(allocSlPriceError)allocSlPriceError.textContent='SL must be < Entry Price.';if(allocSlPriceInput)allocSlPriceInput.classList.add('error');hE=true;} if(hE){if(allocResultsContainer)allocResultsContainer.classList.add('opacity-50','pointer-events-none'); if(allocErrorSummary)allocErrorSummary.classList.remove('hidden'); if(allocResultQty)allocResultQty.textContent=formatNumber(0); if(allocResultRiskOnCapitalPercent)allocResultRiskOnCapitalPercent.textContent=formatPercentage(0); if(allocResultRiskAmount)allocResultRiskAmount.textContent=formatCurrency(0); if(allocResultSlPercent)allocResultSlPercent.textContent=formatPercentage(0); if(allocResultTotalCost)allocResultTotalCost.textContent=formatCurrency(0); return;} if(allocErrorSummary)allocErrorSummary.classList.add('hidden'); if(allocResultsContainer)allocResultsContainer.classList.remove('opacity-50','pointer-events-none'); const alloA=cap*(alloPT/100); let qty=0; if(eP>0){qty=Math.floor(alloA/eP);}else{cW="Cannot calculate QTY: Entry Price is 0.";} if(qty===0&&eP>0&&alloA>0){cW="Calculated QTY is 0. Adjust allocation % or entry price.";} const rPS=eP-sP; const tARA=(rPS>0&&sP>0)?qty*rPS:0; const aROCP=(cap>0&&tARA>0)?(tARA/cap)*100:0; const aSP=(eP>0&&rPS>0&&sP>0)?(rPS/eP)*100:0; const tC=qty*eP; if(cW&&allocCalculationWarning){allocCalculationWarning.textContent=cW;allocCalculationWarning.classList.remove('hidden');} if(sP<=0&&qty>0&&allocCalculationWarning){allocCalculationWarning.textContent=(cW?cW+" ":"")+"Warning: SL Price is 0 or negative; Risk Amount and Risk % might be misleading.";allocCalculationWarning.classList.remove('hidden');}else if(rPS<=0&&sP>0&&qty>0&&allocCalculationWarning){allocCalculationWarning.textContent=(cW?cW+" ":"")+"Warning: SL Price not below Entry; Risk Amount and Risk % are 0.";allocCalculationWarning.classList.remove('hidden');} if(allocResultQty)allocResultQty.textContent=formatNumber(qty); if(allocResultRiskOnCapitalPercent)allocResultRiskOnCapitalPercent.textContent=formatPercentage(aROCP); if(allocResultRiskAmount)allocResultRiskAmount.textContent=formatCurrency(tARA); if(allocResultSlPercent)allocResultSlPercent.textContent=formatPercentage(aSP); if(allocResultTotalCost)allocResultTotalCost.textContent=formatCurrency(tC);}
function updateAllCalculationsAndSave() { if (capitalInput&&!capitalInput.classList.contains('error')&&capitalError){capitalError.textContent='';} calculateRiskBased(); calculateAllocationBased(); saveCalculatorSettings();};

// --- CUSTOM INDEX DATA HANDLING ---
function parseCSV(csvText) { const lines = csvText.replace(/\r/g, '').trim().split('\n'); if (lines.length < 2) return []; const headers = lines[0].split(',').map(h => h.trim()); const result = []; for (let i = 1; i < lines.length; i++) { if (!lines[i]) continue; const values = lines[i].split(',').map(v => v.trim()); if (values.length !== headers.length) continue; const obj = {}; for (let j = 0; j < headers.length; j++) { obj[headers[j]] = values[j]; } result.push(obj); } return result; }
async function fetchAndRenderCustomIndexData(options = { force: false }) { try { const cachedDataJSON = localStorage.getItem(CUSTOM_INDEX_CACHE_KEY); if (cachedDataJSON && !options.force) { const cache = JSON.parse(cachedDataJSON); const isCacheFresh = (Date.now() - cache.timestamp) < CUSTOM_INDEX_CACHE_DURATION_MS; if (isCacheFresh) { renderCustomIndexTable(cache.data, `Cached at: ${new Date(cache.timestamp).toLocaleString()}`); return; } } } catch (e) { console.error("Could not read from cache", e); } customIndexLoading.classList.remove('hidden'); customIndexError.classList.add('hidden'); customIndexMessage.classList.remove('hidden'); customIndexMessage.textContent = 'Fetching latest data...'; try { const response = await fetch(GOOGLE_SHEET_CSV_URL, { cache: "no-store" }); if (!response.ok) throw new Error(`Network response was not ok. Status: ${response.status}`); const csvText = await response.text(); if (!csvText || csvText.trim().length < 5) throw new Error("Received empty or invalid data from sheet."); const data = parseCSV(csvText); const timestamp = Date.now(); localStorage.setItem(CUSTOM_INDEX_CACHE_KEY, JSON.stringify({ data, timestamp })); renderCustomIndexTable(data, `Fetched at: ${new Date(timestamp).toLocaleString()}`); } catch (err) { customIndexLoading.classList.add('hidden'); customIndexError.textContent = `Error: ${err.message}`; customIndexError.classList.remove('hidden'); customIndexMessage.classList.add('hidden'); } }
function renderCustomIndexTable(data, timestampText) {
    customIndexLoading.classList.add('hidden');
    customIndexError.classList.add('hidden');
    customIndexMessage.classList.add('hidden');
    customIndexLastUpdated.textContent = timestampText;
    customIndexTableHead.innerHTML = '';
    customIndexTableBody.innerHTML = '';
    if (!data || data.length === 0) {
        customIndexTableBody.innerHTML = '<tr><td colspan="2" class="text-center p-4">No data to display.</td></tr>';
        currentCustomIndexData = []; // Clear data if empty
        return;
    }
    
    currentCustomIndexData = data; // THIS IS THE FIX. It saves the data for the buttons.
    
    const headers = Object.keys(data[0]);
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => { const th = document.createElement('th'); th.textContent = headerText.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); headerRow.appendChild(th); });
    customIndexTableHead.appendChild(headerRow);
    data.forEach(item => { const row = document.createElement('tr'); headers.forEach(header => { const cell = document.createElement('td'); cell.textContent = item[header] || 'N/A'; row.appendChild(cell); }); customIndexTableBody.appendChild(row); });
}

function formatCustomIndexDataForExport(data) { if (!data || data.length === 0) return ""; const firstItemKeys = Object.keys(data[0]); const sectorKey = firstItemKeys.find(key => key.toLowerCase() === 'sector') || firstItemKeys[0];  const symbolKey = firstItemKeys.find(key => key.toLowerCase() === 'symbol') || (firstItemKeys.length > 1 ? firstItemKeys[1] : firstItemKeys[0]); return data.map(item => `###${item[sectorKey] || ''},${item[symbolKey] || ''}`).join(',');}
function exportCustomIndexData() { if (!currentCustomIndexData || currentCustomIndexData.length === 0) { alert("No data to export."); return; } const formattedData = formatCustomIndexDataForExport(currentCustomIndexData); const blob = new Blob([formattedData], { type: 'text/plain;charset=utf-8' }); const link = document.createElement("a"); const url = URL.createObjectURL(blob); link.setAttribute("href", url); link.setAttribute("download", "custom_index_data.txt"); link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); if(customIndexMessage) { customIndexMessage.textContent = "Data exported."; customIndexMessage.classList.remove('hidden'); setTimeout(() => customIndexMessage.classList.add('hidden'), 3000); }}
function copyCustomIndexData() { if (!currentCustomIndexData || currentCustomIndexData.length === 0) { alert("No data to copy."); return; } const formattedData = formatCustomIndexDataForExport(currentCustomIndexData); navigator.clipboard.writeText(formattedData).then(() => { if(customIndexMessage) { customIndexMessage.textContent = "Data copied!"; customIndexMessage.classList.remove('hidden'); setTimeout(() => customIndexMessage.classList.add('hidden'), 3000); }}).catch(err => { console.error('Failed to copy: ', err); if(customIndexError) { customIndexError.textContent = "Copy failed. See console."; customIndexError.classList.remove('hidden'); setTimeout(() => customIndexError.classList.add('hidden'), 3000); }});}

// --- MAIN SCRIPT EXECUTION ---
document.addEventListener('DOMContentLoaded', () => {
    // Assign ALL DOM Elements
    themeToggle = document.getElementById('theme-toggle');
    mobileThemeToggle = document.getElementById('mobile-theme-toggle');
    navCalculator = document.getElementById('nav-calculator');
    navCustomIndex = document.getElementById('nav-custom-index');
    mobileNavCalculator = document.getElementById('mobile-nav-calculator');
    mobileNavCustomIndex = document.getElementById('mobile-nav-custom-index');
    mobileMenuButton = document.getElementById('mobile-menu-button');
    mobileMenu = document.getElementById('mobile-menu');
    hamburgerIcon = document.getElementById('hamburger-icon');
    closeIcon = document.getElementById('close-icon');
    calculatorView = document.getElementById('calculator-view');
    customIndexView = document.getElementById('custom-index-view');
    capitalInputContainer = calculatorView.querySelector('[role="region"][aria-labelledby="capital-heading"]');
    currentYearElement = document.getElementById('current-year');
    capitalInput = document.getElementById('capital'); capitalError = document.getElementById('capital-error');
    riskRiskPercentInput = document.getElementById('risk_riskPercent'); riskEntryPriceInput = document.getElementById('risk_entryPrice'); riskSlPriceInput = document.getElementById('risk_slPrice'); riskRiskPercentError = document.getElementById('risk_riskPercent-error'); riskEntryPriceError = document.getElementById('risk_entryPrice-error'); riskSlPriceError = document.getElementById('risk_slPrice-error');
    allocAllocationPercentInput = document.getElementById('alloc_allocationPercent'); allocEntryPriceInput = document.getElementById('alloc_entryPrice'); allocSlPriceInput = document.getElementById('alloc_slPrice'); allocAllocationPercentError = document.getElementById('alloc_allocationPercent-error'); allocEntryPriceError = document.getElementById('alloc_entryPrice-error'); allocSlPriceError = document.getElementById('alloc_slPrice-error');
    riskResultsContainer = document.getElementById('risk_results_container'); riskCalculationWarning = document.getElementById('risk_calculation_warning'); riskErrorSummary = document.getElementById('risk_error_summary'); riskResultQty = document.getElementById('risk_result_qty'); riskResultRiskAmount = document.getElementById('risk_result_riskAmount'); riskResultSlPercent = document.getElementById('risk_result_slPercent'); riskResultAllocationPercent = document.getElementById('risk_result_allocationPercent'); riskResultTotalCost = document.getElementById('risk_result_totalCost');
    allocResultsContainer = document.getElementById('alloc_results_container'); allocCalculationWarning = document.getElementById('alloc_calculation_warning'); allocErrorSummary = document.getElementById('alloc_error_summary'); allocResultQty = document.getElementById('alloc_result_qty'); allocResultRiskOnCapitalPercent = document.getElementById('alloc_result_riskOnCapitalPercent'); allocResultRiskAmount = document.getElementById('alloc_result_riskAmount'); allocResultSlPercent = document.getElementById('alloc_result_slPercent'); allocResultTotalCost = document.getElementById('alloc_result_totalCost');
    customIndexTable = document.getElementById('custom-index-table'); customIndexTableHead = customIndexTable.querySelector('thead'); customIndexTableBody = customIndexTable.querySelector('tbody'); customIndexLoading = document.getElementById('custom-index-loading'); customIndexError = document.getElementById('custom-index-error'); customIndexMessage = document.getElementById('custom-index-message'); customIndexLastUpdated = document.getElementById('custom-index-last-updated');
    customIndexRefreshButton = document.getElementById('custom-index-refresh-button');
    customIndexCopyButton = document.getElementById('custom-index-copy-button');
    customIndexExportButton = document.getElementById('custom-index-export-button');
    
    // Populate Input Array
    allCalculatorInputs = [ capitalInput, riskRiskPercentInput, riskEntryPriceInput, riskSlPriceInput, allocAllocationPercentInput, allocEntryPriceInput, allocSlPriceInput ];

    // Attach ALL Event Listeners
    if (themeToggle) themeToggle.addEventListener('click', toggleAndSaveTheme);
    if (mobileThemeToggle) mobileThemeToggle.addEventListener('click', toggleAndSaveTheme);
    if (navCalculator) navCalculator.addEventListener('click', () => switchView('calculator-view'));
    if (navCustomIndex) navCustomIndex.addEventListener('click', () => switchView('custom-index-view'));
    if (mobileMenuButton) { mobileMenuButton.addEventListener('click', () => { mobileMenu.classList.toggle('hidden'); hamburgerIcon.classList.toggle('hidden'); closeIcon.classList.toggle('hidden'); }); }
    const closeMobileMenu = () => { if (mobileMenu && !mobileMenu.classList.contains('hidden')) { mobileMenu.classList.add('hidden'); hamburgerIcon.classList.remove('hidden'); closeIcon.classList.add('hidden'); } };
    if (mobileNavCalculator) { mobileNavCalculator.addEventListener('click', () => { switchView('calculator-view'); closeMobileMenu(); }); }
    if (mobileNavCustomIndex) { mobileNavCustomIndex.addEventListener('click', () => { switchView('custom-index-view'); closeMobileMenu(); }); }
    if (customIndexRefreshButton) customIndexRefreshButton.addEventListener('click', () => fetchAndRenderCustomIndexData({ force: true }));
    if (customIndexCopyButton) customIndexCopyButton.addEventListener('click', copyCustomIndexData);
    if (customIndexExportButton) customIndexExportButton.addEventListener('click', exportCustomIndexData);
    allCalculatorInputs.forEach(input => { if (input) { input.addEventListener('input', () => { sanitizeNumericInput(input); updateAllCalculationsAndSave(); }); input.addEventListener('blur', () => { sanitizeNumericInput(input); if (input.value.endsWith('.')) { input.value = input.value.slice(0, -1); } updateAllCalculationsAndSave(); }); } });
    
    // Initial Page Load Setup
    if(currentYearElement) currentYearElement.textContent = new Date().getFullYear();
    loadTheme();
    loadCalculatorSettings();
    updateAllCalculationsAndSave();
    const lastView = localStorage.getItem(ACTIVE_VIEW_KEY) || 'calculator-view';
    switchView(lastView);
});
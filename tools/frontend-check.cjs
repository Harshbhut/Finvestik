#!/usr/bin/env node
'use strict';
// Offline regression tests: execute the actual browser helpers in a minimal DOM.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
    constructor(tag = '') { this.tagName = tag; this.children = []; this.style = {}; this.dataset = {}; this.textContent = ''; this.classList = { add() {}, remove() {}, contains() { return false; } }; }
    set innerHTML(value) { assert.equal(value, '', 'Dynamic content must not be parsed as HTML'); this.children = []; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); return child; }
    replaceChildren(...children) { this.children = children; }
}
const saved = new Map();
let blockStorage = false;
const localStorage = {
    getItem(key) { if (blockStorage) throw new Error('Blocked'); return saved.get(key) ?? null; },
    setItem(key, value) { if (blockStorage) throw new Error('Quota'); saved.set(key, String(value)); },
    removeItem(key) { if (blockStorage) throw new Error('Blocked'); saved.delete(key); }
};
const context = vm.createContext({
    console, localStorage, AbortSignal,
    setInterval() { return 1; }, clearInterval() {},
    setTimeout, clearTimeout,
    document: {
        hidden: false,
        addEventListener(event, fn) { if (event === 'DOMContentLoaded') fn(); },
        createElement(tag) { return new Element(tag); },
        createDocumentFragment() { return new Element('fragment'); }
    },
    Option: function(text, value) { this.textContent = text; this.value = value; }
});
const source = fs.readFileSync(path.join(__dirname, '../static/js/stock-universe.js'), 'utf8');
const marker = '    // --- INITIALIZATION ---';
assert.ok(source.includes(marker));
vm.runInContext(source.replace(marker, `
    globalThis.helpers = { normalizeStockData, loadSUFilters, setSelectOptions, renderBarChart, initDataLoad, checkForUpdates, fetchInitialData,
        getState: () => ({ fullStockData, localDataVersion, isStockDataLoaded, suFilters }),
        setData: (data, version) => { fullStockData = data; localDataVersion = version; isStockDataLoaded = true; },
        resetLoaded: () => { isStockDataLoaded = false; }, cacheStockData };
    return;
${marker}`), context);
const h = context.helpers;
const attack = '<img src=x onerror="globalThis.attacked=true">';
assert.throws(() => h.normalizeStockData({ rows: [] }), /Invalid stock/);
assert.throws(() => h.normalizeStockData([null]), /Invalid stock/);
assert.throws(() => h.normalizeStockData([{ Symbol: 123 }]), /Invalid stock/);
assert.equal(h.normalizeStockData([{ Symbol: 'NSE:ABC', 'Market Cap': '123.5' }])[0]['Market Cap'], 123.5);
for (const value of ['{broken', 'null', '[]', '{"columns":null,"textFilters":[],"chart":{"groupBy":"bad","minStocks":"bad"}}']) {
    saved.set('finvestikSUFiltersKey', value);
    h.loadSUFilters();
    assert.equal(h.getState().suFilters.chart.groupBy, 'Sector Name');
}
blockStorage = true;
h.loadSUFilters(); // Disabled storage must not crash startup.
blockStorage = false;
const select = new Element('select');
h.setSelectOptions(select, [attack, 'Energy & Power']);
assert.equal(select.children[0].children[1].value, attack);
const chart = new Element('div');
h.renderBarChart(chart, [{ name: attack, percentageWidth: 999 }], { valueFormatter: () => attack, subLabelFormatter: () => attack });
const bar = chart.children[0].children[0];
assert.equal(bar.children[0].textContent, attack);
assert.equal(bar.children[1].children[0].style.width, '100%');
assert.equal(bar.children[1].children[1].textContent, attack);

// Verify CSV parser against quoted commas/newlines and escaped quotes.
const html = fs.readFileSync(path.join(__dirname, '../custom-index/index.html'), 'utf8');
// The maintenance page intentionally omits the table; initialization must exit safely.
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
const customInitializer = inlineScripts.find(script => script.includes('CUSTOM_INDEX_CACHE_KEY'));
assert.ok(customInitializer);
vm.runInNewContext(customInitializer, {
    document: { addEventListener(event, fn) { if (event === 'DOMContentLoaded') fn(); }, getElementById() { return null; } }
});
const csvParser = html.match(/const parseCSV = (\(csvText\) => \{[\s\S]*?\n            \});/);
assert.ok(csvParser);
const parseCSV = vm.runInNewContext(csvParser[1]);
const rows = parseCSV('Sector,Symbol\r\n"Energy, Power","ABC"\r\n"Two\nLines","A""B"\r\n');
assert.equal(rows.length, 2);
assert.equal(rows[0].Sector, 'Energy, Power');
assert.equal(rows[1].Symbol, 'A"B');
assert.equal(rows[1].Sector, 'Two\nLines');
assert.throws(() => parseCSV('A,B\n"unclosed,B'), /Malformed CSV/);

(async () => {
    // A quota failure must not mark a valid network response as a failed load.
    blockStorage = true;
    const data = [{ Symbol: 'ABC', 'Market Cap': 10 }];
    let version = 100;
    context.fetch = async url => ({ ok: true, json: async () => url.includes('data_version') ? { timestamp: version } : data });
    await h.initDataLoad();
    assert.equal(h.getState().isStockDataLoaded, true);
    assert.equal(h.getState().localDataVersion, 100);
    version = 200;
    await h.checkForUpdates();
    assert.equal(h.getState().localDataVersion, 200);
    // A failed refresh must keep last-known-good data usable.
    context.fetch = async () => { throw new Error('Offline'); };
    await h.fetchInitialData();
    assert.equal(h.getState().isStockDataLoaded, true);
    assert.equal(h.getState().localDataVersion, 200);
    h.resetLoaded();
    await h.fetchInitialData();
    assert.equal(h.getState().isStockDataLoaded, false);
    context.fetch = async url => ({ ok: true, json: async () => url.includes('data_version') ? { timestamp: version } : data });
    await h.checkForUpdates();
    assert.equal(h.getState().isStockDataLoaded, true);
    blockStorage = false;
    h.cacheStockData();
    assert.equal(saved.get('finvestikDataVersion'), '200');
    assert.equal(JSON.parse(saved.get('finvestikStockData'))[0].Symbol, 'ABC');
    console.log('Frontend regression checks passed (XSS, CSV, storage, refresh recovery).');
})().catch(error => { console.error(error); process.exitCode = 1; });

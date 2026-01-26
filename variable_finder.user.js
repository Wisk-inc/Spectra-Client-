// ==UserScript==
// @name         Variable Finder
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Deep scanner for Bloxd.io game variables and object paths
// @author       Jules
// @match        *://bloxd.io/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("%c[Variable Finder] Initializing...", "color: #00ff00; font-weight: bold;");

    const FoundPaths = new Set();
    let wpRequire = null;

    // Webpack Interception
    const interceptWebpack = () => {
        let winDescriptors = Object.getOwnPropertyDescriptors(window);
        let wpName = Object.keys(winDescriptors).find(key => winDescriptors[key]?.set?.toString().includes("++"));
        let wpInstance = window[wpName];

        if (!wpInstance) return;

        wpInstance.push([
            [Math.floor(Math.random() * 90000) + 10000], {},
            function(req) {
                wpRequire = req;
                console.log("%c[Variable Finder] Webpack Intercepted!", "color: #00ff00; font-weight: bold;");
                startDiscovery();
            }
        ]);
    };

    // Deep Search Function
    function deepSearch(obj, term, path = "root", depth = 0, maxDepth = 10) {
        if (depth > maxDepth || !obj || typeof obj !== 'object') return;
        if (FoundPaths.has(obj)) return; // Avoid circular refs

        try {
            FoundPaths.add(obj);

            for (let key in obj) {
                const currentPath = `${path}.${key}`;

                // Check key
                if (key.toLowerCase().includes(term.toLowerCase())) {
                    console.log(`%c[MATCH] Key: ${currentPath}`, "color: #ffaa00; font-weight: bold;");
                    console.log(obj[key]);
                }

                // Check value if string/number
                const val = obj[key];
                if ((typeof val === 'string' || typeof val === 'number') && String(val).toLowerCase().includes(term.toLowerCase())) {
                    console.log(`%c[MATCH] Value: ${currentPath} = ${val}`, "color: #00aaff;");
                }

                // Recurse
                if (typeof val === 'object' && val !== null) {
                    deepSearch(val, term, currentPath, depth + 1, maxDepth);
                }
            }
        } catch (e) {}
    }

    // discovery logic
    function startDiscovery() {
        console.log("%c[Variable Finder] Starting Discovery Scan...", "color: #ffff00;");

        const terms = ["breakBlock", "_blockItem", "breakingItem", "entities", "world", "position", "noa", "bloxd"];

        // Scan modules
        const modules = wpRequire.m;
        for (let id in modules) {
            try {
                const modStr = modules[id].toString();
                const matchedTerms = terms.filter(t => modStr.includes(t));

                if (matchedTerms.length > 0) {
                    const exports = wpRequire(id);
                    console.groupCollapsed(`%c[MODULE] ID: ${id} | Matches: ${matchedTerms.join(", ")}`, "color: #00ffaa;");
                    console.log("Source Snippet:", modStr.substring(0, 500) + "...");
                    console.log("Exports:", exports);

                    matchedTerms.forEach(term => {
                        deepSearch(exports, term, `Module(${id})`);
                    });
                    console.groupEnd();
                }
            } catch (e) {}
        }

        console.log("%c[Variable Finder] Discovery Scan Complete. Use window.searchGame(term) for manual search.", "color: #00ff00; font-weight: bold;");
    }

    // Expose to window for manual use
    window.searchGame = (term) => {
        FoundPaths.clear();
        console.log(`%c[Variable Finder] Searching for: ${term}`, "color: #ffff00;");

        // Search window
        deepSearch(window, term, "window", 0, 5);

        // Search Webpack modules if available
        if (wpRequire) {
            const modules = wpRequire.m;
            for (let id in modules) {
                try {
                    const exports = wpRequire(id);
                    deepSearch(exports, term, `Module(${id})`, 0, 5);
                } catch (e) {}
            }
        }
    };

    // Start intercepting
    setInterval(() => {
        if (!wpRequire) interceptWebpack();
    }, 2000);

})();

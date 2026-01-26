// ==UserScript==
// @name         Nuker
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Minimalist Bloxd.io Nuker with updated injection and extended reach
// @author       Jules
// @match        *://bloxd.io/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let Fuxny = {
        wpRequire: null,
        noa: null,
        impKey: null,
        findModule(code) {
            if (!this.wpRequire) return null;
            let modules = this.wpRequire.m;
            for (let id in modules) {
                try {
                    let src = modules[id].toString();
                    if (src.includes(code)) return this.wpRequire(id);

                    // Regex fallback for obfuscated strings
                    let regex = new RegExp(code.split('').join('\\s*'), 'i');
                    if (regex.test(src)) return this.wpRequire(id);
                } catch (e) {}
            }
            return null;
        }
    };

    let injectedBool = false;
    let nukerEnabled = false;
    let lastNuke = 0;
    const nukeDelay = 100;

    const r = {
        values(e) {
            var t = [];
            for (var s in e) if (Object.prototype.hasOwnProperty.call(e, s)) t.push(e[s]);
            return t;
        }
    };

    function showNotification(message) {
        const div = document.createElement('div');
        div.textContent = message;
        Object.assign(div.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '12px',
            background: 'rgba(15, 15, 15, 0.95)',
            color: '#fff',
            borderRadius: '6px',
            border: '2px solid #ff0000',
            zIndex: '999999',
            fontFamily: '"Segoe UI", sans-serif',
            boxShadow: '0 0 15px rgba(255, 0, 0, 0.3)',
            transition: 'opacity 0.5s ease'
        });
        document.body.appendChild(div);
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 500);
        }, 2000);
    }

    function breakBlockAt(pos) {
        try {
            if (!Fuxny.noa || !Fuxny.impKey) return;
            let entities = Fuxny.noa.entities;
            let playerEntity = entities[Fuxny.impKey];
            if (!playerEntity) return;

            // Path to held item components can vary, using the identified index 22
            let heldItemComponent = r.values(playerEntity)[22];
            let heldItem = heldItemComponent?.list?.[0];
            if (!heldItem || !heldItem._blockItem) return;

            let blockItem = heldItem._blockItem;
            let breakingItem = blockItem.breakingItem;
            if (!breakingItem || !breakingItem.breakBlock) return;

            // Spoofing the targeted block for the internal breakBlock call
            let worldInstanceKey = Object.keys(blockItem)[0];
            let worldInstance = Object.values(blockItem)[0];
            let targetedBlockKey = Object.keys(worldInstance)[25];
            let targetedBlock = worldInstance[targetedBlockKey];

            const spoofedTarget = new Proxy({}, {
                get(target, prop) {
                    if (prop === worldInstanceKey) {
                        return new Proxy(worldInstance, {
                            get(inner, key) {
                                if (key === targetedBlockKey) {
                                    let spoofed = Object.assign({}, targetedBlock);
                                    spoofed.position = pos;
                                    return spoofed;
                                }
                                return worldInstance[key];
                            },
                        });
                    }
                    if (prop === "checkTargetedBlockCanBePlacedOver") return () => true;
                    if (typeof blockItem[prop] === "function") return blockItem[prop].bind(blockItem);
                    return blockItem[prop];
                }
            });

            breakingItem.breakBlock.call(spoofedTarget, pos);
        } catch (err) {
            console.error("[Nuker] Error during block break:", err);
        }
    }

    function renderLoop() {
        if (nukerEnabled && Fuxny.noa && Fuxny.noa.inputs.state.fire) {
            let now = Date.now();
            if (now - lastNuke >= nukeDelay) {
                lastNuke = now;
                // Extended reach raycast (20 blocks)
                let result = Fuxny.noa.picking.raycast(20);
                if (result && result.position) {
                    breakBlockAt(result.position);
                }
            }
        }
        requestAnimationFrame(renderLoop);
    }

    function performInjection() {
        if (injectedBool) return;

        // --- Step 1: Find Webpack ---
        if (!Fuxny.wpRequire) {
            // Method A: Descriptor Search (Standard)
            let winDescriptors = Object.getOwnPropertyDescriptors(window);
            let wpName = Object.keys(winDescriptors).find(key => winDescriptors[key]?.set?.toString().includes("++"));
            let wpInstance = window[wpName];

            // Method B: Array Pattern Search (Fallback)
            if (!wpInstance) {
                wpName = Object.keys(window).find(k => k.length <= 3 && Array.isArray(window[k]) && window[k].push !== Array.prototype.push);
                wpInstance = window[wpName];
            }

            if (!wpInstance) {
                console.warn("[Nuker] Webpack instance not found.");
                return;
            }

            wpInstance.push([
                [Math.floor(Math.random() * 90000) + 10000], {},
                function(wpRequire) {
                    Fuxny.wpRequire = wpRequire;
                    console.log("[Nuker] Webpack require obtained.");
                }
            ]);
        }

        // --- Step 2: Find Noa Engine ---
        if (Fuxny.wpRequire && !Fuxny.noa) {
            // Try known module hints
            const hints = ["nonBlocksClient:", "entities:", "camera:", "world:"];
            for (let hint of hints) {
                let mod = Fuxny.findModule(hint);
                if (mod) {
                    let props = Object.values(mod).find(p => typeof p === 'object' && p?.entities && p?.world);
                    if (props) {
                        Fuxny.noa = props;
                        console.log("[Nuker] Found Noa via hint:", hint);
                        break;
                    }
                }
            }

            // Global Scan Fallback (If hints fail)
            if (!Fuxny.noa) {
                let modules = Fuxny.wpRequire.m;
                for (let id in modules) {
                    try {
                        let exports = Fuxny.wpRequire(id);
                        if (exports && typeof exports === 'object') {
                            let props = Object.values(exports).find(p => typeof p === 'object' && p?.entities && p?.world && p?.camera);
                            if (props) {
                                Fuxny.noa = props;
                                console.log("[Nuker] Found Noa via global scan, ID:", id);
                                break;
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        // --- Step 3: Identify Local Player ---
        if (Fuxny.noa && !Fuxny.impKey) {
            const entities = Fuxny.noa.entities;

            // Heuristic 1: Hardcoded 1 (Most common in NOA)
            if (entities[1]) {
                Fuxny.impKey = 1;
            } else {
                // Heuristic 2: Search for entity with most components or matching pattern
                const targetValue = r.values(entities)[2];
                Fuxny.impKey = Object.entries(entities).find(([_, val]) => val === targetValue)?.[0];
            }

            if (Fuxny.impKey) {
                injectedBool = true;
                showNotification("Injection Successful");
                console.log("[Nuker] Injected. Player Key:", Fuxny.impKey);
            }
        }
    }

    // UI Setup
    const ui = document.createElement('div');
    ui.id = 'nuker-ui';
    Object.assign(ui.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '180px',
        background: 'rgba(10, 10, 10, 0.95)',
        border: '2px solid #ff0000',
        borderRadius: '10px',
        padding: '15px',
        zIndex: '1000001',
        fontFamily: '"Segoe UI", Tahoma, sans-serif',
        color: '#fff',
        boxShadow: '0 0 25px rgba(255, 0, 0, 0.4)',
        userSelect: 'none'
    });

    ui.innerHTML = `
        <div style="text-align:center; font-weight:bold; font-size: 18px; margin-bottom:15px; border-bottom:2px solid #ff0000; padding-bottom:8px; color: #ff0000; text-shadow: 0 0 5px #ff0000;">NUKER</div>
        <button id="nuker-inject-btn" style="width:100%; padding:10px; margin-bottom:12px; cursor:pointer; background:#222; color:#fff; border:1px solid #ff0000; border-radius: 6px; font-weight: bold; transition: all 0.3s;">Click to Inject</button>
        <div id="nuker-status" style="font-size: 11px; text-align: center; margin-bottom: 12px; color: #aaa;">Status: Waiting for click...</div>
        <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,0,0,0.1); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,0,0,0.2);">
            <span style="font-size: 14px; font-weight: bold;">Nuker Toggle</span>
            <input type="checkbox" id="nuker-toggle" style="cursor: pointer; width: 20px; height: 20px; accent-color: #ff0000;">
        </div>
    `;

    document.body.appendChild(ui);

    const injectBtn = document.getElementById('nuker-inject-btn');
    const statusText = document.getElementById('nuker-status');

    injectBtn.onmouseover = () => { if(!injectedBool) injectBtn.style.background = '#333'; };
    injectBtn.onmouseout = () => { if(!injectedBool) injectBtn.style.background = '#222'; };

    const updateUIState = () => {
        if (injectedBool) {
            injectBtn.textContent = "Injected ✓";
            injectBtn.style.background = "#1a4d1a";
            injectBtn.style.borderColor = "#00ff00";
            injectBtn.style.cursor = "default";
            statusText.textContent = "Status: Connected to Game";
            statusText.style.color = "#00ff00";
        } else {
            if (Fuxny.wpRequire) {
                statusText.textContent = "Status: Finding Game Modules...";
            } else {
                statusText.textContent = "Status: Finding Webpack...";
            }
        }
    };

    injectBtn.onclick = () => {
        if (injectedBool) return;
        performInjection();
        updateUIState();
        if (!injectedBool) showNotification("Injection Pending... Please wait.");
    };

    document.getElementById('nuker-toggle').onchange = (e) => {
        if (!injectedBool) {
            showNotification("Inject first!");
            e.target.checked = false;
            return;
        }
        nukerEnabled = e.target.checked;
        showNotification("Nuker " + (nukerEnabled ? "Enabled" : "Disabled"));
    };

    // Auto-injection attempt and UI update
    setInterval(() => {
        performInjection();
        updateUIState();
    }, 2000);

    requestAnimationFrame(renderLoop);

})();

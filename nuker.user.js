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
                    if (modules[id] && modules[id].toString().includes(code)) {
                        return this.wpRequire(id);
                    }
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

        if (!Fuxny.wpRequire) {
            let winDescriptors = Object.getOwnPropertyDescriptors(window);
            let wpName = Object.keys(winDescriptors).find(key => winDescriptors[key]?.set?.toString().includes("++"));
            let wpInstance = window[wpName];

            if (!wpInstance) return;

            wpInstance.push([
                [Math.floor(Math.random() * 90000) + 10000], {},
                function(wpRequire) { Fuxny.wpRequire = wpRequire; }
            ]);
        }

        if (Fuxny.wpRequire && !Fuxny.noa) {
            let mod = Fuxny.findModule("nonBlocksClient:") || Fuxny.findModule("entities:");
            if (mod) {
                let props = Object.values(mod).find(p => typeof p === 'object' && p?.entities);
                if (props) {
                    Fuxny.noa = props;
                    const entities = Fuxny.noa.entities;
                    const targetValue = r.values(entities)[2];
                    Fuxny.impKey = Object.entries(entities).find(([_, val]) => val === targetValue)?.[0];

                    if (Fuxny.impKey) {
                        injectedBool = true;
                        showNotification("Injection Successful");
                    }
                }
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
        width: '160px',
        background: 'rgba(10, 10, 10, 0.9)',
        border: '2px solid #ff0000',
        borderRadius: '10px',
        padding: '12px',
        zIndex: '1000001',
        fontFamily: '"Segoe UI", Tahoma, sans-serif',
        color: '#fff',
        boxShadow: '0 0 20px rgba(255, 0, 0, 0.5)',
        userSelect: 'none'
    });

    ui.innerHTML = `
        <div style="text-align:center; font-weight:bold; font-size: 16px; margin-bottom:12px; border-bottom:1px solid #ff0000; padding-bottom:5px; color: #ff0000;">NUKER</div>
        <button id="nuker-inject-btn" style="width:100%; padding:8px; margin-bottom:10px; cursor:pointer; background:#222; color:#fff; border:1px solid #444; border-radius: 4px; font-weight: bold; transition: background 0.3s;">Inject</button>
        <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px;">
            <span style="font-size: 14px;">Enable Nuker</span>
            <input type="checkbox" id="nuker-toggle" style="cursor: pointer; width: 18px; height: 18px; accent-color: #ff0000;">
        </div>
    `;

    document.body.appendChild(ui);

    const injectBtn = document.getElementById('nuker-inject-btn');
    injectBtn.onmouseover = () => injectBtn.style.background = '#333';
    injectBtn.onmouseout = () => injectBtn.style.background = '#222';
    injectBtn.onclick = () => {
        performInjection();
        if (!injectedBool) showNotification("Injection Waiting...");
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

    // Auto-injection attempt
    setInterval(performInjection, 3000);

    requestAnimationFrame(renderLoop);

})();

window.InventoryUI = (function () {
    const GEN2_RECIPES = [
        { id: "paper",  name: "Paper",       icon: "📜", ingredients: ["wood", "water"] },
        { id: "clay",   name: "Clay",        icon: "🏺", ingredients: ["stone", "water"] },
        { id: "sparks", name: "Sparks",      icon: "⚡", ingredients: ["stone", "metal"] },
        { id: "timber", name: "Hull Timber", icon: "⛵", ingredients: ["wood", "metal"] },
        { id: "cobble", name: "Cobble",      icon: "🧱", ingredients: ["wood", "stone"] },
        { id: "steam",  name: "Steam",       icon: "💨", ingredients: ["water", "metal"] }
    ];

    let forgeSlots = [null, null];
    let forgeMessage = "Tap two 1st Gen resources below to experiment.";
    let forgeStatusType = "neutral"; // "neutral" | "success" | "fail"

    function addToForge(resourceKey) {
        const CM = window.CollectibleManager;
        if (!CM) return;

        const available = CM.getInventory()[resourceKey] || 0;
        const alreadyInForge = forgeSlots.filter(s => s === resourceKey).length;

        if (available <= alreadyInForge) {
            forgeMessage = `Not enough ${CM.styles[resourceKey].label} left to add!`;
            forgeStatusType = "fail";
            render();
            return;
        }

        if (forgeSlots[0] === null) {
            forgeSlots[0] = resourceKey;
        } else if (forgeSlots[1] === null) {
            forgeSlots[1] = resourceKey;
        } else {
            forgeSlots = [forgeSlots[1], resourceKey];
        }

        forgeMessage = "Ready to combine!";
        forgeStatusType = "neutral";
        render();
    }

    function clearSlot(index) {
        forgeSlots[index] = null;
        forgeMessage = "Tap two 1st Gen resources below to experiment.";
        forgeStatusType = "neutral";
        render();
    }

    async function attemptCombine() {
        const CM = window.CollectibleManager;
        if (!CM || !forgeSlots[0] || !forgeSlots[1]) return;

        const combineBtn = document.getElementById('btn-forge-combine');
        if (combineBtn) combineBtn.disabled = true;

        const costMap = {};
        forgeSlots.forEach(key => {
            costMap[key] = (costMap[key] || 0) + 1;
        });

        const sortedAttempt = [...forgeSlots].sort();
        const match = GEN2_RECIPES.find(recipe => {
            const sortedRecipe = [...recipe.ingredients].sort();
            return sortedRecipe[0] === sortedAttempt[0] && sortedRecipe[1] === sortedAttempt[1];
        });

        if (match) {
            const inv = CM.getInventory();
            const hasEnough = Object.entries(costMap).every(([k, qty]) => (inv[k] || 0) >= qty);
            if (!hasEnough) {
                forgeMessage = "Insufficient resources!";
                forgeStatusType = "fail";
                forgeSlots = [null, null];
                render();
                return;
            }

            if (window.GameAPI && navigator.onLine) {
                try {
                    await window.GameAPI.craftForgeItem(match.id);
                } catch (err) {
                    forgeMessage = err.message || "Forge sync failed.";
                    forgeStatusType = "fail";
                    render();
                    return;
                }
            }

            CM.consumeResources(costMap);
            const isNewDiscovery = !CM.getDiscovered().includes(match.id);
            CM.addCraftedItem(match.id);

            if (window.UserAccountService) {
                window.UserAccountService.triggerHaptic(45);
            }

            forgeMessage = isNewDiscovery
                ? `✨ New Discovery! You created ${match.icon} ${match.name}!`
                : `Created +1 ${match.icon} ${match.name}!`;
            forgeStatusType = "success";
        } else {
            forgeMessage = "Nothing happened... try a different combination!";
            forgeStatusType = "fail";
        }

        forgeSlots = [null, null];
        render();
    }

    function render() {
        const CM = window.CollectibleManager;
        const container = document.getElementById('inventory-content');
        if (!container || !CM) return;

        const inv = CM.getInventory();
        const crafted = CM.getCrafted();
        const discovered = CM.getDiscovered();
        const gen1Keys = Object.keys(CM.styles);

        const slot0Style = forgeSlots[0] ? CM.styles[forgeSlots[0]] : null;
        const slot1Style = forgeSlots[1] ? CM.styles[forgeSlots[1]] : null;
        const canCombine = Boolean(forgeSlots[0] && forgeSlots[1]);

        container.innerHTML = `
            <div class="forge-sticky-wrapper">
                <div class="forge-card">
                    <div class="forge-header">
                        <span class="forge-title">🔥 Discovery Forge</span>
                        <span class="forge-hint">2nd Gen Experimentation</span>
                    </div>

                    <div class="forge-slots-row">
                        <button type="button" class="forge-slot ${slot0Style ? 'filled' : ''}" data-slot="0" title="Tap to clear">
                            ${slot0Style
                                ? `<span class="slot-icon">${slot0Style.icon}</span><span class="slot-name">${slot0Style.label}</span>`
                                : `<span class="slot-empty">+ Slot 1</span>`}
                        </button>

                        <span class="forge-plus">+</span>

                        <button type="button" class="forge-slot ${slot1Style ? 'filled' : ''}" data-slot="1" title="Tap to clear">
                            ${slot1Style
                                ? `<span class="slot-icon">${slot1Style.icon}</span><span class="slot-name">${slot1Style.label}</span>`
                                : `<span class="slot-empty">+ Slot 2</span>`}
                        </button>

                        <span class="forge-plus">=</span>

                        <div class="forge-result-preview">❓</div>
                    </div>

                    <div class="forge-feedback ${forgeStatusType}">${forgeMessage}</div>

                    <button type="button" class="forge-combine-btn" id="btn-forge-combine" ${!canCombine ? 'disabled' : ''}>
                        Combine Resources
                    </button>
                </div>
            </div>

            <h3 class="inv-section-title">1st Generation Collectibles</h3>
            <div class="inv-grid">
                ${gen1Keys.map(key => {
                    const style = CM.styles[key];
                    const count = inv[key] || 0;
                    return `
                        <button type="button" class="inv-box gen1-box ${count === 0 ? 'empty-stock' : ''}" data-gen1="${key}">
                            <span class="gen-tag gen-1">1st</span>
                            <div class="inv-icon">${style.icon}</div>
                            <div class="inv-name">${style.label}</div>
                            <div class="inv-qty">x${count}</div>
                        </button>
                    `;
                }).join('')}
            </div>

            <h3 class="inv-section-title">2nd Generation Collectibles (${discovered.length}/${GEN2_RECIPES.length} Discovered)</h3>
            <div class="inv-grid">
                ${GEN2_RECIPES.map(recipe => {
                    const isUnlocked = discovered.includes(recipe.id);
                    const count = crafted[recipe.id] || 0;
                    const ingIcons = isUnlocked
                        ? recipe.ingredients.map(k => CM.styles[k]?.icon || '').join('+')
                        : '';

                    return `
                        <div class="inv-box ${isUnlocked ? 'discovered-box' : 'unknown-box'}">
                            <span class="gen-tag gen-2">2nd</span>
                            ${isUnlocked ? `<span class="recipe-icons-corner" title="Recipe: ${recipe.ingredients.join(' + ')}">${ingIcons}</span>` : ''}
                            <div class="inv-icon">${isUnlocked ? recipe.icon : '❓'}</div>
                            <div class="inv-name">${isUnlocked ? recipe.name : 'Unknown'}</div>
                            <div class="inv-qty">${isUnlocked ? `x${count}` : '---'}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        document.querySelectorAll('.forge-slot').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.slot);
                if (forgeSlots[idx]) clearSlot(idx);
            });
        });

        const combineBtn = document.getElementById('btn-forge-combine');
        if (combineBtn && !combineBtn.disabled) {
            combineBtn.addEventListener('click', attemptCombine);
        }

        document.querySelectorAll('.gen1-box').forEach(btn => {
            btn.addEventListener('click', () => addToForge(btn.dataset.gen1));
        });
    }

    return { render };
})();

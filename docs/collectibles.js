window.CollectibleManager = (function() {
    const STORAGE_KEY = "bristol_game_save_v1";

    const RESOURCE_STYLES = {
        stone: { label: "Stone", icon: "🪨", color: "#94a3b8" },
        wood:  { label: "Wood",  icon: "🪵", color: "#d97706" },
        water: { label: "Water", icon: "💧", color: "#38bdf8" },
        metal: { label: "Metal", icon: "⚙️", color: "#e2e8f0" }
    };

    const GLOBAL_COLLECTIBLES = [
        { id: "global-1", name: "Castle Park Fountain", lat: 51.4548, lng: -2.5872, type: "water", tier: "global" },
        { id: "global-2", name: "SS Great Britain Hull", lat: 51.4484, lng: -2.6083, type: "metal", tier: "global" },
        { id: "global-3", name: "Clifton Suspension Bridge Pier", lat: 51.4549, lng: -2.6279, type: "stone", tier: "global" },
        { id: "global-4", name: "Gloucester Road Timber", lat: 51.4772, lng: -2.5891, type: "wood", tier: "global" },
        { id: "global-bs5-1", name: "St George Park Lake", lat: 51.4589, lng: -2.5486, type: "water", tier: "global" },
        { id: "global-bs5-2", name: "Trooper's Hill Chimney", lat: 51.4517, lng: -2.5364, type: "stone", tier: "global" },
        { id: "global-bs5-3", name: "Church Road Redfest Oak", lat: 51.4581, lng: -2.5562, type: "wood", tier: "global" },
        { id: "global-bs5-4", name: "Netham Park Railings", lat: 51.4512, lng: -2.5588, type: "metal", tier: "global" }
    ];

    // Ready for future crafting/merging expansion
    const RECIPES = {
        masonry_block: { label: "Masonry Block", cost: { stone: 2, water: 1 } },
        reinforced_beam: { label: "Reinforced Beam", cost: { wood: 2, metal: 1 } }
    };

    let saveData = loadSave();

    function loadSave() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.warn("Save load failed, resetting.", e);
        }
        return {
            inventory: { stone: 0, wood: 0, water: 0, metal: 0 },
            crafted: {},
            claimedGlobalIds: [],
            personalCycleId: null,
            personalNodes: []
        };
    }

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
    }

    function getCurrent4PMCycleId() {
        const now = new Date();
        const cycleDate = new Date(now);
        if (now.getHours() < 16) cycleDate.setDate(cycleDate.getDate() - 1);
        return `${cycleDate.getFullYear()}-${cycleDate.getMonth() + 1}-${cycleDate.getDate()}-1600`;
    }

    function generatePersonalSpawns(cycleId) {
        const spawns = [];
        const keys = Object.keys(RESOURCE_STYLES);
        let index = 0;

        for (let lat = 51.4250; lat <= 51.4950; lat += 0.0045) {
            for (let lng = -2.6350; lng <= -2.5250; lng += 0.0072) {
                const type = keys[Math.floor(Math.random() * keys.length)];
                spawns.push({
                    id: `personal-${cycleId}-${index++}`,
                    name: `Wild ${RESOURCE_STYLES[type].label} Deposit`,
                    lat: Number((lat + (Math.random() - 0.5) * 0.0020).toFixed(5)),
                    lng: Number((lng + (Math.random() - 0.5) * 0.0030).toFixed(5)),
                    type: type,
                    tier: "personal",
                    claimed: false
                });
            }
        }
        return spawns;
    }

    function ensureDailySpawns() {
        const activeCycle = getCurrent4PMCycleId();
        if (saveData.personalCycleId !== activeCycle) {
            saveData.personalCycleId = activeCycle;
            saveData.personalNodes = generatePersonalSpawns(activeCycle);
            persist();
        }
        return activeCycle;
    }

    function getActiveNodes() {
        ensureDailySpawns();
        return [
            ...GLOBAL_COLLECTIBLES.filter(n => !saveData.claimedGlobalIds.includes(n.id)),
            ...saveData.personalNodes.filter(n => !n.claimed)
        ];
    }

    function claimNode(node) {
        saveData.inventory[node.type] = (saveData.inventory[node.type] || 0) + 1;
        if (node.tier === "global") {
            saveData.claimedGlobalIds.push(node.id);
        } else {
            const target = saveData.personalNodes.find(n => n.id === node.id);
            if (target) target.claimed = true;
        }
        persist();
        return RESOURCE_STYLES[node.type];
    }

    return {
        styles: RESOURCE_STYLES,
        recipes: RECIPES,
        getInventory: () => saveData.inventory,
        ensureDailySpawns,
        getActiveNodes,
        claimNode
    };
})();

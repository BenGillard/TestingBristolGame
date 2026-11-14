window.CollectibleManager = (function() {
    const STORAGE_KEY = "bristol_game_save_v1";

    const RESOURCE_STYLES = {
        stone: { label: "Stone", icon: "🪨", color: "#94a3b8" },
        wood:  { label: "Wood",  icon: "🪵", color: "#d97706" },
        water: { label: "Water", icon: "💧", color: "#38bdf8" },
        metal: { label: "Metal", icon: "⚙️", color: "#e2e8f0" }
    };

// Keep your handcrafted collectibles as the base list
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

// Fetch and append the GeoJSON data
    async function loadOsmCollectibles(geoJsonUrl) {
        try {
            const response = await fetch(geoJsonUrl);
            const geojson = await response.json();

            const osmCollectibles = geojson.features
                .filter(feature => {
                    const props = feature.properties || {};
                    if (!props.name || props.access === "private" || feature.geometry?.type !== "Point") {
                        return false;
                    }
                    // Keep ~30% of green spaces so Wood stays balanced with Stone/Water/Metal
                    const idHash = String(feature.id || props.name)
                        .split('')
                        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
                    return (idHash % 10) < 3;
                })
                .map(feature => {
                    const props = feature.properties;
                    const [lng, lat] = feature.geometry.coordinates;
                    return {
                        id: `osm-${String(feature.id).replace("/", "-")}`,
                        name: props.name,
                        lat: lat,
                        lng: lng,
                        type: "wood",
                        tier: "global"
                    };
                });

            GLOBAL_COLLECTIBLES.push(...osmCollectibles);
            window.dispatchEvent(new Event('osmCollectiblesLoaded'));
        } catch (error) {
            console.error("Failed to load GeoJSON collectibles:", error);
        }
    }

loadOsmCollectibles("assets/bs_greenery.geojson");


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
            discovered: [],
            claimedGlobalIds: [],
            personalCycleId: null,
            personalNodes: []
        };
    }

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
    }

    function getCurrentMidnightCycleId() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-0000`;
    }

    function generatePersonalSpawns(cycleId) {
        const spawns = [];
        const keys = Object.keys(RESOURCE_STYLES);
        let index = 0;

        const latStep = 0.0027;
        const lngStep = 0.0042;

        for (let lat = 51.3000; lat <= 51.6400; lat += latStep) {
            for (let lng = -3.0000; lng <= -2.4100; lng += lngStep) {
                const type = keys[Math.floor(Math.random() * keys.length)];
                spawns.push({
                    id: `personal-${cycleId}-${index++}`,
                    name: `Mystery Resource Deposit`,
                    lat: Number((lat + (Math.random() - 0.5) * (latStep * 0.5)).toFixed(5)),
                    lng: Number((lng + (Math.random() - 0.5) * (lngStep * 0.5)).toFixed(5)),
                    type: type,
                    tier: "personal",
                    claimed: false
                });
            }
        }
        return spawns;
    }

    function ensureDailySpawns() {
        const activeCycle = getCurrentMidnightCycleId();
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

    function grantResource(type, amount = 1) {
        if (!RESOURCE_STYLES[type]) return null;
        saveData.inventory[type] = (saveData.inventory[type] || 0) + amount;
        persist();
        return RESOURCE_STYLES[type];
    }

    function consumeResources(costMap) {
        for (const [type, qty] of Object.entries(costMap)) {
            if ((saveData.inventory[type] || 0) < qty) return false;
        }
        for (const [type, qty] of Object.entries(costMap)) {
            saveData.inventory[type] -= qty;
        }
        persist();
        return true;
    }

    function addCraftedItem(itemId) {
        if (!saveData.crafted) saveData.crafted = {};
        if (!saveData.discovered) saveData.discovered = [];
        saveData.crafted[itemId] = (saveData.crafted[itemId] || 0) + 1;
        if (!saveData.discovered.includes(itemId)) {
            saveData.discovered.push(itemId);
        }
        persist();
    }

    return {
        styles: RESOURCE_STYLES,
        recipes: RECIPES,
        getInventory: () => saveData.inventory,
        getCrafted: () => saveData.crafted || {},
        getDiscovered: () => saveData.discovered || [],
        ensureDailySpawns,
        getActiveNodes,
        claimNode,
        grantResource,
        consumeResources,
        addCraftedItem
    };
})();

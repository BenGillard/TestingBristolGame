window.CollectibleManager = (function() {
    const STORAGE_KEY = "bristol_game_save_v1";

    const RESOURCE_STYLES = {
        stone: { label: "Stone", icon: "🪨", color: "#94a3b8" },
        wood:  { label: "Wood",  icon: "🪵", color: "#d97706" },
        water: { label: "Water", icon: "💧", color: "#38bdf8" },
        metal: { label: "Metal", icon: "⚙️", color: "#e2e8f0" }
    };

    const GLOBAL_COLLECTIBLES = [];
    let SCHEDULED_COLLECTIBLES = [];

    async function loadLandmarkCollectibles(geoJsonUrl) {
        try {
            const response = await fetch(geoJsonUrl);
            if (!response.ok) return;
            const geojson = await response.json();

            const landmarkNodes = (geojson.features || [])
                .filter(f => f.geometry?.type === "Point" && f.properties?.name)
                .map((feature, idx) => {
                    const props = feature.properties;
                    const [lng, lat] = feature.geometry.coordinates;
                    return {
                        id: props.id || `landmark-${idx + 1}`,
                        name: props.name,
                        lat: lat,
                        lng: lng,
                        type: RESOURCE_STYLES[props.resourceType] ? props.resourceType : "stone",
                        tier: "global",
                        isLandmark: true,
                        funFact: props.funFact || "",
                        attribution: props.attribution || "OpenStreetMap"
                    };
                });

            GLOBAL_COLLECTIBLES.push(...landmarkNodes);
            window.dispatchEvent(new Event('osmCollectiblesLoaded'));
        } catch (error) {
            console.error("Failed to load landmark GeoJSON:", error);
        }
    }

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
                        tier: "global",
                        isGreenery: true
                    };
                });

            GLOBAL_COLLECTIBLES.push(...osmCollectibles);
            window.dispatchEvent(new Event('osmCollectiblesLoaded'));
        } catch (error) {
            console.error("Failed to load GeoJSON collectibles:", error);
        }
    }

    async function loadScheduledCollectibles(jsonUrl) {
        try {
            const response = await fetch(jsonUrl);
            if (!response.ok) return;
            const data = await response.json();
            SCHEDULED_COLLECTIBLES = Array.isArray(data.events) ? data.events : [];
            window.dispatchEvent(new Event('osmCollectiblesLoaded'));
        } catch (error) {
            console.error("Failed to load scheduled collectibles:", error);
        }
    }

    function isScheduledEventActive(event, now = new Date()) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = String(event.startTime || "08:00").split(":").map(Number);
        const [endH, endM] = String(event.endTime || "10:00").split(":").map(Number);

        if (currentMinutes < (startH * 60 + (startM || 0)) || currentMinutes >= (endH * 60 + (endM || 0))) {
            return false;
        }
        if (event.schedule === "weekly") return now.getDay() === Number(event.dayOfWeek);
        if (event.schedule === "monthly") return now.getDate() === Number(event.dayOfMonth);
        return false;
    }

    function getActiveScheduledNodes() {
        const now = new Date();
        const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (!saveData.claimedScheduledKeys) saveData.claimedScheduledKeys = [];

        return SCHEDULED_COLLECTIBLES
            .filter(ev => isScheduledEventActive(ev, now))
            .map(ev => ({
                id: `${ev.id}-${datePart}`,
                name: ev.name,
                lat: ev.lat,
                lng: ev.lng,
                type: RESOURCE_STYLES[ev.resourceType] ? ev.resourceType : "metal",
                tier: "global",
                isScheduled: true,
                scheduleLabel: ev.scheduleLabel || `Active ${ev.startTime}–${ev.endTime}`
            }))
            .filter(node => !saveData.claimedScheduledKeys.includes(node.id));
    }

    loadLandmarkCollectibles("assets/bs_landmarks.geojson");
    loadOsmCollectibles("assets/bs_greenery.geojson");
    loadScheduledCollectibles("assets/scheduled_collectibles.json");


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
            ...getActiveScheduledNodes(),
            ...saveData.personalNodes.filter(n => !n.claimed)
        ];
    }

    function claimNode(node) {
        saveData.inventory[node.type] = (saveData.inventory[node.type] || 0) + 1;
        if (node.isScheduled) {
            if (!saveData.claimedScheduledKeys) saveData.claimedScheduledKeys = [];
            saveData.claimedScheduledKeys.push(node.id);
        } else if (node.tier === "global") {
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

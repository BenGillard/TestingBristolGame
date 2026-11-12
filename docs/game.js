const statusDisplay = document.getElementById('gps-status');
const coordDisplay = document.getElementById('gps-coords');
const refreshDisplay = document.getElementById('refresh-status');
const startBtn = document.getElementById('start-btn');
const claimBtn = document.getElementById('claim-btn');

window.onerror = function(msg, url, line) {
    statusDisplay.style.color = "#e63946";
    statusDisplay.textContent = "JS Error: " + msg + " (Line " + line + ")";
};

window.addEventListener('load', () => {
    if (typeof L === 'undefined' || !window.CollectibleManager) {
        statusDisplay.style.color = "#e63946";
        statusDisplay.textContent = "Missing Leaflet or CollectibleManager script.";
        return;
    }

    const CM = window.CollectibleManager;

    function updateInventoryUI() {
        const inv = CM.getInventory();
        document.getElementById('count-stone').textContent = inv.stone;
        document.getElementById('count-wood').textContent = inv.wood;
        document.getElementById('count-water').textContent = inv.water;
        document.getElementById('count-metal').textContent = inv.metal;
    }
    updateInventoryUI();

    const BRISTOL_BOUNDS = L.latLngBounds([51.4000, -2.6800], [51.5200, -2.5000]);
    const map = L.map('map', {
        center: [51.4565, -2.5510],
        zoom: 15,
        minZoom: 12,
        maxZoom: 19,
        maxBounds: BRISTOL_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const collectiblesLayer = L.layerGroup().addTo(map);

    function renderAllNodes() {
        collectiblesLayer.clearLayers();
        const cycleId = CM.ensureDailySpawns();
        refreshDisplay.textContent = `Cycle: ${cycleId} (Resets 4:00 PM)`;

        CM.getActiveNodes().forEach(node => {
            const style = CM.styles[node.type];
            const isGlobal = node.tier === "global";

            L.circle([node.lat, node.lng], {
                radius: isGlobal ? 25 : 20,
                color: style.color,
                fillColor: style.color,
                fillOpacity: isGlobal ? 0.55 : 0.3,
                dashArray: isGlobal ? null : '4, 4',
                weight: isGlobal ? 3 : 2
            })
            .bindPopup(`<b>${style.icon} ${node.name}</b><br>${style.label} (${isGlobal ? 'Global' : 'Daily Personal'})`)
            .addTo(collectiblesLayer);
        });
    }
    renderAllNodes();

        let nearbyNode = null;
    let playerMarker = null;
    let accuracyCircle = null;
    let claimRangeCircle = null;

    claimBtn.addEventListener('click', () => {
        if (!nearbyNode) return;
        const style = CM.claimNode(nearbyNode);
        statusDisplay.textContent = `Claimed +1 ${style.icon} ${style.label}!`;
        statusDisplay.style.color = "#4ad66d";
        nearbyNode = null;
        claimBtn.style.display = "none";
        updateInventoryUI();
        renderAllNodes();
    });

    function checkProximity(currentPos) {
        let closest = null;
        let closestDist = Infinity;

        CM.getActiveNodes().forEach(node => {
            const dist = currentPos.distanceTo([node.lat, node.lng]);
            if (dist <= 25 && dist < closestDist) {
                closest = node;
                closestDist = dist;
            }
        });

        if (closest) {
            nearbyNode = closest;
            const style = CM.styles[closest.type];
            statusDisplay.textContent = `In Range: ${closest.name} (${Math.round(closestDist)}m)`;
            statusDisplay.style.color = "#ffb703";
            claimBtn.textContent = `Claim ${style.icon} ${style.label}`;
            claimBtn.style.display = "block";
        } else {
            nearbyNode = null;
            claimBtn.style.display = "none";
            statusDisplay.textContent = "GPS Connected — Exploring Bristol";
            statusDisplay.style.color = "#4ad66d";
        }
    }

    function startGPS() {
        if (!('geolocation' in navigator)) return;
        statusDisplay.textContent = "Requesting Android GPS...";
        statusDisplay.style.color = "#ffb703";

        navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                const currentPos = L.latLng(latitude, longitude);
                coordDisplay.textContent = `Lat: ${latitude.toFixed(5)} | Lon: ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`;
                startBtn.style.display = "none";

                if (!playerMarker) {
                    accuracyCircle = L.circle(currentPos, {
                        radius: accuracy,
                        color: '#64748b',
                        fillColor: '#64748b',
                        fillOpacity: 0.08,
                        weight: 1,
                        dashArray: '3, 3'
                    }).addTo(map);

                    claimRangeCircle = L.circle(currentPos, {
                        radius: 25,
                        color: '#ffb703',
                        fillColor: '#ffb703',
                        fillOpacity: 0.15,
                        weight: 2,
                        className: 'claim-range-pulse'
                    }).addTo(map);

                    playerMarker = L.circleMarker(currentPos, {
                        radius: 8,
                        color: '#fff',
                        fillColor: '#00b4d8',
                        fillOpacity: 1,
                        weight: 3
                    }).addTo(map);

                    map.setView(currentPos, 17);
                } else {
                    accuracyCircle.setLatLng(currentPos).setRadius(accuracy);
                    claimRangeCircle.setLatLng(currentPos);
                    playerMarker.setLatLng(currentPos);
                }

                checkProximity(currentPos);
            },
            (err) => {
                statusDisplay.style.color = "#e63946";
                statusDisplay.textContent = `GPS Error (${err.code}): ${err.message}`;
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
    }

    startBtn.addEventListener('click', startGPS);
    startGPS();
});


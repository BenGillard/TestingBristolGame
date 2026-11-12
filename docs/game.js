const statusDisplay = document.getElementById('gps-status');
const coordDisplay = document.getElementById('gps-coords');
const refreshDisplay = document.getElementById('refresh-status');
const startBtn = document.getElementById('start-btn');
const claimBtn = document.getElementById('claim-btn');
const recentreBtn = document.getElementById('recentre-btn');

// Circle Radii (in metres — diameter is double the radius)
const PLAYER_PULSE_RADIUS = 25;    // 50m diameter pulsing ring around player
const GLOBAL_NODE_RADIUS = 40;     // 80m diameter for Global landmarks (increase as desired)
const PERSONAL_NODE_RADIUS = 30;   // 60m diameter for Personal spawns (increase as desired)

// Safety & Anti-Cheat Constants (15 mph = 6.7056 m/s)
const MAX_WALKING_SPEED_MPS = 6.71; 
const TELEPORT_SPEED_MPS = 45.0; // ~100 mph (flags obvious spoofing)

let lastValidFix = null; // { latlng: L.LatLng, timestamp: number }
let isPassengerConfirmed = false;
let safetyOverlay = null;

window.onerror = function(msg, url, line) {
    statusDisplay.style.color = "#e63946";
    statusDisplay.textContent = "JS Error: " + msg + " (Line " + line + ")";
};

// Build the un-dismissible 15mph safety overlay dynamically
function initSafetyOverlay() {
    safetyOverlay = document.createElement('div');
    safetyOverlay.id = 'safety-overlay';
    safetyOverlay.style.cssText = `
        display: none; position: fixed; inset: 0; z-index: 9999;
        background: rgba(13, 27, 42, 0.92); backdrop-filter: blur(8px);
        color: #e0e1dd; flex-direction: column; align-items: center;
        justify-content: center; text-align: center; padding: 24px;
    `;
    safetyOverlay.innerHTML = `
        <div style="font-size: 42px; margin-bottom: 12px;">🚌</div>
        <h2 style="color: #ffb703; margin-bottom: 10px;">Moving Fast!</h2>
        <p style="max-width: 320px; line-height: 1.5; margin-bottom: 20px;">
            You're travelling over 15 mph. Are you on the bus? Confirm you are a passenger to keep exploring safely.
        </p>
        <button id="confirm-passenger-btn" style="
            padding: 12px 24px; background: #00b4d8; color: #0d1b2a;
            border: none; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;
        ">I am a Passenger</button>
    `;
    document.body.appendChild(safetyOverlay);

    document.getElementById('confirm-passenger-btn').addEventListener('click', () => {
        isPassengerConfirmed = true;
        safetyOverlay.style.display = 'none';
    });
}

// Collectible reveal overlay for claiming mystery resources
let revealOverlay = null;
let revealTimeout = null;

function initRevealOverlay() {
    revealOverlay = document.createElement('div');
    revealOverlay.id = 'claim-reveal-overlay';
    revealOverlay.innerHTML = `
        <div class="reveal-card">
            <div class="reveal-title">You found</div>
            <div class="reveal-icon" id="reveal-icon">❓</div>
            <div class="reveal-label" id="reveal-label">Resource</div>
        </div>
    `;
    document.body.appendChild(revealOverlay);
}

let currentHeading = null;

function createPlayerDivIcon() {
    return L.divIcon({
        className: '', // Prevent default Leaflet white square background
        iconSize: [48,48],
        iconAnchor:[24,24], // Centres the dot directly on the GPS coordinate
        html: `
            <div class="player-avatar-wrapper">
                <div class="player-heading-cone" id="player-cone"></div>
                <div class="player-core-dot"></div>
            </div>
        `
    });
}



function updatePlayerHeading(degrees) {
    if (degrees === null || degrees === undefined || Number.isNaN(degrees)) return;
    currentHeading = degrees;
    const cone = document.getElementById('player-cone');
    if (cone) {
        cone.classList.add('active');
        cone.style.transform = `rotate(${Math.round(degrees)}deg)`;
    }
}

let compassAttached = false;

function attachCompassEvents() {
    if (compassAttached) return;
    compassAttached = true;

    const handleOrientation = (event) => {
        let heading = null;

        // iOS Safari provides webkitCompassHeading (0 = North, clockwise)
        if (typeof event.webkitCompassHeading === 'number') {
            heading = event.webkitCompassHeading;
        } 
        // Android Chrome provides alpha relative to North on deviceorientationabsolute
        else if (event.absolute === true && typeof event.alpha === 'number') {
            heading = (360 - event.alpha) % 360;
        }

        if (heading !== null) {
            updatePlayerHeading(heading);
        }
    };

    if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    } else if ('ondeviceorientation' in window) {
        window.addEventListener('deviceorientation', handleOrientation, true);
    }
}

// Safely requests iOS 13+ Motion & Orientation permission on user tap, or attaches immediately on Android
function requestCompassAccess() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then((permissionState) => {
                if (permissionState === 'granted') {
                    attachCompassEvents();
                }
            })
            .catch((err) => console.warn('Compass permission skipped:', err));
    } else {
        attachCompassEvents();
    }
}



function showClaimReveal(style) {
    if (!revealOverlay) return;
    document.getElementById('reveal-icon').textContent = style.icon;
    document.getElementById('reveal-label').textContent = style.label;

    revealOverlay.classList.add('visible');

    if (revealTimeout) clearTimeout(revealTimeout);
    revealTimeout = setTimeout(() => {
        revealOverlay.classList.remove('visible');
    }, 2000);
}


window.addEventListener('load', () => {
    if (typeof L === 'undefined' || !window.CollectibleManager) {
        statusDisplay.style.color = "#e63946";
        statusDisplay.textContent = "Missing Leaflet or CollectibleManager script.";
        return;
    }

    initSafetyOverlay();
    requestCompassAccess();
    initRevealOverlay();
    const CM = window.CollectibleManager;

    function updateInventoryUI() {
        const inv = CM.getInventory();
        const elStone = document.getElementById('count-stone');
        const elWood = document.getElementById('count-wood');
        const elWater = document.getElementById('count-water');
        const elMetal = document.getElementById('count-metal');

        if (elStone) elStone.textContent = inv.stone;
        if (elWood) elWood.textContent = inv.wood;
        if (elWater) elWater.textContent = inv.water;
        if (elMetal) elMetal.textContent = inv.metal;
    }

    updateInventoryUI();

        // Full BS Postcode Area Bounds (Clevedon/Weston-super-Mare to Yate/Thornbury & Mendips)
    const BRISTOL_BOUNDS = L.latLngBounds([51.2700, -3.0600], [51.6750, -2.3700]);
    const map = L.map('map', {
        center: [51.4565, -2.5510],
        zoom: 14,
        minZoom: 10,
        maxZoom: 19,
        maxBounds: BRISTOL_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: false
    });

    if (window.TabRouter) window.TabRouter.registerMap(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Create a dedicated non-interactive pane for postcode borders below collectibles
    map.createPane('postcodePane');
    map.getPane('postcodePane').style.zIndex = 350;
    map.getPane('postcodePane').style.pointerEvents = 'none';

    // Load BS Postcode District Boundaries (BS1 - BS49)
    fetch('assets/bs_postcodes.geojson')
        .then(res => {
            if (!res.ok) throw new Error('Postcode GeoJSON not found');
            return res.json();
        })
        .then(geojsonData => {
            L.geoJSON(geojsonData, {
                pane: 'postcodePane',
                interactive: false,
                style: {
                    color: '#ffffff',
                    weight: 1.2,
                    opacity: 0.22,
                    fillOpacity: 0
                }
            }).addTo(map);
        })
        .catch(err => console.warn('Postcode overlay skipped:', err));


    const collectiblesLayer = L.layerGroup().addTo(map);

    function renderAllNodes() {
        collectiblesLayer.clearLayers();
        const cycleId = CM.ensureDailySpawns();
        refreshDisplay.textContent = `Cycle: ${cycleId} (Resets 4:00 PM)`;

        // Expand visible screen bounds slightly (20%) so nodes don't pop in abruptly while panning
        const visibleBounds = map.getBounds().pad(0.2);

        CM.getActiveNodes().forEach(node => {
            // Skip drawing nodes outside the current screen view for fast mobile performance
            if (!visibleBounds.contains([node.lat, node.lng])) return;

            const isGlobal = node.tier === "global";

            // Mystery appearance: neutral cyan/gold ring until claimed
            L.circle([node.lat, node.lng], {
                radius: isGlobal ? GLOBAL_NODE_RADIUS : PERSONAL_NODE_RADIUS,
                color: isGlobal ? '#ffb703' : '#00b4d8',
                fillColor: isGlobal ? '#ffb703' : '#00b4d8',
                fillOpacity: isGlobal ? 0.50 : 0.30,
                dashArray: isGlobal ? null : '4, 4',
                weight: isGlobal ? 3 : 2
            })
            .bindPopup(`<b>❓ Mystery Cache</b><br>${isGlobal ? 'Global Landmark' : 'Daily Personal Spawn'}<br><i>Walk within 25m to claim!</i>`)
            .addTo(collectiblesLayer);
        });
    }

    // Re-render visible nodes whenever the player finishes panning or zooming the map
    map.on('moveend', renderAllNodes);
    renderAllNodes();


    let nearbyNode = null;
    let playerMarker = null;
    let accuracyCircle = null;
    let claimRangeCircle = null;
    let latestPos = null;

    if (recentreBtn) {
        recentreBtn.addEventListener('click', () => {
            requestCompassAccess();
            if (latestPos) {
                map.setView(latestPos, 17, { animate: true });
            }
        });
    }


    claimBtn.addEventListener('click', () => {
        if (!nearbyNode) return;
        const style = CM.claimNode(nearbyNode);
        statusDisplay.textContent = `Claimed +1 ${style.icon} ${style.label}!`;
        statusDisplay.style.color = "#4ad66d";
        nearbyNode = null;
        claimBtn.style.display = "none";

        if (window.DailiesUI) window.DailiesUI.recordCacheClaim();
        showClaimReveal(style);
        updateInventoryUI();
        renderAllNodes();
    });

    function checkProximity(currentPos) {
        let closest = null;
        let closestEdgeGap = Infinity;

        CM.getActiveNodes().forEach(node => {
            const centerDist = currentPos.distanceTo([node.lat, node.lng]);
            const nodeRadius = node.tier === "global" ? GLOBAL_NODE_RADIUS : PERSONAL_NODE_RADIUS;
            const maxOverlapDist = PLAYER_PULSE_RADIUS + nodeRadius;

            // True as soon as the outer edges of the two circles touch or overlap
            if (centerDist <= maxOverlapDist) {
                const edgeGap = centerDist - maxOverlapDist;
                if (edgeGap < closestEdgeGap) {
                    closest = node;
                    closestEdgeGap = edgeGap;
                }
            }
        });

        if (closest) {
            nearbyNode = closest;
            statusDisplay.textContent = `Cache in Reach: ${closest.name}`;
            statusDisplay.style.color = "#ffb703";
            claimBtn.textContent = `Claim Mystery Cache`;
            claimBtn.style.display = "block";
        } else {
            nearbyNode = null;
            claimBtn.style.display = "none";
            statusDisplay.textContent = "GPS Connected — Exploring Bristol";
            statusDisplay.style.color = "#4ad66d";
        }
    }


    function validateMovement(currentPos, timestamp, coords) {
        // 1. Check browser mock location flag
        if (coords.mocked === true) {
            statusDisplay.style.color = "#e63946";
            statusDisplay.textContent = "Mock GPS detected. Disable spoofing to play.";
            return false;
        }

        if (lastValidFix) {
            const timeDeltaSec = (timestamp - lastValidFix.timestamp) / 1000;
            if (timeDeltaSec > 0.5) {
                const distMeters = lastValidFix.latlng.distanceTo(currentPos);
                const speedMps = distMeters / timeDeltaSec;

                // 2. Rubber-band / Teleport check
                if (speedMps > TELEPORT_SPEED_MPS && distMeters > 150) {
                    statusDisplay.style.color = "#e63946";
                    statusDisplay.textContent = "Unrealistic travel speed detected. Syncing...";
                    lastValidFix = { latlng: currentPos, timestamp };
                    return false;
                }

                // 3. 15 mph Safety Check
                if (speedMps > MAX_WALKING_SPEED_MPS && !isPassengerConfirmed) {
                    safetyOverlay.style.display = 'flex';
                } else if (speedMps <= MAX_WALKING_SPEED_MPS) {
                    isPassengerConfirmed = false; // Reset confirmation once back on foot
                }
            }
        }

        lastValidFix = { latlng: currentPos, timestamp };
        return true;
    }

    // Handle mobile browser sleep / wake cycles cleanly
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            renderAllNodes(); // Catch up if 4:00 PM reset passed while asleep
            lastValidFix = null; // Prevent false teleport flag on wake
        }
    });

    function startGPS() {
        if (!('geolocation' in navigator)) return;
        statusDisplay.textContent = "Requesting GPS...";
        statusDisplay.style.color = "#ffb703";

        navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                const currentPos = L.latLng(latitude, longitude);
                latestPos = currentPos;

                if (coordDisplay) coordDisplay.textContent =`Lat: ${latitude.toFixed(5)} | Lon: ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`;
                startBtn.style.display = "none";
                if (recentreBtn) recentreBtn.style.display = "flex";

                const isValid = validateMovement(currentPos, pos.timestamp, pos.coords);

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
                        radius: PLAYER_PULSE_RADIUS,
                        color: '#ffb703',
                        fillColor: '#ffb703',
                        fillOpacity: 0.15,
                        weight: 2,
                        className: 'claim-range-pulse'
                    }).addTo(map);

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
                        radius: PLAYER_PULSE_RADIUS,
                        color: '#ffb703',
                        fillColor: '#ffb703',
                        fillOpacity: 0.15,
                        weight: 2,
                        className: 'claim-range-pulse'
                    }).addTo(map);

                    playerMarker = L.marker(currentPos, {
                        icon: createPlayerDivIcon(),
                        interactive: false,
                        zIndexOffset: 1000
                    }).addTo(map);

                    map.setView(currentPos, 17);
                } else {
                    accuracyCircle.setLatLng(currentPos).setRadius(accuracy);
                    claimRangeCircle.setLatLng(currentPos);
                    playerMarker.setLatLng(currentPos);
                }

                // Fallback to GPS travel direction if compass sensor hasn't fired yet
                if (typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)) {
                    updatePlayerHeading(pos.coords.heading);
                }


                    map.setView(currentPos, 17);
                } else {
                    accuracyCircle.setLatLng(currentPos).setRadius(accuracy);
                    claimRangeCircle.setLatLng(currentPos);
                    playerMarker.setLatLng(currentPos);
                }

                if (isValid) {checkProximity(currentPos);
                }
            },
            (err) => {
            statusDisplay.style.color = "#e63946";
            statusDisplay.textContent = `GPS Error (${err.code}): ${err.message}`;
            },
            { enableHighAccuracy: true, timeout: 15000,   maximumAge: 10000 }
        );
    }

    startBtn.addEventListener('click', () => {
        requestCompassAccess();
        startGPS();
    });

    startGPS();
});

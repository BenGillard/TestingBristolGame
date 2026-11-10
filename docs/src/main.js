import { MapManager } from './mapManager.js';

// Base mock array representing local landmarks & test zones
const MOCK_COLLECTIBLES = [
    { id: 1, name: "Castle Park Fountain Token", lat: 51.4548, lng: -2.5872, tier: "global" },
    { id: 2, name: "SS Great Britain Maritime Shard", lat: 51.4484, lng: -2.6083, tier: "global" },
    { id: 3, name: "Clifton Suspension Bridge Medal", lat: 51.4549, lng: -2.6279, tier: "global" },
    { id: 4, name: "Gloucester Road Indie Coin", lat: 51.4772, lng: -2.5891, tier: "personal" },
    { id: 5, name: "BS5 Local Sandbox Anchor", lat: 51.4580, lng: -2.5530, tier: "personal" } // Local BS5 verification point
];

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        let swPath = './sw.js';

        if (window.location.hostname.includes('github.io')) {
            const repoName = pathSegments[0];
            swPath = `/${repoName}/sw.js`;
        }

        navigator.serviceWorker.register(swPath)
            .then(reg => console.log('[PWA Pipeline] System online with scope:', reg.scope))
            .catch(err => console.error('[PWA Pipeline] Deployment crashed:', err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const gameMap = new MapManager('map');

    const statusDisplay = document.getElementById('gps-status');
    const coordDisplay = document.getElementById('gps-coords');

    // Push local mock collectibles dataset array out into map rendering view
    gameMap.renderCollectibles(MOCK_COLLECTIBLES);

    const geoOptions = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    if ('geolocation' in navigator) {
        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;

                if (statusDisplay && coordDisplay) {
                    statusDisplay.textContent = "Satellite Connection Synchronised";
                    statusDisplay.style.color = "#4ad66d";
                    coordDisplay.textContent = `Lat: ${latitude.toFixed(5)} | Lon: ${longitude.toFixed(5)} (Acc: ${Math.round(accuracy)}m)`;
                }

                gameMap.updatePlayerPosition(latitude, longitude, accuracy);

                // Geofence Checking Loop: Parse proximity calculations against our database list
                MOCK_COLLECTIBLES.forEach(item => {
                    const distanceToItem = gameMap.calculateDistance(latitude, longitude, item.lat, item.lng);
                    
                    // Interaction Radius Gate: Trigger alert notice if player enters within 25 meters of coordinate point
                    if (distanceToItem <= 25) {
                        if (statusDisplay) {
                            statusDisplay.textContent = `🎯 Proximity Alert: Near "${item.name}"!`;
                            statusDisplay.style.color = "#ffb703";
                        }
                    }
                });
            },
            (error) => {
                if (statusDisplay) {
                    statusDisplay.style.color = "#e63946";
                    switch(error.code) {
                        case error.PERMISSION_DENIED:
                            statusDisplay.textContent = "GPS Access Denied. Check Device Permissions.";
                            break;
                        case error.POSITION_UNAVAILABLE:
                            statusDisplay.textContent = "Signal Lost. Checking Bristol Urban Corridors...";
                            break;
                        case error.TIMEOUT:
                            statusDisplay.textContent = "Sync Timeout. Re-polling Satellite Grid...";
                            break;
                    }
                }
            },
            geoOptions
        );
    } else {
        if (statusDisplay) {
            statusDisplay.textContent = "Hardware Browser Conflict. Geolocation Unavailable.";
            statusDisplay.style.color = "#e63946";
        }
    }
});

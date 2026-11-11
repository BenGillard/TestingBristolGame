import { MapManager } from './mapManager.js';

const MOCK_COLLECTIBLES = [
    { id: 1, name: "Castle Park Fountain Token", lat: 51.4548, lng: -2.5872, tier: "global" },
    { id: 2, name: "SS Great Britain Maritime Shard", lat: 51.4484, lng: -2.6083, tier: "global" },
    { id: 3, name: "Clifton Suspension Bridge Medal", lat: 51.4549, lng: -2.6279, tier: "global" },
    { id: 4, name: "Gloucester Road Indie Coin", lat: 51.4772, lng: -2.5891, tier: "personal" },
    { id: 5, name: "BS5 Local Sandbox Anchor", lat: 51.4580, lng: -2.5530, tier: "personal" }
];

// 1. Fixed Service Worker Path Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[PWA] Service Worker active:', reg.scope))
            .catch(err => console.warn('[PWA] Service Worker skipped:', err));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const gameMap = new MapManager('map');
    const statusDisplay = document.getElementById('gps-status');
    const coordDisplay = document.getElementById('gps-coords');

    gameMap.renderCollectibles(MOCK_COLLECTIBLES);

    // 2. Relaxed GPS Options for reliable indoor/outdoor startup
    const geoOptions = {
        enableHighAccuracy: false, // Allows instant Wi-Fi/Cell lock indoors, refines over time
        timeout: 10000,            // Failsafe timeout after 10 seconds instead of hanging
        maximumAge: 30000          // Accepts a recent cached position up to 30s old for instant load
    };

    function startTracking() {
        if (!('geolocation' in navigator)) {
            statusDisplay.textContent = "Geolocation not supported by this browser.";
            statusDisplay.style.color = "#e63946";
            return;
        }

        statusDisplay.textContent = "Requesting Location Access...";
        statusDisplay.style.color = "#00b4d8";

        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;

                statusDisplay.textContent = "Location Synchronised";
                statusDisplay.style.color = "#4ad66d";
                coordDisplay.textContent = `Lat: ${latitude.toFixed(5)} | Lon: ${longitude.toFixed(5)} (Acc: ${Math.round(accuracy)}m)`;

                gameMap.updatePlayerPosition(latitude, longitude, accuracy);

                // Check proximity to collectibles
                MOCK_COLLECTIBLES.forEach(item => {
                    const distance = gameMap.calculateDistance(latitude, longitude, item.lat, item.lng);
                    if (distance <= 25) {
                        statusDisplay.textContent = `🎯 Near "${item.name}" (${Math.round(distance)}m)!`;
                        statusDisplay.style.color = "#ffb703";
                    }
                });
            },
            (error) => {
                statusDisplay.style.color = "#e63946";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        statusDisplay.textContent = "Location Blocked. Enable GPS in browser settings & tap here.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        statusDisplay.textContent = "Location Unavailable. Move near a window & tap to retry.";
                        break;
                    case error.TIMEOUT:
                        statusDisplay.textContent = "GPS Timed Out. Tap here to retry sync.";
                        break;
                    default:
                        statusDisplay.textContent = "Unknown GPS Error. Tap to retry.";
                }
            },
            geoOptions
        );
    }

    // Allow user to tap the status box to manually trigger/retry GPS permissions
    document.getElementById('ui-layer').addEventListener('click', startTracking);

    // Attempt automatic start on load
    startTracking();
});

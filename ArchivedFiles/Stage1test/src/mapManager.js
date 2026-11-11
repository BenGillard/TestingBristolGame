// Strict geographical box limits bounding Bristol (South West Boundary Constraints)
const BRISTOL_BOUNDS = L.latLngBounds(
    [51.4000, -2.6800], 
    [51.5200, -2.5000]  
);

export class MapManager {
    constructor(containerId) {
        this.map = null;
        this.playerMarker = null;
        this.accuracyCircle = null;
        this.collectibleMarkers = []; // Array tracking active interactive nodes
        this.initMap(containerId);
    }

    initMap(containerId) {
        this.map = L.map(containerId, {
            center: [51.4545, -2.5879], // Central Hub Reference: Castle Park
            zoom: 16,
            minZoom: 12,                
            maxZoom: 19,                
            maxBounds: BRISTOL_BOUNDS,
            maxBoundsViscosity: 1.0,    
            zoomControl: false          
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            crossOrigin: true
        }).addTo(this.map);
    }

    /**
     * Renders an array of game items onto the map interface canvas
     * @param {Array} itemsList - List containing collectible node configurations
     */
    renderCollectibles(itemsList) {
        // Clear any old visual markers to avoid duplications on refresh
        this.collectibleMarkers.forEach(marker => this.map.removeLayer(marker));
        this.collectibleMarkers = [];

        itemsList.forEach(item => {
            // Draw a styled circle overlay representing the virtual game currency location
            const marker = L.circle([item.lat, item.lng], {
                radius: 15, // Interactive radius zone scale in meters
                color: item.tier === 'global' ? '#ffb703' : '#fb8500',
                fillColor: item.tier === 'global' ? '#ffb703' : '#fb8500',
                fillOpacity: 0.4,
                weight: 2
            }).addTo(this.map);

            // Bind an un-styled simple informative map popup bubble
            marker.bindPopup(`<b>${item.name}</b><br>Tier: ${item.tier.toUpperCase()}<br>Status: Discovered`);
            
            // Reference the marker link context
            this.collectibleMarkers.push(marker);
        });
    }

    /**
     * Calculates the real-world distance between two coordinate sets in meters using the Haversine formula
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth radius index metric in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c; 
    }

    updatePlayerPosition(lat, lng, accuracy) {
        const currentPos = L.latLng(lat, lng);

        if (!this.accuracyCircle) {
            this.accuracyCircle = L.circle(currentPos, {
                radius: accuracy,
                color: '#00b4d8',
                fillColor: '#00b4d8',
                fillOpacity: 0.15,
                weight: 1
            }).addTo(this.map);
        } else {
            this.accuracyCircle.setLatLng(currentPos);
            this.accuracyCircle.setRadius(accuracy);
        }

        if (!this.playerMarker) {
            this.playerMarker = L.circleMarker(currentPos, {
                radius: 8,
                color: '#ffffff',
                fillColor: '#00b4d8',
                fillOpacity: 1.0,
                weight: 3
            }).addTo(this.map);
            
            this.map.setView(currentPos, 16);
        } else {
            this.playerMarker.setLatLng(currentPos);
        }
    }
}

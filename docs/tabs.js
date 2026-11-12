window.TabRouter = (function() {
    let mapInstance = null;

    function registerMap(map) {
        mapInstance = map;
    }

    function switchTo(tabId) {
        document.querySelectorAll('.tab-view').forEach(view => {
            view.classList.toggle('active', view.id === tabId);
        });

        document.querySelectorAll('#bottom-nav .nav-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Recalculate Leaflet map size when returning to Map tab
        if (tabId === 'tab-map' && mapInstance) {
            setTimeout(() => mapInstance.invalidateSize(), 50);
        }

        // Trigger modular tab renderers if loaded
        if (tabId === 'tab-dailies' && window.DailiesUI) window.DailiesUI.render();
        if (tabId === 'tab-bulletin' && window.BulletinUI) window.BulletinUI.render();
        if (tabId === 'tab-inventory' && window.InventoryUI) window.InventoryUI.render();
        if (tabId === 'tab-leaderboard' && window.LeaderboardUI) window.LeaderboardUI.render();
    }

    window.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('#bottom-nav .nav-tab').forEach(btn => {
            btn.addEventListener('click', () => switchTo(btn.dataset.tab));
        });
    });

    return { registerMap, switchTo };
})();

window.LeaderboardUI = (function() {
    let activeSubTab = "postcodes"; // "postcodes" | "players"

    // Calculate current player's total collectibles from local save
    function getLocalPlayerTotal() {
        const CM = window.CollectibleManager;
        if (!CM) return 0;

        const inv = CM.getInventory() || {};
        const crafted = CM.getCrafted() || {};

        const gen1Total = Object.values(inv).reduce((sum, n) => sum + (Number(n) || 0), 0);
        const gen2Total = Object.values(crafted).reduce((sum, n) => sum + (Number(n) || 0), 0);

        return gen1Total + gen2Total;
    }

    // Replace this mock loader with your live backend API call (e.g., Supabase) later
    async function fetchLeaderboardData() {
        const localTotal = getLocalPlayerTotal();

        return {
            isLiveBackend: false,
            postcodes: [
                { rank: 1, code: "BS5", name: "Easton / St George", players: 42, total: 1280 + localTotal, isUserDistrict: true },
                { rank: 2, code: "BS8", name: "Clifton / Hotwells", players: 38, total: 1195, isUserDistrict: false },
                { rank: 3, code: "BS1", name: "City Centre / Harbourside", players: 51, total: 1140, isUserDistrict: false },
                { rank: 4, code: "BS7", name: "Bishopston / Horfield", players: 29, total: 960, isUserDistrict: false },
                { rank: 5, code: "BS3", name: "Bedminster / Southville", players: 34, total: 890, isUserDistrict: false }
            ],
            players: [
                { rank: 1, username: "BrunelWalker", postcode: "BS8", total: 148, isCurrentUser: false },
                { rank: 2, username: "AvonScout", postcode: "BS1", total: 132, isCurrentUser: false },
                { rank: 3, username: "CabotRunner", postcode: "BS7", total: 119, isCurrentUser: false },
                { rank: 4, username: "You (Local Preview)", postcode: "BS5", total: localTotal, isCurrentUser: true }
            ].sort((a, b) => b.total - a.total).map((entry, idx) => ({ ...entry, rank: idx + 1 }))
        };
    }

    async function render() {
        const container = document.getElementById('leaderboard-content');
        if (!container) return;

        const data = await fetchLeaderboardData();

        container.innerHTML = `
            <div class="lb-wrapper">
                <!-- Sub-tab Switcher -->
                <div class="lb-toggle-bar">
                    <button class="lb-toggle-btn ${activeSubTab === 'postcodes' ? 'active' : ''}" data-lb-view="postcodes">
                        🏘️ BS Postcodes
                    </button>
                    <button class="lb-toggle-btn ${activeSubTab === 'players' ? 'active' : ''}" data-lb-view="players">
                        🧭 Top Explorers
                    </button>
                </div>

                <!-- Offline / Preview Banner -->
                ${!data.isLiveBackend ? `
                    <div class="lb-preview-banner">
                        Live server sync coming soon — showing preview rankings with your real local tally (${getLocalPlayerTotal()} items).
                    </div>
                ` : ''}

                <!-- Leaderboard Rows -->
                <div class="lb-list">
                    ${activeSubTab === 'postcodes'
                        ? renderPostcodeRows(data.postcodes)
                        : renderPlayerRows(data.players)}
                </div>
            </div>
        `;

        container.querySelectorAll('.lb-toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activeSubTab = btn.dataset.lbView;
                render();
            });
        });
    }

    function renderPostcodeRows(rows) {
        return rows.map(row => `
            <div class="lb-row ${row.isUserDistrict ? 'highlight-row' : ''}">
                <div class="lb-rank">#${row.rank}</div>
                <div class="lb-info">
                    <div class="lb-primary">${row.code} <span class="lb-sub-inline">${row.name}</span></div>
                    <div class="lb-secondary">${row.players} linked explorers</div>
                </div>
                <div class="lb-score">
                    <span class="lb-score-num">${row.total.toLocaleString()}</span>
                    <span class="lb-score-label">items</span>
                </div>
            </div>
        `).join('');
    }

    function renderPlayerRows(rows) {
        return rows.map(row => `
            <div class="lb-row ${row.isCurrentUser ? 'highlight-row' : ''}">
                <div class="lb-rank">#${row.rank}</div>
                <div class="lb-info">
                    <div class="lb-primary">${row.username}</div>
                    <div class="lb-secondary">District: ${row.postcode}</div>
                </div>
                <div class="lb-score">
                    <span class="lb-score-num">${row.total.toLocaleString()}</span>
                    <span class="lb-score-label">items</span>
                </div>
            </div>
        `).join('');
    }

    return { render };
})();

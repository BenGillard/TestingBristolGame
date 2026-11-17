window.LeaderboardUI = (function() {
    let activeSubTab = "postcodes"; // "postcodes" | "players"

    const BS_AREA_NAMES = {
        BS1: "City Centre / Harbourside",
        BS2: "Kingsdown / St Pauls",
        BS3: "Bedminster / Southville",
        BS4: "Brislington / Knowle",
        BS5: "Easton / St George",
        BS6: "Redland / Cotham / Montpelier",
        BS7: "Bishopston / Horfield",
        BS8: "Clifton / Hotwells",
        BS9: "Westbury-on-Trym / Stoke Bishop",
        BS10: "Henbury / Southmead",
        BS11: "Avonmouth / Shirehampton",
        BS13: "Bedminster Down / Hartcliffe",
        BS14: "Hengrove / Stockwood",
        BS15: "Kingswood / Hanham",
        BS16: "Fishponds / Downend / Frenchay"
    };

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

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

    async function fetchLeaderboardData() {
        const localTotal = getLocalPlayerTotal();
        const profile = window.UserAccountService
            ? await window.UserAccountService.getProfile()
            : { username: "Bristol Explorer", avatar: "🧭", outcode: "BS5" };

        const userOutcode = profile.outcode || "BS5";

        if (window.GameAPI && navigator.onLine) {
            try {
                const [rawOutcodes, rawPlayers] = await Promise.all([
                    window.GameAPI.getOutcodeLeaderboard(),
                    window.GameAPI.getIndividualLeaderboard()
                ]);

                const postcodes = rawOutcodes.map((row, idx) => ({
                    rank: idx + 1,
                    code: row.outcode,
                    name: BS_AREA_NAMES[row.outcode] || "Bristol District",
                    players: row.active_residents,
                    total: row.total_points,
                    isUserDistrict: row.outcode === userOutcode
                }));

                const players = rawPlayers.map((row, idx) => ({
                    rank: idx + 1,
                    username: row.username,
                    avatar: row.avatar || "🧭",
                    avatarType: row.avatar_type || "emoji",
                    postcode: row.outcode || "Visitor",
                    total: row.total_discovered,
                    isCurrentUser: row.username === profile.username
                }));

                return { isLiveBackend: true, profile, postcodes, players };
            } catch (err) {
                console.warn("Leaderboard fetch failed, showing offline preview:", err.message);
            }
        }

        // Keep your existing mock fallback array here when offline
        return { isLiveBackend: false, profile, postcodes: [], players: [] };
    }


    async function render() {
        const container = document.getElementById('leaderboard-content');
        if (!container) return;

        const data = await fetchLeaderboardData();
        const isVisitor = data.profile.outcode === "Visitor";

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
                        Live server sync coming soon — showing preview rankings for <strong>${escapeHtml(data.profile.username)}</strong> (${escapeHtml(data.profile.outcode)}) with your real local tally (${getLocalPlayerTotal()} items).
                        ${isVisitor && activeSubTab === 'postcodes' ? '<br><em>Tip: Select a BS postcode in your Profile to contribute to a district!</em>' : ''}
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
        if (!rows || rows.length === 0) {
            return `<div class="placeholder-card">No registered BS residents on the board yet — open your Profile (👤) to claim your district!</div>`;
        }
        return rows.map(row => `
            <div class="lb-row ${row.isUserDistrict ? 'highlight-row' : ''}">
                <div class="lb-rank">#${row.rank}</div>
                <div class="lb-info">
                    <div class="lb-primary">${escapeHtml(row.code)} <span class="lb-sub-inline">${escapeHtml(row.name)}</span></div>
                    <div class="lb-secondary">${row.players} linked explorers${row.isUserDistrict ? ' • Your District' : ''}</div>
                </div>
                <div class="lb-score">
                    <span class="lb-score-num">${row.total.toLocaleString()}</span>
                    <span class="lb-score-label">items</span>
                </div>
            </div>
        `).join('');
    }

    function renderPlayerRows(rows) {
        if (!rows || rows.length === 0) {
            return `<div class="placeholder-card">No ranked explorers yet — register as a Resident in your Profile (👤) to appear here!</div>`;
        }
        return rows.map(row => {
            const isImg = row.avatarType === 'image' || String(row.avatar || '').startsWith('data:image/');
            const avatarHtml = row.avatar
                ? (isImg ? `<img src="${row.avatar}" alt="" class="lb-avatar-img" /> ` : `${escapeHtml(row.avatar)} `)
                : '';
            return `
                <div class="lb-row ${row.isCurrentUser ? 'highlight-row' : ''}">
                    <div class="lb-rank">#${row.rank}</div>
                    <div class="lb-info">
                        <div class="lb-primary">${avatarHtml}${escapeHtml(row.username)}${row.isCurrentUser ? ' (You)' : ''}</div>
                        <div class="lb-secondary">District: ${escapeHtml(row.postcode)}</div>
                    </div>
                    <div class="lb-score">
                        <span class="lb-score-num">${row.total.toLocaleString()}</span>
                        <span class="lb-score-label">items</span>
                    </div>
                </div>
            `;
        }).join('');
    }


    window.addEventListener('profileUpdated', render);

    return { render };
})();

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

    // Replace this mock loader with your live backend API call (e.g., Supabase) later
    async function fetchLeaderboardData() {
        const localTotal = getLocalPlayerTotal();
        const profile = window.UserAccountService
            ? await window.UserAccountService.getProfile()
            : { username: "Bristol Explorer", avatar: "🧭", outcode: "BS5" };

        const userOutcode = profile.outcode || "BS5";
        const isVisitor = userOutcode === "Visitor";

        const basePostcodes = [
            { code: "BS5", name: BS_AREA_NAMES.BS5, players: 42, total: 1280 },
            { code: "BS8", name: BS_AREA_NAMES.BS8, players: 38, total: 1195 },
            { code: "BS1", name: BS_AREA_NAMES.BS1, players: 51, total: 1140 },
            { code: "BS7", name: BS_AREA_NAMES.BS7, players: 29, total: 960 },
            { code: "BS3", name: BS_AREA_NAMES.BS3, players: 34, total: 890 }
        ];

        // Add user's selected BS outcode to preview rankings if not already in the top 5
        if (!isVisitor && !basePostcodes.some(p => p.code === userOutcode)) {
            basePostcodes.push({
                code: userOutcode,
                name: BS_AREA_NAMES[userOutcode] || "Bristol District",
                players: 18,
                total: 740
            });
        }

        const postcodes = basePostcodes
            .map(district => {
                const isUserDistrict = !isVisitor && district.code === userOutcode;
                return {
                    ...district,
                    total: isUserDistrict ? district.total + localTotal : district.total,
                    isUserDistrict
                };
            })
            .sort((a, b) => b.total - a.total)
            .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

        const players = [
            { username: "BrunelWalker", avatar: "🌉", postcode: "BS8", total: 148, isCurrentUser: false },
            { username: "AvonScout", avatar: "⛵", postcode: "BS1", total: 132, isCurrentUser: false },
            { username: "CabotRunner", avatar: "🔭", postcode: "BS7", total: 119, isCurrentUser: false },
            {
                username: profile.username,
                avatar: profile.avatar,
                avatarType: profile.avatarType || 'emoji',
                postcode: userOutcode,
                total: localTotal,
                isCurrentUser: true
            }

        ]
            .sort((a, b) => b.total - a.total)
            .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

        return {
            isLiveBackend: false,
            profile,
            postcodes,
            players
        };
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

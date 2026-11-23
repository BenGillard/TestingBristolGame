window.BulletinUI = (function() {
    const ITEM_ICONS = {
        stone: '🪨',
        wood: '🪵',
        water: '💧',
        metal: '⚙️',
        paper: '📜',
        clay: '🏺',
        sparks: '✨',
        timber: '🪚',
        cobble: '🧱',
        steam: '♨️'
    };

    function formatTimeWindow(startsAt, endsAt) {
        const start = new Date(startsAt);
        const end = new Date(endsAt);
        const dayPart = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const startTime = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const endTime = end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        return `${dayPart} · ${startTime}–${endTime}`;
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderPollChart(poll) {
        if (!poll || !Array.isArray(poll.results) || poll.results.length === 0) {
            return '';
        }

        const maxPct = Math.max(...poll.results.map(r => Number(r.percentage) || 0), 1);

        const barsHtml = poll.results.map(r => {
            const pct = Number(r.percentage) || 0;
            const votes = Number(r.votes) || 0;
            const isLeader = pct > 0 && pct === maxPct;
            const barColor = isLeader ? '#4ad66d' : '#5bc0be';

            return `
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; margin-bottom: 4px; gap: 8px;">
                        <span style="color: #e0e1dd; font-weight: ${isLeader ? '700' : '500'};">${escapeHtml(r.option)}</span>
                        <span style="color: ${isLeader ? '#4ad66d' : '#a8b2d1'}; font-variant-numeric: tabular-nums; white-space: nowrap;">
                            <strong>${pct.toFixed(1)}%</strong> (${votes})
                        </span>
                    </div>
                    <div style="width: 100%; height: 10px; background: rgba(255, 255, 255, 0.08); border-radius: 999px; overflow: hidden;">
                        <div style="width: ${Math.min(pct, 100)}%; height: 100%; background: ${barColor}; border-radius: 999px; transition: width 0.4s ease;"></div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="placeholder-card" style="padding: 18px; margin-top: 14px; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #5bc0be;">
                        📊 Last Week's Poll Results
                    </span>
                    <span style="font-size: 11px; color: #8d99ae;">${escapeHtml(poll.poll_date)}</span>
                </div>
                <div style="font-size: 15px; font-weight: 700; color: #e0e1dd; margin-bottom: 14px;">
                    ${escapeHtml(poll.poll_question)}
                </div>
                ${barsHtml}
                <div style="font-size: 11px; color: #8d99ae; text-align: right; margin-top: 6px;">
                    Total Resident Votes: ${Number(poll.total_votes) || 0}
                </div>
            </div>
        `;
    }

    function renderUpcomingDrops(collectibles) {
        if (!Array.isArray(collectibles) || collectibles.length === 0) {
            return `
                <div class="placeholder-card" style="padding: 16px; margin-top: 14px; text-align: left;">
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #f4a261; margin-bottom: 6px;">
                        ⏳ Upcoming Timed Collectibles
                    </div>
                    <div style="font-size: 13px; color: #8d99ae;">
                        No special timed drops scheduled right now. Check back soon!
                    </div>
                </div>
            `;
        }

        const itemsHtml = collectibles.map(drop => {
            const icon = ITEM_ICONS[drop.item_key] || '📦';
            const isLiveNow = new Date(drop.starts_at) <= new Date() && new Date(drop.ends_at) >= new Date();

            return `
                <div style="padding: 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; margin-top: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <div style="font-size: 14px; font-weight: 700; color: #e0e1dd;">
                            ${icon} ${escapeHtml(drop.title)}
                        </div>
                        ${isLiveNow
                            ? '<span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: rgba(74, 214, 109, 0.18); color: #4ad66d;">LIVE</span>'
                            : ''}
                    </div>
                    <div style="font-size: 12px; color: #5bc0be; margin-top: 3px;">
                        📍 ${escapeHtml(drop.area_name || 'Across Bristol')} · ${formatTimeWindow(drop.starts_at, drop.ends_at)}
                    </div>
                    ${drop.description
                        ? `<div style="font-size: 12px; color: #a8b2d1; margin-top: 6px; line-height: 1.4;">${escapeHtml(drop.description)}</div>`
                        : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="placeholder-card" style="padding: 18px; margin-top: 14px; text-align: left;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #f4a261;">
                    ⏳ Upcoming Timed Collectibles
                </div>
                ${itemsHtml}
            </div>
        `;
    }

    async function render() {
        const container = document.getElementById('bulletin-content');
        if (!container) return;

        container.innerHTML = `
            <div class="placeholder-card" style="text-align: center; padding: 32px 20px;">
                <div style="font-size: 28px; margin-bottom: 8px;">📡</div>
                <div style="font-size: 14px; color: #a8b2d1;">Loading Bristol dispatch...</div>
            </div>
        `;

        try {
            if (!window.GameAPI || typeof window.GameAPI.getTodayBulletin !== 'function') {
                throw new Error('GameAPI.getTodayBulletin is not available.');
            }

            const data = await window.GameAPI.getTodayBulletin();
            const title = data?.title || 'Bristol Explorer Bulletin';
            const bulletinHtml = data?.bulletin_html || '<p style="margin:0; color:#a8b2d1;">No special announcements today. Happy exploring!</p>';

            container.innerHTML = `
                <div class="placeholder-card" style="padding: 18px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #4ad66d;">
                            📢 Daily Dispatch
                        </span>
                        <span style="font-size: 11px; color: #8d99ae;">${escapeHtml(data?.active_date || '')}</span>
                    </div>
                    <div style="font-size: 17px; font-weight: 700; color: #e0e1dd; margin-bottom: 10px;">
                        ${escapeHtml(title)}
                    </div>
                    <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5;">
                        ${bulletinHtml}
                    </div>
                </div>
                ${renderUpcomingDrops(data?.upcoming_collectibles)}
                ${renderPollChart(data?.last_week_poll)}
            `;
        } catch (err) {
            console.warn('Bulletin load error:', err);
            container.innerHTML = `
                <div class="placeholder-card" style="text-align: center; padding: 32px 20px;">
                    <div style="font-size: 36px; margin-bottom: 10px;">📢</div>
                    <div style="font-size: 16px; font-weight: 700; color: #e0e1dd; margin-bottom: 6px;">
                        Offline Mode
                    </div>
                    <div style="font-size: 13px; color: #8d99ae;">
                        Reconnect to view today's Bristol dispatch, timed drops, and weekly poll charts.
                    </div>
                </div>
            `;
        }
    }

    return { render };
})();

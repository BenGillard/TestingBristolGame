window.BulletinUI = (function() {
    function render() {
        const container = document.getElementById('bulletin-content');
        if (!container) return;

        container.innerHTML = `
            <div class="placeholder-card" style="text-align: center; padding: 32px 20px;">
                <div style="font-size: 36px; margin-bottom: 10px;">📢</div>
                <div style="font-size: 16px; font-weight: 700; color: #e0e1dd;">
                    Announcements coming soon
                </div>
            </div>
        `;
    }

    return { render };
})();

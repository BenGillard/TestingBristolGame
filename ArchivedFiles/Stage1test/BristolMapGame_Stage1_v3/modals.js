window.UserAccountService = (function () {
    const PROFILE_KEY = 'bristol_player_profile_v1';
    const SETTINGS_KEY = 'bristol_player_settings_v1';

    const DEFAULT_PROFILE = {
        userId: null, // Populated once linked to Supabase/Firebase auth
        username: 'Bristol Explorer',
        avatar: '🧭',
        outcode: 'BS1',
        updatedAt: null
    };

    const DEFAULT_SETTINGS = {
        mode: 'dark',           // 'dark' | 'light'
        mapTheme: 'maritime',   // 'maritime' | 'cartoon'
        showPostcodes: true,
        showCoords: true,
        haptics: true,
        wakeLock: false
    };

    // SWAP THESE ASYNC METHODS WHEN CONNECTING YOUR BACKEND DATABASE
    async function getProfile() {
        try {
            const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
            return { ...DEFAULT_PROFILE, ...saved };
        } catch {
            return { ...DEFAULT_PROFILE };
        }
    }

    async function saveProfile(updates) {
        const current = await getProfile();
        const next = {
            ...current,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('profileUpdated', { detail: next }));
        // Future DB hook: await supabase.from('profiles').upsert(next);
        return next;
    }

    async function deleteAccount() {
        // Future DB hook: await supabase.rpc('delete_user_account');
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem('bristol_game_save_v1');
        localStorage.removeItem('bristol_dailies_v1');
    }

    function getSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            return { ...DEFAULT_SETTINGS, ...saved };
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveSettings(updates) {
        const next = { ...getSettings(), ...updates };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        applySettingsToDOM(next);
        return next;
    }

    let wakeLockSentinel = null;

    async function syncWakeLock(enabled) {
        if (!('wakeLock' in navigator)) return;
        try {
            if (enabled && !wakeLockSentinel) {
                wakeLockSentinel = await navigator.wakeLock.request('screen');
            } else if (!enabled && wakeLockSentinel) {
                await wakeLockSentinel.release();
                wakeLockSentinel = null;
            }
        } catch (err) {
            console.warn('Wake Lock skipped:', err);
        }
    }

    function applySettingsToDOM(settings = getSettings()) {
        // 1. Apply combined theme + light/dark mode (matches style.css rules)
        document.body.dataset.theme = `${settings.mapTheme}-${settings.mode}`;
        document.body.classList.toggle('light-ui', settings.mode === 'light');

        // 2. Toggle GPS Coordinates readout
        const coordsEl = document.getElementById('gps-coords');
        if (coordsEl) {
            coordsEl.style.display = settings.showCoords ? 'block' : 'none';
        }

        // 3. Toggle Postcode border pane if map has initialised
        const postcodePane = document.querySelector('.leaflet-postcodePane-pane');
        if (postcodePane) {
            postcodePane.style.display = settings.showPostcodes ? 'block' : 'none';
        }

        // 4. Manage screen wake lock
        syncWakeLock(settings.wakeLock);
    }

    function triggerHaptic(ms = 35) {
        const settings = getSettings();
        if (settings.haptics && 'vibrate' in navigator) {
            navigator.vibrate(ms);
        }
    }

    return {
        getProfile,
        saveProfile,
        deleteAccount,
        getSettings,
        saveSettings,
        applySettingsToDOM,
        triggerHaptic
    };
})();

window.OverlaysUI = (function () {
    const AVATAR_CHOICES = ['🧭', '⛵', '🌉', '🦊', '🎈', '⚓', '🌿', '🔭'];

    // All valid Bristol & surrounding BS outcodes (BS1 - BS49)
    const BS_OUTCODES = [
        'Visitor',
        ...Array.from({ length: 49 }, (_, i) => `BS${i + 1}`).filter(code => code !== 'BS12')
    ];

    const FAQ_ITEMS = [
        {
            q: 'How do I claim Mystery Caches?',
            a: 'Walk until your pulsing yellow range ring overlaps a Gold (Global Landmark) or Cyan (Daily Personal) circle on the map, then tap Claim Mystery Cache.'
        },
        {
            q: 'When do Daily Tasks and Personal Spawns reset?',
            a: 'Both reset automatically at midnight (00:00) local UK time every day.'
        },
        {
            q: 'How does crafting work in the Forge?',
            a: 'Open the Inventory tab, tap two 1st-Generation resources (Stone, Wood, Water, Metal) to load them into the Forge slots, and press Combine to discover 2nd-Generation items.'
        },
        {
            q: 'Why does the 15 mph bus warning appear?',
            a: 'To keep players safe near Bristol roads, travelling faster than 15 mph pauses claiming until you confirm you are a passenger.'
        }
    ];

    function buildModalShell() {
        const container = document.createElement('div');
        container.id = 'app-modal-backdrop';
        container.className = 'modal-backdrop';
        container.innerHTML = `<div class="modal-sheet" id="app-modal-sheet" role="dialog" aria-modal="true"></div>`;
        document.body.appendChild(container);

        container.addEventListener('click', (e) => {
            if (e.target === container) closeModal();
        });
    }

    function closeModal() {
        const backdrop = document.getElementById('app-modal-backdrop');
        if (backdrop) backdrop.classList.remove('open');
    }

    async function openProfileModal() {
        const profile = await window.UserAccountService.getProfile();
        const backdrop = document.getElementById('app-modal-backdrop');
        const sheet = document.getElementById('app-modal-sheet');

        sheet.innerHTML = `
            <div class="modal-header">
                <h3>Explorer Profile</h3>
                <button class="modal-close-btn" id="modal-close-x" aria-label="Close">✕</button>
            </div>

            <div class="modal-body">
                <label class="field-label">Profile Picture</label>
                <div class="avatar-picker-grid" id="avatar-picker">
                    ${AVATAR_CHOICES.map(emoji => `
                        <button type="button" class="avatar-opt ${profile.avatar === emoji ? 'selected' : ''}" data-avatar="${emoji}">
                            ${emoji}
                        </button>
                    `).join('')}
                </div>

                <label class="field-label" for="profile-username">Explorer Username</label>
                <input type="text" id="profile-username" class="modal-input" maxlength="24"
                       value="${profile.username.replace(/"/g, '&quot;')}" placeholder="Enter username" />

                <label class="field-label" for="profile-outcode">Home Postcode (Outcode)</label>
                <select id="profile-outcode" class="modal-input">
                    ${BS_OUTCODES.map(code => `
                        <option value="${code}" ${profile.outcode === code ? 'selected' : ''}>${code}</option>
                    `).join('')}
                </select>
                <p class="field-hint">Used for local BS postcode district leaderboards. No full address is ever stored.</p>

                <button type="button" id="save-profile-btn" class="modal-primary-btn">Save Profile</button>
                <div id="profile-save-msg" class="modal-feedback"></div>

                <div class="danger-zone">
                    <div class="danger-title">Account Data</div>
                    <p class="field-hint">Permanently erase your explorer profile, inventory, and local progress.</p>
                    <button type="button" id="delete-account-btn" class="modal-danger-btn">Delete Account</button>
                </div>
            </div>
        `;

        backdrop.classList.add('open');

        let selectedAvatar = profile.avatar;

        document.getElementById('modal-close-x').addEventListener('click', closeModal);

        document.querySelectorAll('.avatar-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedAvatar = btn.dataset.avatar;
            });
        });

        document.getElementById('save-profile-btn').addEventListener('click', async () => {
            const rawName = document.getElementById('profile-username').value.trim();
            const username = rawName.length >= 2 ? rawName : 'Bristol Explorer';
            const outcode = document.getElementById('profile-outcode').value;

            await window.UserAccountService.saveProfile({
                username,
                avatar: selectedAvatar,
                outcode
            });

            // Update floating profile button icon to match chosen avatar
            const fab = document.getElementById('profile-btn');
            if (fab) fab.textContent = selectedAvatar;

            window.UserAccountService.triggerHaptic(30);
            const msg = document.getElementById('profile-save-msg');
            msg.textContent = 'Profile saved!';
            setTimeout(() => { msg.textContent = ''; }, 2000);
        });

        // Two-step confirmation to prevent accidental account deletion
        let confirmDeleteArmed = false;
        const delBtn = document.getElementById('delete-account-btn');
        delBtn.addEventListener('click', async () => {
            if (!confirmDeleteArmed) {
                confirmDeleteArmed = true;
                delBtn.textContent = 'Tap again to confirm permanent deletion';
                delBtn.classList.add('armed');
                return;
            }

            await window.UserAccountService.deleteAccount();
            window.UserAccountService.triggerHaptic(100);
            closeModal();
            alert('Your account and local progress have been permanently deleted.');
            location.reload();
        });
        }

    function openSettingsModal() {
        const settings = window.UserAccountService.getSettings();
        const backdrop = document.getElementById('app-modal-backdrop');
        const sheet = document.getElementById('app-modal-sheet');

        sheet.innerHTML = `
            <div class="modal-header">
                <h3>Settings & Help</h3>
                <button class="modal-close-btn" id="modal-close-x" aria-label="Close">✕</button>
            </div>

            <div class="modal-body">
                <div class="settings-group-title">Appearance</div>

                <div class="setting-row">
                    <div>
                        <div class="setting-name">Colour Mode</div>
                        <div class="setting-sub">Switch between Dark and Light interface</div>
                    </div>
                    <div class="segmented-control">
                        <button type="button" class="seg-btn ${settings.mode === 'dark' ? 'active' : ''}" data-mode="dark">🌙 Dark</button>
                        <button type="button" class="seg-btn ${settings.mode === 'light' ? 'active' : ''}" data-mode="light">☀️ Light</button>
                    </div>
                </div>

                <div class="setting-row">
                    <div>
                        <div class="setting-name">Map Theme</div>
                        <div class="setting-sub">Visual style of the Bristol street map</div>
                    </div>
                    <select id="setting-map-theme" class="modal-select-compact">
                        <option value="maritime" ${settings.mapTheme === 'maritime' ? 'selected' : ''}>Maritime Chart</option>
                        <option value="cartoon" ${settings.mapTheme === 'cartoon' ? 'selected' : ''}>Cartoon Explorer</option>
                    </select>
                </div>

                <div class="settings-group-title">Exploration Preferences</div>

                <label class="setting-row toggle-row">
                    <div>
                        <div class="setting-name">BS Postcode Borders</div>
                        <div class="setting-sub">Show district boundaries on the map</div>
                    </div>
                    <input type="checkbox" id="toggle-postcodes" class="toggle-switch" ${settings.showPostcodes ? 'checked' : ''} />
                </label>

                <label class="setting-row toggle-row">
                    <div>
                        <div class="setting-name">Show GPS Coordinates</div>
                        <div class="setting-sub">Display live latitude & longitude readout</div>
                    </div>
                    <input type="checkbox" id="toggle-coords" class="toggle-switch" ${settings.showCoords ? 'checked' : ''} />
                </label>

                <label class="setting-row toggle-row">
                    <div>
                        <div class="setting-name">Haptic Vibration</div>
                        <div class="setting-sub">Vibrate gently when claiming or crafting</div>
                    </div>
                    <input type="checkbox" id="toggle-haptics" class="toggle-switch" ${settings.haptics ? 'checked' : ''} />
                </label>

                <label class="setting-row toggle-row">
                    <div>
                        <div class="setting-name">Keep Screen Awake</div>
                        <div class="setting-sub">Prevent screen timeout while walking</div>
                    </div>
                    <input type="checkbox" id="toggle-wakelock" class="toggle-switch" ${settings.wakeLock ? 'checked' : ''} />
                </label>

                <div class="settings-group-title">Frequently Asked Questions</div>
                <div class="faq-accordion">
                    ${FAQ_ITEMS.map(item => `
                        <details class="faq-item">
                            <summary class="faq-question">${item.q}</summary>
                            <p class="faq-answer">${item.a}</p>
                        </details>
                    `).join('')}
                </div>
            </div>
        `;

        backdrop.classList.add('open');

        document.getElementById('modal-close-x').addEventListener('click', closeModal);

        document.querySelectorAll('.seg-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.UserAccountService.saveSettings({ mode: btn.dataset.mode });
            });
        });

        document.getElementById('setting-map-theme').addEventListener('change', (e) => {
            window.UserAccountService.saveSettings({ mapTheme: e.target.value });
        });

        document.getElementById('toggle-postcodes').addEventListener('change', (e) => {
            window.UserAccountService.saveSettings({ showPostcodes: e.target.checked });
        });

        document.getElementById('toggle-coords').addEventListener('change', (e) => {
            window.UserAccountService.saveSettings({ showCoords: e.target.checked });
        });

        document.getElementById('toggle-haptics').addEventListener('change', (e) => {
            window.UserAccountService.saveSettings({ haptics: e.target.checked });
        });

        document.getElementById('toggle-wakelock').addEventListener('change', (e) => {
            window.UserAccountService.saveSettings({ wakeLock: e.target.checked });
        });
    }

    async function init() {
        buildModalShell();
        window.UserAccountService.applySettingsToDOM();

        const profile = await window.UserAccountService.getProfile();
        const profileBtn = document.getElementById('profile-btn');
        const settingsBtn = document.getElementById('settings-btn');

        if (profileBtn) {
            profileBtn.textContent = profile.avatar;
            profileBtn.addEventListener('click', openProfileModal);
        }
        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettingsModal);
        }
    }

    window.addEventListener('DOMContentLoaded', init);

    return { openProfileModal, openSettingsModal, closeModal };
})();

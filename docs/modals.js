window.UserAccountService = (function () {
    const PROFILE_KEY = 'bristol_player_profile_v1';
    const SETTINGS_KEY = 'bristol_player_settings_v1';

    const DEFAULT_PROFILE = {
        userId: null,
        username: 'BristolExplorer123',
        avatar: '🧭',
        avatarType: 'emoji',
        outcode: 'Visitor',
        ageBracket: '25_34',
        isResident: false,
        updatedAt: null
    };

    const DEFAULT_SETTINGS = {
        mode: 'dark',           // 'dark' | 'light'
        showPostcodes: true,
        showCoords: true,
        haptics: true,
        wakeLock: false
    };

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
        return next;
    }

    async function deleteAccount() {
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
        // 1. Apply light/dark mode (matches style.css rules)
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

    function renderProfileFab(profile) {
        const fab = document.getElementById('profile-btn');
        if (!fab) return;
        if (profile.avatarType === 'image' && profile.avatar) {
            fab.innerHTML = `<img src="${profile.avatar}" alt="Profile" class="fab-avatar-img" />`;
        } else {
            fab.textContent = profile.avatar || '🧭';
        }
    }

    return {
        getProfile,
        saveProfile,
        deleteAccount,
        getSettings,
        saveSettings,
        applySettingsToDOM,
        triggerHaptic,
        renderProfileFab
    };
})();


window.OverlaysUI = (function () {
    const AVATAR_CHOICES = ['🧭', '⛵', '🌉', '🦊', '🎈', '⚓', '🌿', '🔭'];

    // All valid Bristol & surrounding BS outcodes (BS1 - BS49, excluding BS12)
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
            q: 'Why does the 20 mph bus warning appear?',
            a: 'To keep players safe near Bristol roads, travelling faster than 20 mph pauses claiming until you confirm you are a passenger.'
        },
        {           
            q: 'Whats the benefit of registering as a BS Resident?',
            a: 'Registering as a BS Resident allows you to join the Bristol district leaderboards, enjoy the daily rewards and challenges, and recover your account on a new device. Minimal information is collected (an email address, age bracket, and outcode) to preserve your privacy. These details are used only for the leaderboards and dailies. All your collectibles are safe when you upgrade! Of course, you can still enjoy finding treasures as a Visitor.'
        },{
            q: 'Won\'t this game just create more phone zombies?!',
            a: 'Hopefully not! The game is designed to encourage walking and exploration. We consciously made the map visible and scrollable so you can plan a route and enjoy looking up whilst exploring Bristol.'
        },{
            q:'Will more features be added?',
            a: 'Yes! This is an early prototype and we plan to add more features. We welcome your feedback and suggestions - please send them via our feedback button in the settings tab.'}
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

    function resizeImageFile(file, maxSize = 96) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = maxSize;
                    canvas.height = maxSize;
                    const ctx = canvas.getContext('2d');
                    const minSide = Math.min(img.width, img.height);
                    ctx.drawImage(img, (img.width - minSide) / 2, (img.height - minSide) / 2, minSide, minSide, 0, 0, maxSize, maxSize);
                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                };
                img.onerror = reject;
                img.src = ev.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function openProfileModal() {
        const profile = await window.UserAccountService.getProfile();
        const backdrop = document.getElementById('app-modal-backdrop');
        const sheet = document.getElementById('app-modal-sheet');
        const isCustomImage = profile.avatarType === 'image' && profile.avatar;
        const isCurrentlyResident = Boolean(profile.isResident && profile.outcode !== 'Visitor');
        const showResidentFields = profile.outcode !== 'Visitor';

        sheet.innerHTML = `
            <div class="modal-header">
                <h3>Explorer Profile</h3>
                <button class="modal-close-btn" id="modal-close-x" aria-label="Close">✕</button>
            </div>

            <div class="modal-body">
                <label class="field-label">Profile Picture</label>
                <div class="avatar-upload-row">
                    <div class="avatar-preview-circle" id="avatar-preview-box">
                        ${isCustomImage
                            ? `<img src="${profile.avatar}" alt="Avatar preview" />`
                            : `<span>${profile.avatar || '🧭'}</span>`}
                    </div>
                    <div class="avatar-upload-actions">
                        <label for="avatar-file-input" class="upload-photo-btn">📷 Upload Photo</label>
                        <input type="file" id="avatar-file-input" accept="image/*" hidden />
                        <span class="field-hint">Or pick a standard icon below</span>
                    </div>
                </div>

                <div class="avatar-picker-grid" id="avatar-picker">
                    ${AVATAR_CHOICES.map(emoji => `
                        <button type="button" class="avatar-opt ${!isCustomImage && profile.avatar === emoji ? 'selected' : ''}" data-avatar="${emoji}">
                            ${emoji}
                        </button>
                    `).join('')}
                </div>

                <label class="field-label" for="profile-username">Explorer Username (20 characters max, no spaces or special characters)</label>
                <input type="text" id="profile-username" class="modal-input" maxlength="20"
                       value="${profile.username.replace(/"/g, '&quot;')}" placeholder="Enter username" />

                <label class="field-label" for="profile-outcode">Home Postcode (Outcode)</label>
                <select id="profile-outcode" class="modal-input">
                    ${BS_OUTCODES.map(code => `
                        <option value="${code}" ${profile.outcode === code ? 'selected' : ''}>${code}</option>
                    `).join('')}
                </select>
                <p class="field-hint">Used for local BS postcode district leaderboards. No full address is ever stored.</p>

                                <div id="resident-upgrade-fields" style="display: ${showResidentFields ? 'flex' : 'none'}; flex-direction: column; gap: 10px; margin-top: 6px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.12);">
                    <div class="settings-group-title">Resident Leaderboard Registration</div>

                    <select id="profile-age-bracket" class="modal-input">
                        ${[
                            { value: 'under_18', label: 'Under 18' },
                            { value: '18_24', label: '18-24' },
                            { value: '25_34', label: '25-34' },
                            { value: '35_44', label: '35-44' },
                            { value: '45_54', label: '45-54' },
                            { value: '55_plus', label: '55+' }
                        ].map(b => `
                            <option value="${b.value}" ${profile.ageBracket === b.value ? 'selected' : ''}>${b.label}</option>
                        `).join('')}
                    </select>


                    ${!isCurrentlyResident ? `
                        <label class="field-label" for="profile-email">Email Address</label>
                        <input type="email" id="profile-email" class="modal-input" placeholder="you@example.com" />

                        <p class="field-hint">Links your progress permanently and unlocks BS district leaderboards and daily fun bits.</p>
                    ` : `
                        <p class="field-hint">✅ Registered BS Resident — your discoveries count toward the ${profile.outcode} leaderboard.</p>
                    `}
                </div>

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
        let selectedAvatarType = profile.avatarType || 'emoji';
        const previewBox = document.getElementById('avatar-preview-box');

        document.getElementById('modal-close-x').addEventListener('click', closeModal);

        document.getElementById('avatar-file-input').addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            selectedAvatar = await resizeImageFile(file, 96);
            selectedAvatarType = 'image';
            document.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
            previewBox.innerHTML = `<img src="${selectedAvatar}" alt="Avatar preview" />`;
        });

        document.querySelectorAll('.avatar-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.avatar-opt').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedAvatar = btn.dataset.avatar;
                selectedAvatarType = 'emoji';
                previewBox.innerHTML = `<span>${selectedAvatar}</span>`;
            });
        });

        const outcodeSelect = document.getElementById('profile-outcode');
        const residentBox = document.getElementById('resident-upgrade-fields');
        const saveBtn = document.getElementById('save-profile-btn');

        function syncFormMode() {
            const isVisitor = outcodeSelect.value === 'Visitor';
            residentBox.style.display = isVisitor ? 'none' : 'flex';
            if (isVisitor) {
                saveBtn.textContent = 'Save Visitor Profile';
            } else if (isCurrentlyResident) {
                saveBtn.textContent = 'Update Resident Profile';
            } else {
                saveBtn.textContent = 'Upgrade to Resident';
            }
        }

        outcodeSelect.addEventListener('change', syncFormMode);
        syncFormMode();

        saveBtn.addEventListener('click', async () => {
            const msg = document.getElementById('profile-save-msg');
            const rawName = document.getElementById('profile-username').value.trim();
            const username = rawName.length >= 2 ? rawName : 'BristolExplorer123';
            const outcode = outcodeSelect.value;
            const isVisitor = outcode === 'Visitor';

            try {
                msg.style.color = '#00b4d8';
                msg.textContent = 'Saving...';

                if (isVisitor) {
                    if (window.GameAPI && navigator.onLine) {
                        await window.GameAPI.updateProfile({
                            username,
                            avatar: selectedAvatar,
                            avatarType: selectedAvatarType,
                            outcode: 'Visitor',
                            ageBracket: null,
                            isResident: false
                        });
                    }
                    const saved = await window.UserAccountService.saveProfile({
                        username,
                        avatar: selectedAvatar,
                        avatarType: selectedAvatarType,
                        outcode: 'Visitor',
                        isResident: false
                    });
                    window.UserAccountService.renderProfileFab(saved);
                    msg.style.color = '#4ad66d';
                    msg.textContent = 'Visitor profile saved!';
                } else if (!isCurrentlyResident) {
                    const ageBracket = document.getElementById('profile-age-bracket').value;
                    const email = document.getElementById('profile-email').value.trim();

                    if (!email) {
                        throw new Error('Enter a valid email.');
                    }

                    await window.GameAPI.upgradeToResident({
                        email,
                        username,
                        avatar: selectedAvatar,
                        avatarType: selectedAvatarType,
                        outcode,
                        ageBracket
                    });

                    const saved = await window.UserAccountService.saveProfile({
                        username,
                        avatar: selectedAvatar,
                        avatarType: selectedAvatarType,
                        outcode,
                        ageBracket,
                        isResident: true
                    });
                    window.UserAccountService.renderProfileFab(saved);
                    msg.style.color = '#4ad66d';
                    msg.textContent = 'Upgraded to BS Resident!';
                } else {
                    const ageBracket = document.getElementById('profile-age-bracket').value;
                    if (window.GameAPI && navigator.onLine) {
                        await window.GameAPI.updateProfile({
                            username,
                            avatar: selectedAvatar,
                            avatarType: selectedAvatarType,
                            outcode,
                            ageBracket,
                            isResident: true
                        });
                    }
                    const saved = await window.UserAccountService.saveProfile({
                        username,
                        avatar: selectedAvatar,
                        avatarType: selectedAvatarType,
                        outcode,
                        ageBracket,
                        isResident: true
                    });
                    window.UserAccountService.renderProfileFab(saved);
                    msg.style.color = '#4ad66d';
                    msg.textContent = 'Resident profile updated!';
                }

                window.UserAccountService.triggerHaptic(30);
            } catch (err) {
                msg.style.color = '#f87171';
                msg.textContent = err.message || 'Could not save profile.';
            }
            setTimeout(() => { msg.textContent = ''; }, 3000);
        });

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

                <div class="settings-group-title" style="margin-top: 14px;">Feedback & Bug Reports</div>
                <button type="button" id="toggle-feedback-btn" class="upload-photo-btn" style="width: 100%; text-align: center; justify-content: center;">
                    🐞 Report a Bug or Suggest an Improvement
                </button>

                <div id="feedback-form-box" style="display: none; flex-direction: column; gap: 10px; margin-top: 10px; padding: 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12);">
                    <label class="field-label" for="feedback-category">Report Type</label>
                    <select id="feedback-category" class="modal-input">
                        <option value="bug">🐞 Bug / Glitch</option>
                        <option value="improvement">💡 Game Improvement / Idea</option>
                        <option value="other">💬 General Feedback</option>
                    </select>

                    <label class="field-label" for="feedback-text">Details (max 1000 characters)</label>
                    <textarea id="feedback-text" class="modal-input" rows="4" maxlength="1000"
                              placeholder="Describe what happened or what you'd love to see in Bristol..."
                              style="resize: vertical; font-family: inherit;"></textarea>

                    <button type="button" id="submit-feedback-btn" class="modal-primary-btn">Send Report</button>
                    <div id="feedback-status-msg" class="modal-feedback"></div>
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

        // Toggle & submit bug/improvement report
        const toggleFeedbackBtn = document.getElementById('toggle-feedback-btn');
        const feedbackBox = document.getElementById('feedback-form-box');
        const submitFeedbackBtn = document.getElementById('submit-feedback-btn');
        const feedbackText = document.getElementById('feedback-text');
        const feedbackCategory = document.getElementById('feedback-category');
        const feedbackMsg = document.getElementById('feedback-status-msg');

        toggleFeedbackBtn.addEventListener('click', () => {
            const isHidden = feedbackBox.style.display === 'none';
            feedbackBox.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                feedbackText.focus();
            }
        });

        submitFeedbackBtn.addEventListener('click', async () => {
            const message = feedbackText.value.trim();
            const category = feedbackCategory.value;

            if (message.length < 5) {
                feedbackMsg.style.color = '#f87171';
                feedbackMsg.textContent = 'Please enter at least 5 characters.';
                return;
            }

            if (!navigator.onLine || !window.GameAPI || typeof window.GameAPI.submitFeedback !== 'function') {
                feedbackMsg.style.color = '#f87171';
                feedbackMsg.textContent = 'You need an internet connection to send a report.';
                return;
            }

            submitFeedbackBtn.disabled = true;
            feedbackMsg.style.color = '#00b4d8';
            feedbackMsg.textContent = 'Sending report...';

            try {
                await window.GameAPI.submitFeedback({ message, category });
                window.UserAccountService.triggerHaptic(35);
                feedbackText.value = '';
                feedbackMsg.style.color = '#4ad66d';
                feedbackMsg.textContent = 'Thanks! Your report has been sent.';
                setTimeout(() => {
                    feedbackMsg.textContent = '';
                    feedbackBox.style.display = 'none';
                }, 2000);
            } catch (err) {
                feedbackMsg.style.color = '#f87171';
                feedbackMsg.textContent = err.message || 'Could not send report. Please try again.';
            } finally {
                submitFeedbackBtn.disabled = false;
            }
        });
    }

    async function init() {
        buildModalShell();
        window.UserAccountService.applySettingsToDOM();

        const profile = await window.UserAccountService.getProfile();
        const profileBtn = document.getElementById('profile-btn');
        const settingsBtn = document.getElementById('settings-btn');

        if (profileBtn) {
            window.UserAccountService.renderProfileFab(profile);
            profileBtn.addEventListener('click', openProfileModal);
        }

        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettingsModal);
        }
    }

    window.addEventListener('DOMContentLoaded', init);

    return { openProfileModal, openSettingsModal, closeModal };
})();
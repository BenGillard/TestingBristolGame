window.DailiesUI = (function() {
    const STORAGE_KEY = "bristol_dailies_v1";

    // Built-in fallback queue if offline or before external JSON is created
    const FALLBACK_CONTENT = {
        checkin: {
            reward: { type: "stone", amount: 1 }
        },
        puzzle: {
            question: "Which Bristol bridge opened in 1864 and spans the Avon Gorge?",
            answer: "Clifton Suspension Bridge",
            reward: { type: "stone", amount: 2 }
        },
        poll: {
            question: "What feature should we add next?",
            options: ["Treasure hunts", "Player created treasures", "Next generation collectibles", "Trooper's Hill"],
            reward: { type: "water", amount: 1 }
        },
        advert: {
            sponsor: "Local Bristol Spot",
            headline: "Show your explorer badge for 10% off coffee!",
            cta: "Claim Sponsor Bonus",
            reward: { type: "wood", amount: 1 }
        },
        challenge: {
            title: "Neighbourhood Scout",
            description: "Claim 3 mystery caches anywhere in BS today.",
            target: 3,
            reward: { type: "metal", amount: 2 }
        }
    };

    let state = loadState();
    let todayContent = FALLBACK_CONTENT;

    function getMidnightDateKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function loadState() {
        const todayKey = getMidnightDateKey();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // Reset daily flags if a new midnight cycle has started
                if (parsed.dateKey !== todayKey) {
                    const isConsecutive = isYesterday(parsed.dateKey, todayKey);
                    return {
                        dateKey: todayKey,
                        streak: isConsecutive ? (parsed.streak || 0) : 0,
                        checkedIn: false,
                        puzzleSolved: false,
                        pollVote: null,
                        advertClaimed: false,
                        challengeProgress: 0,
                        challengeClaimed: false
                    };
                }
                return parsed;
            }
        } catch (e) {
            console.warn("Dailies save reset:", e);
        }

        return {
            dateKey: todayKey,
            streak: 0,
            checkedIn: false,
            puzzleSolved: false,
            pollVote: null,
            advertClaimed: false,
            challengeProgress: 0,
            challengeClaimed: false
        };
    }

    function isYesterday(prevKey, todayKey) {
        if (!prevKey) return false;
        const prev = new Date(prevKey + "T00:00:00");
        const today = new Date(todayKey + "T00:00:00");
        const diffDays = Math.round((today - prev) / (1000 * 60 * 60 * 24));
        return diffDays === 1;
    }

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function formatRewardBadge(reward) {
        const CM = window.CollectibleManager;
        if (!CM || !reward || !CM.styles[reward.type]) return "";
        const style = CM.styles[reward.type];
        return `+${reward.amount} ${style.icon} ${style.label}`;
    }

    function awardPlayer(reward) {
        const CM = window.CollectibleManager;
        if (!CM || !reward) return;
        CM.grantResource(reward.type, reward.amount);

        // Refresh top resource counters immediately
        const inv = CM.getInventory();
        const elStone = document.getElementById('count-stone');
        const elWood = document.getElementById('count-wood');
        const elWater = document.getElementById('count-water');
        const elMetal = document.getElementById('count-metal');
        if (elStone) elStone.textContent = inv.stone;
        if (elWood) elWood.textContent = inv.wood;
        if (elWater) elWater.textContent = inv.water;
        if (elMetal) elMetal.textContent = inv.metal;
    }

    // Called by game.js whenever the player claims a map cache
    function recordCacheClaim() {
        state = loadState();
        if (state.challengeProgress < todayContent.challenge.target) {
            state.challengeProgress += 1;
            persist();
            render();
        }
    }

    const GEN1_POOL = ["stone", "wood", "water", "metal"];

    function rollRandomGen1Reward(amount = 1) {
        const randomType = GEN1_POOL[Math.floor(Math.random() * GEN1_POOL.length)];
        return { type: randomType, amount };
    }



    // Fetch queued daily content keyed by YYYY-MM-DD from external JSON
    async function loadScheduledContent() {
        const todayKey = getMidnightDateKey();
        try {
            const res = await fetch(`data/daily_schedule.json?v=${todayKey}`);
            if (!res.ok) return;
            const schedule = await res.json();
            if (schedule[todayKey]) {
                todayContent = { ...FALLBACK_CONTENT, ...schedule[todayKey] };
            }
        } catch (_) {
            // Offline or no schedule file yet — keep FALLBACK_CONTENT
        }
    }

    function render() {
        // Re-check midnight rollover every time the tab opens
        state = loadState();
        const container = document.getElementById('dailies-content');
        if (!container) return;

        container.innerHTML = `
            <div class="dailies-stack">
                                <!-- 1. Daily Check-In -->
                <div class="daily-card ${state.checkedIn ? 'completed' : ''}">
                    <div class="daily-card-top">
                        <span class="daily-badge">✅ Daily Check-In</span>
                        <span class="daily-reward">Streak: ${state.streak} 🔥 | +1 🎲 Gen 1</span>
                    </div>
                    <p class="daily-desc">Log in each day after midnight to keep your Bristol explorer streak alive.</p>
                    <button class="daily-btn" id="btn-daily-checkin" ${state.checkedIn ? 'disabled' : ''}>
                        ${state.checkedIn ? 'Checked In Today' : 'Claim Daily Check-In'}
                    </button>
                </div>

                <!-- 2. Daily Puzzle -->
                <div class="daily-card ${state.puzzleSolved ? 'completed' : ''}">
                    <div class="daily-card-top">
                        <span class="daily-badge">🧩 Daily Puzzle</span>
                        <span class="daily-reward">+1 🎲 Gen 1</span>
                    </div>
                    <p class="daily-desc">${todayContent.puzzle.question}</p>
                    <button class="daily-btn" id="btn-daily-puzzle" ${state.puzzleSolved ? 'disabled' : ''}>
                        ${state.puzzleSolved ? `Solved: ${todayContent.puzzle.answer}` : 'Solve Today’s Puzzle'}
                    </button>
                </div>

                <!-- 3. Daily Poll -->
                <div class="daily-card ${state.pollVote ? 'completed' : ''}">
                    <div class="daily-card-top">
                        <span class="daily-badge">📊 Daily Poll</span>
                        <span class="daily-reward">+1 🎲 Gen 1</span>
                    </div>
                    <p class="daily-desc">${todayContent.poll.question}</p>
                    <div class="poll-options">
                        ${todayContent.poll.options.map(opt => `
                            <button class="poll-opt-btn ${state.pollVote === opt ? 'selected' : ''}" 
                                    data-opt="${opt}" ${state.pollVote ? 'disabled' : ''}>
                                ${opt}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <!-- 4. Daily Advert (No Reward Button) -->
                <div class="daily-card">
                    <div class="daily-card-top">
                        <span class="daily-badge">📣 Daily Sponsor</span>
                    </div>
                    <p class="daily-desc"><strong>${todayContent.advert.sponsor}:</strong> ${todayContent.advert.headline}</p>
                </div>

                <!-- 5. Daily Challenge -->
                <div class="daily-card ${state.challengeClaimed ? 'completed' : ''}">
                    <div class="daily-card-top">
                        <span class="daily-badge">🎯 Daily Challenge</span>
                        <span class="daily-reward">+1 🎲 Gen 1</span>
                    </div>
                    <p class="daily-desc"><strong>${todayContent.challenge.title}:</strong> ${todayContent.challenge.description}</p>
                    <button class="daily-btn" id="btn-daily-challenge" 
                            ${(state.challengeClaimed || state.challengeProgress < todayContent.challenge.target) ? 'disabled' : ''}>
                        ${state.challengeClaimed 
                            ? 'Challenge Complete' 
                            : state.challengeProgress >= todayContent.challenge.target 
                                ? 'Claim Challenge Reward' 
                                : `Progress: ${state.challengeProgress} / ${todayContent.challenge.target}`}
                    </button>
                </div>

            </div>
        `;

        bindEvents();
    }

    function bindEvents() {
        const checkinBtn = document.getElementById('btn-daily-checkin');
        if (checkinBtn && !state.checkedIn) {
            checkinBtn.addEventListener('click', () => {
                state.checkedIn = true;
                state.streak += 1;
                awardPlayer(rollRandomGen1Reward(1));
                persist();
                render();
            });
        }

        const puzzleBtn = document.getElementById('btn-daily-puzzle');
        if (puzzleBtn && !state.puzzleSolved) {
            puzzleBtn.addEventListener('click', () => {
                state.puzzleSolved = true;
                awardPlayer(rollRandomGen1Reward(1));
                persist();
                render();
            });
        }

        document.querySelectorAll('.poll-opt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (state.pollVote) return;
                state.pollVote = btn.dataset.opt;
                awardPlayer(rollRandomGen1Reward(1));
                persist();
                render();
            });
        });

        const challengeBtn = document.getElementById('btn-daily-challenge');
        if (challengeBtn && !state.challengeClaimed && state.challengeProgress >= todayContent.challenge.target) {
            challengeBtn.addEventListener('click', () => {
                state.challengeClaimed = true;
                awardPlayer(rollRandomGen1Reward(1));
                persist();
                render();
            });
        }
    }

    // Preload external schedule once on startup
    loadScheduledContent().then(() => render());

    return { render, recordCacheClaim };

})();

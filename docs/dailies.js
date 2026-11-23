window.DailiesUI = (function() {
    const STORAGE_KEY = "bristol_dailies_v1";

    // Built-in fallback queue if offline or before external JSON is created
    const FALLBACK_CONTENT = {
        checkin: {
            reward: { type: "stone", amount: 1 }
        },
        puzzle: {
            question: "Which Bristol bridge opened in 1864 and spans the Avon Gorge?",
            options: [
                "Clifton Suspension Bridge",
                "Pero's Bridge",
                "Prince Street Bridge",
                "Bristol Bridge"
            ],
            answerIndex: 0,
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
    let pendingPuzzleChoice = null;
    let pendingPollChoice = null;

    function getMidnightDateKey() {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    }

    function defaultState(todayKey, streak = 0) {
        return {
            dateKey: todayKey,
            streak,
            checkedIn: false,
            checkinRewardText: "",
            puzzleAttempted: false,
            puzzleSelectedIndex: null,
            puzzleSolved: false,
            puzzleRewardText: "",
            pollVote: null,
            pollRewardText: "",
            advertClaimed: false,
            challengeProgress: 0,
            challengeClaimed: false,
            challengeRewardText: ""
        };
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
                    return defaultState(todayKey, isConsecutive ? (parsed.streak || 0) : 0);
                }
                // Backwards compatibility if older save had puzzleSolved without puzzleAttempted
                if (parsed.puzzleSolved && typeof parsed.puzzleAttempted !== 'boolean') {
                    parsed.puzzleAttempted = true;
                }
                return parsed;
            }
        } catch (e) {
            console.warn("Dailies save reset:", e);
        }

        return defaultState(todayKey, 0);
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
        if (!CM || !reward) return "";
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

        return formatRewardBadge(reward);
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

    // Fetch queued daily content keyed by YYYY-MM-DD from Supabase RPC
    async function loadScheduledContent() {
        if (!window.GameAPI) return;
        try {
            const row = await window.GameAPI.getTodaySchedule();
            if (!row) return;

            const options = Array.isArray(row.puzzle_options) && row.puzzle_options.length > 0
                ? row.puzzle_options
                : FALLBACK_CONTENT.puzzle.options;
            const answerIndex = typeof row.puzzle_answer_index === 'number'
                ? row.puzzle_answer_index
                : 0;

            todayContent = {
                ...FALLBACK_CONTENT,
                puzzle: {
                    question: row.puzzle_question,
                    options,
                    answerIndex,
                    reward: { type: "stone", amount: 1 }
                },
                poll: row.poll_question ? {
                    question: row.poll_question,
                    options: row.poll_options || [],
                    reward: { type: "water", amount: 1 }
                } : null,
                challenge: {
                    title: "Daily Bristol Challenge",
                    description: row.challenge_text,
                    target: 3,
                    reward: { type: "metal", amount: 1 }
                }
            };
        } catch (err) {
            console.warn("Using offline fallback dailies:", err.message);
        }
    }

    function render() {
        // Re-check midnight rollover every time the tab opens
        state = loadState();
        const container = document.getElementById('dailies-content');
        if (!container) return;

        const puzzleOptions = todayContent.puzzle.options || [];
        const correctIdx = Number(todayContent.puzzle.answerIndex);
        const correctLabel = puzzleOptions[correctIdx] || "Solved";
        const activePuzzleSelection = state.puzzleAttempted ? state.puzzleSelectedIndex : pendingPuzzleChoice;

        const activePollSelection = state.pollVote || pendingPollChoice;

        const pollCardHtml = todayContent.poll ? `
            <!-- 3. Daily Poll (18+ Residents Only) -->
            <div class="daily-card ${state.pollVote ? 'completed' : ''}">
                <div class="daily-card-top">
                    <span class="daily-badge">📊 Daily Poll</span>
                    <span class="daily-reward">+1 🎲 Gen 1</span>
                </div>
                <p class="daily-desc">${todayContent.poll.question}</p>
                <div class="poll-options">
                    ${todayContent.poll.options.map((opt, idx) => `
                        <button class="poll-opt-btn ${activePollSelection === opt ? 'selected' : ''}" 
                                data-opt="${opt}" data-index="${idx}" ${state.pollVote ? 'disabled' : ''}>
                            ${opt}
                        </button>
                    `).join('')}
                </div>
                <button class="daily-btn poll-submit-btn" id="btn-submit-poll"
                        ${(state.pollVote || !pendingPollChoice) ? 'disabled' : ''}>
                    ${state.pollVote
                        ? `Vote Submitted (${state.pollRewardText || 'Reward Claimed'})`
                        : pendingPollChoice
                            ? `Submit Vote: "${pendingPollChoice}"`
                            : 'Select an option to submit'}
                </button>
            </div>
        ` : '';

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
                        ${state.checkedIn
                            ? `Checked In (${state.checkinRewardText || 'Reward Claimed'})`
                            : 'Claim Daily Check-In'}
                    </button>
                </div>

                <!-- 2. Daily Puzzle -->
                <div class="daily-card ${state.puzzleAttempted ? 'completed' : ''}">
                    <div class="daily-card-top">
                        <span class="daily-badge">🧩 Daily Puzzle</span>
                        <span class="daily-reward">+1 🎲 Gen 1</span>
                    </div>
                    <p class="daily-desc">${todayContent.puzzle.question}</p>
                    <div class="poll-options">
                        ${puzzleOptions.map((opt, idx) => {
                            let extraStyle = '';
                            let suffix = '';
                            if (state.puzzleAttempted) {
                                if (idx === correctIdx) {
                                    extraStyle = 'border-color: #4ad66d; color: #4ad66d;';
                                    suffix = ' ✅';
                                } else if (idx === state.puzzleSelectedIndex) {
                                    extraStyle = 'border-color: #f87171; color: #f87171;';
                                    suffix = ' ❌';
                                }
                            }
                            return `
                                <button class="poll-opt-btn puzzle-opt-btn ${activePuzzleSelection === idx ? 'selected' : ''}" 
                                        data-index="${idx}" style="${extraStyle}" ${state.puzzleAttempted ? 'disabled' : ''}>
                                    ${opt}${suffix}
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <button class="daily-btn" id="btn-daily-puzzle"
                            ${(state.puzzleAttempted || pendingPuzzleChoice === null) ? 'disabled' : ''}>
                        ${state.puzzleAttempted
                            ? (state.puzzleSolved
                                ? `Correct! (${state.puzzleRewardText || 'Reward Claimed'})`
                                : `Incorrect — Answer: ${correctLabel}`)
                            : pendingPuzzleChoice !== null
                                ? `Submit Answer: "${puzzleOptions[pendingPuzzleChoice]}"`
                                : 'Select an answer to submit'}
                    </button>
                </div>

                ${pollCardHtml}

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
                            ? `Challenge Complete (${state.challengeRewardText || 'Reward Claimed'})` 
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
                state.checkinRewardText = awardPlayer(rollRandomGen1Reward(1));
                persist();
                render();
            });
        }

        // Puzzle option selection
        document.querySelectorAll('.puzzle-opt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (state.puzzleAttempted) return;
                pendingPuzzleChoice = Number(btn.dataset.index);
                render();
            });
        });

        // Puzzle answer submission (only awards collectible if correct)
        const puzzleBtn = document.getElementById('btn-daily-puzzle');
        if (puzzleBtn && !state.puzzleAttempted && pendingPuzzleChoice !== null) {
            puzzleBtn.addEventListener('click', () => {
                const chosenIdx = pendingPuzzleChoice;
                const isCorrect = chosenIdx === Number(todayContent.puzzle.answerIndex);

                state.puzzleAttempted = true;
                state.puzzleSelectedIndex = chosenIdx;
                state.puzzleSolved = isCorrect;
                pendingPuzzleChoice = null;

                if (isCorrect) {
                    state.puzzleRewardText = awardPlayer(rollRandomGen1Reward(1));
                    if (window.UserAccountService) {
                        window.UserAccountService.triggerHaptic(50);
                    }
                } else {
                    state.puzzleRewardText = "";
                }

                persist();
                render();
            });
        }

        // Poll option selection
        document.querySelectorAll('.poll-opt-btn:not(.puzzle-opt-btn)').forEach(btn => {
            btn.addEventListener('click', () => {
                if (state.pollVote) return;
                pendingPollChoice = btn.dataset.opt;
                render();
            });
        });

        // Poll submission (also records vote in Supabase poll_votes)
        const submitPollBtn = document.getElementById('btn-submit-poll');
        if (submitPollBtn && !state.pollVote && pendingPollChoice && todayContent.poll) {
            submitPollBtn.addEventListener('click', async () => {
                const chosenOpt = pendingPollChoice;
                const optIndex = todayContent.poll.options.indexOf(chosenOpt);
                submitPollBtn.disabled = true;

                try {
                    if (window.GameAPI && optIndex >= 0 && navigator.onLine) {
                        await window.GameAPI.submitPollVote(optIndex);
                    }
                } catch (err) {
                    console.warn("Poll cloud submit warning:", err.message);
                }

                state.pollVote = chosenOpt;
                pendingPollChoice = null;
                state.pollRewardText = awardPlayer(rollRandomGen1Reward(1));
                persist();
                render();
            });
        }

        const challengeBtn = document.getElementById('btn-daily-challenge');
        if (challengeBtn && !state.challengeClaimed && state.challengeProgress >= todayContent.challenge.target) {
            challengeBtn.addEventListener('click', () => {
                state.challengeClaimed = true;
                state.challengeRewardText = awardPlayer(rollRandomGen1Reward(1));
                persist();
                render();
            });
        }
    }

    // Preload external schedule once on startup
    loadScheduledContent().then(() => render());

    return { render, recordCacheClaim };
})();


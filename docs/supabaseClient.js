// js/supabaseClient.js
const SUPABASE_URL = 'https://ghqdlwazhfvyayanlhli.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_NL8Kv6zmsxwoEV7z1e2tGg_78_R0Pnk';

// Initialise the global client
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GameAPI = {
  // Local storage keys for offline caching & action queuing
  CACHE_KEYS: {
    SCHEDULE: 'bristol_game_daily_schedule',
    INVENTORY: 'bristol_game_inventory',
    QUEUE: 'bristol_game_offline_queue',
    VOTED_DATE: 'bristol_game_poll_voted_date'
  },

  // Helper: Get current Bristol/UK date string (YYYY-MM-DD)
  getUKDateString() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  },

  // ==========================================================================
  // 1. AUTHENTICATION (Visitor-to-Resident Flow)
  // ==========================================================================

  // Call once on app boot to ensure every Visitor has an anonymous session
  async initSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) console.error('Anonymous sign-in failed:', error.message);
      return data?.user || null;
    }
    // Attempt to flush any offline claims when app boots online
    this.flushOfflineQueue();
    return session.user;
  },

  // Upgrade Visitor to a permanent Resident account
  async upgradeToResident({ email, password, username, outcode, ageBracket }) {
    // 1. Link email & password to the existing anonymous user ID
    const { error: authError } = await sb.auth.updateUser({ email, password });
    if (authError) throw authError;

    // 2. Save validated profile details via secure RPC
    const { error: rpcError } = await sb.rpc('update_player_profile', {
      p_username: username,
      p_outcode: outcode,
      p_age_bracket: ageBracket,
      p_is_resident: true
    });
    if (rpcError) throw rpcError;

    return true;
  },

  // Update username, BS outcode, or age bracket for an existing profile
  async updateProfile({ username, outcode, ageBracket, isResident }) {
    const { error } = await sb.rpc('update_player_profile', {
      p_username: username,
      p_outcode: outcode,
      p_age_bracket: ageBracket,
      p_is_resident: isResident
    });
    if (error) throw error;
    return true;
  },

  // ==========================================================================
  // 2. INVENTORY & ANTI-CHEAT CLAIMING (With Offline Queue)
  // ==========================================================================

  // Fetch server inventory and sync to localStorage cache
  async getInventory() {
    try {
      const { data, error } = await sb
        .from('inventory')
        .select('item_key, quantity, discovered_recipe');
      
      if (error) throw error;
      localStorage.setItem(this.CACHE_KEYS.INVENTORY, JSON.stringify(data));
      return data;
    } catch (err) {
      console.warn('Offline: serving cached inventory');
      return JSON.parse(localStorage.getItem(this.CACHE_KEYS.INVENTORY) || '[]');
    }
  },

  // Claim a collectible (queues locally if signal drops in tunnels/pubs)
  async claimCollectible(itemKey, lat, lng) {
    if (!navigator.onLine) {
      this._queueOfflineClaim({ itemKey, lat, lng, timestamp: Date.now() });
      return { status: 'queued_offline', item: itemKey };
    }

    const { data, error } = await sb.rpc('claim_collectible', {
      p_item_key: itemKey,
      p_lat: lat,
      p_lng: lng
    });

    if (error) {
      // If network drops mid-request, save to queue
      if (error.message.includes('Failed to fetch')) {
        this._queueOfflineClaim({ itemKey, lat, lng, timestamp: Date.now() });
        return { status: 'queued_offline', item: itemKey };
      }
      throw error;
    }

    return data;
  },

  // Craft a Tier 2 item in the Forge
  async craftForgeItem(resultItemKey) {
    const { data, error } = await sb.rpc('craft_forge_item', {
      p_result_item_key: resultItemKey
    });
    if (error) throw error;
    return data;
  },

  _queueOfflineClaim(claimObj) {
    const queue = JSON.parse(localStorage.getItem(this.CACHE_KEYS.QUEUE) || '[]');
    queue.push(claimObj);
    localStorage.setItem(this.CACHE_KEYS.QUEUE, JSON.stringify(queue));
  },

  // Replay queued claims sequentially when connection returns
  async flushOfflineQueue() {
    if (!navigator.onLine) return;
    const queue = JSON.parse(localStorage.getItem(this.CACHE_KEYS.QUEUE) || '[]');
    if (queue.length === 0) return;

    const remaining = [];
    for (const item of queue) {
      const { error } = await sb.rpc('claim_collectible', {
        p_item_key: item.itemKey,
        p_lat: item.lat,
        p_lng: item.lng
      });
      // Keep in queue only if it was a network error; drop if rejected by anti-cheat
      if (error && error.message.includes('Failed to fetch')) {
        remaining.push(item);
      }
    }
    localStorage.setItem(this.CACHE_KEYS.QUEUE, JSON.stringify(remaining));
  },

  // ==========================================================================
  // 3. DAILY SCHEDULE & ZERO-TRACKING POLLS
  // ==========================================================================

  // Fetch today's UK schedule (uses cache if already fetched today)
  async getTodaySchedule(forceRefresh = false) {
    const todayUK = this.getUKDateString();
    const cached = JSON.parse(localStorage.getItem(this.CACHE_KEYS.SCHEDULE) || 'null');

    if (!forceRefresh && cached && cached.active_date === todayUK) {
      return cached;
    }

    try {
      const { data, error } = await sb.rpc('get_today_schedule');
      if (error) throw error;

      if (data) {
        localStorage.setItem(this.CACHE_KEYS.SCHEDULE, JSON.stringify(data));
        return data;
      }
    } catch (err) {
      console.warn('Could not fetch live daily schedule, falling back to cache:', err.message);
    }

    return cached; // Fallback to last cached schedule if offline
  },

  // Submit anonymous daily poll vote (18+ Residents only)
  async submitPollVote(optionIndex) {
    const todayUK = this.getUKDateString();
    if (localStorage.getItem(this.CACHE_KEYS.VOTED_DATE) === todayUK) {
      throw new Error('You have already voted in today’s poll.');
    }

    const { error } = await sb.rpc('submit_poll_vote', {
      p_option_index: optionIndex
    });
    if (error) throw error;

    // Store only today's date locally to prevent double-voting without server tracking
    localStorage.setItem(this.CACHE_KEYS.VOTED_DATE, todayUK);
    return true;
  },

  // Fetch live aggregate poll results for today
  async getTodayPollResults() {
    const todayUK = this.getUKDateString();
    const { data, error } = await sb
      .from('poll_votes')
      .select('option_index, vote_count')
      .eq('active_date', todayUK);

    if (error) throw error;
    return data || [];
  },

  // ==========================================================================
  // 4. LEADERBOARDS
  // ==========================================================================

  // Fetch top 100 individual residents
  async getIndividualLeaderboard() {
    const { data, error } = await sb
      .from('leaderboard_individual')
      .select('*');
    if (error) throw error;
    return data || [];
  },

  // Fetch aggregated Bristol BS outcode rankings
  async getOutcodeLeaderboard() {
    const { data, error } = await sb
      .from('leaderboard_outcodes')
      .select('*');
    if (error) throw error;
    return data || [];
  }
};

// Automatically sync offline claims when connection restores or iOS Safari wakes up
window.addEventListener('online', () => GameAPI.flushOfflineQueue());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    GameAPI.flushOfflineQueue();
    GameAPI.getTodaySchedule(); // Refresh if Bristol midnight passed while asleep
  }
});

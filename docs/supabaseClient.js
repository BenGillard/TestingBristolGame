// Debugging helper to show errors in a fixed banner at the top of the page
window.showDebugError = function(step, err) {
  console.error(`[Supabase Debug - ${step}]`, err);
  let banner = document.getElementById('sb-debug-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'sb-debug-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#d90429;color:#fff;padding:12px;font-family:monospace;font-size:12px;word-break:break-word;';
    document.body.prepend(banner);
  }
  banner.innerHTML += `<div><strong>FAIL [${step}]:</strong> ${err?.message || err}</div>`;
};

const SUPABASE_URL = 'https://ghqdlwazhfvyayanlhli.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NL8Kv6zmsxwoEV7z1e2tGg_78_R0Pnk';

window.sb = window.sb || null;
try {
  if (!window.supabase) {
    throw new Error('window.supabase is undefined (CDN script failed to load)');
  }
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (err) {
  window.showDebugError('1. Client Init', err);
}

const GameAPI = {
  // Local storage keys for offline caching & action queuing
  CACHE_KEYS: {
    SCHEDULE: 'bristol_game_daily_schedule',
    INVENTORY: 'bristol_game_inventory',
    QUEUE: 'bristol_offline_actions_v1', // Unified chronological queue
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

   // Upgrade Visitor to a permanent Resident account (BS1–BS49 + Age Bracket + Email/Password)
  async upgradeToResident({ email, password, username, avatar, avatarType, outcode, ageBracket }) {
    // Ensure an anonymous session exists before linking email/password
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      await this.initSession();
    }

    // 1. Link email & password to the existing anonymous user ID
    const { error: authError } = await sb.auth.updateUser({ email, password });
    if (authError) throw authError;

    // 2. Save validated Resident profile details via secure RPC
  const { error: rpcError } = await sb.rpc('update_player_profile', {
    p_username: username,
    p_email: email, // Added to match SQL signature
    p_avatar: avatar || '🧭',
    p_avatar_type: avatarType || 'emoji',
    p_outcode: outcode,
    p_age_bracket: ageBracket,
    p_is_resident: true
  });
    if (rpcError) throw rpcError;

    // 3. Flush any pending offline claims first
    await this.flushOfflineQueue();

    // 4. Read exact local save from CollectibleManager / bristol_game_save_v1
    const itemsMap = new Map();
    const CM = window.CollectibleManager;
    const rawSave = JSON.parse(localStorage.getItem('bristol_game_save_v1') || '{}');

    const gen1 = (CM && typeof CM.getInventory === 'function' ? CM.getInventory() : rawSave.inventory) || {};
    const gen2 = (CM && typeof CM.getCrafted === 'function' ? CM.getCrafted() : rawSave.crafted) || {};
    const discovered = (CM && typeof CM.getDiscovered === 'function' ? CM.getDiscovered() : rawSave.discovered) || [];

    let gen1Total = 0;
    Object.entries(gen1).forEach(([item_key, quantity]) => {
      const qty = Number(quantity) || 0;
      gen1Total += qty;
      if (qty > 0) {
        itemsMap.set(item_key, { item_key, quantity: qty, discovered_recipe: false });
      }
    });

    let gen2Total = 0;
    Object.entries(gen2).forEach(([item_key, quantity]) => {
      const qty = Number(quantity) || 0;
      gen2Total += qty;
      if (qty > 0) {
        itemsMap.set(item_key, { item_key, quantity: qty, discovered_recipe: true });
      }
    });

    discovered.forEach(item_key => {
      const existing = itemsMap.get(item_key);
      itemsMap.set(item_key, {
        item_key,
        quantity: existing ? existing.quantity : 0,
        discovered_recipe: true
      });
    });

    // Calculate lifetime collectibles found:
    // Each 2nd-gen crafted item consumed 2x 1st-gen collectibles, plus count claimed nodes directly
    const claimedNodesCount =
      (Array.isArray(rawSave.claimedGlobalIds) ? rawSave.claimedGlobalIds.length : 0) +
      (Array.isArray(rawSave.claimedScheduledKeys) ? rawSave.claimedScheduledKeys.length : 0) +
      (Array.isArray(rawSave.personalNodes) ? rawSave.personalNodes.filter(n => n.claimed).length : 0);

    const localTotalDiscovered = Math.max(gen1Total + (gen2Total * 2), claimedNodesCount);
    const itemsPayload = Array.from(itemsMap.values());

    // 5. Sync merged items & discovery totals up to Supabase
    if (itemsPayload.length > 0 || localTotalDiscovered > 0) {
      const { error: syncError } = await sb.rpc('sync_local_inventory', {
        p_items: itemsPayload,
        p_total_discovered: localTotalDiscovered
      });
      if (syncError) throw syncError;
    }

    // 6. Refresh local cache with authoritative server inventory
    await this.getInventory();

    return true;
  },

  // Update Visitor profile (or existing Resident details without re-linking auth)
  async updateProfile({ username, avatar, avatarType, outcode = 'Visitor', ageBracket = null, isResident = false }) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      await this.initSession();
    }

  const { error } = await sb.rpc('update_player_profile', {
    p_username: username,
    p_email: null, // Added to match SQL signature
    p_avatar: avatar || '🧭',
    p_avatar_type: avatarType || 'emoji',
    p_outcode: outcode,
    p_age_bracket: isResident ? ageBracket : null,
    p_is_resident: isResident
  });
    if (error) throw error;
    return true;
  },

  // Delete the current Resident account and all associated data (irreversible)
    async deleteAccount() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const { error } = await sb.rpc('delete_my_account');
      if (error) throw error;
      await sb.auth.signOut();
    }
    Object.values(this.CACHE_KEYS).forEach(key => localStorage.removeItem(key));
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

  _enqueueOfflineAction(action) {
  const queue = JSON.parse(localStorage.getItem(this.CACHE_KEYS.QUEUE) || '[]');
  queue.push({
    ...action,
    queuedAt: new Date().toISOString()
  });
  localStorage.setItem(this.CACHE_KEYS.QUEUE, JSON.stringify(queue));
},

  // Claim a collectible (queues locally if signal drops in tunnels/pubs)
  async claimCollectible(itemKey, lat, lng, claimedAt = new Date().toISOString()) {
    const queue = JSON.parse(localStorage.getItem(this.CACHE_KEYS.QUEUE) || '[]');

    if (!navigator.onLine || queue.length > 0) {
      this._enqueueOfflineAction({ type: 'claim', itemKey, lat, lng, claimedAt });
      return { status: 'queued_offline', item: itemKey };
    }

    const { data, error } = await sb.rpc('claim_collectible', {
      p_item_key: itemKey,
      p_lat: lat,
      p_lng: lng,
      p_claimed_at: claimedAt
    });

    if (error) {
      // If network drops mid-request, save to queue
      if (error.message.includes('Failed to fetch')) {
        this._enqueueOfflineAction({ type: 'claim', itemKey, lat, lng, claimedAt });
        return { status: 'queued_offline', item: itemKey };
      }
      throw error;
    }

    if (data?.inventory && window.CollectibleManager?.applyServerInventory) {
    window.CollectibleManager.applyServerInventory(data.inventory);
  }
    return data;
  },

  // Craft a Tier 2 item in the Forge
  async craftForgeItem(resultItemKey) {
    const queue = JSON.parse(localStorage.getItem(this.CACHE_KEYS.QUEUE) || '[]');

    // Queue behind any pending offline claims so ingredients exist on the server first
    if (!navigator.onLine || queue.length > 0) {
      this._enqueueOfflineAction({ type: 'craft', resultItemKey });
      return { status: 'queued_offline', item: resultItemKey };
    }

    const { data, error } = await sb.rpc('craft_forge_item', {
      p_result_item_key: resultItemKey
    });

    if (error) {
      if (error.message.includes('Failed to fetch')) {
        this._enqueueOfflineAction({ type: 'craft', resultItemKey });
        return { status: 'queued_offline', item: resultItemKey };
      }
      throw error;
    }

    if (data?.inventory && window.CollectibleManager?.applyServerInventory) {
      window.CollectibleManager.applyServerInventory(data.inventory);
    }
    return data;
  },

  // Replay queued claims sequentially when connection returns
  async flushOfflineQueue() {
    if (!navigator.onLine || this._isFlushing) return;
    const queue = JSON.parse(localStorage.getItem(this.CACHE_KEYS.QUEUE) || '[]');
    if (queue.length === 0) return;

    this._isFlushing = true;
    let latestInventory = null;

    try {
      while (queue.length > 0) {
        const action = queue[0];
        let res;

        if (action.type === 'claim') {
          res = await sb.rpc('claim_collectible', {
            p_item_key: action.itemKey,
            p_lat: action.lat,
            p_lng: action.lng,
            p_claimed_at: action.claimedAt || action.queuedAt
          });
        } else if (action.type === 'craft') {
          res = await sb.rpc('craft_forge_item', {
            p_result_item_key: action.resultItemKey
          });
        }

        if (res?.error) {
          // Network dropped mid-flush: stop and keep remaining items for next reconnect
          if (res.error.message.includes('Failed to fetch')) {
            break;
          }
          // Anti-cheat or validation rejected this specific action: discard it and continue
          console.warn('Rejected offline action:', action, res.error.message);
          queue.shift();
          localStorage.setItem(this.CACHE_KEYS.QUEUE, JSON.stringify(queue));
          continue;
        }

        if (res?.data?.inventory) {
          latestInventory = res.data.inventory;
        }

        queue.shift();
        localStorage.setItem(this.CACHE_KEYS.QUEUE, JSON.stringify(queue));
      }

      // Once all queued actions have replayed, sync the final authoritative inventory
      if (queue.length === 0 && window.CollectibleManager) {
        if (latestInventory && window.CollectibleManager.applyServerInventory) {
          window.CollectibleManager.applyServerInventory(latestInventory);
        } else {
          await window.CollectibleManager.syncFromServer();
        }
      }
    } finally {
      this._isFlushing = false;
    }
  },


  // ==========================================================================
  // 3. DAILY/BULLETIN SCHEDULE & ZERO-TRACKING POLLS
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

  // Fetch daily bulletin, upcoming timed collectibles, and 7-day-old poll results
  async getTodayBulletin() {
    const { data, error } = await sb.rpc('get_today_bulletin');
    if (error) throw error;
    return data;
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
  },

  // ==========================================================================
  // 5. FEEDBACK & ERROR REPORTING
  // ==========================================================================
  // Submit a bug report or improvement suggestion from the Settings modal
  async submitFeedback({ message, category = 'bug' }) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      await this.initSession();
    }

    const appContext = {
      online: navigator.onLine,
      standalone: window.matchMedia('(display-mode: standalone)').matches,
      userAgent: navigator.userAgent.slice(0, 200)
    };

    const { error } = await sb.rpc('submit_game_feedback', {
      p_message: message,
      p_category: category,
      p_app_context: appContext
    });

    if (error) throw error;
    return true;
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

window.GameAPI = GameAPI;


// ── SUPABASE ──────────────────────────────────────────────────────────────────
// SUPABASE_URL and SUPABASE_ANON_KEY come from config.js (loaded earlier).

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── PROFILE FETCH ─────────────────────────────────────────────────────────────

// Fetch a single profile row. `match` is one filter pair, e.g. { id: '...' }
// or { nickname: '...' }. Returns null on miss / error.
async function fetchProfile(match, fields = '*') {
  const [key, val] = Object.entries(match)[0];
  if (val == null) return null;
  const { data, error } = await db
    .from('profiles')
    .select(fields)
    .eq(key, val)
    .maybeSingle();
  if (error) console.warn('fetchProfile error:', error);
  return data || null;
}

// Fetch all profiles. Used by leaderboard for nickname → avatar mapping.
async function fetchAllProfiles(fields = 'nickname, avatar_url, default_avatar') {
  const { data, error } = await db.from('profiles').select(fields);
  if (error) console.warn('fetchAllProfiles error:', error);
  return data || [];
}

// ── GAMES + PLAYERS HYDRATION ────────────────────────────────────────────────

// Fetch the player rows for a set of game ids, ordered by position. Returns []
// for an empty input. Used wherever we already have a list of game ids and
// want their participants (game-log, characters monthly report, etc).
async function fetchPlayersForGames(ids) {
  if (!ids.length) return [];
  const { data, error } = await db
    .from('game_players')
    .select('*')
    .in('game_id', ids)
    .order('position');
  if (error) console.warn('fetchPlayersForGames error:', error);
  return data || [];
}

// Fetch full game rows by id. `orderByPlayedAtDesc` returns newest first.
async function fetchGamesByIds(ids, { orderByPlayedAtDesc = false } = {}) {
  if (!ids.length) return [];
  let q = db.from('games').select('*').in('id', ids);
  if (orderByPlayedAtDesc) q = q.order('played_at', { ascending: false });
  const { data, error } = await q;
  if (error) console.warn('fetchGamesByIds error:', error);
  return data || [];
}

// Convenience: returns { games, players } for a set of ids in one trip.
async function fetchGamesWithPlayers(ids, opts = {}) {
  if (!ids.length) return { games: [], players: [] };
  const [games, players] = await Promise.all([
    fetchGamesByIds(ids, opts),
    fetchPlayersForGames(ids),
  ]);
  return { games, players };
}

// ── STATIC DATA LOADERS ──────────────────────────────────────────────────────
// Tiny cache of the JSON data files referenced from config.js. Each loader
// returns the parsed object on first call and serves the same instance on
// subsequent calls.

async function _fetchJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) { console.warn(`fetchJson ${url}: ${r.status}`); return {}; }
    return await r.json();
  } catch (e) {
    console.warn(`fetchJson ${url}:`, e);
    return {};
  }
}

let _objectives = null;
async function loadObjectives() {
  if (!_objectives) _objectives = await _fetchJson(DATA_OBJECTIVES_URL);
  return _objectives;
}

let _charFaq = null;
async function loadCharFaq() {
  if (!_charFaq) _charFaq = await _fetchJson(DATA_CHARACTER_FAQ_URL);
  return _charFaq;
}

let _boxInfo = null;
async function loadBoxInfo() {
  if (!_boxInfo) _boxInfo = await _fetchJson(DATA_BOX_INFO_URL);
  return _boxInfo;
}

// ── CHARACTER CACHE ───────────────────────────────────────────────────────────

let _chars = null;

async function loadCharacters() {
  if (_chars) return _chars;
  const { data, error } = await db
    .from('characters')
    .select('*')
    .order('sort_order');
  if (error) {
    console.error('Failed to load characters:', error.message);
    return [];
  }
  _chars = data || [];
  return _chars;
}

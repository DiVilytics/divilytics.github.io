// ── STATE ─────────────────────────────────────────────────────────────────────

let lbCharBoxMap    = {};
let lbNickAvatarMap = {};

let lbTab    = 'characters';   // 'characters' | 'players'
let lbMode   = 'pct';          // 'pct' | 'count' | 'games'
let lbFilter = 'all';          // 'all' | 2 | 3 | 4 | 5 | 6

// Cache: key `${lbTab}:${lbFilter}` → { rows, summary }
// Avoids re-fetching when only the sort lbMode changes.
const _lbCache = {};

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('leaderboard.html');
  await initAuth();

  const [chars, profiles] = await Promise.all([
    loadCharacters(),
    fetchAllProfiles(),
  ]);

  lbCharBoxMap    = Object.fromEntries(chars.map(c => [c.name, c.box]));
  lbNickAvatarMap = Object.fromEntries(
    profiles.filter(p => p.nickname).map(p => [p.nickname, resolveAvatar(p)])
  );

  await loadAndRender();
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────

function setTab(t) {
  lbTab = t;
  document.getElementById('tabChars').classList.toggle('on',   t === 'characters');
  document.getElementById('tabPlayers').classList.toggle('on', t === 'players');
  loadAndRender();
}

function setMode(m) {
  lbMode = m;
  const cached = _lbCache[`${lbTab}:${lbFilter}`];
  if (cached) render(cached);
}

function setFilter(f) {
  lbFilter = f;
  updateFilterPills('#filterPills .pill', f);
  loadAndRender();
}

// ── DATA LOADING ──────────────────────────────────────────────────────────────

async function loadAndRender() {
  const key = `${lbTab}:${lbFilter}`;

  if (!_lbCache[key]) {
    const isChar  = lbTab === 'characters';
    const view    = lbFilter === 'all'
      ? (isChar ? 'character_stats' : 'player_stats')
      : (isChar ? 'character_stats_by_size' : 'player_stats_by_size');

    const rowsQuery = lbFilter === 'all'
      ? db.from(view).select('*')
      : db.from(view).select('*').eq('player_count', lbFilter);

    const [{ data: rows }, { data: summary }] = await Promise.all([
      rowsQuery,
      db.rpc('game_stats', lbFilter === 'all' ? {} : { player_count_filter: lbFilter }),
    ]);

    _lbCache[key] = {
      rows:    rows    || [],
      summary: (summary || [])[0] || { games: 0, avg_duration: null, avg_turns: null },
    };
  }

  document.getElementById('lb').className = '';
  render(_lbCache[key]);
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render({ rows, summary }) {
  const { games, avg_duration, avg_turns } = summary;
  const avgDur   = avg_duration != null ? Math.round(avg_duration) : null;
  const avgTurns = avg_turns    != null ? Math.round(avg_turns)    : null;

  document.getElementById('summary').innerHTML = statBoxesHTML([
    { val: games,                                  lbl: 'Games' },
    { val: avgDur   != null ? avgDur + 'm' : '|',  lbl: 'Avg duration' },
    { val: avgTurns != null ? avgTurns      : '|', lbl: 'Avg rounds' },
  ]);

  if (!rows.length) {
    document.getElementById('lb').innerHTML =
      `<div class="empty-state">No games match this filter.</div>`;
    return;
  }

  const isChar = lbTab === 'characters';

  document.getElementById('lb').innerHTML = `
    <div class="controls mb-1">
      <div class="seg">
        <button class="seg-btn ${lbMode === 'pct'   ? 'on' : ''}" onclick="setMode('pct')">% Wins</button>
        <button class="seg-btn ${lbMode === 'count' ? 'on' : ''}" onclick="setMode('count')"># Wins</button>
        <button class="seg-btn ${lbMode === 'games' ? 'on' : ''}" onclick="setMode('games')"># Games</button>
      </div>
    </div>
    ${renderStatTableHTML(rows, {
      mode:        lbMode,
      headLabel:   isChar ? 'Character' : 'Player',
      getKey:      r   => isChar ? r.character : r.nickname,
      getHref:     key => isChar
        ? `characters.html?char=${encodeURIComponent(key)}`
        : `player.html?nick=${encodeURIComponent(key)}`,
      getIdentity: key => isChar ? charImgHTML(key) : playerAvatarHTML(lbNickAvatarMap[key]),
      getSub:      key => isChar ? lbCharBoxMap[key] : '',
      getSubHref:  key => (isChar && lbCharBoxMap[key]) ? `characters.html?box=${boxAnchorId(lbCharBoxMap[key])}` : '',
    })}`;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

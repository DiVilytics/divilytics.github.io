// ── STATE ─────────────────────────────────────────────────────────────────────

let charBoxMap    = {};
let nickAvatarMap = {};

let tab    = 'characters';   // 'characters' | 'players'
let mode   = 'pct';          // 'pct' | 'count' | 'games'
let filter = 'all';          // 'all' | 2 | 3 | 4 | 5 | 6

// Cache: key `${tab}:${filter}` → { rows, summary }
// Avoids re-fetching when only the sort mode changes.
const _lbCache = {};

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('leaderboard.html');
  await initAuth();

  const [chars, { data: profiles }] = await Promise.all([
    loadCharacters(),
    db.from('profiles').select('nickname, avatar_url, default_avatar'),
  ]);

  charBoxMap    = Object.fromEntries(chars.map(c => [c.name, c.box]));
  nickAvatarMap = Object.fromEntries(
    (profiles || []).filter(p => p.nickname).map(p => [p.nickname, resolveAvatar(p)])
  );

  await loadAndRender();
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────

function setTab(t) {
  tab = t;
  document.getElementById('tabChars').classList.toggle('on',   t === 'characters');
  document.getElementById('tabPlayers').classList.toggle('on', t === 'players');
  loadAndRender();
}

function setMode(m) {
  mode = m;
  const cached = _lbCache[`${tab}:${filter}`];
  if (cached) render(cached);
}

function setFilter(f) {
  filter = f;
  updateFilterPills('#filterPills .pill', f);
  loadAndRender();
}

// ── DATA LOADING ──────────────────────────────────────────────────────────────

async function loadAndRender() {
  const key = `${tab}:${filter}`;

  if (!_lbCache[key]) {
    const isChar  = tab === 'characters';
    const view    = filter === 'all'
      ? (isChar ? 'character_stats' : 'player_stats')
      : (isChar ? 'character_stats_by_size' : 'player_stats_by_size');

    const rowsQuery = filter === 'all'
      ? db.from(view).select('*')
      : db.from(view).select('*').eq('player_count', filter);

    const [{ data: rows }, { data: summary }] = await Promise.all([
      rowsQuery,
      db.rpc('game_stats', filter === 'all' ? {} : { player_count_filter: filter }),
    ]);

    _lbCache[key] = {
      rows:    rows    || [],
      summary: (summary || [])[0] || { games: 0, avg_duration: null, avg_turns: null },
    };
  }

  document.getElementById('lb').className = '';
  render(_lbCache[key]);
}

// ── SORT ──────────────────────────────────────────────────────────────────────

function sortRows(rows) {
  return sortStatRows(rows, mode);
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render({ rows, summary }) {
  const { games, avg_duration, avg_turns } = summary;
  const avgDur   = avg_duration != null ? Math.round(avg_duration) : null;
  const avgTurns = avg_turns    != null ? Math.round(avg_turns)    : null;

  document.getElementById('summary').innerHTML = `
    <div class="stat-box">
      <div class="stat-val">${games}</div>
      <div class="stat-lbl">Games</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${avgDur != null ? avgDur + 'm' : '—'}</div>
      <div class="stat-lbl">Avg duration</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${avgTurns != null ? avgTurns : '—'}</div>
      <div class="stat-lbl">Avg turns</div>
    </div>`;

  if (!rows.length) {
    document.getElementById('lb').innerHTML =
      `<div class="empty-state">No games match this filter.</div>`;
    return;
  }

  const isChar   = tab === 'characters';
  const sorted   = sortRows(rows);
  const maxWins  = sorted[0]?.wins  || 1;
  const maxGames = sorted[0]?.games || 1;
  const maxPct   = Math.max(...sorted.map(r => r.games ? r.wins / r.games : 0)) || 1;

  const ranks      = computeRanks(sorted, mode);
  const medalClass = rank => rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

  document.getElementById('lb').innerHTML = `
    <div class="controls" style="margin-bottom:1rem">
      <div class="seg">
        <button class="seg-btn ${mode === 'pct'   ? 'on' : ''}" onclick="setMode('pct')">% Wins</button>
        <button class="seg-btn ${mode === 'count' ? 'on' : ''}" onclick="setMode('count')"># Wins</button>
        <button class="seg-btn ${mode === 'games' ? 'on' : ''}" onclick="setMode('games')"># Games</button>
      </div>
    </div>
    <div class="lb-table">
      <div class="lb-head">
        <span>#</span>
        <span>${isChar ? 'Character' : 'Player'}</span>
        <span></span>
        <span style="text-align:right">${mode === 'count' ? '# Wins' : mode === 'pct' ? '% Wins' : '# Games'}</span>
        <span style="text-align:right">${mode === 'games' ? '# Wins' : '# Games'}</span>
      </div>
      ${sorted.map((r, i) => {
        const rank    = ranks[i];
        const key     = isChar ? r.character : r.nickname;
        const pct     = r.games ? r.wins / r.games : 0;
        const barW    = statBarWidth(r, mode, maxWins, maxGames, maxPct);
        const dispVal = mode === 'count' ? r.wins : mode === 'pct' ? Math.round(pct * 100) + '%' : r.games;
        const dispSub = mode === 'games' ? r.wins : r.games;
        const sub     = isChar ? (charBoxMap[key] || '') : '';
        const href    = isChar
          ? `character.html?char=${encodeURIComponent(key)}`
          : `player.html?nick=${encodeURIComponent(key)}`;
        return `
          <a class="lb-row link" href="${href}">
            <div class="rank-num ${medalClass(rank)}">${rank}</div>
            <div class="row-identity">
              ${isChar ? charImgHTML(key) : playerAvatarHTML(nickAvatarMap[key])}
              <div>
                <div class="row-name">${_esc(key)}</div>
                ${sub ? `<div class="row-sub">${_esc(sub)}</div>` : ''}
              </div>
            </div>
            <div class="bar-cell">
              <div class="bar-bg">
                <div class="bar-fill${rank === 1 ? ' gold' : ''}" style="width:${barW}%"></div>
              </div>
            </div>
            <div class="row-val">${dispVal}</div>
            <div class="row-games">${dispSub}</div>
          </a>`;
      }).join('')}
    </div>`;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

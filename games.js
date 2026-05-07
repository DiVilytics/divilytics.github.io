// ── STATE ─────────────────────────────────────────────────────────────────────

let games        = [];   // loaded games (current page)
let players      = [];   // game_players for loaded games
let chars        = [];   // character list from DB

let filterCount    = 'all';   // 'all' | 2 | 3 | 4 | 5 | 6
let filterChars    = new Set();
let filterLocation = null;

let _gameOffset     = 0;
let _totalGames     = 0;
let _hasMore        = false;
let _filterDebounce = null;
const PAGE_SIZE     = 20;

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('games.html');
  await initAuth(() => render());
  chars = await loadCharacters();
  buildCharGrid(
    document.getElementById('charGrid'),
    chars,
    filterChars,
    () => updateFilterUI()
  );
  await loadLocationOptions();
  await load();
  _checkResume();
  _initDrag();
}

// ── DATA ──────────────────────────────────────────────────────────────────────

async function load(reset = true) {
  if (reset) {
    _gameOffset = 0;
    // Don't wipe the DOM yet — keep current cards visible while fetching
  }

  const charArr  = filterChars.size > 0 ? [...filterChars] : null;
  const countVal = filterCount !== 'all' ? filterCount : null;
  const locVal   = filterLocation || null;

  const [{ data: newGames, error }, { data: total }] = await Promise.all([
    db.rpc('get_game_page', {
      char_filter:     charArr,
      count_filter:    countVal,
      location_filter: locVal,
      page_offset:     _gameOffset,
      page_size:       PAGE_SIZE,
    }),
    db.rpc('get_game_count', {
      char_filter:     charArr,
      count_filter:    countVal,
      location_filter: locVal,
    }),
  ]);

  if (error) {
    document.getElementById('root').innerHTML =
      `<div class="empty"><p>Error: ${error.message}</p></div>`;
    return;
  }

  const g = newGames || [];
  _totalGames = Number(total) || 0;

  let newPlayers = [];
  if (g.length) {
    const { data: p } = await db
      .from('game_players')
      .select('*')
      .in('game_id', g.map(x => x.id))
      .order('position');
    newPlayers = p || [];
  }

  // Update state atomically so render() sees a consistent snapshot
  if (reset) {
    games   = g;
    players = newPlayers;
    _gameOffset = g.length;
  } else {
    const existingGameIds = new Set(games.map(x => x.id));
    const freshGames   = g.filter(x => !existingGameIds.has(x.id));
    const freshPlayers = newPlayers.filter(p => !existingGameIds.has(p.game_id));
    games   = [...games, ...freshGames];
    players = [...players, ...freshPlayers];
    _gameOffset += g.length;
  }

  _hasMore = games.length < _totalGames;

  document.getElementById('root').className = '';
  render();
}

// ── FILTER ────────────────────────────────────────────────────────────────────

function setCountFilter(value) {
  filterCount = value;
  updateFilterPills('#countPills .pill', value);
  load(true);
}

function toggleCharFilter() {
  const panel   = document.getElementById('charFilterPanel');
  const chevron = document.getElementById('charChevron');
  const open    = panel.classList.toggle('open');
  chevron.classList.toggle('open', open);
}

function updateFilterUI() {
  const badge = document.getElementById('charBadge');
  const n = filterChars.size;
  badge.textContent = n;
  badge.classList.toggle('visible', n > 0);
  clearTimeout(_filterDebounce);
  _filterDebounce = setTimeout(() => load(true), 400);
}

function selectAllChars() {
  chars.forEach(c => {
    filterChars.add(c.name);
    const btn = document.querySelector(`.char-pill[data-name="${CSS.escape(c.name)}"]`);
    btn?.classList.add('on');
  });
  updateFilterUI();
}

function clearChars() {
  filterChars.clear();
  document.querySelectorAll('#charGrid .char-pill').forEach(b => b.classList.remove('on'));
  updateFilterUI();
}

function applyCharFilter() {
  load(true);
  const panel   = document.getElementById('charFilterPanel');
  const chevron = document.getElementById('charChevron');
  panel.classList.remove('open');
  chevron.classList.remove('open');
}

function setLocationFilter(value) {
  filterLocation = value || null;
  load(true);
}

function clearLocationFilter() {
  filterLocation = null;
  const input = document.getElementById('locationSearchInput');
  if (input) input.value = '';
  load(true);
}

let _locationOptions = [];

async function loadLocationOptions() {
  const { data } = await db.from('games').select('location').neq('location', null);
  _locationOptions = [...new Set((data || []).map(r => r.location).filter(Boolean))].sort();
  document.getElementById('locationSearch').style.display = _locationOptions.length ? '' : 'none';
}

function locationInput(e) {
  const val      = e.target.value;
  const dropdown = document.getElementById('locationDropdown');
  if (!val.trim()) {
    if (filterLocation) { filterLocation = null; load(true); }
    dropdown.classList.remove('open');
    return;
  }
  const matches = _locationOptions.filter(l => l.toLowerCase().includes(val.toLowerCase()));
  if (!matches.length) { dropdown.classList.remove('open'); return; }
  populateSearchDropdown(
    dropdown,
    matches.map(l => `<div class="cs-option" data-loc="${_esc(l)}">${_esc(l)}</div>`).join(''),
    opt => _applyLocationOption(opt.dataset.loc)
  );
}

function locationBlur() {
  _handleSearchBlur(document.getElementById('locationDropdown'));
}

function locationKeydown(e) {
  _handleSearchKeydown(
    e,
    document.getElementById('locationDropdown'),
    document.getElementById('locationSearchInput'),
    opt => _applyLocationOption(opt.dataset.loc)
  );
}

function _applyLocationOption(loc) {
  filterLocation = loc;
  document.getElementById('locationSearchInput').value = loc;
  document.getElementById('locationDropdown').classList.remove('open');
  load(true);
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render() {
  const hint         = document.getElementById('resultsHint');
  const filterActive = filterCount !== 'all' || filterChars.size > 0 || filterLocation !== null;
  const root         = document.getElementById('root');

  const pillArea = document.getElementById('locationPillArea');
  if (pillArea) pillArea.innerHTML = filterLocation
    ? `<button class="pill on" onclick="clearLocationFilter()">${_esc(filterLocation)} · Clear</button>`
    : '';

  if (_totalGames === 0) {
    hint.textContent = '';
    root.className = '';
    if (!filterActive) {
      root.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🕒</div>
          <h3>No games yet</h3>
          <p>Record your first game to get started.</p>
          <button class="btn btn-primary btn-sm" onclick="openSheet()">+ New Game</button>
        </div>`;
    } else {
      root.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><h3>No matches</h3><p>Try adjusting the filters.</p></div>`;
    }
    return;
  }

  hint.textContent = games.length < _totalGames
    ? `Showing ${games.length} of ${_totalGames} games`
    : `${_totalGames} game${_totalGames !== 1 ? 's' : ''}`;

  // Pre-group players by game_id to avoid O(n²) scans in the render loop
  const byGame = {};
  for (const p of players) {
    if (!byGame[p.game_id]) byGame[p.game_id] = [];
    byGame[p.game_id].push(p);
  }

  root.className = 'games-list';
  root.innerHTML = '';

  for (const g of games) {
    const gp = (byGame[g.id] || []).slice().sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.id < b.id ? -1 : 1));
    root.appendChild(buildCard(g, gp));
  }

  if (_hasMore) {
    const btn = document.createElement('button');
    btn.className = 'btn-load-more';
    btn.textContent = 'Load more';
    btn.onclick = () => { btn.disabled = true; load(false); };
    root.appendChild(btn);
  }
}

function buildCard(g, gp) {
  const me = getCurrentUser();
  return buildGameCard(g, gp, {
    isSelf: p => me && p.user_id === me.id,
    onLocationClick: loc => _applyLocationOption(loc),
  });
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

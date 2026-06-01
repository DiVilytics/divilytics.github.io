// ── STATE ─────────────────────────────────────────────────────────────────────

let glGames        = [];   // loaded glGames (current page)
let glPlayers      = [];   // game_players for loaded glGames
let glChars        = [];   // character list from DB

let glFilterCount    = 'all';   // 'all' | 2 | 3 | 4 | 5 | 6
let glFilterChars    = new Set();
let glFilterLocation = null;

let _gameOffset     = 0;
let _totalGames     = 0;
let _hasMore        = false;
let _filterDebounce = null;

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
	setActiveNav('game-log.html');
	await initAuth(() => render());
	glChars = await loadCharacters();
	buildCharGrid(
		document.getElementById('charGrid'),
		glChars,
		glFilterChars,
		() => updateFilterUI()
	);
	await loadLocationOptions();
	await load();
}

// ── DATA ──────────────────────────────────────────────────────────────────────

async function load(reset = true) {
	if (reset) {
		_gameOffset = 0;
		// Don't wipe the DOM yet. keep current cards visible while fetching
	}

	const charArr  = glFilterChars.size > 0 ? [...glFilterChars] : null;
	const countVal = glFilterCount !== 'all' ? glFilterCount : null;
	const locVal   = glFilterLocation || null;

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

	const newPlayers = await fetchPlayersForGames(g.map(x => x.id));

	// Update state atomically so render() sees a consistent snapshot
	if (reset) {
		glGames   = g;
		glPlayers = newPlayers;
		_gameOffset = g.length;
	} else {
		const existingGameIds = new Set(glGames.map(x => x.id));
		const freshGames   = g.filter(x => !existingGameIds.has(x.id));
		const freshPlayers = newPlayers.filter(p => !existingGameIds.has(p.game_id));
		glGames   = [...glGames, ...freshGames];
		glPlayers = [...glPlayers, ...freshPlayers];
		_gameOffset += g.length;
	}

	_hasMore = glGames.length < _totalGames;

	document.getElementById('root').className = '';
	render();
}

// ── FILTER ────────────────────────────────────────────────────────────────────

function setCountFilter(value) {
	glFilterCount = value;
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
	const n = glFilterChars.size;
	badge.textContent = n;
	badge.classList.toggle('visible', n > 0);
	clearTimeout(_filterDebounce);
	_filterDebounce = setTimeout(() => load(true), 400);
}

function selectAllChars() {
	glChars.forEach(c => {
		glFilterChars.add(c.name);
		const btn = document.querySelector(`.char-pill[data-name="${CSS.escape(c.name)}"]`);
		btn?.classList.add('on');
	});
	updateFilterUI();
}

function clearChars() {
	glFilterChars.clear();
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
	glFilterLocation = value || null;
	load(true);
}

function clearLocationFilter() {
	glFilterLocation = null;
	const input = document.getElementById('locationSearchInput');
	if (input) input.value = '';
	load(true);
}

async function loadLocationOptions() {
	// Show the location search only if at least one game has a location (cheap
	// count-only request — no rows transferred).
	const { count } = await db.from('games')
		.select('location', { count: 'exact', head: true })
		.not('location', 'is', null);
	setVisible('locationSearch', (count || 0) > 0);

	// Same strategy as the player search: query the DB per keystroke. The
	// search_locations(q) RPC does the DISTINCT + LIMIT server-side, so we never
	// pull every game's location into the browser (and never hit the row cap).
	attachSearchBox({
		inputId:    'locationSearchInput',
		dropdownId: 'locationDropdown',
		debounceMs: 200,
		fetchOptions: dbSearchSource(q => db.rpc('search_locations', { q })),
		renderOption: l => `<div class="cs-option" data-loc="${_esc(l)}">${_esc(l)}</div>`,
		onSelect:     opt => _applyLocationOption(opt.dataset.loc),
		onEmpty:      () => { if (glFilterLocation) { glFilterLocation = null; load(true); } },
	});
}

function _applyLocationOption(loc) {
	glFilterLocation = loc;
	document.getElementById('locationSearchInput').value = loc;
	document.getElementById('locationDropdown').classList.remove('open');
	load(true);
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render() {
	const hint         = document.getElementById('resultsHint');
	const filterActive = glFilterCount !== 'all' || glFilterChars.size > 0 || glFilterLocation !== null;
	const root         = document.getElementById('root');

	const pillArea = document.getElementById('locationPillArea');
	if (pillArea) pillArea.innerHTML = glFilterLocation
		? `<button class="pill on" onclick="clearLocationFilter()">${_esc(glFilterLocation)} | Clear</button>`
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
					<a class="btn btn-primary btn-sm" href="new-game.html">+ New Game</a>
				</div>`;
		} else {
			root.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><h3>No matches</h3><p>Try adjusting the filters.</p></div>`;
		}
		return;
	}

	hint.textContent = glGames.length < _totalGames
		? `Showing ${glGames.length} of ${_totalGames} games`
		: `${_totalGames} game${_totalGames !== 1 ? 's' : ''}`;

	// Pre-group glPlayers by game_id to avoid O(n²) scans in the render loop
	const byGame = {};
	for (const p of glPlayers) {
		if (!byGame[p.game_id]) byGame[p.game_id] = [];
		byGame[p.game_id].push(p);
	}

	root.className = 'games-list';
	root.innerHTML = '';

	for (const g of glGames) {
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

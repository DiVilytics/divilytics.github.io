// ── STATE ─────────────────────────────────────────────────────────────────────

let glGames        = [];   // loaded glGames (current page)
let glPlayers      = [];   // game_players for loaded glGames
let glChars        = [];   // character list from DB

let glFilterCount    = 'all';   // 'all' | 2 | 3 | 4 | 5 | 6
let glExcluded       = new Set();   // excluded characters (struck through) — same model as new-game
let glFilterLocation = null;
let glOwnedBoxes     = new Set();   // boxes owned by the signed-in user
let glSelectedPace   = null;        // 'green'|'yellow'|'orange'|'red'|null — single-select
let glPacePlus       = false;       // Pace+ : a pace selection also covers neighbours
let glMineOn         = false;       // sticky: limit the selection to your boxes

const PACE_ORDER = ['green', 'yellow', 'orange', 'red'];

let _gameOffset     = 0;
let _totalGames     = 0;
let _hasMore        = false;
let _loaded         = false;   // true once the first load() has fetched data

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
	setActiveNav('game-log.html');
	await initAuth(async () => {
		await _loadOwnedBoxes();
		_glUpdatePaceUI();
		render();
	});
	glChars = await loadCharacters();
	await _loadOwnedBoxes();
	buildExcludeGrid(
		document.getElementById('charGrid'),
		glChars,
		glExcluded,
		() => updateFilterUI()
	);
	await loadLocationOptions();
	await load();
	updateFilterUI();   // show the included-character count from the start
}

async function _loadOwnedBoxes() {
	const user = getCurrentUser();
	if (!user) { glOwnedBoxes = new Set(); return; }
	const { data } = await db.from('profile_boxes').select('box').eq('user_id', user.id);
	glOwnedBoxes = new Set((data || []).map(r => r.box));
}

// ── DATA ──────────────────────────────────────────────────────────────────────

async function load(reset = true) {
	if (reset) {
		_gameOffset = 0;
		// Don't wipe the DOM yet. keep current cards visible while fetching
	}

	// char_filter is the INCLUDED set (everything not excluded). Nothing excluded →
	// null (no restriction); excluding everything → empty array → no games.
	const charArr  = glExcluded.size === 0 ? null : glChars.filter(c => !glExcluded.has(c.name)).map(c => c.name);
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
	_loaded  = true;

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
	if (!open) load(true);   // closing the menu commits the selection
}

// Updates the panel UI only. The game list is NOT refetched here — that happens
// when the panel closes (Done or the toggle), so toggling characters never
// reloads mid-edit.
function updateFilterUI() {
	const badge = document.getElementById('charBadge');
	badge.textContent = glChars.length - glExcluded.size;   // characters still included
	badge.classList.add('visible');
	_glUpdatePaceUI();
}

// ── PACE / MY-BOXES SELECTION ──────────────────────────────────────────────────
// Exactly the new-game model, applied to the log: clicking a character excludes
// it (struck through), pace is a single-select that RESETS the pool to that
// colour's band (Pace+ also covers the neighbours), and "My boxes" is a sticky
// toggle resets take into account. The included set (everything not excluded)
// feeds char_filter, so games using any excluded character drop out.

function _glPaceBand(color) {
	if (!glPacePlus) return new Set([color]);
	const i = PACE_ORDER.indexOf(color);
	return new Set(PACE_ORDER.slice(Math.max(0, i - 1), i + 2));
}

// Rebuild the excluded set from the pace + My-boxes selection: everything outside
// the band — or, when My boxes is on, outside your boxes — is excluded.
function _glApplyPaceSelection() {
	const band    = glSelectedPace ? _glPaceBand(glSelectedPace) : null;
	const useMine = glMineOn && !!getCurrentUser() && glOwnedBoxes.size > 0;
	glExcluded.clear();
	for (const c of glChars) {
		if ((band && !band.has(c.pace)) || (useMine && !glOwnedBoxes.has(c.box))) {
			glExcluded.add(c.name);
		}
	}
	_glSyncExcludePills();
	updateFilterUI();
}

function _glSyncExcludePills() {
	document.querySelectorAll('#charGrid .char-pill').forEach(btn => {
		btn.classList.toggle('excluded', glExcluded.has(btn.dataset.name));
	});
}

// Clicking a colour resets the pool to that colour's band (not additive).
function glSelectPace(color) {
	glSelectedPace = color;
	_glApplyPaceSelection();
}

function glSetPaceMode(plus) {
	glPacePlus = plus;
	if (glSelectedPace) _glApplyPaceSelection();
	else _glUpdatePaceUI();
}

function glToggleMine() {
	if (!getCurrentUser())  { showErr('Sign in to filter by owned boxes.'); return; }
	if (!glOwnedBoxes.size) { showErr('Mark which boxes you own on the account page first.'); return; }
	glMineOn = !glMineOn;
	_glApplyPaceSelection();
}

function showErr(msg) {
	showError('err', msg, { scroll: true });
}

// Reflect the selection: swatches in the selected band, the Pace/Pace+ toggle, and
// My boxes (active + enabled state + tooltip).
function _glUpdatePaceUI() {
	const band = glSelectedPace ? _glPaceBand(glSelectedPace) : null;
	for (const color of PACE_ORDER) {
		const el = document.querySelector(`#glPaceColors .pace-color[data-pace="${color}"]`);
		if (!el) continue;
		el.classList.remove('sel-primary', 'sel-neighbor', 'sel-out');
		if (!band) continue;
		el.classList.add(color === glSelectedPace ? 'sel-primary' : band.has(color) ? 'sel-neighbor' : 'sel-out');
	}
	const modeBtns = document.querySelectorAll('#glPaceMode .seg-btn');
	modeBtns[0]?.classList.toggle('on', !glPacePlus);
	modeBtns[1]?.classList.toggle('on',  glPacePlus);

	const mineBtn = document.getElementById('glMineBtn');
	if (!mineBtn) return;
	const enabled = !!getCurrentUser() && glOwnedBoxes.size > 0;
	mineBtn.classList.toggle('disabled', !enabled);
	mineBtn.classList.toggle('on', glMineOn && enabled);
	mineBtn.title = !getCurrentUser()
		? 'Sign in to use your boxes'
		: !glOwnedBoxes.size
			? 'Mark which boxes you own on the account page first'
			: glMineOn ? 'Limited to your boxes' : 'Limit to characters in your boxes';
}

function glExcludeAll() {
	glSelectedPace = null;
	glMineOn = false;
	glChars.forEach(c => glExcluded.add(c.name));
	_glSyncExcludePills();
	updateFilterUI();
}

function glClearExcluded() {
	glSelectedPace = null;
	glMineOn = false;
	glExcluded.clear();
	_glSyncExcludePills();
	updateFilterUI();
}

// "Done" just closes the panel — closing is what commits the selection.
function applyCharFilter() {
	if (document.getElementById('charFilterPanel').classList.contains('open')) toggleCharFilter();
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
	// Don't render the empty/"no games" state before the first load has run —
	// otherwise the initAuth callback flashes it over the loading spinner.
	if (!_loaded) return;

	const hint         = document.getElementById('resultsHint');
	const filterActive = glFilterCount !== 'all' || glExcluded.size > 0 || glFilterLocation !== null;
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

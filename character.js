// ── STATE ─────────────────────────────────────────────────────────────────────

const OBJECTIVES = {
  'Maleficent':     'Start your turn with a Curse at each location.',
  'Jafar':          'Start your turn with the Magic Lamp at Sultan\'s Palace and the Genie under your control.',
  'Ursula':         'Start your turn with the Trident and the Crown at Ursula\'s Lair.',
  'Captain Hook':   'Defeat Peter Pan at the Jolly Roger.',
  'Queen of Hearts':'Have a Wicket at each location and successfully take a Shot.',
  'Prince John':    'Start your turn with at least 20 Power.',
  'Evil Queen':     'Find Snow White and defeat her.',
  'Dr. Facilier':   'Have the Talisman in your Realm and cast Rule New Orleans.',
  'Hades':          'Start your turn with at least three Titans at Mount Olympus.',
  'Scar':           'Defeat Mufasa, then have at least 15 Strength in your Succession pile.',
  'Ratigan':        'Have the Queen\'s Robot at Buckingham Palace (if the Robot is discarded, your objective changes to: Defeat Basil).',
  'Yzma':           'Find and defeat Kuzco using Kronk.',
  'Cruella de Vil': 'Start your turn with at least 99 Puppies captured.',
  'Mother Gothel':  'Start your turn with at least 10 Trust.',
  'Pete':           'Complete the four Goal tokens randomly assigned to your locations.',
  'Gaston':         'Remove all 8 Obstacle tokens from your board.',
  'Lady Tremaine':  'Have the Prince at your realm and marry him to Drizella or Anastasia.',
  'Horned King':    'Have Cauldron Born at each location.',
  'Syndrome':       'Defeat the Omnidroid v.10, then have no Heroes in your Realm.',
  'Lotso':          'Have 4 Heroes with 0 Strength and Buzz Lightyear in the Sunnyside Library.',
  'Madam Mim':      'Defeat all of Merlin\'s Transformations.',
  'King Candy':     'Win the Race (reach the finish line with a Glitch attached to an opponent).',
  'Shere Khan':     'Defeat Mowgli and ensure there is no Fire in your Realm.',
  'Oogie Boogie':   'Defeat Jack Skellington.',
  'Tamatoa':        'Have the Heart of Te Fiti and Maui\'s Hook at Tamatoa\'s Lair.',
  'Davy Jones':     'Collect all 5 Treasure tokens.',
};

let csMode    = 'pct';   // 'pct' | 'count' | 'games'
let csChar    = null;      // character record from DB
let csBuckets = null;      // computed stats per player count
let allChars  = [];        // full character list for search

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('character.html');
  await initAuth();

  const params   = new URLSearchParams(location.search);
  const charName = (params.get('char') || '').trim();

  if (!charName) {
    document.title = 'DVS — Characters';

    allChars = await loadCharacters();
    document.getElementById('csSearchWrap').style.display = '';

    const byBox = groupByBox(allChars);
    const root = document.getElementById('csRoot');
    root.className = '';
    root.innerHTML = Object.entries(byBox).map(([box, chars]) => `
      <div class="char-roster-group">
        <div class="char-roster-group-name">${_esc(box)}</div>
        <div class="char-roster">${
          chars.map(c => `
            <a class="char-roster-item" href="character.html?char=${encodeURIComponent(c.name)}">
              <img class="char-roster-portrait" src="${charImgSrc(c.name)}" alt="" onerror="this.src='asset/player.svg'">
              <div class="char-roster-name">${_esc(c.name)}</div>
            </a>`).join('')
        }</div>
      </div>`).join('');
    return;
  }

  document.title = `DVS — ${charName}`;

  allChars = await loadCharacters();
  csChar   = allChars.find(c => c.name === charName);

  if (!csChar) {
    document.getElementById('csRoot').className = '';
    document.getElementById('csRoot').innerHTML =
      `<div class="empty"><h3>Character not found</h3><p>${_esc(charName)}</p></div>`;
    return;
  }

  // Update identity block
  const csIdentityEl = document.getElementById('csIdentity');
  const objective = OBJECTIVES[csChar.name];
  csIdentityEl.innerHTML =
    `<div class="pf-identity"><img class="char-portrait" style="width:40px;height:40px;flex-shrink:0" src="${charImgSrc(csChar.name)}" alt=""><span class="pf-name-block"><span class="pf-nick">${_esc(csChar.name)}</span><span class="pf-since">${_esc(csChar.box)}</span></span></div>${objective ? `<p class="char-objective">${_esc(objective)}</p>` : ''}`;
  document.getElementById('csSearchWrap').style.display = '';

  // Load bucketed stats via server-side aggregation (one RPC, no row-limit risk)
  const { data: buckets, error } = await db.rpc('character_bucket_stats', { char_name: charName });

  if (error) {
    document.getElementById('csRoot').className = '';
    document.getElementById('csRoot').innerHTML =
      `<div class="empty"><p>Error: ${_esc(error.message)}</p></div>`;
    return;
  }

  if (!buckets || !buckets.length) {
    document.getElementById('csRoot').className = '';
    document.getElementById('csRoot').innerHTML =
      `<div class="empty"><div class="empty-icon">🎭</div><h3>No games yet</h3><p>${_esc(csChar.name)} hasn't been played in any recorded games.</p></div>`;
    return;
  }

  // Build csBuckets from the returned rows
  csBuckets = {
    all: { games: 0, wins: 0 },
    2:   { games: 0, wins: 0 },
    3:   { games: 0, wins: 0 },
    4:   { games: 0, wins: 0 },
    5:   { games: 0, wins: 0 },
    6:   { games: 0, wins: 0 },
  };

  for (const b of buckets) {
    const n = b.player_count;
    const g = Number(b.games);
    const w = Number(b.wins);
    csBuckets.all.games += g;
    csBuckets.all.wins  += w;
    if (n >= 2 && n <= 6) {
      csBuckets[n] = { games: g, wins: w };
    }
  }

  render();
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────

function csSetMode(m) {
  csMode = m;
  render();
}

// ── SEARCH / AUTOCOMPLETE ─────────────────────────────────────────────────────

function csSearchInput(e) {
  const val      = e.target.value.trim().toLowerCase();
  const dropdown = document.getElementById('csDropdown');

  if (!val) { dropdown.classList.remove('open'); return; }

  const matches = allChars
    .filter(c => c.name.toLowerCase().includes(val))
    .slice(0, 8);

  if (!matches.length) { dropdown.classList.remove('open'); return; }

  populateSearchDropdown(
    dropdown,
    matches.map(c => `
      <div class="cs-option" data-name="${_esc(c.name)}">
        <img class="char-portrait" src="${charImgSrc(c.name)}" alt="">
        <span>${_esc(c.name)}</span>
        <span class="cs-option-box">${_esc(c.box)}</span>
      </div>`).join(''),
    opt => { location.href = `character.html?char=${encodeURIComponent(opt.dataset.name)}`; }
  );
}

function csSearchBlur() {
  _handleSearchBlur(document.getElementById('csDropdown'));
}

function csSearchKeydown(e) {
  _handleSearchKeydown(
    e,
    document.getElementById('csDropdown'),
    document.getElementById('csSearchInput'),
    opt => { location.href = `character.html?char=${encodeURIComponent(opt.dataset.name)}`; }
  );
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render() {
  const root = document.getElementById('csRoot');
  root.className = '';

  const rows = [
    { label: 'Overall', key: 'all' },
    { label: '2p', key: 2 },
    { label: '3p', key: 3 },
    { label: '4p', key: 4 },
    { label: '5p', key: 5 },
    { label: '6p', key: 6 },
  ];

  const maxVal = Math.max(...rows.map(r => {
    const b = csBuckets[r.key];
    if (!b.games) return 0;
    return csMode === 'count' ? b.wins : csMode === 'games' ? b.games : b.wins / b.games;
  })) || 1;

  root.innerHTML = `
    <div class="controls" style="margin-bottom:1rem">
      <div class="seg">
        <button class="seg-btn ${csMode === 'pct'   ? 'on' : ''}" onclick="csSetMode('pct')">% Wins</button>
        <button class="seg-btn ${csMode === 'count' ? 'on' : ''}" onclick="csSetMode('count')"># Wins</button>
        <button class="seg-btn ${csMode === 'games' ? 'on' : ''}" onclick="csSetMode('games')"># Games</button>
      </div>
    </div>
    <div class="lb-table cs-table" style="margin-bottom:1.25rem">
      <div class="lb-head">
        <span>Players</span>
        <span></span>
        <span style="text-align:right">${csMode === 'count' ? '# Wins' : csMode === 'games' ? '# Games' : '% Wins'}</span>
        <span style="text-align:right">${csMode === 'games' ? '# Wins' : '# Games'}</span>
      </div>
      ${rows.map(r => {
        const b       = csBuckets[r.key];
        const pct     = b.games ? b.wins / b.games : 0;
        const barW    = b.games
          ? Math.round(((csMode === 'count' ? b.wins : csMode === 'games' ? b.games : pct) / maxVal) * 100)
          : 0;
        const dispVal = b.games
          ? (csMode === 'count' ? b.wins : csMode === 'games' ? b.games : Math.round(pct * 100) + '%')
          : '—';
        const secondary = csMode === 'games' ? b.wins : b.games;
        return `
          <div class="lb-row">
            <div class="row-label">${r.label}</div>
            <div class="bar-cell">
              <div class="bar-bg">
                <div class="bar-fill" style="width:${barW}%"></div>
              </div>
            </div>
            <div class="row-val">${dispVal}</div>
            <div class="row-games">${secondary}</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();


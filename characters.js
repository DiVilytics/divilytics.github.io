// ── STATE ─────────────────────────────────────────────────────────────────────
// Static character data (objectives, FAQ) is loaded from JSON via db.js.

// Currently-selected month for the roster report (first day of that month).
let csReportMonth = (() => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
})();

// Aggregates character stats from the games played in `monthStart`'s calendar
// month. Returns { stats, label, gameCount } where stats matches the shape
// used by the character_stats view ({ character, wins, games }).
async function _loadMonthCharacterStats(monthStart) {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(),     1);
  const end   = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const label = start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const { data: games } = await db
    .from('games')
    .select('id')
    .gte('played_at', start.toISOString())
    .lt('played_at',  end.toISOString());

  const ids = (games || []).map(g => g.id);
  if (!ids.length) return { stats: [], label, gameCount: 0 };

  const players = await fetchPlayersForGames(ids);

  const agg = new Map();
  for (const p of players) {
    const cur = agg.get(p.character) || { character: p.character, wins: 0, games: 0 };
    cur.games += 1;
    if (p.is_winner) cur.wins += 1;
    agg.set(p.character, cur);
  }
  return { stats: [...agg.values()], label, gameCount: ids.length };
}

function _isFutureMonth(d) {
  const now = new Date();
  return d.getFullYear() > now.getFullYear()
      || (d.getFullYear() === now.getFullYear() && d.getMonth() > now.getMonth());
}

async function csShiftMonth(delta) {
  const next = new Date(csReportMonth.getFullYear(), csReportMonth.getMonth() + delta, 1);
  if (delta > 0 && _isFutureMonth(next)) return;
  csReportMonth = next;
  await _renderMonthlyReport();
}

let _csPickerYear = null;

function csOpenMonthPicker(ev) {
  ev?.stopPropagation();
  const panel = document.getElementById('csMonthPickerPanel');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  if (isOpen) { csCloseMonthPicker(); return; }
  _csPickerYear = csReportMonth.getFullYear();
  _renderMonthPickerPanel();
  panel.classList.add('open');
  setTimeout(() => document.addEventListener('click', _csOutsideClick), 0);
}

function csCloseMonthPicker() {
  const panel = document.getElementById('csMonthPickerPanel');
  if (!panel) return;
  panel.classList.remove('open');
  document.removeEventListener('click', _csOutsideClick);
}

function _csOutsideClick(e) {
  const panel = document.getElementById('csMonthPickerPanel');
  if (!panel || panel.contains(e.target)) return;
  csCloseMonthPicker();
}

function csPickerShiftYear(delta, ev) {
  ev?.stopPropagation();
  const now = new Date();
  const next = _csPickerYear + delta;
  if (next > now.getFullYear()) return;
  _csPickerYear = next;
  _renderMonthPickerPanel();
}

async function csPickerSelect(month, ev) {
  ev?.stopPropagation();
  const next = new Date(_csPickerYear, month, 1);
  if (_isFutureMonth(next)) return;
  csCloseMonthPicker();
  csReportMonth = next;
  await _renderMonthlyReport();
}

function _renderMonthPickerPanel() {
  const panel = document.getElementById('csMonthPickerPanel');
  if (!panel) return;
  const now      = new Date();
  const curY     = csReportMonth.getFullYear();
  const curM     = csReportMonth.getMonth();
  const nextYDis = _csPickerYear >= now.getFullYear();
  const months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  panel.innerHTML = `
    <div class="cs-mp-year">
      <button class="cs-month-nav" type="button" onclick="csPickerShiftYear(-1, event)" title="Previous year">‹</button>
      <span class="cs-mp-year-text">${_csPickerYear}</span>
      <button class="cs-month-nav" type="button" onclick="csPickerShiftYear(1, event)" title="Next year"${nextYDis ? ' disabled' : ''}>›</button>
    </div>
    <div class="cs-mp-grid">
      ${months.map((mn, i) => {
        const disabled = _csPickerYear > now.getFullYear()
                      || (_csPickerYear === now.getFullYear() && i > now.getMonth());
        const selected = _csPickerYear === curY && i === curM;
        return `<button class="cs-mp-month${selected ? ' selected' : ''}" type="button" onclick="csPickerSelect(${i}, event)"${disabled ? ' disabled' : ''}>${mn}</button>`;
      }).join('')}
    </div>`;
}

async function _renderMonthlyReport() {
  const host = document.getElementById('csSummary');
  if (!host) return;
  host.innerHTML = '<div class="spinner spinner-inline">Loading…</div>';
  const monthly = await _loadMonthCharacterStats(csReportMonth);
  host.innerHTML = _renderRosterSummary(monthly.stats, monthly.label, monthly.gameCount);
}

function _renderRosterSummary(rows, monthLabel, gameCount) {
  const nextDisabled = _isFutureMonth(
    new Date(csReportMonth.getFullYear(), csReportMonth.getMonth() + 1, 1)
  );
  const header = monthLabel
    ? `<div class="cs-summary-header">
         <button class="cs-month-nav" type="button" onclick="csShiftMonth(-1)" title="Previous month">‹</button>
         <span class="cs-month-picker-wrap">
           <button class="cs-month-text" type="button" onclick="csOpenMonthPicker(event)" title="Pick month">Monthly report: ${_esc(monthLabel)} (${gameCount} ${gameCount === 1 ? 'game' : 'games'})</button>
           <div class="cs-month-picker-panel" id="csMonthPickerPanel" role="dialog" aria-label="Pick month"></div>
         </span>
         <button class="cs-month-nav" type="button" onclick="csShiftMonth(1)" title="Next month"${nextDisabled ? ' disabled' : ''}>›</button>
       </div>`
    : '';
  if (!rows.length) return header;

  const withPct = rows.map(r => ({
    name:  r.character,
    wins:  r.wins  || 0,
    games: r.games || 0,
    pct:   r.games ? r.wins / r.games : 0,
  }));

  const sortedPct   = [...withPct].sort((a, b) => b.pct   - a.pct   || b.wins - a.wins);
  const sortedWins  = [...withPct].sort((a, b) => b.wins  - a.wins  || b.pct  - a.pct);
  const sortedGames = [...withPct].sort((a, b) => b.games - a.games || b.wins - a.wins);

  const fmtPct   = r => Math.round(r.pct * 100) + '%';
  const fmtWins  = r => String(r.wins);
  const fmtGames = r => String(r.games);

  const card = (title, sortedRows, fmt) => {
    const top    = sortedRows.slice(0, 3);
    const bottom = sortedRows.slice(-3).reverse();
    const row = r => `
      <a class="cs-mini-row" href="characters.html?char=${encodeURIComponent(r.name)}" title="${_esc(r.name)}">
        <img class="char-portrait" src="${charImgSrc(r.name)}" onerror="this.src='asset/players/default.svg'" alt="${_esc(r.name)}">
        <span class="cs-mini-val">${fmt(r)}</span>
      </a>`;
    return `
      <div class="cs-summary-card">
        <div class="cs-summary-title">${title}</div>
        <div class="cs-mini-section-lbl">Top</div>
        ${top.map(row).join('')}
        ${bottom.length ? `<div class="cs-mini-section-lbl">Bottom</div>${bottom.map(row).join('')}` : ''}
      </div>`;
  };

  return `${header}
    <div class="cs-summary">
      ${card('% Wins',  sortedPct,   fmtPct)}
      ${card('# Wins',  sortedWins,  fmtWins)}
      ${card('# Games', sortedGames, fmtGames)}
    </div>`;
}

let csMode    = 'pct';   // 'pct' | 'count' | 'games'
let csChar    = null;      // character record from DB
let csBuckets = null;      // computed stats per player count
let csAllChars  = [];        // full character list for search

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('characters.html');
  await initAuth();

  const params   = new URLSearchParams(location.search);
  const charName = (params.get('char') || '').trim();
  if (!charName) await renderRosterPage((params.get('box') || '').trim());
  else           await renderDetailPage(charName);
}

async function renderRosterPage(scrollBox) {
  document.title = 'DiVilytics | Characters';

  csAllChars = await loadCharacters();
  setVisible('csSearchWrap', true);
  _attachCharSearch();

  const byBox = groupByBox(csAllChars);
  const root = document.getElementById('csRoot');
  root.className = '';
  root.innerHTML =
    `<div id="csSummary"></div>` +
    Object.entries(byBox).map(([box, chars]) => `
      <div class="char-roster-group" id="${boxAnchorId(box)}">
        <div class="char-roster-group-name">${_esc(box)}</div>
        <div class="char-roster">${
          chars.map(c => `
            <a class="char-roster-item" href="characters.html?char=${encodeURIComponent(c.name)}">
              <img class="char-roster-portrait" src="${charImgSrc(c.name)}" alt="" onerror="this.src='asset/players/default.svg'">
              <div class="char-roster-name">${_esc(c.name)}</div>
            </a>`).join('')
        }</div>
      </div>`).join('');

  // Wait for the monthly report (it fills #csSummary above the groups and
  // changes layout) before scrolling, so a ?box= jump lands at the right spot.
  await _renderMonthlyReport();
  if (scrollBox) {
    requestAnimationFrame(() => document.getElementById(scrollBox)?.scrollIntoView({ block: 'start' }));
  }
}

function _showCsEmpty(html) {
  const el = document.getElementById('csRoot');
  el.className = '';
  el.innerHTML = html;
}

async function renderDetailPage(charName) {
  document.title = `DiVilytics | ${charName}`;

  csAllChars = await loadCharacters();
  csChar     = csAllChars.find(c => c.name === charName);

  if (!csChar) {
    _showCsEmpty(`<div class="empty"><h3>Character not found</h3><p>${_esc(charName)}</p></div>`);
    return;
  }

  await _renderCharIdentity();
  setVisible('csSearchWrap', true);
  _attachCharSearch();

  // Load bucketed stats via server-side aggregation (one RPC, no row-limit risk)
  const { data: buckets, error } = await db.rpc('character_bucket_stats', { char_name: charName });

  if (error) {
    _showCsEmpty(`<div class="empty"><p>Error: ${_esc(error.message)}</p></div>`);
    return;
  }

  if (!buckets || !buckets.length) {
    _showCsEmpty(`<div class="empty"><div class="empty-icon">🎭</div><h3>No games yet</h3><p>${_esc(csChar.name)} hasn't been played in any recorded games.</p></div>`);
    return;
  }

  csBuckets = _foldBuckets(buckets);
  render();
  await renderFaq(charName);
}

async function _renderCharIdentity() {
  const objectives = await loadObjectives();
  const objective  = objectives[csChar.name];
  const paceDot    = csChar.pace ? `<span class="pace-dot ${csChar.pace}" title="${_esc(csChar.pace)}"></span>` : '';
  document.getElementById('csIdentity').innerHTML =
    `<div class="pf-identity"><img class="char-portrait identity-portrait zoomable" src="${charImgSrc(csChar.name)}" alt="" onerror="this.src='asset/players/default.svg'" onclick="showAvatarLightbox(this.src, 'asset/players/default.svg')"><span class="pf-name-block"><span class="pf-nick">${_esc(csChar.name)}</span>${csChar.box ? `<a class="pf-since pf-since-link" href="characters.html?box=${boxAnchorId(csChar.box)}" title="View ${_esc(csChar.box)} characters">${_esc(csChar.box)}</a>` : ''}</span></div>${objective ? `<p class="char-objective">${paceDot}${_esc(objective)}</p>` : ''}`;
}

function _foldBuckets(buckets) {
  const out = {
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
    out.all.games += g;
    out.all.wins  += w;
    if (n >= 2 && n <= 6) out[n] = { games: g, wins: w };
  }
  return out;
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────

function csSetMode(m) {
  csMode = m;
  render();
}

// ── SEARCH / AUTOCOMPLETE ─────────────────────────────────────────────────────

function _attachCharSearch() {
  attachSearchBox({
    inputId:    'csSearchInput',
    dropdownId: 'csDropdown',
    fetchOptions: q => {
      const lower = q.toLowerCase();
      return csAllChars.filter(c => c.name.toLowerCase().includes(lower)).slice(0, 8);
    },
    renderOption: c => `
      <div class="cs-option" data-name="${_esc(c.name)}">
        <img class="char-portrait" src="${charImgSrc(c.name)}" alt="">
        <span>${_esc(c.name)}</span>
        <span class="cs-option-box">${_esc(c.box)}</span>
      </div>`,
    onSelect: opt => { location.href = `characters.html?char=${encodeURIComponent(opt.dataset.name)}`; },
  });
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
    <div class="controls mb-1">
      <div class="seg">
        <button class="seg-btn ${csMode === 'pct'   ? 'on' : ''}" onclick="csSetMode('pct')">% Wins</button>
        <button class="seg-btn ${csMode === 'count' ? 'on' : ''}" onclick="csSetMode('count')"># Wins</button>
        <button class="seg-btn ${csMode === 'games' ? 'on' : ''}" onclick="csSetMode('games')"># Games</button>
      </div>
    </div>
    <div class="lb-table cs-table mb-1-25">
      <div class="lb-head">
        <span>Players</span>
        <span></span>
        <span class="text-right">${csMode === 'count' ? '# Wins' : csMode === 'games' ? '# Games' : '% Wins'}</span>
        <span class="text-right">${csMode === 'games' ? '# Wins' : '# Games'}</span>
      </div>
      ${rows.map(r => {
        const b       = csBuckets[r.key];
        const pct     = b.games ? b.wins / b.games : 0;
        const barW    = b.games
          ? Math.round(((csMode === 'count' ? b.wins : csMode === 'games' ? b.games : pct) / maxVal) * 100)
          : 0;
        const dispVal = b.games
          ? (csMode === 'count' ? b.wins : csMode === 'games' ? b.games : Math.round(pct * 100) + '%')
          : '|';
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

// ── CHARACTER FAQ ─────────────────────────────────────────────────────────────


async function renderFaq(charName) {
  const el = document.getElementById('csFaq');
  if (!el) return;
  const faq   = await loadCharFaq();
  const rules = faq[charName];
  if (!rules || !rules.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="home-faq mt-1-5">
      <h2 class="home-faq-title">F.A.Q. <span>${_esc(charName)}</span></h2>
      <div class="home-faq-list">
        ${rules.map(r => `<div class="home-faq-item"><strong>${_esc(r.term)}</strong><span>${_esc(r.text)}</span></div>`).join('')}
      </div>
    </div>`;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();


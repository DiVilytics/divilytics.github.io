// ── STATE ─────────────────────────────────────────────────────────────────────

let pfNick      = '';
let pfGames     = [];   // games this nickname appeared in
let pfPlayers   = [];   // all players for those games
let charBoxMap  = {};
let pfChars     = [];
let pfAvatarUrl = null;

let pfMode           = 'pct';   // 'pct' | 'count' | 'games'
let pfFilter         = 'all';   // 'all' | 2..6
let pfWinsOnly       = false;
let pfLocationFilter = null;

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('player.html');
  await initAuth();

  const params = new URLSearchParams(location.search);
  pfNick = (params.get('nick') || '').trim();

  if (!pfNick) {
    const loggedUser    = getCurrentUser();
    const loggedProfile = getCurrentProfile();
    if (loggedUser && loggedProfile?.nickname) {
      pfNick = loggedProfile.nickname;
      history.replaceState(null, '', `player.html?nick=${encodeURIComponent(pfNick)}`);
    } else if (loggedUser && !loggedProfile) {
      document.title = 'DiVilytics | Player';
      document.getElementById('pfRoot').className = '';
      document.getElementById('pfRoot').innerHTML = `
        <div class="empty">
          <div class="empty-icon">👤</div>
          <h3>Welcome!</h3>
          <p>Choose a nickname before you can record games.</p>
          <button class="btn btn-primary btn-sm" onclick="_openNicknameModal(newNick => { location.href = 'player.html?nick=' + encodeURIComponent(newNick); })">Set Nickname</button>
        </div>`;
      return;
    } else {
      document.getElementById('pfRoot').className = '';
      document.getElementById('pfRoot').innerHTML =
        `<div class="empty"><div class="empty-icon">👤</div><h3>No player selected</h3><p>Open a profile by clicking a nickname on the leaderboard or a game card.</p></div>`;
      return;
    }
  }

  document.title = `DiVilytics | ${pfNick}`;

  const [chars, { data: viewedProfile }] = await Promise.all([
    loadCharacters(),
    db.from('profiles').select('avatar_url, default_avatar, created_at').eq('nickname', pfNick).maybeSingle(),
  ]);
  pfAvatarUrl = resolveAvatar(viewedProfile);
  const sinceHTML = viewedProfile?.created_at
    ? `<span class="pf-since">Since ${fmtDateShort(viewedProfile.created_at)}</span>`
    : '';
  pfChars     = chars;
  charBoxMap  = Object.fromEntries(chars.map(c => [c.name, c.box]));

  const profile = getCurrentProfile();
  const isOwnProfile = profile && profile.nickname === pfNick;
  const nameBlock = `<span class="pf-name-block"><span class="pf-nick">${_esc(pfNick)}</span>${sinceHTML}</span>`;
  let identityEl = document.getElementById('pfIdentity');
  if (!identityEl) {
    identityEl = document.createElement('div');
    identityEl.id = 'pfIdentity';
    document.getElementById('pfControls').insertAdjacentElement('beforebegin', identityEl);
  }
  identityEl.innerHTML =
    `<span class="pf-identity"><img id="pfAvatar" class="player-avatar-lg" src="${_esc(pfAvatarUrl)}" alt="" onerror="this.src='asset/player.svg'">${nameBlock}</span>`;

  await load();
}

async function load() {
  // 1) find all game_players rows matching this nickname
  const { data: myRows, error } = await db
    .from('game_players')
    .select('game_id')
    .eq('nickname', pfNick);

  if (error) {
    document.getElementById('pfRoot').className = '';
    document.getElementById('pfRoot').innerHTML =
      `<div class="empty"><p>Error: ${error.message}</p></div>`;
    return;
  }

  const gameIds = [...new Set((myRows || []).map(r => r.game_id))];

  if (!gameIds.length) {
    pfGames = [];
    pfPlayers = [];
  } else {
    const [{ data: g }, { data: gp }] = await Promise.all([
      db.from('games').select('*').in('id', gameIds).order('played_at', { ascending: false }),
      db.from('game_players').select('*').in('game_id', gameIds).order('position'),
    ]);
    pfGames   = g  || [];
    pfPlayers = gp || [];
  }

  document.getElementById('pfRoot').className = '';
  render();
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────

function pfSetMode(m) {
  pfMode = m;
  render();
}

function pfSetFilter(f) {
  pfFilter = f;
  updateFilterPills('#pfFilterPills .pill', f);
  render();
}

function pfToggleWinsOnly() {
  pfWinsOnly = !pfWinsOnly;
  const btn = document.getElementById('pfWinsOnlyBtn');
  if (btn) btn.classList.toggle('on', pfWinsOnly);
  _renderGamesList();
}

function pfJump(ev) {
  ev.preventDefault();
  const v = document.getElementById('pfJumpInput').value.trim();
  if (!v) return false;
  location.href = `player.html?nick=${encodeURIComponent(v)}`;
  return false;
}

let _pfSearchTimer = null;

async function pfSearchInput(e) {
  const val      = e.target.value.trim();
  const dropdown = document.getElementById('pfDropdown');

  if (!val) { dropdown.classList.remove('open'); return; }

  clearTimeout(_pfSearchTimer);
  _pfSearchTimer = setTimeout(async () => {
    const { data } = await db
      .from('profiles')
      .select('nickname, avatar_url, default_avatar')
      .ilike('nickname', `${val}%`)
      .not('nickname', 'is', null)
      .limit(8);

    const matches = data || [];
    if (!matches.length) { dropdown.classList.remove('open'); return; }

    populateSearchDropdown(
      dropdown,
      matches.map(p => `
        <div class="cs-option" data-nick="${_esc(p.nickname)}">
          ${playerAvatarHTML(resolveAvatar(p))}
          <span>${_esc(p.nickname)}</span>
        </div>`).join(''),
      opt => { location.href = `player.html?nick=${encodeURIComponent(opt.dataset.nick)}`; }
    );
  }, 200);
}

function pfSearchBlur() {
  _handleSearchBlur(document.getElementById('pfDropdown'));
}

function pfSearchKeydown(e) {
  _handleSearchKeydown(
    e,
    document.getElementById('pfDropdown'),
    document.getElementById('pfJumpInput'),
    opt => { location.href = `player.html?nick=${encodeURIComponent(opt.dataset.nick)}`; },
    v   => { location.href = `player.html?nick=${encodeURIComponent(v)}`; }
  );
}

function pfFilteredGameIds() {
  let games = pfGames;
  if (pfFilter !== 'all') {
    const countMap = {};
    for (const p of pfPlayers) countMap[p.game_id] = (countMap[p.game_id] || 0) + 1;
    games = games.filter(g => countMap[g.id] === pfFilter);
  }
  if (pfLocationFilter) games = games.filter(g => g.location === pfLocationFilter);
  return new Set(games.map(g => g.id));
}

function pfSetLocationFilter(loc) {
  pfLocationFilter = pfLocationFilter === loc ? null : loc;
  render();
}

function pfClearLocationFilter() {
  pfLocationFilter = null;
  render();
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render() {
  const root = document.getElementById('pfRoot');

  if (!pfGames.length) {
    document.getElementById('pfControls').style.display = 'none';
    root.innerHTML =
      `<div class="empty"><div class="empty-icon">🎭</div><h3>No games yet</h3><p>${_esc(pfNick)} hasn't played any recorded games.</p></div>`;
    return;
  }

  document.getElementById('pfControls').style.display = '';

  const keepIds = pfFilteredGameIds();
  const games   = pfGames.filter(g => keepIds.has(g.id));
  const mine    = pfPlayers.filter(p => keepIds.has(p.game_id) && p.nickname === pfNick);

  const wins   = mine.filter(p => p.is_winner).length;
  const nGames = mine.length;
  const winPct = nGames ? Math.round((wins / nGames) * 100) : 0;

  if (!nGames) {
    root.innerHTML =
      `<div class="empty"><div class="empty-icon">🔍</div><h3>No games for this filter</h3><p>Try adjusting the player count.</p></div>`;
    return;
  }

  // Character tally
  const charMap = {};
  for (const p of mine) {
    if (!charMap[p.character]) charMap[p.character] = { key: p.character, games: 0, wins: 0 };
    charMap[p.character].games++;
    if (p.is_winner) charMap[p.character].wins++;
  }
  let charRows = Object.values(charMap);
  charRows = sortStatRows(charRows, pfMode);

  const maxWins  = charRows[0]?.wins || 1;
  const maxPct   = Math.max(...charRows.map(r => r.games ? r.wins / r.games : 0)) || 1;
  const maxGames = charRows[0]?.games || 1;

  const ranks      = computeRanks(charRows, pfMode);
  const medalClass = rank => rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

  root.innerHTML = `
    <div class="summary">
      <div class="stat-box">
        <div class="stat-val">${winPct}%</div>
        <div class="stat-lbl">Win rate</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${wins}</div>
        <div class="stat-lbl">Wins</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${nGames}</div>
        <div class="stat-lbl">Games</div>
      </div>
    </div>

    <div class="controls" style="margin-bottom:1rem">
      <div class="seg">
        <button class="seg-btn ${pfMode === 'pct'   ? 'on' : ''}" onclick="pfSetMode('pct')"   type="button">% Wins</button>
        <button class="seg-btn ${pfMode === 'count' ? 'on' : ''}" onclick="pfSetMode('count')" type="button"># Wins</button>
        <button class="seg-btn ${pfMode === 'games' ? 'on' : ''}" onclick="pfSetMode('games')" type="button"># Games</button>
      </div>
    </div>

    <div class="lb-table" style="margin-bottom:1.25rem">
      <div class="lb-head">
        <span>#</span>
        <span>Character</span>
        <span></span>
        <span style="text-align:right">${pfMode === 'pct' ? '% Wins' : pfMode === 'count' ? '# Wins' : '# Games'}</span>
        <span style="text-align:right">${pfMode === 'games' ? '# Wins' : '# Games'}</span>
      </div>
      ${charRows.map((r, i) => {
        const rank    = ranks[i];
        const pct     = r.games ? r.wins / r.games : 0;
        const barW    = statBarWidth(r, pfMode, maxWins, maxGames, maxPct);
        const dispVal = pfMode === 'count' ? r.wins : pfMode === 'games' ? r.games : Math.round(pct * 100) + '%';
        const dispSub = pfMode === 'games' ? r.wins : r.games;
        const sub     = charBoxMap[r.key] || '';
        return `
          <a class="lb-row link" href="characters.html?char=${encodeURIComponent(r.key)}">
            <div class="rank-num ${medalClass(rank)}">${rank}</div>
            <div class="row-identity">
              ${charImgHTML(r.key)}
              <div>
                <div class="row-name">${_esc(r.key)}</div>
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
    </div>

    <div class="pf-games-header">
      <span class="pf-games-title">Games</span>
      ${pfLocationFilter ? `<button class="pill on" onclick="pfClearLocationFilter()" type="button">${_esc(pfLocationFilter)} · Clear</button>` : ''}
      <button class="pill" id="pfWinsOnlyBtn" onclick="pfToggleWinsOnly()" type="button">Wins only</button>
    </div>
    <div class="games-list" id="pfGamesList"></div>
  `;

  _renderGamesList(keepIds);
}

function _renderGamesList(keepIds = pfFilteredGameIds()) {
  let games = pfGames.filter(g => keepIds.has(g.id));

  if (pfWinsOnly) {
    const winGameIds = new Set(
      pfPlayers.filter(p => keepIds.has(p.game_id) && p.nickname === pfNick && p.is_winner).map(p => p.game_id)
    );
    games = games.filter(g => winGameIds.has(g.id));
  }

  const list = document.getElementById('pfGamesList');
  if (!list) return;
  list.innerHTML = '';
  for (const g of games) {
    const gp = pfPlayers.filter(p => p.game_id === g.id).sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.id < b.id ? -1 : 1));
    list.appendChild(buildProfileCard(g, gp));
  }
}
function pfCanEditGame(g, gp) {
  const user = getCurrentUser();
  if (!user) return false;
  if (g.created_by === user.id) return true;
  return gp.some(p => p.user_id === user.id);
}


function buildProfileCard(g, gp) {
  const editable    = pfCanEditGame(g, gp);
  const canFillMeta = editable && (!g.duration_minutes || !g.num_turns || !g.location);
  const actions     = editable ? `
    <div class="card-actions">
      <button class="btn btn-ghost btn-sm" onclick="pfShowGameQR('${g.id}')">QR Code</button>
      ${canFillMeta ? `<button class="btn btn-ghost btn-sm" onclick="pfEditGame('${g.id}')">Edit</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="pfDeleteGame('${g.id}')">Delete</button>
    </div>` : '';
  return buildGameCard(g, gp, { isSelf: p => p.nickname === pfNick, actions, onLocationClick: pfSetLocationFilter });
}

// ── GAME ACTIONS ──────────────────────────────────────────────────────────────

let _pfEditingId = null;

function pfEditGame(id) {
  const g = pfGames.find(x => x.id === id);
  if (!g) return;
  _pfEditingId = id;

  const dur  = document.getElementById('pfEditDur');
  const trn  = document.getElementById('pfEditTurns');
  const loc  = document.getElementById('pfEditLocation');

  dur.value = g.duration_minutes || '';
  trn.value = g.num_turns || '';
  loc.value = g.location || '';

  // Lock fields that already have a value
  dur.disabled = !!g.duration_minutes;
  trn.disabled = !!g.num_turns;
  loc.disabled = !!g.location;

  document.getElementById('pfEditErr').classList.remove('show');
  const btn = document.getElementById('pfEditSaveBtn');
  btn.disabled    = false;
  btn.textContent = 'Save Changes';

  openOverlay('pfEditOverlay');
}

function pfCloseEdit() {
  _pfEditingId = null;
  closeOverlay('pfEditOverlay');
}

async function pfSaveEdit() {
  if (!_pfEditingId) return;
  const g = pfGames.find(x => x.id === _pfEditingId);
  if (!g) { pfCloseEdit(); return; }

  const dur      = parseInt(document.getElementById('pfEditDur').value)   || null;
  const turns    = parseInt(document.getElementById('pfEditTurns').value) || null;
  const location = document.getElementById('pfEditLocation').value.trim() || null;

  const patch = {};
  if (!g.duration_minutes && dur)      patch.duration_minutes = dur;
  if (!g.num_turns        && turns)    patch.num_turns        = turns;
  if (!g.location         && location) patch.location         = location;

  if (!Object.keys(patch).length) {
    pfCloseEdit();
    return;
  }

  const btn   = document.getElementById('pfEditSaveBtn');
  const errEl = document.getElementById('pfEditErr');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const { error } = await db.from('games').update(patch).eq('id', _pfEditingId);

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.add('show');
    btn.disabled    = false;
    btn.textContent = 'Save Changes';
    return;
  }

  pfCloseEdit();
  await load();
}

function pfShowGameQR(id) {
  const url = new URL(`join.html?game=${id}`, location.href).href;
  document.getElementById('qrTitle').textContent = 'Share with players';
  document.getElementById('qrBlurb').textContent = 'Other players can scan this QR code to claim their character and appear in the game record.';
  showQRModal(url, 'qrCode', 'qrOverlay');
}

let _pfPendingDeleteGameId = null;

function pfDeleteGame(id) {
  _pfPendingDeleteGameId = id;
  openOverlay('pfDeleteGameOverlay');
}

function pfCancelDeleteGame() {
  _pfPendingDeleteGameId = null;
  closeOverlay('pfDeleteGameOverlay');
}

async function pfConfirmDeleteGame() {
  if (!_pfPendingDeleteGameId) return;
  const id = _pfPendingDeleteGameId;
  pfCancelDeleteGame();
  const { error } = await db.from('games').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await load();
}

function closeProfileQR() {
  closeOverlay('qrOverlay');
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

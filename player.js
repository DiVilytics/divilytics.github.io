// ── STATE ─────────────────────────────────────────────────────────────────────

let pfNick      = '';
let pfGames     = [];   // games this nickname appeared in
let pfPlayers   = [];   // all players for those games
let pfCharBoxMap  = {};
let pfAvatarUrl = null;
let pfAllChars  = [];
let pfAch       = new Map();
let pfBoxInfo   = {};
let pfGlobal    = null;

let pfMode           = 'pct';   // 'pct' | 'count' | 'games'
let pfFilter         = 'all';   // 'all' | 2..6
let pfWinsOnly       = false;
let pfLocationFilter = null;

let pfDisplayLimit   = PAGE_SIZE;

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('player.html');
  await initAuth();
  _attachPlayerSearch();

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

  const [chars, viewedProfile, boxInfo] = await Promise.all([
    loadCharacters(),
    fetchProfile({ nickname: pfNick }, 'avatar_url, default_avatar, created_at'),
    loadBoxInfo(),
  ]);
  pfAllChars  = chars;
  pfBoxInfo   = boxInfo || {};
  pfAvatarUrl = resolveAvatar(viewedProfile);
  const sinceHTML = viewedProfile?.created_at
    ? `<span class="pf-since">Since ${fmtDateShort(viewedProfile.created_at)}</span>`
    : '';
  pfCharBoxMap  = Object.fromEntries(chars.map(c => [c.name, c.box]));

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
    `<div class="pf-identity-row">
      <span class="pf-identity">${avatarHTML(pfAvatarUrl, { cls: 'player-avatar-lg', extraClass: 'zoomable', id: 'pfAvatar', lightbox: true })}${nameBlock}</span>
      <button class="btn btn-ghost btn-sm pf-share-btn" onclick="showProfileQR()">Share</button>
    </div>`;

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

  let gameIds = (myRows || []).map(r => r.game_id);

  // On your own profile, also include games you created — even ones you haven't
  // claimed a character in (e.g. after releasing your claim). Otherwise such a
  // game would vanish from your profile, taking its manage/QR actions with it.
  const me      = getCurrentUser();
  const profile = getCurrentProfile();
  if (me && profile && profile.nickname === pfNick) {
    const { data: createdRows } = await db
      .from('games')
      .select('id')
      .eq('created_by', me.id);
    gameIds = gameIds.concat((createdRows || []).map(r => r.id));
  }

  gameIds = [...new Set(gameIds)];

  const { games, players } = await fetchGamesWithPlayers(gameIds, { orderByPlayedAtDesc: true });
  pfGames   = games;
  pfPlayers = players;
  pfAch     = computeCharacterAchievements(players.filter(p => p.nickname === pfNick));
  pfGlobal  = computeGlobalAchievements(games, players, p => p.nickname === pfNick);

  document.getElementById('pfRoot').className = '';

  // If we just came back from opening a game, scroll that card into view once
  // the list has rendered.
  try {
    _pfScrollToId = sessionStorage.getItem('pfReturnGameId');
    if (_pfScrollToId) sessionStorage.removeItem('pfReturnGameId');
  } catch (_) { _pfScrollToId = null; }

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
  pfDisplayLimit = PAGE_SIZE;
  _renderGamesList();
}

function pfJump(ev) {
  ev.preventDefault();
  const v = document.getElementById('pfJumpInput').value.trim();
  if (!v) return false;
  location.href = `player.html?nick=${encodeURIComponent(v)}`;
  return false;
}

function _attachPlayerSearch() {
  const goTo = nick => { location.href = `player.html?nick=${encodeURIComponent(nick)}`; };
  attachSearchBox({
    inputId:    'pfJumpInput',
    dropdownId: 'pfDropdown',
    debounceMs: 200,
    fetchOptions: dbSearchSource(q => db
      .from('profiles')
      .select('nickname, avatar_url, default_avatar')
      .ilike('nickname', `${q}%`)
      .not('nickname', 'is', null)
      .limit(8)),
    renderOption: p => `
      <div class="cs-option" data-nick="${_esc(p.nickname)}">
        ${playerAvatarHTML(resolveAvatar(p))}
        <span>${_esc(p.nickname)}</span>
      </div>`,
    onSelect:      opt => goTo(opt.dataset.nick),
    onDirectEnter: v   => goTo(v),
  });
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
  pfDisplayLimit = PAGE_SIZE;
  const root = document.getElementById('pfRoot');

  if (!pfGames.length) {
    setVisible('pfControls', false);
    root.innerHTML =
      `<div class="empty"><div class="empty-icon">🎭</div><h3>No games yet</h3><p>${_esc(pfNick)} hasn't played any recorded games.</p></div>`;
    return;
  }

  setVisible('pfControls', true);

  const keepIds = pfFilteredGameIds();
  const games   = pfGames.filter(g => keepIds.has(g.id));
  const mine    = pfPlayers.filter(p => keepIds.has(p.game_id) && p.nickname === pfNick);

  const wins   = mine.filter(p => p.is_winner).length;
  const nGames = mine.length;
  const winPct = nGames ? Math.round((wins / nGames) * 100) : 0;

  const avgDur   = avg(games.map(g => g.duration_minutes));
  const avgTurns = avg(games.map(g => g.num_turns));

  if (!nGames) {
    root.innerHTML =
      `<div class="empty"><div class="empty-icon">🔍</div><h3>No games for this filter</h3><p>Try adjusting the player count.</p></div>`;
    return;
  }

  // Character tally
  const charMap = {};
  for (const p of mine) {
    if (!charMap[p.character]) charMap[p.character] = { character: p.character, games: 0, wins: 0 };
    charMap[p.character].games++;
    if (p.is_winner) charMap[p.character].wins++;
  }
  const charRows = Object.values(charMap);

  root.innerHTML = `
    <div class="summary">
      ${statBoxesHTML([
        { val: nGames,       lbl: 'Games' },
        { val: avgDur   != null ? Math.round(avgDur) + 'm' : '-', lbl: 'Avg duration' },
        { val: avgTurns != null ? Math.round(avgTurns)     : '-', lbl: 'Avg rounds' },
        { val: winPct + '%', lbl: 'Win rate' },
        { val: wins,         lbl: 'Wins' },
      ])}
    </div>

    <div class="controls mb-1">
      <div class="seg">
        <button class="seg-btn ${pfMode === 'pct'   ? 'on' : ''}" onclick="pfSetMode('pct')"   type="button">% Wins</button>
        <button class="seg-btn ${pfMode === 'count' ? 'on' : ''}" onclick="pfSetMode('count')" type="button"># Wins</button>
        <button class="seg-btn ${pfMode === 'games' ? 'on' : ''}" onclick="pfSetMode('games')" type="button"># Games</button>
      </div>
    </div>

    ${renderStatTableHTML(charRows, {
      mode:        pfMode,
      headLabel:   'Character',
      getKey:      r   => r.character,
      getHref:     key => `characters.html?char=${encodeURIComponent(key)}`,
      getIdentity: key => charImgHTML(key),
      getSub:      key => pfCharBoxMap[key],
      getSubHref:  key => pfCharBoxMap[key] ? `characters.html?box=${boxAnchorId(pfCharBoxMap[key])}` : '',
      wrapClass:   'mb-1-25',
    })}

    ${(() => {
      const playedChars = pfAllChars.filter(c => {
        const s = pfAch.get(c.name);
        return s && (s.plays > 0 || s.wins > 0);
      });
      const ch  = countAchievements(pfAch, pfAllChars);
      const box = computeBoxCompletion(pfAch, pfAllChars, pfBoxInfo);
      const bc  = countBoxAchievements(box);
      const gc  = pfGlobal ? countGlobalAchievements(pfGlobal) : { earned: 0, total: 0 };
      // Only show boxes that have actually earned an achievement (played-all or
      // won-all), mirroring the characters grid which only shows earned ones.
      const earnedBoxes = box.filter(r => r.size > 0 && (r.played >= r.size || r.won >= r.size));
      return `
        <div class="pf-games-header">
          <span class="pf-games-title">Achievements · ${ch.earned + bc.earned + gc.earned} / ${ch.total + bc.total + gc.total}</span>
        </div>
        ${pfGlobal ? `
          <div class="ach-group-label">Global · ${gc.earned} / ${gc.total}</div>
          ${renderGlobalStripHTML(pfGlobal, true)}` : ''}
        <div class="ach-group-label">Boxes · ${bc.earned} / ${bc.total}</div>
        ${renderBoxStripHTML(earnedBoxes)}
        <div class="ach-group-label">Characters · ${ch.earned} / ${ch.total}</div>
        ${renderAchievementsGridHTML(pfAch, playedChars)}`;
    })()}

    <div class="pf-games-header">
      <span class="pf-games-title">Games</span>
      ${pfLocationFilter ? `<button class="pill on" onclick="pfClearLocationFilter()" type="button">${_esc(pfLocationFilter)} | Clear</button>` : ''}
      <button class="pill" id="pfWinsOnlyBtn" onclick="pfToggleWinsOnly()" type="button">Wins only</button>
    </div>
    <div class="games-list" id="pfGamesList"></div>
  `;

  _renderGamesList(keepIds);
}

let _pfScrollToId = null;

function _renderGamesList(keepIds = pfFilteredGameIds()) {
  let games = pfGames.filter(g => keepIds.has(g.id));

  if (pfWinsOnly) {
    const winGameIds = new Set(
      pfPlayers.filter(p => keepIds.has(p.game_id) && p.nickname === pfNick && p.is_winner).map(p => p.game_id)
    );
    games = games.filter(g => winGameIds.has(g.id));
  }

  // Returning from an opened game: make sure its card is within the rendered
  // page so we can scroll to it (it may sit beyond the current "Load more" cut).
  if (_pfScrollToId) {
    const idx = games.findIndex(g => g.id === _pfScrollToId);
    if (idx >= pfDisplayLimit) pfDisplayLimit = Math.ceil((idx + 1) / PAGE_SIZE) * PAGE_SIZE;
  }

  const visible = games.slice(0, pfDisplayLimit);
  const hasMore = games.length > visible.length;

  const list = document.getElementById('pfGamesList');
  if (!list) return;
  list.innerHTML = '';
  for (const g of visible) {
    const gp = pfPlayers.filter(p => p.game_id === g.id).sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (a.id < b.id ? -1 : 1));
    list.appendChild(buildProfileCard(g, gp));
  }
  if (hasMore) {
    const btn = document.createElement('button');
    btn.className = 'btn-load-more';
    btn.textContent = 'Load more';
    btn.onclick = () => { btn.disabled = true; pfLoadMore(); };
    list.appendChild(btn);
  }

  if (_pfScrollToId) {
    const target = _pfScrollToId;
    _pfScrollToId = null;
    requestAnimationFrame(() => {
      document.getElementById(`pf-game-${target}`)?.scrollIntoView({ block: 'center' });
    });
  }
}

function pfLoadMore() {
  pfDisplayLimit += PAGE_SIZE;
  _renderGamesList();
}
function buildProfileCard(g, gp) {
  const role    = gameUserRole(g, gp, getCurrentUser());
  const actions = role.isParticipant ? `
    <div class="card-actions">
      <a class="btn btn-ghost btn-sm" href="join.html?game=${g.id}" onclick="pfRememberReturn('${g.id}')">Open</a>
      ${role.isCreator ? `<button class="btn btn-danger btn-sm" onclick="pfDeleteGame('${g.id}')">Delete</button>` : ''}
    </div>` : '';
  const me = getCurrentUser();
  const card = buildGameCard(g, gp, { isSelf: p => me && p.user_id === me.id, actions, onLocationClick: pfSetLocationFilter });
  card.id = `pf-game-${g.id}`;   // so we can scroll back to it after opening a game
  return card;
}

// ── GAME ACTIONS ──────────────────────────────────────────────────────────────

// Remember which game we're opening so we can scroll back to it on return.
function pfRememberReturn(id) {
  try { sessionStorage.setItem('pfReturnGameId', id); } catch (_) {}
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

// ── SHARE PROFILE QR ─────────────────────────────────────────────────────────

function showProfileQR() {
  if (!pfNick) return;
  const title = document.getElementById('pfQrTitle');
  if (title) title.textContent = `Share ${pfNick}`;
  showQRModal(new URL(`player.html?nick=${encodeURIComponent(pfNick)}`, location.href).href, 'pfQrCode', 'pfQrOverlay');
}

function closeProfileQR() {
  closeOverlay('pfQrOverlay');
}

// ── ACHIEVEMENT DETAIL ────────────────────────────────────────────────────────

function _showAchDetail(charName) {
  const body  = document.getElementById('achBody');
  const title = document.getElementById('achTitle');
  if (!body || !title) return;
  title.textContent = pfNick ? `Achievements | ${pfNick}` : 'Achievements';
  body.innerHTML = renderAchievementDetailHTML(charName, pfAch.get(charName));
  openOverlay('achOverlay');
}

function _showBoxDetail(boxName) {
  const body  = document.getElementById('achBody');
  const title = document.getElementById('achTitle');
  if (!body || !title) return;
  const row = computeBoxCompletion(pfAch, pfAllChars, pfBoxInfo).find(r => r.box === boxName);
  if (!row) return;
  title.textContent = pfNick ? `Achievements | ${pfNick}` : 'Achievements';
  body.innerHTML = renderBoxDetailHTML(row, groupByBox(pfAllChars)[boxName] || [], pfAch);
  openOverlay('achOverlay');
}

function _showGlobalDetail(key) {
  const body  = document.getElementById('achBody');
  const title = document.getElementById('achTitle');
  if (!body || !title || !pfGlobal) return;
  title.textContent = pfNick ? `Achievements | ${pfNick}` : 'Achievements';
  body.innerHTML = renderGlobalDetailHTML(key, pfGlobal);
  openOverlay('achOverlay');
}

function _closeAchOverlay() { closeOverlay('achOverlay'); }

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

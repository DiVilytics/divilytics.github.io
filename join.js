// ── STATE ─────────────────────────────────────────────────────────────────────

let claimGame    = null;
let claimPlayers = [];

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('');
  await initAuth(() => render());

  const params = new URLSearchParams(location.search);
  const gameId = params.get('game');

  if (!gameId) {
    return showClaimError('No game specified.');
  }

  const { data: game, error: gameErr } = await db
    .from('games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (gameErr || !game) {
    return showClaimError('Game not found.');
  }

  const { data: players, error: playersErr } = await db
    .from('game_players')
    .select('*')
    .eq('game_id', gameId);

  if (playersErr) {
    return showClaimError(playersErr.message);
  }

  claimGame    = game;
  claimPlayers = players || [];

  render();
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function render() {
  const root    = document.getElementById('claimRoot');
  const user    = getCurrentUser();
  const profile = getCurrentProfile();

  root.className = '';

  if (!claimGame) return;

  if (!user) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🔒</div>
        <h3>Sign in to claim</h3>
        <p>You need to be signed in to claim your character.</p>
        <button class="btn btn-primary" onclick="goToSignIn()">Sign in</button>
      </div>`;
    return;
  }

  if (!profile) {
    root.innerHTML = `
      <div class="empty">
        <div class="empty-icon">👤</div>
        <h3>Set a nickname first</h3>
        <p>You need a nickname before you can claim a character.</p>
        <button class="btn btn-primary" onclick="_openNicknameModal()">Set nickname</button>
      </div>`;
    return;
  }

  const myClaim = claimPlayers.find(p => p.user_id === user.id);

  const meta = [
    fmtDuration(claimGame.duration_minutes),
    claimGame.num_turns ? `${claimGame.num_turns} rounds` : null,
    claimGame.location  ? claimGame.location             : null,
  ].filter(Boolean).join(' | ');

  const rowsHTML = claimPlayers.map(p => {
    const isMine = p.user_id === user.id;
    let actionHTML;
    if (p.nickname) {
      actionHTML = `<div class="claim-nick">${_esc(p.nickname)}</div>`;
    } else if (myClaim) {
      actionHTML = `<div class="claim-nick unclaimed">Unclaimed</div>`;
    } else {
      actionHTML = `<button class="btn btn-ghost btn-sm" onclick="claimCharacter('${p.id}')">Claim</button>`;
    }
    return `
      <div class="claim-row${p.is_winner ? ' winner' : ''}${isMine ? ' mine' : ''}">
        <div class="claim-char">
          ${p.is_winner ? '<span class="win-star">👑</span>' : ''}
          ${charImgHTML(p.character)}${_esc(p.character)}
        </div>
        ${actionHTML}
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="claim-game-info">
      <div class="claim-date">${fmtDateTime(claimGame.played_at)}</div>
      ${meta ? `<div class="claim-meta">${meta}</div>` : ''}
    </div>
    <div class="section-label">Players</div>
    <div class="claim-rows">${rowsHTML}</div>
    ${myClaim ? `<p class="claim-success">You are playing as <strong>${charImgHTML(myClaim.character)}${_esc(myClaim.character)}</strong> in this game.</p>` : ''}`;
}

// ── CLAIM ─────────────────────────────────────────────────────────────────────

let _pendingClaimId = null;

function _ensureClaimConfirmModal() {
  if (document.getElementById('claimConfirmOverlay')) return;
  const tpl = document.createElement('div');
  tpl.innerHTML = `
    <div class="overlay" id="claimConfirmOverlay" onclick="if(event.target===this) cancelClaim()">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h3>Confirm your character</h3>
          <button class="sheet-close" onclick="cancelClaim()">×</button>
        </div>
        <div class="sheet-body">
          <p class="confirm-text">You're about to claim <strong id="claimConfirmChar" class="text-emph"></strong> in this game. This can't be undone!</p>
        </div>
        <div class="sheet-footer sheet-footer-row">
          <button class="btn btn-ghost"   onclick="cancelClaim()">Cancel</button>
          <button class="btn btn-primary" id="claimConfirmBtn" onclick="confirmClaim()">Claim character</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(tpl.firstElementChild);
}

function claimCharacter(playerId) {
  const user    = getCurrentUser();
  const profile = getCurrentProfile();
  if (!user || !profile) return;
  if (claimPlayers.find(p => p.user_id === user.id)) return;

  const player = claimPlayers.find(p => p.id === playerId);
  if (!player) return;

  // If it got claimed out from under us, refresh
  if (player.user_id) { init(); return; }

  _ensureClaimConfirmModal();
  _pendingClaimId = playerId;
  document.getElementById('claimConfirmChar').innerHTML = charImgHTML(player.character) + _esc(player.character);
  const btn = document.getElementById('claimConfirmBtn');
  btn.disabled    = false;
  btn.textContent = 'Claim character';
  openOverlay('claimConfirmOverlay');
}

function cancelClaim() {
  _pendingClaimId = null;
  const el = document.getElementById('claimConfirmOverlay');
  if (el) closeOverlay('claimConfirmOverlay');
}

async function confirmClaim() {
  if (!_pendingClaimId) return;
  const user    = getCurrentUser();
  const profile = getCurrentProfile();
  if (!user || !profile) { cancelClaim(); return; }

  const playerId = _pendingClaimId;

  const btn = document.getElementById('claimConfirmBtn');
  btn.disabled    = true;
  btn.textContent = 'Claiming…';

  const { error } = await db
    .from('game_players')
    .update({ user_id: user.id, nickname: profile.nickname })
    .eq('id', playerId)
    .is('user_id', null);

  cancelClaim();

  if (error) {
    const root = document.getElementById('claimRoot');
    const errEl = document.createElement('div');
    errEl.className = 'err show';
    errEl.textContent = error.message;
    root.prepend(errEl);
    return;
  }

  await init();
}

// ── ERROR ─────────────────────────────────────────────────────────────────────

function showClaimError(msg) {
  const root = document.getElementById('claimRoot');
  root.className = '';
  root.innerHTML = `
    <div class="empty">
      <div class="empty-icon">⚠️</div>
      <h3>Oops</h3>
      <p>${msg}</p>
      <a class="btn btn-ghost btn-sm" href="index.html">Back to Games</a>
    </div>`;
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

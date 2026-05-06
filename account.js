let _acctChars    = [];
let _acctAvatar   = null;
let _acctNick     = null;
let _acctFallback = 'asset/player.svg';

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  await initAuth(() => _onAuthChange());
  const user = getCurrentUser();
  if (!user) { location.href = 'index.html'; return; }
  _acctChars = await loadCharacters();
  _renderPage();
}

function _onAuthChange() {
  if (!getCurrentUser()) location.href = 'index.html';
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function _renderPage() {
  const profile = getCurrentProfile();
  _acctNick     = profile?.nickname   || null;
  _acctAvatar   = profile?.avatar_url || null;
  _acctFallback = profile?.default_avatar || 'asset/player.svg';

  const since = profile?.created_at ? fmtDateShort(profile.created_at) : null;

  const root = document.getElementById('acctRoot');
  root.className = '';
  root.innerHTML = `
    <div class="acct-identity">
      <img class="player-avatar-lg" id="acctAvatarPreview"
        src="${_esc(_acctAvatar || _acctFallback)}"
        onerror="this.src='${_esc(_acctFallback)}'" alt="">
      <div>
        <div class="acct-nick">${_esc(_acctNick || '—')}</div>
        ${since ? `<div class="pf-since">Since ${_esc(since)}</div>` : ''}
      </div>
    </div>

    <div class="acct-section">
      <div class="section-label">Player icon</div>
      <div class="err" id="avatarErr"></div>
      <div class="avatar-picker" id="avatarPicker"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" id="saveAvatarBtn" onclick="saveAvatar()">Save icon</button>
        <button class="btn btn-ghost btn-sm" id="removeAvatarBtn" onclick="removeAvatar()">Remove icon</button>
      </div>
    </div>

    <div class="acct-section">
      <div class="section-label">Profile</div>
      <div class="acct-actions">
        <button class="btn btn-ghost" onclick="showProfileQR()">Share Profile</button>
        <button class="btn btn-ghost" onclick="changeNickname()">Change Nickname</button>
        <button class="btn btn-ghost" onclick="signOut()">Sign out</button>
      </div>
    </div>

    <div class="acct-section acct-danger">
      <div class="section-label">Danger zone</div>
      <button class="btn btn-danger" onclick="openDeleteAccount()">Delete Profile</button>
    </div>
  `;

  _buildAvatarPicker();
}

function _buildAvatarPicker() {
  const picker = document.getElementById('avatarPicker');
  if (!picker) return;
  const options = [
    ...Array.from({ length:19 }, (_, i) => ({
      label: `Player ${i + 1}`,
      value: `asset/players/${i + 1}.jpeg`,
      src:   `asset/players/${i + 1}.jpeg`,
    })),
  ];
  picker.innerHTML = '';
  for (const opt of options) {
    const img = document.createElement('img');
    img.className = 'avatar-option' + ((opt.value ?? '') === (_acctAvatar ?? '') ? ' selected' : '');
    img.src   = opt.src;
    img.alt   = opt.label;
    img.dataset.value = opt.value ?? '';
    img.onerror = () => { img.src = 'asset/player.svg'; };
    img.onclick = () => {
      _acctAvatar = opt.value;
      picker.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
      img.classList.add('selected');
    };
    picker.appendChild(img);
  }
}

// ── SAVE AVATAR ───────────────────────────────────────────────────────────────

async function saveAvatar() {
  const user = getCurrentUser();
  if (!user) return;

  const btn   = document.getElementById('saveAvatarBtn');
  const errEl = document.getElementById('avatarErr');
  btn.disabled    = true;
  btn.textContent = 'Saving…';
  errEl.classList.remove('show');

  const { error } = await db.from('profiles').update({ avatar_url: _acctAvatar }).eq('id', user.id);

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.add('show');
    btn.disabled    = false;
    btn.textContent = 'Save icon';
    return;
  }

  const preview = document.getElementById('acctAvatarPreview');
  if (preview) preview.src = _acctAvatar || _acctFallback;
  _updateAuthUI();   // refresh nav avatar
  btn.textContent = 'Saved!';
  setTimeout(() => { btn.disabled = false; btn.textContent = 'Save icon'; }, 1500);
}

async function removeAvatar() {
  const user = getCurrentUser();
  if (!user) return;

  const btn   = document.getElementById('removeAvatarBtn');
  const errEl = document.getElementById('avatarErr');
  btn.disabled    = true;
  btn.textContent = 'Removing…';
  errEl.classList.remove('show');

  const { error } = await db.from('profiles').update({ avatar_url: null }).eq('id', user.id);

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.add('show');
    btn.disabled    = false;
    btn.textContent = 'Remove icon';
    return;
  }

  _acctAvatar = null;
  document.getElementById('avatarPicker').querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
  const preview = document.getElementById('acctAvatarPreview');
  if (preview) preview.src = _acctFallback;
  _updateAuthUI();
  btn.textContent = 'Removed!';
  setTimeout(() => { btn.disabled = false; btn.textContent = 'Remove icon'; }, 1500);
}

// ── SHARE PROFILE QR ─────────────────────────────────────────────────────────

function showProfileQR() {
  const nick = getCurrentProfile()?.nickname;
  if (!nick) return;
  showQRModal(new URL(`player.html?nick=${encodeURIComponent(nick)}`, location.href).href, 'acctQrCode', 'acctQrOverlay');
}

function closeProfileQR() {
  closeOverlay('acctQrOverlay');
}

// ── CHANGE NICKNAME ───────────────────────────────────────────────────────────

function changeNickname() {
  openChangeNicknameModal(newNick => {
    _acctNick = newNick;
    const el = document.querySelector('.acct-nick');
    if (el) el.textContent = newNick;
  });
}

// ── DELETE ACCOUNT ────────────────────────────────────────────────────────────

function openDeleteAccount() {
  document.getElementById('delAccountInput').value = '';
  document.getElementById('delAccountErr').classList.remove('show');
  _syncDelBtn();
  openOverlay('delAccountOverlay');
  setTimeout(() => document.getElementById('delAccountInput')?.focus(), 120);
}

function closeDeleteAccount() {
  closeOverlay('delAccountOverlay');
}

function _syncDelBtn() {
  const input = document.getElementById('delAccountInput');
  const btn   = document.getElementById('delAccountBtn');
  if (!input || !btn) return;
  btn.disabled = (input.value !== _acctNick);
}

async function confirmDeleteAccount() {
  const errEl = document.getElementById('delAccountErr');
  errEl.textContent = '';
  errEl.classList.remove('show');

  const user = getCurrentUser();
  if (!user) return;

  const btn = document.getElementById('delAccountBtn');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';

  const { error: gpErr } = await db
    .from('game_players')
    .update({ nickname: null })
    .eq('user_id', user.id);

  if (gpErr) {
    errEl.textContent = gpErr.message;
    errEl.classList.add('show');
    btn.disabled    = false;
    btn.textContent = 'Delete my profile';
    return;
  }

  const { error } = await db.from('profiles').delete().eq('id', user.id);
  if (error) {
    errEl.textContent = error.message;
    errEl.classList.add('show');
    btn.disabled    = false;
    btn.textContent = 'Delete my profile';
    return;
  }

  await db.auth.signOut();
  location.href = 'index.html';
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

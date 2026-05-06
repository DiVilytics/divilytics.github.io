// ── NAV ───────────────────────────────────────────────────────────────────────

let _activeNavFile = '';

function setActiveNav(filename) {
  _activeNavFile = filename;
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === filename);
  });
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

let _currentUser    = null;
let _currentProfile = null;
let _authChangeHook = null;

async function initAuth(onChange) {
  _authChangeHook = onChange;
  _injectNicknameModal();
  _updateAuthUI();  // render sign-in button immediately, before async session check

  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    _currentUser = session.user;
    await _loadProfile();
  }

  db.auth.onAuthStateChange(async (event, session) => {
    const prevId = _currentUser?.id;
    _currentUser = session?.user || null;

    if (_currentUser && _currentUser.id !== prevId) {
      await _loadProfile();
    }
    if (!_currentUser) _currentProfile = null;

    _updateAuthUI();

    if (event === 'SIGNED_IN' && _currentUser && !_currentProfile) {
      _openNicknameModal();
    }

    if (_authChangeHook) _authChangeHook(_currentUser, _currentProfile);
  });

  _updateAuthUI();

  // Force nickname setup if logged in but no profile yet
  // (e.g. user closed the tab before finishing setup and came back)
  if (_currentUser && !_currentProfile) {
    _openNicknameModal();
  }

  return { user: _currentUser, profile: _currentProfile };
}

async function _loadProfile() {
  if (!_currentUser) return null;
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', _currentUser.id)
    .maybeSingle();
  if (error) console.warn('loadProfile error:', error);
  _currentProfile = data || null;
  return _currentProfile;
}

function getCurrentUser()    { return _currentUser; }
function getCurrentProfile() { return _currentProfile; }

async function signInWithDiscord() {
  await db.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.href },
  });
}

async function signOut() {
  await db.auth.signOut();
  _currentUser    = null;
  _currentProfile = null;
  _updateAuthUI();
  if (_authChangeHook) _authChangeHook(null, null);
}

function _updateAuthUI() {
  const el = document.getElementById('navAuth');
  if (!el) return;

  const themeBtn = `<button class="nav-icon-btn" id="themeToggleBtn" onclick="toggleTheme()" title="Theme"></button>`;

  if (_currentUser) {
    const avatarSrc = resolveAvatar(_currentProfile);
    el.innerHTML = `${themeBtn}<a class="nav-avatar-link active" href="account.html" title="Account"><img class="nav-avatar" src="${_esc(avatarSrc)}" onerror="this.src='asset/player.svg'" alt=""></a>`;
  } else {
    el.innerHTML = `${themeBtn}<button class="nav-avatar-btn" onclick="signInWithDiscord()" title="Sign in"><img class="nav-avatar nav-avatar-guest" src="asset/player.svg" alt=""></button>`;
  }
  _updateThemeBtn();
  _updateThemeIcons();
}

// Render the default (signed-out) nav button immediately — before any async
// session check — so it never flickers in after the page loads.
_updateAuthUI();

// ── NICKNAME MODAL ────────────────────────────────────────────────────────────

let _nickMode      = 'create';  // 'create' | 'update'
let _nickOnSuccess = null;      // optional callback(newNick)

function _injectNicknameModal() {
  if (document.getElementById('nicknameOverlay')) return;
  const tpl = document.createElement('div');
  tpl.innerHTML = `
    <div class="overlay" id="nicknameOverlay">
      <div class="sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h3 id="nickModalTitle">Choose your nickname</h3>
        </div>
        <div class="sheet-body">
          <p id="nickModalHint" style="font-size:13px;color:var(--muted);margin-bottom:16px">
            This nickname identifies you on game records and the leaderboard. You can't change it later.
          </p>
          <div class="err" id="nickErr"></div>
          <div class="field">
            <label>Nickname</label>
            <input type="text" id="nickInput" maxlength="30" placeholder="e.g. emilio" autocomplete="off">
          </div>
        </div>
        <div class="sheet-footer">
          <button class="btn btn-primary" onclick="_saveNickname()">Save Nickname</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(tpl.firstElementChild);
}

function _openNicknameModal(onSuccess) {
  _nickMode = 'create';
  _nickOnSuccess = onSuccess || null;
  if (!document.getElementById('nicknameOverlay')) return;
  document.getElementById('nickModalTitle').textContent = 'Choose your nickname';
  document.getElementById('nickModalHint').textContent  = "This nickname identifies you on game records and the leaderboard. You can't change it later.";
  document.getElementById('nickInput').value = '';
  document.getElementById('nickErr').classList.remove('show');
  openOverlay('nicknameOverlay');
  setTimeout(() => document.getElementById('nickInput')?.focus(), 120);
}

function openChangeNicknameModal(onSuccess) {
  _nickMode = 'update';
  _nickOnSuccess = onSuccess || null;
  if (!document.getElementById('nicknameOverlay')) return;
  document.getElementById('nickModalTitle').textContent = 'Change your nickname';
  document.getElementById('nickModalHint').textContent  = 'Your nickname will be updated on all past and future game records.';
  document.getElementById('nickInput').value = _currentProfile?.nickname || '';
  document.getElementById('nickErr').classList.remove('show');
  openOverlay('nicknameOverlay');
  setTimeout(() => document.getElementById('nickInput')?.focus(), 120);
}

function _closeNicknameModal() {
  const overlay = document.getElementById('nicknameOverlay');
  if (!overlay) return;
  closeOverlay('nicknameOverlay');
}

async function _saveNickname() {
  const input = document.getElementById('nickInput');
  const errEl = document.getElementById('nickErr');
  const nick  = input?.value.trim() || '';

  errEl.textContent = '';
  errEl.classList.remove('show');

  if (nick.length < 2) {
    errEl.textContent = 'Nickname must be at least 2 characters.';
    errEl.classList.add('show');
    return;
  }

  if (_nickMode === 'update') {
    if (nick === _currentProfile?.nickname) { _closeNicknameModal(); return; }

    const { error } = await db.from('profiles').update({ nickname: nick }).eq('id', _currentUser.id);
    if (error) {
      errEl.textContent = error.message.includes('unique') || error.message.includes('duplicate')
        ? 'That nickname is already taken — try another.'
        : error.message;
      errEl.classList.add('show');
      return;
    }

    await db.from('game_players').update({ nickname: nick }).eq('user_id', _currentUser.id);

    _currentProfile = { ..._currentProfile, nickname: nick };
    _closeNicknameModal();
    _updateAuthUI();
    if (_authChangeHook) _authChangeHook(_currentUser, _currentProfile);
    if (_nickOnSuccess) _nickOnSuccess(nick);
    return;
  }

  const { error } = await db.from('profiles').insert({ id: _currentUser.id, nickname: nick });

  if (error) {
    errEl.textContent = error.message.includes('unique') || error.message.includes('duplicate')
      ? 'That nickname is already taken — try another.'
      : error.message;
    errEl.classList.add('show');
    return;
  }

  _currentProfile = { id: _currentUser.id, nickname: nick };
  _closeNicknameModal();
  _updateAuthUI();
  if (_authChangeHook) _authChangeHook(_currentUser, _currentProfile);
  if (_nickOnSuccess) _nickOnSuccess(nick);
}

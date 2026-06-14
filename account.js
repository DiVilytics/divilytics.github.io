let _acctChars      = [];
let _acctAvatar     = null;   // the saved avatar (in the DB)
let _pendingAvatar  = null;   // the currently-previewed selection, saved on "Apply"
let _acctNick       = null;
let _acctFallback   = 'asset/players/default.svg';
let _acctBoxInfo    = {};
let _acctOwnedBoxes = new Set();
let _acctAch        = new Map();
let _acctGlobal     = null;   // profile-wide achievements (table sizes / volume / locations)
let _acctIdentities = [];   // list of { provider, identity_id, email, last_sign_in_at, ... }

// Providers we support, in display order. Keep in sync with sign-in.html.
const ACCT_PROVIDERS = [
  { key: 'discord', label: 'Discord', logo: 'asset/signin/discord.png' },
  { key: 'google',  label: 'Google',  logo: 'asset/signin/google.png'  },
];

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  await initAuth(() => _onAuthChange());
  const user = getCurrentUser();
  if (!user) { location.href = 'index.html'; return; }
  const [chars, boxInfo, ownedRes, gpRes] = await Promise.all([
    loadCharacters(),
    loadBoxInfo(),
    db.from('profile_boxes').select('box').eq('user_id', user.id),
    db.from('game_players').select('game_id, character, is_winner').eq('user_id', user.id),
  ]);
  _acctChars      = chars;
  _acctBoxInfo    = boxInfo;
  _acctOwnedBoxes = new Set((ownedRes.data || []).map(r => r.box));
  const myGp      = gpRes.data || [];
  _acctAch        = computeCharacterAchievements(myGp);
  const { games, players } = await fetchGamesWithPlayers([...new Set(myGp.map(r => r.game_id))]);
  _acctGlobal     = computeGlobalAchievements(games, players, p => p.user_id === user.id);
  await _loadIdentities();
  _renderPage();
}

async function _loadIdentities() {
  try {
    const { data, error } = await db.auth.getUserIdentities();
    if (error) { console.warn('getUserIdentities error:', error); _acctIdentities = []; return; }
    _acctIdentities = data?.identities || [];
  } catch (e) {
    console.warn('getUserIdentities threw:', e);
    _acctIdentities = [];
  }
}

function _onAuthChange() {
  if (!getCurrentUser()) location.href = 'index.html';
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function _renderPage() {
  const profile = getCurrentProfile();
  const user    = getCurrentUser();
  _acctNick      = profile?.nickname   || null;
  _acctAvatar    = profile?.avatar_url || null;
  _pendingAvatar = _acctAvatar;
  _acctFallback  = profile?.default_avatar || 'asset/players/default.svg';

  const metaLn = profile?.created_at ? `Since ${fmtDateShort(profile.created_at)}` : null;

  const root = document.getElementById('acctRoot');
  root.className = '';
  root.innerHTML = `
    <div class="acct-section">
      <div class="section-label">My Profile</div>
      <div class="err" id="avatarErr"></div>
      <div class="acct-identity">
        <span id="acctAvatarPreviewWrap"></span>
        <div class="acct-identity-info">
          <div class="acct-nick">${_acctNick
            ? `<a class="acct-nick-link" href="player.html?nick=${encodeURIComponent(_acctNick)}" title="View my player page">${_esc(_acctNick)}</a>`
            : '—'}</div>
          ${metaLn ? `<div class="pf-since">${_esc(metaLn)}</div>` : ''}
          <button class="btn btn-ghost btn-sm acct-change-nick" onclick="changeNickname()">Change nickname</button>
        </div>
      </div>
      <div class="avatar-tab-row">
        <div class="seg" role="tablist">
          <button class="seg-btn on" id="avatarTabPhotos"  type="button" onclick="_showAvatarTab('photos')">Photos</button>
          <button class="seg-btn"    id="avatarTabBuilder" type="button" onclick="_showAvatarTab('builder')">Build</button>
        </div>
        <div class="avatar-actions">
          <button class="btn btn-ghost btn-sm" id="removeAvatarBtn" onclick="removeAvatar()" ${(_pendingAvatar || _acctAvatar) ? '' : 'disabled'}>Default</button>
          <button class="btn btn-ghost btn-sm" type="button" onclick="randomizeAvatar()">Random</button>
          <button class="btn btn-primary btn-sm" id="commitAvatarBtn" onclick="commitAvatar()" disabled>Apply</button>
        </div>
      </div>
      <div class="avatar-pane" id="avatarPanePhotos">
        <div class="avatar-picker" id="avatarPicker"></div>
      </div>
      <div class="avatar-pane" id="avatarPaneBuilder" hidden></div>
    </div>

    <div class="acct-section">
      <div class="section-label">My boxes</div>
      <div class="err" id="boxesErr"></div>
      <div class="box-picker" id="boxPicker"></div>
    </div>

    <div class="acct-section">
      ${(() => {
        const ch  = countAchievements(_acctAch, _acctChars);
        const box = computeBoxCompletion(_acctAch, _acctChars, _acctBoxInfo);
        const bc  = countBoxAchievements(box);
        const gc  = _acctGlobal ? countGlobalAchievements(_acctGlobal) : { earned: 0, total: 0 };
        return `
          <div class="section-label">My Achievements · ${ch.earned + bc.earned + gc.earned} / ${ch.total + bc.total + gc.total}</div>
          ${_acctGlobal ? `
            <div class="ach-group-label">Global · ${gc.earned} / ${gc.total}</div>
            ${renderGlobalStripHTML(_acctGlobal)}` : ''}
          <div class="ach-group-label">Boxes · ${bc.earned} / ${bc.total}</div>
          ${renderBoxStripHTML(box)}
          <div class="ach-group-label">Characters · ${ch.earned} / ${ch.total}</div>
          ${renderAchievementsGridHTML(_acctAch, _acctChars)}`;
      })()}
    </div>

    <div class="acct-section">
      <div class="section-label">Account</div>
      <div class="err" id="identitiesErr"></div>
      <div id="identitiesList" class="acct-identities">${_renderIdentitiesHTML()}</div>
      <div class="acct-actions">
        <button class="btn btn-ghost" id="exportDataBtn" onclick="exportMyData()">Download my data</button>
        <button class="btn btn-ghost" onclick="signOut()">Sign out</button>
      </div>
    </div>

    <div class="acct-section acct-danger">
      <div class="section-label">Danger zone</div>
      <button class="btn btn-danger" onclick="openDeleteAccount()">Delete profile</button>
    </div>
  `;

  _buildAvatarPicker();
  _buildAvatarBuilder();
  _buildBoxPicker();
}

function _showAvatarTab(name) {
  const isBuilder = name === 'builder';
  document.getElementById('avatarTabPhotos') ?.classList.toggle('on', !isBuilder);
  document.getElementById('avatarTabBuilder')?.classList.toggle('on',  isBuilder);
  const photos  = document.getElementById('avatarPanePhotos');
  const builder = document.getElementById('avatarPaneBuilder');
  if (photos)  photos.hidden  = isBuilder;
  if (builder) builder.hidden = !isBuilder;
  // The identity avatar previews the active tab: the saved icon (or a clicked
  // preset) on Presets, the in-progress composition on Build.
  if (isBuilder) {
    _previewBuild();
  } else {
    _pendingAvatar = _acctAvatar;
    document.querySelectorAll('#avatarPicker .avatar-option').forEach(el =>
      el.classList.toggle('selected', el.dataset.value === _acctAvatar));
    _renderPreview();
    _syncCommitBtn();
  }
}

function _buildBoxPicker() {
  const picker = document.getElementById('boxPicker');
  if (!picker) return;
  const boxNames = [...new Set(_acctChars.map(c => c.box).filter(Boolean))];
  boxNames.sort((a, b) => {
    const oa = _acctBoxInfo[a]?.order ?? 999;
    const ob = _acctBoxInfo[b]?.order ?? 999;
    return oa - ob || a.localeCompare(b);
  });
  picker.innerHTML = boxNames.map(box => {
    const info  = _acctBoxInfo[box] || {};
    const owned = _acctOwnedBoxes.has(box);
    const src   = info.slug ? `asset/boxes/${info.slug}.webp` : 'asset/players/default.svg';
    const year  = info.year ? `<span class="box-option-year">${info.year}</span>` : '';
    return `
      <button class="box-option${owned ? ' selected' : ''}" data-box="${_esc(box)}" type="button" onclick="_toggleBox(this.dataset.box)" title="${_esc(box)}">
        <img src="${src}" alt="${_esc(box)}" onerror="this.src='asset/players/default.svg'">
        <span class="box-option-name">${_esc(box)}</span>
        ${year}
      </button>`;
  }).join('');
}

async function _toggleBox(box) {
  const user = getCurrentUser();
  if (!user) return;
  const wasOwned = _acctOwnedBoxes.has(box);
  if (wasOwned) _acctOwnedBoxes.delete(box);
  else          _acctOwnedBoxes.add(box);
  const btn = document.querySelector(`.box-option[data-box="${CSS.escape(box)}"]`);
  if (btn) btn.classList.toggle('selected', !wasOwned);
  clearError('boxesErr');

  const { error } = wasOwned
    ? await db.from('profile_boxes').delete().eq('user_id', user.id).eq('box', box)
    : await db.from('profile_boxes').insert({ user_id: user.id, box });

  if (error) {
    if (wasOwned) _acctOwnedBoxes.add(box);
    else          _acctOwnedBoxes.delete(box);
    if (btn) btn.classList.toggle('selected', wasOwned);
    showError('boxesErr', error.message);
  }
}

// ── DATA EXPORT ──────────────────────────────────────────────────────────────

async function exportMyData() {
  const user = getCurrentUser();
  if (!user) return;
  const btn = document.getElementById('exportDataBtn');
  btn.disabled    = true;
  btn.textContent = 'Preparing…';

  try {
    const [profile, { data: gamePlayers }] = await Promise.all([
      fetchProfile({ id: user.id }),
      db.from('game_players').select('*').eq('user_id', user.id),
    ]);

    const payload = {
      exported_at: new Date().toISOString(),
      auth_user:   { id: user.id, email: user.email },
      profile:     profile || null,
      game_players: gamePlayers || [],
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `DiVilytics-${_acctNick || user.id}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    btn.textContent = 'Downloaded ✓';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Download my data'; }, 1500);
  } catch (e) {
    console.error('exportMyData failed:', e);
    btn.disabled    = false;
    btn.textContent = 'Download failed. Retry';
  }
}

function _buildAvatarPicker() {
  const picker = document.getElementById('avatarPicker');
  if (!picker) return;
  picker.innerHTML = '';
  for (let i = 1; i <= 19; i++) {
    const value = `asset/players/${i}.jpeg`;
    const img   = document.createElement('img');
    img.className = 'avatar-option' + (value === _acctAvatar ? ' selected' : '');
    img.src   = value;
    img.alt   = `Player ${i}`;
    img.dataset.value = value;
    img.onerror = () => { img.src = 'asset/players/default.svg'; };
    img.onclick = () => _previewAvatar(value);
    picker.appendChild(img);
  }
  _renderPreview();
}

// The large identity avatar (left of the nickname) is the live preview of the
// pending selection — a clicked preset or the in-progress build. It's only
// written to the profile when the user presses "Use this icon".
function _renderPreview() {
  const host = document.getElementById('acctAvatarPreviewWrap');
  if (host) host.innerHTML = avatarHTML(_pendingAvatar || _acctFallback, { cls: 'acct-identity-avatar', fallback: _acctFallback });
}

// Clicking a preset previews it (highlights it + shows it large) but does not
// save — saving happens on "Use this icon".
function _previewAvatar(value) {
  _pendingAvatar = value;
  document.querySelectorAll('#avatarPicker .avatar-option').forEach(el =>
    el.classList.toggle('selected', el.dataset.value === value));
  _renderPreview();
  _syncCommitBtn();
  clearError('avatarErr');
}

// Preview the in-progress build (clears any preset highlight, since it's a build).
function _previewBuild() {
  _pendingAvatar = _builderRecipe();
  document.querySelectorAll('#avatarPicker .avatar-option').forEach(el => el.classList.remove('selected'));
  _renderPreview();
  _syncCommitBtn();
}

// "Use this icon" lights up only when the preview differs from what's saved.
function _syncCommitBtn() {
  const btn = document.getElementById('commitAvatarBtn');
  if (btn) btn.disabled = (_pendingAvatar === _acctAvatar);
  _syncRemoveBtn();   // the Default button also depends on the pending preview
}

// 🎲 — random preset on the Presets tab, random composition on the Build tab.
function randomizeAvatar() {
  const builderPane = document.getElementById('avatarPaneBuilder');
  if (builderPane && !builderPane.hidden) {
    _randomizeBuilder();
  } else {
    _previewAvatar(`asset/players/${1 + Math.floor(Math.random() * 19)}.jpeg`);
  }
}

// ── AVATAR BUILDER ───────────────────────────────────────────────────────────
// Compose a player icon by picking one transparent PNG part per body slot over
// a background colour. The body parts, their draw order and per-part option
// counts live in AVATAR_BUILDER (ui.js) — the same config the renderer uses, so
// the builder and every display point can never drift. Saving stores a compact
// recipe string in avatar_url; avatarHTML() composes it on the fly everywhere.
// The live preview here uses that same render path (no rasterisation anywhere).
// Disney Villainous jewel tones — villain signature colours over a dark, moody
// base (Maleficent purple/green, Ursula teal, Jafar/Hook crimson, Prince John
// gold, Hades blue, the black-and-gold box).
const AVATAR_BG_SWATCHES = ['#4a1d6e', '#6b2d8c', '#7d1f3f', '#a01515', '#b8621b', '#c9a227', '#1f7a4d', '#0e5c6b', '#15182e'];
const AVATAR_BUILDER_LS  = 'divilytics:avatarBuilder';

let _builderSel = {};
let _builderBg  = AVATAR_BUILDER.defaultBg;

// Seed the builder from the saved avatar if it's already a recipe, else from
// the last edit kept in localStorage, else defaults.
function _loadBuilderState() {
  const fromRecipe = parseAvatarRecipe(_acctAvatar);
  let saved = null;
  if (!fromRecipe) {
    try { saved = JSON.parse(localStorage.getItem(AVATAR_BUILDER_LS) || 'null'); } catch (_) {}
  }
  _builderSel = {};
  for (const part of AVATAR_BUILDER.parts) {
    const n = fromRecipe ? fromRecipe.parts[part.key] : saved?.sel?.[part.key];
    _builderSel[part.key] = (Number.isInteger(n) && n >= 1 && n <= part.count) ? n : 1;
  }
  if (fromRecipe)                                                   _builderBg = fromRecipe.bg;
  else if (typeof saved?.bg === 'string' && /^#[0-9a-f]{6}$/i.test(saved.bg)) _builderBg = saved.bg;
  else                                                             _builderBg = AVATAR_BUILDER.defaultBg;
}

function _saveBuilderState() {
  try { localStorage.setItem(AVATAR_BUILDER_LS, JSON.stringify({ sel: _builderSel, bg: _builderBg })); } catch (_) {}
}

function _builderRecipe() {
  return serializeAvatarRecipe(_builderSel, _builderBg);
}

function _buildAvatarBuilder() {
  const pane = document.getElementById('avatarPaneBuilder');
  if (!pane) return;
  _loadBuilderState();

  const rows = AVATAR_BUILDER.parts.map(part => `
    <div class="builder-row" data-key="${part.key}">
      <span class="builder-row-label">${part.label}</span>
      <div class="builder-stepper">
        <button class="cs-month-nav" type="button" onclick="_cyclePart('${part.key}', -1)" ${part.count < 2 ? 'disabled' : ''} aria-label="Previous ${part.label}">‹</button>
        <span class="builder-count"><span class="builder-num">${_builderSel[part.key]}</span> / ${part.count}</span>
        <button class="cs-month-nav" type="button" onclick="_cyclePart('${part.key}', 1)" ${part.count < 2 ? 'disabled' : ''} aria-label="Next ${part.label}">›</button>
      </div>
    </div>`).join('');

  const swatches = AVATAR_BG_SWATCHES.map(c =>
    `<button class="builder-swatch${c === _builderBg ? ' selected' : ''}" type="button" data-color="${c}" style="background:${c}" onclick="_setBg('${c}')" aria-label="Background ${c}"></button>`
  ).join('');

  pane.innerHTML = `
    <div class="builder-wrap">
      <div class="builder-controls">
        ${rows}
        <div class="builder-row builder-row-bg">
          <span class="builder-row-label">Background</span>
          <div class="builder-swatches">
            ${swatches}
            <label class="builder-swatch builder-swatch-custom" title="Custom colour">
              <input type="color" id="builderBgInput" value="${_builderBg}" oninput="_setBg(this.value)">
            </label>
          </div>
        </div>
      </div>
    </div>`;
  // The Randomize / "Use this icon" actions live in the toolbar above (shared
  // with Presets); the build is previewed when its tab opens.
}

function _cyclePart(key, dir) {
  const part = AVATAR_BUILDER.parts.find(p => p.key === key);
  if (!part || part.count < 2) return;
  _builderSel[key] = ((_builderSel[key] - 1 + dir + part.count) % part.count) + 1;
  const row = document.querySelector(`.builder-row[data-key="${key}"] .builder-num`);
  if (row) row.textContent = _builderSel[key];
  _saveBuilderState();
  _previewBuild();
}

// Roll a random part for every slot and a random villain background, then sync
// the steppers, swatches and preview (without persisting a new avatar — the
// user still confirms with "Use this icon").
function _randomizeBuilder() {
  for (const part of AVATAR_BUILDER.parts) {
    _builderSel[part.key] = 1 + Math.floor(Math.random() * part.count);
    const num = document.querySelector(`.builder-row[data-key="${part.key}"] .builder-num`);
    if (num) num.textContent = _builderSel[part.key];
  }
  _builderBg = AVATAR_BG_SWATCHES[Math.floor(Math.random() * AVATAR_BG_SWATCHES.length)];
  document.querySelectorAll('.builder-swatch[data-color]').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === _builderBg);
  });
  const inp = document.getElementById('builderBgInput');
  if (inp) inp.value = _builderBg;
  _saveBuilderState();
  _previewBuild();
}

function _setBg(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  _builderBg = color.toLowerCase();
  document.querySelectorAll('.builder-swatch[data-color]').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === _builderBg);
  });
  _saveBuilderState();
  _previewBuild();
}

// ── AVATAR ACTIONS ───────────────────────────────────────────────────────────

// "Use this icon": persist the previewed selection (preset or build). Optimistic,
// reverts on error.
async function commitAvatar() {
  const user = getCurrentUser();
  if (!user || _pendingAvatar === _acctAvatar) return;

  const value = _pendingAvatar;
  const btn   = document.getElementById('commitAvatarBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  clearError('avatarErr');

  const previous = _acctAvatar;
  _acctAvatar = value;
  const profile = getCurrentProfile();
  if (profile) profile.avatar_url = value;
  _updateAuthUI();
  _syncRemoveBtn();

  const { error } = await db.from('profiles').update({ avatar_url: value }).eq('id', user.id);
  if (error) {
    _acctAvatar = previous;
    if (profile) profile.avatar_url = previous;
    _updateAuthUI();
    _syncRemoveBtn();
    showError('avatarErr', error.message);
    if (btn) { btn.textContent = 'Apply'; btn.disabled = false; }
    return;
  }
  if (btn) {
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Apply'; _syncCommitBtn(); }, 1500);
  }
}

// Keep the "Use default icon" button's disabled state in sync with whether
// a custom avatar is currently set.
function _syncRemoveBtn() {
  const btn = document.getElementById('removeAvatarBtn');
  // Available whenever the current avatar isn't the default — whether that's a
  // saved avatar or just an uncommitted preview (build/random/preset).
  if (btn) btn.disabled = !_pendingAvatar && !_acctAvatar;
}

function removeAvatar() {
  _doRemoveAvatar();
}

async function _doRemoveAvatar() {
  const user = getCurrentUser();
  if (!user) return;

  // Nothing saved (committed avatar is already the default): the Default button
  // only needs to discard the uncommitted preview — no DB write.
  if (!_acctAvatar) {
    _pendingAvatar = null;
    document.querySelectorAll('#avatarPicker .avatar-option').forEach(el => el.classList.remove('selected'));
    _renderPreview();
    _syncCommitBtn();   // also re-syncs the Default button
    clearError('avatarErr');
    return;
  }

  const btn = document.getElementById('removeAvatarBtn');
  btn.disabled    = true;
  btn.textContent = 'Updating…';
  clearError('avatarErr');

  const { error } = await db.from('profiles').update({ avatar_url: null }).eq('id', user.id);
  if (error) {
    showError('avatarErr', error.message);
    btn.disabled    = false;
    btn.textContent = 'Default';
    return;
  }

  _acctAvatar = null;
  _pendingAvatar = null;
  const profile = getCurrentProfile();
  if (profile) profile.avatar_url = null;
  document.querySelectorAll('#avatarPicker .avatar-option').forEach(el => el.classList.remove('selected'));
  _renderPreview();
  _syncCommitBtn();
  _updateAuthUI();
  btn.textContent = 'Default'; 
  _syncRemoveBtn();
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
  clearError('delAccountErr');
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
  clearError(errEl);

  const user = getCurrentUser();
  if (!user) return;

  const btn = document.getElementById('delAccountBtn');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';

  const fail = msg => {
    showError(errEl, msg);
    btn.disabled    = false;
    btn.textContent = 'Delete my profile';
  };

  const { error: gpErr } = await db.from('game_players').update({ nickname: null }).eq('user_id', user.id);
  if (gpErr) return fail(gpErr.message);

  const { error } = await db.from('profiles').delete().eq('id', user.id);
  if (error) return fail(error.message);

  await db.auth.signOut();
  location.href = 'index.html';
}

// ── ACHIEVEMENT DETAIL ────────────────────────────────────────────────────────

function _showAchDetail(charName) {
  const body = document.getElementById('achBody');
  const title = document.getElementById('achTitle');
  if (!body || !title) return;
  title.textContent = _acctNick ? `Achievements | ${_acctNick}` : 'Achievements';
  body.innerHTML = renderAchievementDetailHTML(charName, _acctAch.get(charName));
  openOverlay('achOverlay');
}

function _showBoxDetail(boxName) {
  const body = document.getElementById('achBody');
  const title = document.getElementById('achTitle');
  if (!body || !title) return;
  const row = computeBoxCompletion(_acctAch, _acctChars, _acctBoxInfo).find(r => r.box === boxName);
  if (!row) return;
  title.textContent = _acctNick ? `Achievements | ${_acctNick}` : 'Achievements';
  body.innerHTML = renderBoxDetailHTML(row, groupByBox(_acctChars)[boxName] || [], _acctAch);
  openOverlay('achOverlay');
}

function _showGlobalDetail(key) {
  const body = document.getElementById('achBody');
  const title = document.getElementById('achTitle');
  if (!body || !title || !_acctGlobal) return;
  title.textContent = _acctNick ? `Achievements | ${_acctNick}` : 'Achievements';
  body.innerHTML = renderGlobalDetailHTML(key, _acctGlobal);
  openOverlay('achOverlay');
}

function _closeAchOverlay() { closeOverlay('achOverlay'); }

// ── LINKED IDENTITIES ─────────────────────────────────────────────────────────

function _renderIdentitiesHTML() {
  const linkedSet = new Set(_acctIdentities.map(i => i.provider));
  const canUnlink = linkedSet.size > 1;  // refuse to remove the last identity

  return ACCT_PROVIDERS.map(p => {
    const identity = _acctIdentities.find(i => i.provider === p.key);
    const isLinked = !!identity;
    const meta     = identity?.identity_data?.email || identity?.email || '';

    let actionHTML;
    if (isLinked) {
      actionHTML = `
        <span class="identity-linked-badge">Linked</span>
        <button class="btn btn-ghost btn-sm" ${canUnlink ? '' : 'disabled'} title="${canUnlink ? 'Unlink this provider' : 'You need at least one sign-in method'}"
                onclick="unlinkIdentity('${_esc(p.key)}')">Unlink</button>
      `;
    } else {
      actionHTML = `<button class="btn btn-primary btn-sm" onclick="linkIdentity('${_esc(p.key)}')">Link</button>`;
    }

    return `
      <div class="identity-row">
        <img class="identity-logo" src="${_esc(p.logo)}" alt="">
        <div class="identity-text">
          <div class="identity-name">${_esc(p.label)}</div>
          ${meta ? `<div class="identity-meta">${_esc(meta)}</div>` : ''}
        </div>
        <div class="identity-actions">${actionHTML}</div>
      </div>
    `;
  }).join('');
}

async function linkIdentity(provider) {
  clearError('identitiesErr');
  const { error } = await db.auth.linkIdentity({
    provider,
    options: { redirectTo: window.location.href },
  });
  if (error) {
    // Common case: "Manual linking is not enabled" or provider not configured.
    showError('identitiesErr', error.message);
  }
}

async function unlinkIdentity(provider) {
  clearError('identitiesErr');
  const identity = _acctIdentities.find(i => i.provider === provider);
  if (!identity) return;

  // Safety: never unlink the last identity (would leave the user stranded).
  if (_acctIdentities.length <= 1) {
    showError('identitiesErr', 'You need at least one sign-in method.');
    return;
  }

  const { error } = await db.auth.unlinkIdentity(identity);
  if (error) {
    showError('identitiesErr', error.message);
    return;
  }

  await _loadIdentities();
  const host = document.getElementById('identitiesList');
  if (host) host.innerHTML = _renderIdentitiesHTML();
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

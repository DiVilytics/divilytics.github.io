// ── STATE ─────────────────────────────────────────────────────────────────────

let chars            = [];
let excluded         = new Set();   // currently excluded (manual ∪ auto-by-pace ∪ auto-by-ownership)
let manualExcluded   = new Set();   // user-toggled exclusions, preserved across mode switches
let drawMode         = 'random';    // 'random' | 'pace' | 'paceplus'
let paceColor        = null;        // 'green' | 'yellow' | 'orange' | 'red' | null
let ownedBoxes       = new Set();   // boxes owned by the signed-in user
let ownedOnly        = false;       // when true, exclude characters not in ownedBoxes
let orderSlots       = [];          // each: { id, char, isMe, isWinner }
let orderNextId      = 0;
let slotTimers       = {};          // slotId → setInterval id (active spin animation)

// Live-game timers stay here because they tick the DOM directly. All other
// "live game" state (start time, turns, exact duration, hasSession, hooks,
// persistence) lives in the shared `liveGame` module.
let liveTimerId     = null;        // 1s clock ticker
let _saveIntervalId = null;        // 30s background-persist
let _resumeTickId   = null;        // resume-banner ticker (set in _checkResume)

const PACE_ORDER = ['green', 'yellow', 'orange', 'red'];

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
  setActiveNav('new-game.html');
  // Re-render slots whenever auth state changes so the Me-locked indicator
  // updates in-place after sign-in / sign-out.
  await initAuth(async () => {
    await _loadOwnedBoxes();
    _updateOwnedToggleUI();
    _recomputeExcluded();
    if (orderSlots.length) renderOrderSlots();
  });
  chars = await loadCharacters();
  await _loadOwnedBoxes();
  buildExcludeGrid(
    document.getElementById('excludeGrid'),
    chars,
    excluded,
    _onPillToggle
  );
  // Default date = now (local time)
  _setDateToNow();
  onBeforeSignIn(_savePendingState);
  const restored = _restorePendingState();
  if (!restored) {
    addOrderSlot();
    addOrderSlot();
  }
  _updateOwnedToggleUI();
  _initDrag();
  _checkResume();
  attachLocationAutocomplete('fLocation', 'fLocationDropdown');
}

async function _loadOwnedBoxes() {
  const user = getCurrentUser();
  if (!user) { ownedBoxes = new Set(); return; }
  const { data } = await db.from('profile_boxes').select('box').eq('user_id', user.id);
  ownedBoxes = new Set((data || []).map(r => r.box));
}

// Pending-state survives the OAuth round-trip (sessionStorage = same tab only)
// so users don't lose their draft if they sign in mid-edit.
const PENDING_KEY = 'newGamePending';

function _savePendingState() {
  const hasContent = orderSlots.some(s => s.char || s.isMe || s.isWinner) ||
                     document.getElementById('fLocation')?.value ||
                     document.getElementById('fDur')?.value ||
                     document.getElementById('fTurns')?.value;
  if (!hasContent) return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      slots:          orderSlots.map(s => ({ char: s.char, isMe: s.isMe, isWinner: s.isWinner })),
      fDate:          document.getElementById('fDate')?.value     || '',
      fLocation:      document.getElementById('fLocation')?.value || '',
      fDur:           document.getElementById('fDur')?.value      || '',
      fTurns:         document.getElementById('fTurns')?.value    || '',
      drawMode,
      paceColor,
      ownedOnly,
      manualExcluded: [...manualExcluded],
    }));
  } catch (_) {}
}

function _restorePendingState() {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return false;
  sessionStorage.removeItem(PENDING_KEY);

  // A saved live game is newer and more authoritative; let _checkResume handle it.
  if (liveGame.loadSaved()) return false;

  let state;
  try { state = JSON.parse(raw); } catch (_) { return false; }
  if (!state || !state.slots || !state.slots.length) return false;

  if (state.fDate)     document.getElementById('fDate').value     = state.fDate;
  if (state.fLocation) document.getElementById('fLocation').value = state.fLocation;
  if (state.fDur)      document.getElementById('fDur').value      = state.fDur;
  if (state.fTurns)    document.getElementById('fTurns').value    = state.fTurns;

  orderSlots = state.slots.map(s => ({
    id:       orderNextId++,
    char:     s.char || '',
    isMe:     !!s.isMe,
    isWinner: !!s.isWinner,
  }));

  if (state.manualExcluded?.length) manualExcluded = new Set(state.manualExcluded);
  if (state.ownedOnly) ownedOnly = true;
  if (state.drawMode && state.drawMode !== 'random') {
    setDrawMode(state.drawMode);
    if (state.paceColor) setPaceColor(state.paceColor);
  } else {
    _recomputeExcluded();
  }
  renderOrderSlots();
  return true;
}

function _setDateToNow() {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('fDate').value = now.toISOString().slice(0, 16);
}

// User clicked an exclude-grid pill. Sync the change into manualExcluded so
// it survives mode switches (and so manual un-excludes don't get clobbered
// when we re-apply the pace filter).
function _onPillToggle(name, nowExcluded) {
  if (nowExcluded) manualExcluded.add(name);
  else             manualExcluded.delete(name);
  updateExcludeUI();
}

// ── EXCLUDE CONTROLS ─────────────────────────────────────────────────────────

function toggleExclude() {
  const body   = document.getElementById('excludeBody');
  const chevron = document.getElementById('exChevron');
  const open   = body.classList.toggle('open');
  chevron.classList.toggle('open', open);
}

function updateExcludeUI() {
  const badge = document.getElementById('exBadge');
  const n = excluded.size;
  badge.textContent = n;
  badge.classList.toggle('visible', n > 0);
}

function excludeAll() {
  chars.forEach(c => {
    excluded.add(c.name);
    manualExcluded.add(c.name);
    const btn = document.querySelector(`#excludeGrid .char-pill[data-name="${CSS.escape(c.name)}"]`);
    btn?.classList.add('excluded');
  });
  updateExcludeUI();
}

function clearExcluded() {
  excluded.clear();
  manualExcluded.clear();
  document.querySelectorAll('#excludeGrid .char-pill').forEach(b => b.classList.remove('excluded'));
  updateExcludeUI();
}

function applyExclude() {
  const body = document.getElementById('excludeBody');
  const chevron = document.getElementById('exChevron');
  body.classList.remove('open');
  chevron.classList.remove('open');
}

// ── DRAW MODE / PACE ─────────────────────────────────────────────────────────

function setDrawMode(mode) {
  drawMode = mode;
  const sel = document.getElementById('drawModeSel');
  if (sel && sel.value !== mode) sel.value = mode;
  setVisible('paceColors', mode !== 'random');
  if (mode === 'random') {
    paceColor = null;
    document.querySelectorAll('#paceColors .pace-color').forEach(b => b.classList.remove('on'));
  }

  const locked = mode !== 'random';
  document.getElementById('excludeBody').classList.toggle('locked', locked);
  setVisible('excludeLockedHint', locked);

  _recomputeExcluded();
  _updateActionBtns();
}

function setPaceColor(color) {
  paceColor = paceColor === color ? null : color;
  document.querySelectorAll('#paceColors .pace-color').forEach(b => {
    b.classList.toggle('on', b.dataset.pace === paceColor);
  });
  _recomputeExcluded();
  _updateActionBtns();
}

function _allowedPaces() {
  if (drawMode === 'random' || !paceColor) return null;
  if (drawMode === 'pace') return new Set([paceColor]);
  const i = PACE_ORDER.indexOf(paceColor);
  return new Set(PACE_ORDER.slice(Math.max(0, i - 1), Math.min(PACE_ORDER.length, i + 2)));
}

function _recomputeExcluded() {
  const allowed = _allowedPaces();
  excluded = new Set(manualExcluded);
  if (allowed) {
    for (const c of chars) {
      if (!allowed.has(c.pace)) excluded.add(c.name);
    }
  }
  if (ownedOnly && ownedBoxes.size) {
    for (const c of chars) {
      if (!ownedBoxes.has(c.box)) excluded.add(c.name);
    }
  }
  document.querySelectorAll('#excludeGrid .char-pill').forEach(btn => {
    btn.classList.toggle('excluded', excluded.has(btn.dataset.name));
  });
  updateExcludeUI();
}

function toggleOwnedOnly() {
  if (!getCurrentUser()) {
    showErr('Sign in to filter by owned boxes.');
    return;
  }
  if (!ownedBoxes.size) {
    showErr('Mark which boxes you own on the account page first.');
    return;
  }
  ownedOnly = !ownedOnly;
  _updateOwnedToggleUI();
  _recomputeExcluded();
  _updateActionBtns();
  _saveLiveState();
}

function _updateOwnedToggleUI() {
  const btn = document.getElementById('ownedOnlyBtn');
  if (!btn) return;
  const enabled = !!getCurrentUser() && ownedBoxes.size > 0;
  btn.classList.toggle('on', ownedOnly && enabled);
  btn.classList.toggle('disabled', !enabled);
  btn.title = !getCurrentUser()
    ? 'Sign in to filter by owned boxes'
    : !ownedBoxes.size
      ? 'Mark which boxes you own on the account page first'
      : (ownedOnly ? 'Showing only characters from your boxes' : 'Show only characters from your boxes');
  if (!enabled && ownedOnly) {
    ownedOnly = false;
    _recomputeExcluded();
  }
}

// ── SLOT MANAGEMENT ──────────────────────────────────────────────────────────

function addOrderSlot(char = '', isMe = false, isWinner = false) {
  if (orderSlots.length >= 6) return;
  orderSlots.push({ id: orderNextId++, char, isMe, isWinner });
  renderOrderSlots();
  _saveLiveState();
}

function setPlayerCount(n) {
  n = Math.max(2, Math.min(6, parseInt(n) || 2));
  while (orderSlots.length < n) orderSlots.push({ id: orderNextId++, char: '', isMe: false, isWinner: false });
  while (orderSlots.length > n) {
    const last = orderSlots[orderSlots.length - 1];
    if (slotTimers[last.id]) { clearInterval(slotTimers[last.id]); delete slotTimers[last.id]; }
    orderSlots.pop();
  }
  renderOrderSlots();
  _saveLiveState();
}

function removeOrderSlot(id) {
  if (orderSlots.length <= 2) return;
  if (slotTimers[id]) { clearInterval(slotTimers[id]); delete slotTimers[id]; }
  orderSlots = orderSlots.filter(s => s.id !== id);
  renderOrderSlots();
  _saveLiveState();
}

function toggleMe(id) {
  if (!getCurrentUser()) {
    showErr('Sign in first to mark your character.');
    return;
  }
  for (const s of orderSlots) s.isMe = (s.id === id ? !s.isMe : false);
  renderOrderSlots();
  _saveLiveState();
}

function toggleWin(id) {
  for (const s of orderSlots) s.isWinner = (s.id === id ? !s.isWinner : false);
  renderOrderSlots();
  _saveLiveState();
}

function updateOrderSlot(id, char) {
  const slot = orderSlots.find(s => s.id === id);
  if (!slot) return;
  slot.char = char;
  renderOrderSlots();
  _saveLiveState();
}

// Pool of characters available for slot `excludeId` to draw from.
function _slotPool(excludeId) {
  const taken = new Set(orderSlots.filter(o => o.id !== excludeId && o.char).map(o => o.char));
  return chars.filter(c => !excluded.has(c.name) && !taken.has(c.name));
}

function drawSlot(id) {
  const slot = orderSlots.find(s => s.id === id);
  if (!slot) return;

  const pool = _slotPool(id);
  if (!pool.length) return;

  if (slotTimers[id]) { clearInterval(slotTimers[id]); delete slotTimers[id]; }

  const slotEl     = document.querySelector(`.order-slot[data-id="${id}"]`);
  const portraitEl = slotEl?.querySelector('.order-slot-portrait');
  const nameEl     = slotEl?.querySelector('.order-slot-name');
  if (!portraitEl) return;

  slotEl.classList.add('spinning');

  let ticks = 0;
  const total = 18;

  slotTimers[id] = setInterval(() => {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    portraitEl.src = charImgSrc(pick.name);
    if (nameEl) nameEl.textContent = pick.name;
    ticks++;

    if (ticks >= total) {
      clearInterval(slotTimers[id]);
      delete slotTimers[id];
      const finalPool = _slotPool(id);
      if (!finalPool.length) {
        slotEl.classList.remove('spinning');
        return;
      }
      const final = finalPool[Math.floor(Math.random() * finalPool.length)];
      slot.char = final.name;
      renderOrderSlots();
      _saveLiveState();
    }
  }, 55);
}

function drawAllEmpty() {
  const empties = orderSlots.filter(s => !s.char);
  empties.forEach((s, i) => setTimeout(() => drawSlot(s.id), i * 60));
}

function drawAll() {
  for (const id of Object.keys(slotTimers)) { clearInterval(slotTimers[id]); }
  slotTimers = {};
  for (const s of orderSlots) s.char = '';
  renderOrderSlots();
  drawAllEmpty();
}

function shuffleOrder() {
  for (const id of Object.keys(slotTimers)) { clearInterval(slotTimers[id]); }
  slotTimers = {};
  for (let i = orderSlots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [orderSlots[i], orderSlots[j]] = [orderSlots[j], orderSlots[i]];
  }
  renderOrderSlots();
  _saveLiveState();
}

function renderOrderSlots() {
  const container = document.getElementById('orderSlots');

  const isAuthed = !!getCurrentUser();
  container.innerHTML = orderSlots.map((s, i) => {
    const taken     = new Set(orderSlots.filter(o => o.id !== s.id && o.char).map(o => o.char));
    const available = chars.filter(c => !taken.has(c.name));
    const src       = s.char ? charImgSrc(s.char) : 'asset/players/default.svg';
    const nameTxt   = s.char ? _esc(s.char) : '<span class="order-slot-empty">— Character —</span>';
    const meTitle   = isAuthed ? 'My character' : 'Sign in to mark your character';
    return `
      <div class="order-slot" data-id="${s.id}">
        <div class="drag-handle">
          <span class="drag-dots">⠿</span><span class="row-num">${i + 1}.</span>
          <img class="order-slot-portrait" src="${src}" onerror="this.src='asset/players/default.svg'" alt="">
        </div>
        <div class="order-slot-info">
          <select class="order-slot-select" onchange="updateOrderSlot(${s.id}, this.value)" title="Pick manually">
            ${charSelectHTML(available, s.char)}
          </select>
          <div class="order-slot-name">${nameTxt}</div>
          <span class="order-slot-chevron" aria-hidden="true">▾</span>
        </div>
        <div class="order-slot-actions">
          <button class="pf-btn rand" onclick="drawSlot(${s.id})" title="Draw">🎲</button>
          <button class="pf-btn me${s.isMe ? ' on' : ''}${isAuthed ? '' : ' locked'}" onclick="toggleMe(${s.id})" title="${meTitle}">👤</button>
          <button class="pf-btn win${s.isWinner ? ' on' : ''}" onclick="toggleWin(${s.id})" title="Winner">👑</button>
          ${orderSlots.length > 2
            ? `<button class="pf-btn del" onclick="removeOrderSlot(${s.id})" title="Remove">❌</button>`
            : ''}
        </div>
      </div>`;
  }).join('');

  setVisible('orderAddBtn', orderSlots.length < 6);
  const pcSel = document.getElementById('playerCountSel');
  if (pcSel) pcSel.value = String(orderSlots.length);
  _updateActionBtns();
}

function _updateActionBtns() {
  const filled     = orderSlots.filter(s => s.char).length;
  const empties    = orderSlots.length - filled;
  const needsColor = drawMode !== 'random' && !paceColor;

  const drawAllEmptyBtn = document.getElementById('drawAllEmptyBtn');
  const drawAllBtn      = document.getElementById('drawAllBtn');
  const shuffleBtn      = document.getElementById('shuffleOrderBtn');
  const startBtn        = document.getElementById('startBtn');
  const submitBtn       = document.getElementById('submitBtn');

  if (drawAllEmptyBtn) {
    drawAllEmptyBtn.disabled = empties === 0 || needsColor;
    drawAllEmptyBtn.title    = needsColor ? 'Pick a pace first' :
                               empties === 0 ? 'All slots are filled' : '';
  }
  if (drawAllBtn) {
    drawAllBtn.disabled = needsColor;
    drawAllBtn.title    = needsColor ? 'Pick a pace first' : '';
  }
  if (shuffleBtn) {
    shuffleBtn.disabled = filled < 2;
    shuffleBtn.title    = filled < 2 ? 'Pick at least 2 characters first' : '';
  }
  // Start / Save are fully validated in their handlers; we only gate them on
  // the "fill at least 2 slots" minimum here so the UI stays honest.
  const meaningful = filled >= 2;
  if (startBtn)  startBtn.disabled  = !meaningful;
  if (submitBtn) submitBtn.disabled = !meaningful;
}

// ── DRAG TO REORDER ───────────────────────────────────────────────────────────

let _dragSrc = null;

function _initDrag() {
  const container = document.getElementById('orderSlots');

  function _endDrag() {
    if (!_dragSrc) return;
    _dragSrc.classList.remove('dragging');
    _dragSrc = null;
    document.body.style.touchAction = '';
    // Sync orderSlots state to the new DOM order
    const newOrder = [...container.querySelectorAll('.order-slot')]
      .map(el => Number(el.dataset.id));
    orderSlots.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    renderOrderSlots();
    _saveLiveState();
  }

  container.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    _dragSrc = handle.closest('.order-slot');
    _dragSrc.classList.add('dragging');
    document.body.style.touchAction = 'none';
    container.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', e => {
    if (!_dragSrc) return;
    _dragSrc.style.visibility = 'hidden';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    _dragSrc.style.visibility = '';
    if (!el) return;
    const row = el.closest('.order-slot');
    if (!row || row === _dragSrc) return;
    const rect = row.getBoundingClientRect();
    container.insertBefore(_dragSrc, e.clientY < rect.top + rect.height / 2 ? row : row.nextSibling);
  });

  container.addEventListener('pointerup',     _endDrag);
  container.addEventListener('pointercancel', _endDrag);
}

// ── LIVE GAME ─────────────────────────────────────────────────────────────────

function setLiveUI(on) {
  setVisible('formContent',   !on);
  setVisible('liveContent',    on);
  setVisible('footerDefault', !on);
  setVisible('footerLive',     on);
}

function fmtElapsed(ms) {
  const s   = Math.max(0, Math.floor(ms / 1000));
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function tickLive() {
  if (!liveGame.isRunning) return;
  document.getElementById('liveTime').textContent = fmtElapsed(liveGame.elapsedMs);
}

function bumpTurn(delta) {
  liveGame.bumpTurns(delta);
  document.getElementById('liveTurnCount').textContent = liveGame.turns;
  if (!liveTimerId) {
    const fTurns = document.getElementById('fTurns');
    if (fTurns) fTurns.value = liveGame.turns || '';
  }
  _saveLiveState();
}

function showErr(msg) {
  showError('err', msg, { scroll: true });
}

function _validateLineup() {
  if (orderSlots.length < 2) return 'A game must have at least 2 players.';
  if (orderSlots.some(s => !s.char)) return 'Choose a character for each player.';
  const names = orderSlots.map(s => s.char);
  if (new Set(names).size !== names.length) return 'Each player must use a different character.';
  if (!orderSlots.some(s => s.isMe)) return 'Mark which character you played with 👤.';
  return null;
}

function startLive() {
  clearError('err');
  const err = _validateLineup();
  if (err) return showErr(err);

  const fDurEl    = document.getElementById('fDur');
  const durOffset = liveGame.exactDurMs ?? (parseInt(fDurEl.value) || 0) * 60000;
  liveGame.markStarted(Date.now() - durOffset);

  _setDateToNow();

  liveGame.setTurns(parseInt(document.getElementById('fTurns').value) || 0);
  document.getElementById('liveTurnCount').textContent = liveGame.turns;

  const playerCount = orderSlots.length;
  const location    = document.getElementById('fLocation').value.trim();
  const infoEl      = document.getElementById('liveInfo');
  if (infoEl) infoEl.textContent = [`${playerCount} players`, location || null].filter(Boolean).join(' | ');

  setLiveUI(true);
  tickLive();
  liveTimerId = setInterval(tickLive, 1000);
  _updateDiscardBtn();
  liveGame.emit('start');
  _saveLiveState();
  if (!_saveIntervalId) _saveIntervalId = setInterval(_saveLiveState, 30000);
}

function stopLive() {
  if (!liveGame.isRunning) return;
  clearInterval(liveTimerId);
  liveTimerId = null;

  const ms = liveGame.elapsedMs;
  document.getElementById('fDur').value = Math.max(1, Math.round(ms / 60000));
  if (liveGame.turns > 0) document.getElementById('fTurns').value = liveGame.turns;
  liveGame.markStopped(ms);

  setLiveUI(false);
  const sb = document.getElementById('startBtn');
  sb.textContent = 'Resume Game';
  sb.classList.remove('btn-success');
  sb.classList.add('btn-primary');
  _updateDiscardBtn();
  liveGame.emit('stop');
  _saveLiveState();
}

// ── LIVE STATE PERSISTENCE ────────────────────────────────────────────────────

function _saveLiveState() {
  liveGame.persist({
    slots:     orderSlots,
    fDate:     document.getElementById('fDate')?.value     || '',
    fLocation: document.getElementById('fLocation')?.value || '',
    fDur:      document.getElementById('fDur')?.value      || '',
    fTurns:    document.getElementById('fTurns')?.value    || '',
  });
  updateLiveGameNavBadge();
}

function _clearLiveState() {
  liveGame.clear();
  if (_saveIntervalId) { clearInterval(_saveIntervalId); _saveIntervalId = null; }
  _updateDiscardBtn();
  updateLiveGameNavBadge();
}

function _updateDiscardBtn() {
  setVisible('discardBtn', liveGame.hasSession);
  setVisible('resumeBtn',  liveGame.isPaused);
}

function discardLiveGame() {
  if (!confirm('Discard the current game? This will reset the form and clear saved progress.')) return;

  if (liveTimerId) { clearInterval(liveTimerId); liveTimerId = null; }
  _clearLiveState();
  liveGame.emit('close');

  const sbD = document.getElementById('startBtn');
  sbD.textContent = 'Start Game';
  sbD.classList.remove('btn-primary');
  sbD.classList.add('btn-success');
  clearError('err');
  document.getElementById('fLocation').value = '';
  document.getElementById('fDur').value = '';
  document.getElementById('fTurns').value = '';
  _setDateToNow();

  for (const id of Object.keys(slotTimers)) { clearInterval(slotTimers[id]); }
  slotTimers = {};
  orderSlots = [];
  addOrderSlot();
  addOrderSlot();

  manualExcluded.clear();
  excluded.clear();
  setDrawMode('random');
  paceColor = null;
  ownedOnly = false;
  _updateOwnedToggleUI();
  document.querySelectorAll('#paceColors .pace-color').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('#excludeGrid .char-pill').forEach(b => b.classList.remove('excluded'));
  updateExcludeUI();

  setLiveUI(false);
}

// ── RESUME BANNER ─────────────────────────────────────────────────────────────

function _checkResume() {
  const state = liveGame.loadSaved();
  if (!state) {
    // Drop any stale (>24h) or incomplete snapshot still sitting in storage.
    if (localStorage.getItem(liveGame.KEY)) liveGame.clear();
    return;
  }

  const banner = document.createElement('div');
  banner.id = 'resumeBanner';
  banner.className = 'resume-banner';
  banner.innerHTML = `
    <div class="resume-banner-text">
      <strong>Game in progress</strong>
      <span>${state.slots.length} players | Round ${state.liveTurns}<span id="resumeElapsed"></span></span>
    </div>
    <div class="resume-banner-btns">
      <button class="btn btn-primary btn-sm" onclick="_doResume()">Resume</button>
      <button class="btn btn-ghost btn-sm" onclick="_dismissResume()">Discard</button>
    </div>`;
  document.querySelector('main').prepend(banner);

  const elapsedEl = document.getElementById('resumeElapsed');
  if (state.liveStart) {
    const tick = () => { elapsedEl.textContent = ` | ${fmtElapsed(Date.now() - state.liveStart)}`; };
    tick();
    _resumeTickId = setInterval(tick, 1000);
  } else if (state.fDurExactMs) {
    elapsedEl.textContent = ` | ${fmtElapsed(state.fDurExactMs)}`;
  }
}

function _dismissResume() {
  if (_resumeTickId) { clearInterval(_resumeTickId); _resumeTickId = null; }
  _clearLiveState();
  document.getElementById('resumeBanner')?.remove();
}

function _doResume() {
  const state = liveGame.loadSaved();
  if (!state) return;

  if (_resumeTickId) { clearInterval(_resumeTickId); _resumeTickId = null; }
  document.getElementById('resumeBanner')?.remove();
  if (!getCurrentUser()) { goToSignIn(); return; }
  if (!getCurrentProfile()) { _openNicknameModal(); return; }

  const sbR = document.getElementById('startBtn');
  sbR.textContent = 'Resume Game';
  sbR.classList.remove('btn-success');
  sbR.classList.add('btn-primary');
  clearError('err');

  document.getElementById('fDate').value     = state.fDate     || '';
  document.getElementById('fLocation').value = state.fLocation || '';
  document.getElementById('fDur').value      = state.fDur      || '';
  document.getElementById('fTurns').value    = state.fTurns    || '';

  liveGame.restoreFrom(state);

  orderSlots = (state.slots || []).map(s => ({
    id:       orderNextId++,
    char:     s.char || '',
    isMe:     !!s.isMe,
    isWinner: !!s.isWinner,
  }));
  renderOrderSlots();
  _updateDiscardBtn();

  if (state.liveStart) {
    document.getElementById('liveTurnCount').textContent = liveGame.turns;
    setLiveUI(true);
    tickLive();
    liveTimerId = setInterval(tickLive, 1000);
    _updateDiscardBtn();
    liveGame.emit('start');
    _saveLiveState();
    if (!_saveIntervalId) _saveIntervalId = setInterval(_saveLiveState, 30000);
  }
}

// ── SUBMIT (Save Game) ────────────────────────────────────────────────────────

async function submitForm() {
  clearError('err');

  const date     = document.getElementById('fDate').value;
  const dur      = parseInt(document.getElementById('fDur').value)   || null;
  const turns    = parseInt(document.getElementById('fTurns').value) || null;
  const location = document.getElementById('fLocation').value.trim() || null;
  const btn      = document.getElementById('submitBtn');

  if (!date) return showErr('Date and time is required.');
  if (new Date(date) > new Date()) return showErr('Date cannot be in the future.');

  const user    = getCurrentUser();
  const profile = getCurrentProfile();
  if (!user)    return showErr('Sign in to save the game.');
  if (!profile) { _openNicknameModal(); return; }

  const lineupErr = _validateLineup();
  if (lineupErr) return showErr(lineupErr);
  if (!orderSlots.some(s => s.isWinner)) return showErr('Mark the winner with 👑.');

  const ps = orderSlots.map((s, i) => ({
    position:  i,
    character: s.char,
    is_winner: s.isWinner,
    user_id:   s.isMe ? user.id          : null,
    nickname:  s.isMe ? profile.nickname : null,
  }));

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const gameData = {
    played_at:        new Date(date).toISOString(),
    duration_minutes: dur,
    num_turns:        turns,
    location:         location,
    created_by:       user.id,
  };

  const { data: g, error } = await db.from('games').insert(gameData).select().single();
  if (error) {
    btn.disabled    = false;
    btn.textContent = 'Save Game';
    return showErr(error.message);
  }

  await db.from('game_players').insert(ps.map(p => ({ game_id: g.id, ...p })));

  btn.disabled    = false;
  btn.textContent = 'Save Game';

  // Clear live state (we just saved the game) and notify hooks
  _clearLiveState();
  liveGame.emit('close');

  showQR(g.id);
}

// ── QR CODE ───────────────────────────────────────────────────────────────────

function showQR(gameId) {
  showQRModal(new URL(`join.html?game=${gameId}`, location.href).href, 'qrCode', 'qrOverlay');
}

function closeQR() {
  closeOverlay('qrOverlay');
  // After saving, send the user to the game log to see their new entry
  window.location.href = 'game-log.html';
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
init();

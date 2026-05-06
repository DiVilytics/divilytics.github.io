// ── STATE ─────────────────────────────────────────────────────────────────────

const gameEvents = {
  onStart:    [],
  onStop:     [],
  onTurnBump: [],
  onClose:    [],
};

let editId   = null;
let pIdx     = 0;
let winnerId = null;
let meId     = null;

// Live game state
let liveStart       = null;   // Date.now() timestamp
let liveTurns       = 0;
let liveTimerId     = null;
let _saveIntervalId = null;

const _LIVE_KEY = 'divilytics_live_game';

// ── SHEET (NEW / EDIT) ────────────────────────────────────────────────────────

function openSheet(gameId = null) {
  if (!getCurrentUser()) { signInWithDiscord(); return; }
  if (!getCurrentProfile()) { _openNicknameModal(); return; }

  editId   = gameId;
  pIdx     = 0;
  winnerId = null;
  meId     = null;

  const isEdit = !!gameId;

  document.getElementById('sheetTitle').textContent  = isEdit ? 'Edit Game' : 'New Game';
  document.getElementById('submitBtn').textContent   = isEdit ? 'Save Changes' : 'Save Game';
  document.getElementById('startBtn').textContent    = 'Start Game';
  document.getElementById('startBtn').style.display  = isEdit ? 'none' : '';
  document.getElementById('randomizeBtn').style.display = isEdit ? 'none' : '';
  document.getElementById('err').classList.remove('show');
  document.getElementById('pRows').innerHTML = '';

  // Edit mode: only duration / turns / location are editable
  document.getElementById('editHint').style.display       = isEdit ? '' : 'none';
  document.getElementById('fDateField').style.display     = isEdit ? 'none' : '';
  document.getElementById('playersSection').style.display = isEdit ? 'none' : '';

  // Default date = now (local time)
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('fDate').value     = now.toISOString().slice(0, 16);
  document.getElementById('fDur').value      = '';
  delete document.getElementById('fDur').dataset.exactMs;
  document.getElementById('fTurns').value    = '';
  document.getElementById('fLocation').value = '';

  // Reset lock state
  document.getElementById('fDur').disabled      = false;
  document.getElementById('fTurns').disabled    = false;
  document.getElementById('fLocation').disabled = false;

  if (isEdit) {
    const g = games.find(x => x.id === gameId);
    if (g) {
      const d = new Date(g.played_at);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      document.getElementById('fDate').value     = d.toISOString().slice(0, 16);
      document.getElementById('fDur').value      = g.duration_minutes || '';
      document.getElementById('fTurns').value    = g.num_turns || '';
      document.getElementById('fLocation').value = g.location || '';
      // Lock fields that already have a value — info can be filled in but not changed
      document.getElementById('fDur').disabled      = !!g.duration_minutes;
      document.getElementById('fTurns').disabled    = !!g.num_turns;
      document.getElementById('fLocation').disabled = !!g.location;
    }
  } else {
    addRow('', false, true); addRow();
  }

  syncRowBtns();
  openOverlay('overlay');
}

function closeSheet() {
  if (liveTimerId) { clearInterval(liveTimerId); liveTimerId = null; }
  if (_saveIntervalId) { clearInterval(_saveIntervalId); _saveIntervalId = null; }
  liveStart = null;
  liveTurns = 0;
  _clearLiveState();
  setLiveUI(false);
  closeOverlay('overlay');
  gameEvents.onClose.forEach(fn => fn());
}

// ── LIVE GAME ─────────────────────────────────────────────────────────────────

function setLiveUI(on) {
  document.getElementById('formContent').style.display   = on ? 'none' : '';
  document.getElementById('liveContent').style.display   = on ? ''     : 'none';
  document.getElementById('footerDefault').style.display = on ? 'none' : '';
  document.getElementById('footerLive').style.display    = on ? ''     : 'none';
  document.querySelector('.sheet-close').style.display   = on ? 'none' : '';
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
  if (!liveStart) return;
  document.getElementById('liveTime').textContent = fmtElapsed(Date.now() - liveStart);
}

function bumpTurn(delta) {
  liveTurns = Math.max(1, liveTurns + delta);
  document.getElementById('liveTurnCount').textContent = liveTurns;
  if (!liveTimerId) {
    const fTurns = document.getElementById('fTurns');
    if (fTurns) fTurns.value = liveTurns;
  }
  gameEvents.onTurnBump.forEach(fn => fn());
  _saveLiveState();
}

function startLive() {
  document.getElementById('err').classList.remove('show');

  const rows = document.querySelectorAll('.player-form-row');
  if (!rows.length) return showErr('Add at least one player before starting.');
  if (rows.length < 2) return showErr('A game must have at least 2 players.');
  if (!meId) return showErr('Mark which character you played before starting.');
  for (const row of rows) {
    const id = row.id.replace('pr-', '');
    if (!document.getElementById(`pc-${id}`).value) {
      return showErr('Choose a character for each player before starting.');
    }
  }
  if (new Set([...rows].map(r => document.getElementById(`pc-${r.id.replace('pr-', '')}`).value)).size !== rows.length) {
    return showErr('Each player must use a different character.');
  }

  const fDurEl = document.getElementById('fDur');
  const durOffset = fDurEl.dataset.exactMs
    ? parseInt(fDurEl.dataset.exactMs)
    : (parseInt(fDurEl.value) || 0) * 60000;
  delete fDurEl.dataset.exactMs;
  liveStart = Date.now() - durOffset;
  const d = new Date(Date.now());
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  document.getElementById('fDate').value = d.toISOString().slice(0, 16);

  liveTurns = parseInt(document.getElementById('fTurns').value) || 1;
  document.getElementById('liveTurnCount').textContent = liveTurns;

  const playerCount = document.querySelectorAll('.player-form-row').length;
  const location    = document.getElementById('fLocation').value.trim();
  const infoEl      = document.getElementById('liveInfo');
  if (infoEl) infoEl.textContent = [`${playerCount} players`, location || null].filter(Boolean).join(' | ');

  setLiveUI(true);
  tickLive();
  liveTimerId = setInterval(tickLive, 1000);
  gameEvents.onStart.forEach(fn => fn());
  _saveLiveState();
  if (!_saveIntervalId) _saveIntervalId = setInterval(_saveLiveState, 30000);
}

function stopLive() {
  if (!liveStart) return;
  clearInterval(liveTimerId);
  liveTimerId = null;

  const ms = Date.now() - liveStart;
  const mins = Math.max(1, Math.round(ms / 60000));
  document.getElementById('fDur').value = mins;
  document.getElementById('fDur').dataset.exactMs = ms;
  if (liveTurns > 0) document.getElementById('fTurns').value = liveTurns;

  liveStart = null;
  setLiveUI(false);
  document.getElementById('startBtn').textContent = 'Resume Game';
  gameEvents.onStop.forEach(fn => fn());
  _saveLiveState();
}

function overlayClick(e) {
}

// ── LIVE STATE PERSISTENCE ────────────────────────────────────────────────────

function _saveLiveState() {
  const rows = [...document.querySelectorAll('.player-form-row')].map(row => {
    const id = row.id.replace('pr-', '');
    return {
      char:     document.getElementById(`pc-${id}`)?.value || '',
      isMe:     meId == id,
      isWinner: winnerId == id,
      userId:   row.dataset.userId || null,
      nick:     row.dataset.nick   || null,
    };
  });
  const fDurEl = document.getElementById('fDur');
  const state = {
    saved:       Date.now(),
    liveStart:   liveStart,
    liveTurns:   liveTurns,
    isLive:      liveTimerId !== null,
    rows,
    fDate:       document.getElementById('fDate')?.value     || '',
    fLocation:   document.getElementById('fLocation')?.value || '',
    fDur:        fDurEl?.value || '',
    fDurExactMs: fDurEl?.dataset.exactMs ? parseInt(fDurEl.dataset.exactMs) : null,
    fTurns:      document.getElementById('fTurns')?.value    || '',
  };
  try { localStorage.setItem(_LIVE_KEY, JSON.stringify(state)); } catch (_) {}
}

function _clearLiveState() {
  localStorage.removeItem(_LIVE_KEY);
  if (_saveIntervalId) { clearInterval(_saveIntervalId); _saveIntervalId = null; }
}

// ── ROW MANAGEMENT ────────────────────────────────────────────────────────────

function syncRowBtns() {
  const count = document.querySelectorAll('.player-form-row').length;
  document.getElementById('addBtn').disabled = count >= 6;
  document.querySelectorAll('.pf-btn.del').forEach(b => b.disabled = count <= 2);
}

function renumberRows() {
  document.querySelectorAll('.player-form-row').forEach((row, i) => {
    const span = row.querySelector('.row-num');
    if (span) span.textContent = `${i + 1}.`;
  });
}

function updateRowPortrait(id) {
  const val = document.getElementById(`pc-${id}`)?.value;
  const img = document.getElementById(`pi-${id}`);
  if (!img) return;
  img.src = val ? charImgSrc(val) : 'asset/player.svg';
}

function addRow(char = '', win = false, isMe = false, origUserId = null, origNick = null) {
  if (document.querySelectorAll('.player-form-row').length >= 6) return;
  const id = ++pIdx;
  const div = document.createElement('div');
  div.className = 'player-form-row';
  div.id = `pr-${id}`;
  div.dataset.userId = origUserId || '';
  div.dataset.nick   = origNick   || '';
  div.innerHTML = `
    <div class="drag-handle">
      <span class="drag-dots">⠿</span>
      <span class="row-num"></span>
      <img class="order-slot-portrait" id="pi-${id}" src="${char ? charImgSrc(char) : 'asset/player.svg'}" onerror="this.src='asset/player.svg'" alt="">
    </div>
    <button class="pf-btn rand" id="pr-rand-${id}" onclick="randomizeOne(${id})" title="Random character">🎲</button>
    <select id="pc-${id}" onchange="updateRowPortrait(${id})">${charSelectHTML(chars, char)}</select>
    <button class="pf-btn me${isMe ? ' on' : ''}" id="pm-${id}" onclick="toggleMe(${id})" title="My character">👤</button>
    <button class="pf-btn win${win ? ' on' : ''}" id="pw-${id}" onclick="toggleWin(${id})" title="Winner">👑</button>
    <button class="pf-btn del" id="pd-${id}" onclick="rmRow(${id})" title="Remove">×</button>`;
  document.getElementById('pRows').appendChild(div);
  if (win)  winnerId = id;
  if (isMe) meId     = id;

  syncRowBtns();
  renumberRows();
}

function rmRow(id) {
  if (document.querySelectorAll('.player-form-row').length <= 2) return;
  document.getElementById(`pr-${id}`)?.remove();
  if (winnerId === id) winnerId = null;
  if (meId     === id) meId     = null;
  syncRowBtns();
  renumberRows();
}

function toggleMe(id) {
  document.querySelectorAll('.pf-btn.me').forEach(b => b.classList.remove('on'));
  if (meId === id) { meId = null; return; }
  meId = id;
  document.getElementById(`pm-${id}`)?.classList.add('on');
}

function toggleWin(id) {
  document.querySelectorAll('.pf-btn.win').forEach(b => b.classList.remove('on'));
  if (winnerId === id) { winnerId = null; return; }
  winnerId = id;
  document.getElementById(`pw-${id}`)?.classList.add('on');
}

// ── DRAG TO REORDER ───────────────────────────────────────────────────────────

let _dragSrc = null;

function _initDrag() {
  const container = document.getElementById('pRows');

  function _endDrag() {
    if (!_dragSrc) return;
    _dragSrc.classList.remove('dragging');
    _dragSrc = null;
    // Restore sheet-body scrolling
    const sb = container.closest('.sheet-body');
    if (sb) sb.style.touchAction = '';
    renumberRows();
  }

  // Pointer events handle both mouse (desktop) and touch (iOS) in one path.
  // setPointerCapture keeps events routed here even when the pointer moves fast.
  container.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    _dragSrc = handle.closest('.player-form-row');
    _dragSrc.classList.add('dragging');
    // Lock the sheet-body scroll so the iOS native scroll layer doesn't claim
    // the touch sequence (critical in standalone/PWA mode with
    // -webkit-overflow-scrolling: touch).
    const sb = container.closest('.sheet-body');
    if (sb) sb.style.touchAction = 'none';
    container.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', e => {
    if (!_dragSrc) return;
    _dragSrc.style.visibility = 'hidden';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    _dragSrc.style.visibility = '';
    if (!el) return;
    const row = el.closest('.player-form-row');
    if (!row || row === _dragSrc) return;
    const rect = row.getBoundingClientRect();
    container.insertBefore(_dragSrc, e.clientY < rect.top + rect.height / 2 ? row : row.nextSibling);
  });

  container.addEventListener('pointerup',     _endDrag);
  container.addEventListener('pointercancel', _endDrag);
}

// ── RANDOMIZE ─────────────────────────────────────────────────────────────────

function randomizeOne(id) {
  const sel = document.getElementById(`pc-${id}`);
  if (!sel) return;
  // Exclude characters already picked by other rows
  const taken = new Set(
    [...document.querySelectorAll('.player-form-row select')]
      .filter(s => s.id !== `pc-${id}`)
      .map(s => s.value)
      .filter(Boolean)
  );
  const pool = chars.map(c => c.name).filter(n => !taken.has(n));
  if (!pool.length) return;
  sel.value = pool[Math.floor(Math.random() * pool.length)];
  updateRowPortrait(id);
}

function randomizeOrder() {
  const rows = [...document.querySelectorAll('.player-form-row')];
  if (rows.length < 2) return;

  const rids       = rows.map(r => r.id.replace('pr-', ''));
  const selections = rids.map(rid => document.getElementById(`pc-${rid}`).value);

  // Track which character "Me" is attached to, so the flag can follow it.
  const meChar = meId != null
    ? document.getElementById(`pc-${meId}`)?.value
    : null;

  // Fisher–Yates
  for (let i = selections.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selections[i], selections[j]] = [selections[j], selections[i]];
  }

  rids.forEach((rid, i) => {
    document.getElementById(`pc-${rid}`).value = selections[i];
    updateRowPortrait(Number(rid));
  });

  // Re-attach "Me" to whichever row now holds the original character.
  if (meChar) {
    const newMeIdx = selections.indexOf(meChar);
    if (newMeIdx !== -1) {
      const newMeId = Number(rids[newMeIdx]);
      document.querySelectorAll('.pf-btn.me').forEach(b => b.classList.remove('on'));
      meId = newMeId;
      document.getElementById(`pm-${newMeId}`)?.classList.add('on');
    }
  }
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────

function showErr(msg) {
  const el = document.getElementById('err');
  el.textContent = msg;
  el.classList.add('show');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function _submitEditGame(dur, turns, location, btn) {
  const g = games.find(x => x.id === editId);
  const patch = {};
  if (g && !g.duration_minutes && dur)      patch.duration_minutes = dur;
  if (g && !g.num_turns        && turns)    patch.num_turns        = turns;
  if (g && !g.location         && location) patch.location         = location;

  if (!Object.keys(patch).length) { closeSheet(); return; }

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const { error } = await db.from('games').update(patch).eq('id', editId);

  btn.disabled    = false;
  btn.textContent = 'Save Changes';

  if (error) return showErr(error.message);
  closeSheet();
  await load();
}

async function _submitNewGame(dur, turns, location, btn) {
  const date = document.getElementById('fDate').value;
  if (!date) return showErr('Date and time is required.');
  if (new Date(date) > new Date()) return showErr('Date cannot be in the future.');

  const rows = document.querySelectorAll('.player-form-row');
  if (!rows.length) return showErr('Add at least one player.');
  if (rows.length < 2) return showErr('A game must have at least 2 players.');
  if (!meId) return showErr('Mark which character you played with 👤.');

  const user    = getCurrentUser();
  const profile = getCurrentProfile();

  const ps = [];
  for (const row of rows) {
    const rid  = row.id.replace('pr-', '');
    const char = document.getElementById(`pc-${rid}`).value;
    if (!char) return showErr('Choose a character for each player.');
    const isMe = meId == rid;
    ps.push({
      position:  ps.length,
      character: char,
      is_winner: winnerId == rid,
      user_id:   isMe ? user.id         : (row.dataset.userId || null),
      nickname:  isMe ? profile.nickname : (row.dataset.nick  || null),
    });
  }

  if (!ps.some(p => p.is_winner)) return showErr('Mark the winner with 👑.');
  if (new Set(ps.map(p => p.character)).size !== ps.length)
    return showErr('Each player must use a different character.');

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  const gameData = {
    played_at:        new Date(date).toISOString(),
    duration_minutes: dur,
    num_turns:        turns,
    location:         location,
    created_by:       user?.id || null,
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
  closeSheet();
  await load();
  loadLocationOptions();
  showQR(g.id);
}

async function submitForm() {
  document.getElementById('err').classList.remove('show');

  const dur      = parseInt(document.getElementById('fDur').value)   || null;
  const turns    = parseInt(document.getElementById('fTurns').value) || null;
  const location = document.getElementById('fLocation').value.trim() || null;
  const btn      = document.getElementById('submitBtn');

  if (editId) return _submitEditGame(dur, turns, location, btn);
  return _submitNewGame(dur, turns, location, btn);
}

// ── RESUME BANNER ─────────────────────────────────────────────────────────────

function _checkResume() {
  let state;
  try { state = JSON.parse(localStorage.getItem(_LIVE_KEY)); } catch (_) { return; }
  if (!state || !state.rows || !state.rows.length) return;
  if (Date.now() - state.saved > 86400000) { _clearLiveState(); return; }

  const elapsed = state.liveStart ? fmtElapsed(Date.now() - state.liveStart) : null;
  const banner = document.createElement('div');
  banner.id = 'resumeBanner';
  banner.className = 'resume-banner';
  banner.innerHTML = `
    <div class="resume-banner-text">
      <strong>Game in progress</strong>
      <span>${state.rows.length} players · Turn ${state.liveTurns}${elapsed ? ` · ${elapsed}` : ''}</span>
    </div>
    <div class="resume-banner-btns">
      <button class="btn btn-primary btn-sm" onclick="_doResume()">Resume</button>
      <button class="btn btn-ghost btn-sm" onclick="_dismissResume()">Discard</button>
    </div>`;
  document.querySelector('main').prepend(banner);
  document.getElementById('newGameBtn').disabled = true;
}

function _dismissResume() {
  _clearLiveState();
  document.getElementById('resumeBanner')?.remove();
  document.getElementById('newGameBtn').disabled = false;
}

function _doResume() {
  let state;
  try { state = JSON.parse(localStorage.getItem(_LIVE_KEY)); } catch (_) { return; }
  if (!state) return;

  document.getElementById('resumeBanner')?.remove();
  document.getElementById('newGameBtn').disabled = false;

  if (!getCurrentUser()) { signInWithDiscord(); return; }
  if (!getCurrentProfile()) { _openNicknameModal(); return; }

  editId   = null;
  pIdx     = 0;
  winnerId = null;
  meId     = null;

  document.getElementById('sheetTitle').textContent      = 'New Game';
  document.getElementById('submitBtn').textContent       = 'Save Game';
  document.getElementById('startBtn').textContent        = 'Resume Game';
  document.getElementById('startBtn').style.display      = '';
  document.getElementById('randomizeBtn').style.display  = '';
  document.getElementById('err').classList.remove('show');
  document.getElementById('pRows').innerHTML             = '';
  document.getElementById('editHint').style.display      = 'none';
  document.getElementById('fDateField').style.display    = '';
  document.getElementById('playersSection').style.display = '';

  const fDurEl = document.getElementById('fDur');
  document.getElementById('fDate').value     = state.fDate     || '';
  document.getElementById('fLocation').value = state.fLocation || '';
  fDurEl.value                               = state.fDur      || '';
  document.getElementById('fTurns').value    = state.fTurns    || '';
  if (state.fDurExactMs) fDurEl.dataset.exactMs = state.fDurExactMs;
  else delete fDurEl.dataset.exactMs;

  fDurEl.disabled                               = false;
  document.getElementById('fTurns').disabled    = false;
  document.getElementById('fLocation').disabled = false;

  for (const r of state.rows) {
    addRow(r.char, r.isWinner, r.isMe, r.userId, r.nick);
  }

  syncRowBtns();
  openOverlay('overlay');

  if (state.liveStart) {
    liveStart = state.liveStart;
    liveTurns = state.liveTurns;
    document.getElementById('liveTurnCount').textContent = liveTurns;
    setLiveUI(true);
    tickLive();
    liveTimerId = setInterval(tickLive, 1000);
    gameEvents.onStart.forEach(fn => fn());
    _saveLiveState();
    if (!_saveIntervalId) _saveIntervalId = setInterval(_saveLiveState, 30000);
  }
}

// ── QR CODE ───────────────────────────────────────────────────────────────────

function showQR(gameId) {
  showQRModal(new URL(`join.html?game=${gameId}`, location.href).href, 'qrCode', 'qrOverlay');
}

function closeQR() {
  closeOverlay('qrOverlay');
}

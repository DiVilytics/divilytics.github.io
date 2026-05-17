// ── THEME ─────────────────────────────────────────────────────────────────────

(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (saved === 'auto') {
    if (!window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', 'light');
  }
  // 'dark' or unset: no attribute needed
})();

let _autoMql = null;

function _onAutoChange(e) {
  if (e.matches) document.documentElement.removeAttribute('data-theme');
  else           document.documentElement.setAttribute('data-theme', 'light');
  _updateThemeBtn();
  _updateThemeIcons();
  if (typeof _updateHomeThemeBtns === 'function') _updateHomeThemeBtns();
}

function _applyTheme(state) {
  if (_autoMql) { _autoMql.removeEventListener('change', _onAutoChange); _autoMql = null; }
  if (state === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (state === 'dark') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    if (mql.matches) document.documentElement.removeAttribute('data-theme');
    else             document.documentElement.setAttribute('data-theme', 'light');
    _autoMql = mql;
    _autoMql.addEventListener('change', _onAutoChange);
  }
  localStorage.setItem('theme', state);
  _updateThemeBtn();
  _updateThemeIcons();
  if (typeof _updateHomeThemeBtns === 'function') _updateHomeThemeBtns();
}

// Re-attach auto listener on page load if theme was previously set to auto
if (localStorage.getItem('theme') === 'auto') {
  _autoMql = window.matchMedia('(prefers-color-scheme: dark)');
  _autoMql.addEventListener('change', _onAutoChange);
}

function _updateThemeIcons() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const asset = isLight ? 'asset/logo-w.svg' : 'asset/logo-b.svg';
  const navImg = document.querySelector('.nav-brand img');
  if (navImg) navImg.src = asset;
}

function _nextTheme(current) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (current === 'auto') return systemDark ? 'light' : 'dark';
  if (systemDark)         return current === 'light' ? 'dark' : 'auto';
  return                         current === 'dark'  ? 'light' : 'auto';
}

function toggleTheme() {
  _applyTheme(_nextTheme(localStorage.getItem('theme') || 'dark'));
}

function _updateThemeBtn() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const current = localStorage.getItem('theme') || 'dark';
  const next    = _nextTheme(current);
  const icons   = { dark: '🌙', light: '☀️', auto: '🌗' };
  const titles  = { dark: 'Force dark', light: 'Force light', auto: 'Follow system' };
  btn.textContent = icons[current];
  btn.title       = titles[next];
}

// ── CHARACTER HELPERS ─────────────────────────────────────────────────────────

function charImgSrc(name) {
  return `asset/characters/${name.replace(/ /g, '_')}.webp`;
}

function charImgHTML(name) {
  return `<img class="char-portrait" src="${charImgSrc(name)}" alt="">`;
}

function resolveAvatar(profile) {
  return profile?.avatar_url || profile?.default_avatar || 'asset/player.svg';
}

function playerAvatarHTML(url, large, fallback = 'asset/player.svg') {
  const src = (url || '').trim() || fallback;
  const cls = large ? 'player-avatar-lg' : 'player-avatar';
  return `<img class="${cls}" src="${_esc(src)}" alt="" onerror="this.src='${_esc(fallback)}'">`;
}

// ── CHARACTER GRIDS ───────────────────────────────────────────────────────────

function groupByBox(chars) {
  const map = {};
  for (const c of chars) {
    if (!map[c.box]) map[c.box] = [];
    map[c.box].push(c);
  }
  return map;
}

function charSelectHTML(chars, selected = '') {
  const byBox = groupByBox(chars);
  let html = '<option value="">— Character —</option>';
  for (const [box, cs] of Object.entries(byBox)) {
    html += `<optgroup label="${box}">`;
    for (const c of cs) {
      html += `<option value="${c.name}"${c.name === selected ? ' selected' : ''}>${c.name}</option>`;
    }
    html += '</optgroup>';
  }
  return html;
}

// Shared pill-grid builder. Pass `activeClass` to control which CSS class
// represents membership in `set` ("on" for filter selection, "excluded" for
// the new-game character filter). The `onToggle(name, nowActive)` callback
// fires after the set + DOM are updated.
function buildCharPillGrid(container, chars, set, { activeClass = 'on', onToggle } = {}) {
  const byBox = groupByBox(chars);
  container.innerHTML = '';
  for (const [box, cs] of Object.entries(byBox)) {
    const group = document.createElement('div');
    group.className = 'box-group';
    group.innerHTML = `<div class="box-name">${box}</div><div class="box-pills"></div>`;
    container.appendChild(group);
    const pillsEl = group.querySelector('.box-pills');
    for (const c of cs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'char-pill' + (set.has(c.name) ? ` ${activeClass}` : '');
      btn.innerHTML = charImgHTML(c.name) + _esc(c.name);
      btn.dataset.name = c.name;
      btn.onclick = () => {
        const wasOn = set.has(c.name);
        if (wasOn) { set.delete(c.name); btn.classList.remove(activeClass); }
        else       { set.add(c.name);    btn.classList.add(activeClass);    }
        onToggle?.(c.name, !wasOn);
      };
      pillsEl.appendChild(btn);
    }
  }
}

function buildCharGrid(container, chars, selectedSet, onToggle) {
  buildCharPillGrid(container, chars, selectedSet, { activeClass: 'on', onToggle });
}

function buildExcludeGrid(container, chars, excludedSet, onChange) {
  buildCharPillGrid(container, chars, excludedSet, { activeClass: 'excluded', onToggle: onChange });
}

// ── FORMATTING ────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function fmtDuration(min) {
  if (!min) return null;
  if (min < 60) return min + 'm';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtDateShort(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function avg(arr) {
  const valid = arr.filter(x => x != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// ── DOM HELPERS ───────────────────────────────────────────────────────────────

function _resolveEl(target) {
  return typeof target === 'string' ? document.getElementById(target) : target;
}

// Toggle the .hidden utility class. Call as setVisible(id, true|false).
function setVisible(target, visible) {
  const el = _resolveEl(target);
  if (!el) return;
  el.classList.toggle('hidden', !visible);
}

// Show an error banner (.err element). The shake animation always re-plays so
// repeated submits with the same error are still noticeable. Optional
// `scroll` smooth-scrolls the banner into view.
function showError(target, msg, { scroll = false } = {}) {
  const el = _resolveEl(target);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  // Restart the animation by toggling the trigger class through one reflow.
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  if (scroll) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearError(target) {
  _resolveEl(target)?.classList.remove('show');
}

// ── OVERLAYS ──────────────────────────────────────────────────────────────────

function closeOverlay(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

function openOverlay(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Avatar zoom: full-screen circular preview of an image. Click anywhere
// outside the image (or on the close button) to dismiss. The overlay is
// injected once per page on first use.
function showAvatarLightbox(src, fallback) {
  let overlay = document.getElementById('avatarLightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'avatarLightbox';
    overlay.className = 'avatar-lightbox';
    // Any click anywhere on the overlay (image, backdrop, close button) dismisses.
    overlay.onclick = () => closeAvatarLightbox();
    overlay.innerHTML = `
      <button class="avatar-lightbox-close" type="button" aria-label="Close">×</button>
      <img class="avatar-lightbox-img" id="avatarLightboxImg" alt="">
    `;
    document.body.appendChild(overlay);
  }
  const img = document.getElementById('avatarLightboxImg');
  img.src = src;
  if (fallback) img.onerror = () => { img.src = fallback; };
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAvatarLightbox() {
  const overlay = document.getElementById('avatarLightbox');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function showQRModal(url, codeElId, overlayId) {
  document.getElementById('qrUrlText').textContent = url;
  const el = document.getElementById(codeElId);
  el.innerHTML = '';
  new QRCode(el, { text: url, width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff' });
  openOverlay(overlayId);
}

// ── FILTER HELPERS ────────────────────────────────────────────────────────────

function updateFilterPills(selector, value) {
  document.querySelectorAll(selector).forEach((btn, i) => {
    btn.classList.toggle('on', (i === 0 ? 'all' : i + 1) === value);
  });
}

function populateSearchDropdown(dropdown, html, onSelect) {
  dropdown.innerHTML = html;
  dropdown.querySelectorAll('.cs-option').forEach(opt => {
    opt.addEventListener('mousedown', ev => { ev.preventDefault(); onSelect(opt); });
  });
  dropdown.classList.add('open');
}

// ── STATS HELPERS ─────────────────────────────────────────────────────────────

// Renders the standard summary trio: e.g.
//   statBoxesHTML([{ val: '12', lbl: 'Games' }, { val: '23m', lbl: 'Avg duration' }])
// Returns an HTML string of three `.stat-box` divs (no wrapping element).
function statBoxesHTML(boxes) {
  return boxes.map(b =>
    `<div class="stat-box"><div class="stat-val">${b.val}</div><div class="stat-lbl">${b.lbl}</div></div>`
  ).join('');
}

function sortStatRows(rows, mode) {
  const sorted = [...rows];
  if (mode === 'count') return sorted.sort((a, b) => b.wins - a.wins || b.games - a.games);
  if (mode === 'games') return sorted.sort((a, b) => b.games - a.games || b.wins - a.wins);
  return sorted.sort((a, b) => {
    const pa = a.games ? a.wins / a.games : 0;
    const pb = b.games ? b.wins / b.games : 0;
    return pb - pa || b.wins - a.wins;
  });
}

function computeRanks(rows, mode) {
  const primaryVal = r =>
    mode === 'count' ? r.wins :
    mode === 'games' ? r.games :
    (r.games ? r.wins / r.games : 0);
  const ranks = [];
  for (let i = 0; i < rows.length; i++) {
    ranks.push(i === 0 || primaryVal(rows[i]) !== primaryVal(rows[i - 1]) ? i + 1 : ranks[i - 1]);
  }
  return ranks;
}

function statBarWidth(r, mode, maxWins, maxGames, maxPct) {
  if (mode === 'count') return Math.round((r.wins  / maxWins)  * 100);
  if (mode === 'games') return Math.round((r.games / maxGames) * 100);
  const pct = r.games ? r.wins / r.games : 0;
  return Math.round((pct / maxPct) * 100);
}

// Renders the rank | identity | bar | value | sub stat table. Used by the
// leaderboard and the player profile (the character-detail stat table has a
// different shape and is built inline in characters.js).
//
// Required opts:
//   mode          : 'pct' | 'count' | 'games'
//   headLabel     : column header for the identity column ("Character" | "Player")
//   getKey(r)     : returns the row's display name (string)
//   getHref(key)  : returns the link target
//   getIdentity(key): returns the inline HTML for the row's avatar/portrait
//   getSub(key)   : optional, returns small grey sub-text under the name
//   wrapClass     : optional extra class on the `lb-table` wrapper
function renderStatTableHTML(rows, opts) {
  const { mode, headLabel, getKey, getHref, getIdentity, getSub, wrapClass = '' } = opts;
  const sorted = sortStatRows(rows, mode);

  const maxWins  = sorted[0]?.wins  || 1;
  const maxGames = sorted[0]?.games || 1;
  const maxPct   = Math.max(...sorted.map(r => r.games ? r.wins / r.games : 0)) || 1;

  const ranks      = computeRanks(sorted, mode);
  const medalClass = rank => rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

  return `
    <div class="lb-table${wrapClass ? ' ' + wrapClass : ''}">
      <div class="lb-head">
        <span>#</span>
        <span>${headLabel}</span>
        <span></span>
        <span class="text-right">${mode === 'count' ? '# Wins' : mode === 'pct' ? '% Wins' : '# Games'}</span>
        <span class="text-right">${mode === 'games' ? '# Wins' : '# Games'}</span>
      </div>
      ${sorted.map((r, i) => {
        const rank    = ranks[i];
        const key     = getKey(r);
        const pct     = r.games ? r.wins / r.games : 0;
        const barW    = statBarWidth(r, mode, maxWins, maxGames, maxPct);
        const dispVal = mode === 'count' ? r.wins : mode === 'pct' ? Math.round(pct * 100) + '%' : r.games;
        const dispSub = mode === 'games' ? r.wins : r.games;
        const sub     = getSub ? (getSub(key, r) || '') : '';
        return `
          <a class="lb-row link" href="${getHref(key, r)}">
            <div class="rank-num ${medalClass(rank)}">${rank}</div>
            <div class="row-identity">
              ${getIdentity(key, r)}
              <div>
                <div class="row-name">${_esc(key)}</div>
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
    </div>`;
}

// ── ACHIEVEMENTS ──────────────────────────────────────────────────────────────

const ACH_TIERS = [
  { id: 'bronze', threshold: 1,  label: 'Bronze', icon: '⭐', cupIcon: '🏆' },
  { id: 'silver', threshold: 5,  label: 'Silver', icon: '⭐', cupIcon: '🏆' },
  { id: 'gold',   threshold: 10, label: 'Gold',   icon: '⭐', cupIcon: '🏆' },
];
// Locked / not-yet-earned slots render as a subtle dot rather than a greyed
// trophy/star, so they read as "empty" instead of "dim silver".
const ACH_EMPTY_ICON       = '·';
const ACH_EMPTY_MEDAL_ICON = '·';

// Long character names that read better as two lines in the cramped achievement
// tile label. Returns HTML; callers must NOT pre-escape — this helper escapes
// each part itself.
function _fmtAchTileName(name) {
  if (name === 'Cruella de Vil')  return 'Cruella<br>de Vil';
  if (name === 'Queen of Hearts') return 'Queen<br>of Hearts';
  return _esc(name);
}

function achTierFor(count) {
  let tier = -1;
  for (let i = 0; i < ACH_TIERS.length; i++) {
    if (count >= ACH_TIERS[i].threshold) tier = i;
  }
  return tier;
}

function countAchievements(charAch, allChars) {
  let earned = 0;
  for (const c of allChars) {
    const stats = charAch.get(c.name) || { plays: 0, wins: 0 };
    const pt = achTierFor(stats.plays);
    const wt = achTierFor(stats.wins);
    if (pt >= 0) earned += pt + 1;
    if (wt >= 0) earned += wt + 1;
  }
  return { earned, total: allChars.length * 2 * ACH_TIERS.length };
}

function computeCharacterAchievements(playerRows) {
  const out = new Map();
  for (const p of playerRows) {
    if (!p.character) continue;
    const entry = out.get(p.character) || { plays: 0, wins: 0 };
    entry.plays++;
    if (p.is_winner) entry.wins++;
    out.set(p.character, entry);
  }
  return out;
}

function renderAchievementsGridHTML(charAch, allChars, onClickFn = '_showAchDetail') {
  const topMedal = (count, kind) => {
    const t = achTierFor(count);
    const isCup = kind === 'cup';
    const emptyIcon = isCup ? ACH_EMPTY_ICON : ACH_EMPTY_MEDAL_ICON;
    if (t < 0) {
      return `<span class="ach-medal locked" title="None earned (${count})">${emptyIcon}</span>`;
    }
    const tier = ACH_TIERS[t];
    const icon = isCup ? tier.cupIcon : tier.icon;
    const tierCls = isCup
      ? ` ach-cup ach-cup-${tier.id}`
      : ` ach-star ach-star-${tier.id}`;
    return `<span class="ach-medal${tierCls}" title="${tier.label} (${count})">${icon}</span>`;
  };
  const tiles = allChars.map(c => {
    const stats = charAch.get(c.name) || { plays: 0, wins: 0 };
    return `
      <button class="ach-tile" data-char="${_esc(c.name)}" onclick="${onClickFn}(this.dataset.char)" type="button" title="${_esc(c.name)}">
        <div class="ach-tile-main">
          <img class="ach-tile-img" src="${charImgSrc(c.name)}" onerror="this.src='asset/player.svg'" alt="${_esc(c.name)}">
          <div class="ach-tile-rows">
            <div class="ach-tile-row" aria-label="Plays">${topMedal(stats.plays, 'medal')}</div>
            <div class="ach-tile-row" aria-label="Wins">${topMedal(stats.wins, 'cup')}</div>
          </div>
        </div>
        <div class="ach-tile-name">${_fmtAchTileName(c.name)}</div>
      </button>`;
  }).join('');
  return `
    <div class="ach-grid">${tiles}</div>`;
}

function renderAchievementDetailHTML(charName, stats) {
  stats = stats || { plays: 0, wins: 0 };
  const track = (count, label, verb, kind) => {
    const tier = achTierFor(count);
    const isCup = kind === 'cup';
    return `
      <div class="ach-track">
        <div class="ach-track-label">${label} | ${count}</div>
        ${ACH_TIERS.map((t, i) => {
          const earned = i <= tier;
          const cond   = `${verb} ${t.threshold} ${t.threshold === 1 ? 'game' : 'games'}`;
          const status = earned ? `Earned | ${cond}` : `${count} / ${t.threshold} | ${cond}`;
          const icon   = isCup ? t.cupIcon : t.icon;
          const tierCls = isCup
            ? ` ach-cup ach-cup-${t.id}`
            : ` ach-star ach-star-${t.id}`;
          return `<div class="ach-track-tier${earned ? ' earned' : ''}">
            <span class="ach-track-icon${tierCls}">${icon}</span>
            <span class="ach-track-name">${t.label}</span>
            <span class="ach-track-status">${status}</span>
          </div>`;
        }).join('')}
      </div>`;
  };
  return `
    <div class="ach-detail-head">
      <img class="char-portrait identity-portrait" src="${charImgSrc(charName)}" onerror="this.src='asset/player.svg'" alt="">
      <div class="ach-detail-name">${_esc(charName)}</div>
    </div>
    ${track(stats.plays, 'Plays', 'Play', 'medal')}
    ${track(stats.wins,  'Wins',  'Win',  'cup')}`;
}

// ── SEARCH HELPERS ────────────────────────────────────────────────────────────

// Wires up a typeahead input + dropdown. Every page that has a search box
// previously had three near-identical wrappers (input/blur/keydown) — this
// helper replaces them with a single registration call.
//
// Required opts:
//   inputId, dropdownId
//   fetchOptions(query)  : sync or async, returns an array of "option" data
//   renderOption(item)   : returns the inner HTML string for one .cs-option
//   onSelect(optionEl)   : called with the chosen .cs-option element
// Optional:
//   onDirectEnter(query) : Enter w/ no active option fires this with raw text
//   onEmpty()            : called when query goes blank (e.g. clear filters)
//   debounceMs           : 0 = instant; >0 debounces fetchOptions
function attachSearchBox(opts) {
  const {
    inputId, dropdownId,
    fetchOptions, renderOption,
    onSelect, onDirectEnter, onEmpty,
    debounceMs = 0,
  } = opts;
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  let timer = null;

  async function _runQuery(val) {
    const trimmed = val.trim();
    if (!trimmed) {
      dropdown.classList.remove('open');
      onEmpty?.();
      return;
    }
    const matches = await fetchOptions(trimmed);
    if (!matches || !matches.length) { dropdown.classList.remove('open'); return; }
    populateSearchDropdown(dropdown, matches.map(renderOption).join(''), onSelect);
  }

  input.addEventListener('input', e => {
    const v = e.target.value;
    if (debounceMs > 0) {
      clearTimeout(timer);
      timer = setTimeout(() => _runQuery(v), debounceMs);
    } else {
      _runQuery(v);
    }
  });
  input.addEventListener('blur',    () => _handleSearchBlur(dropdown));
  input.addEventListener('keydown', e  => _handleSearchKeydown(e, dropdown, input, onSelect, onDirectEnter));
}

function _handleSearchBlur(dropdownEl) {
  setTimeout(() => dropdownEl.classList.remove('open'), 150);
}

function _handleSearchKeydown(e, dropdownEl, inputEl, onSelect, onDirectEnter) {
  const options = [...dropdownEl.querySelectorAll('.cs-option')];
  const active  = dropdownEl.querySelector('.cs-option.active');
  let idx = active ? options.indexOf(active) : -1;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    options.forEach(o => o.classList.remove('active'));
    options[(idx + 1) % options.length]?.classList.add('active');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    options.forEach(o => o.classList.remove('active'));
    options[(idx - 1 + options.length) % options.length]?.classList.add('active');
  } else if (e.key === 'Enter') {
    const target = active || (options.length === 1 ? options[0] : null);
    if (target) {
      e.preventDefault();
      onSelect(target);
    } else if (onDirectEnter) {
      const v = inputEl.value.trim();
      if (v) { e.preventDefault(); onDirectEnter(v); }
    }
  } else if (e.key === 'Escape') {
    dropdownEl.classList.remove('open');
    inputEl.blur();
  }
}

// ── QR URL COPY ───────────────────────────────────────────────────────────────

function copyQrUrl() {
  const url = document.getElementById('qrUrlText')?.textContent?.trim();
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.qr-url-row .pf-btn');
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('copy-success');
    setTimeout(() => { btn.textContent = prev; btn.classList.remove('copy-success'); }, 1500);
  });
}

// ── GAME ROLES ────────────────────────────────────────────────────────────────

// Centralizes "what's this user's relationship to this game?" so callers
// don't re-derive the same booleans inline. Pass the current user object
// (typically `getCurrentUser()`); a missing user yields all-false.
function gameUserRole(g, gp, user) {
  if (!user) return { isCreator: false, isClaimant: false, isParticipant: false };
  const isCreator  = g.created_by === user.id;
  const isClaimant = gp.some(p => p.user_id === user.id);
  return { isCreator, isClaimant, isParticipant: isCreator || isClaimant };
}

// ── GAME CARD ─────────────────────────────────────────────────────────────────

// Pure HTML builder for a game card. The result is meant to be injected into
// a `<div class="game-card">…</div>` host. Pass `locationClickable: true` to
// render the location as a button (the caller wires the click handler).
function buildGameCardHTML(g, gp, { isSelf = () => false, actions = '', locationClickable = false } = {}) {
  const locationPart = g.location
    ? (locationClickable ? `<button class="card-loc-btn">${_esc(g.location)}</button>` : _esc(g.location))
    : null;
  const meta = [
    fmtDuration(g.duration_minutes),
    g.num_turns ? `${g.num_turns} rounds` : null,
    locationPart,
    `${gp.length}p`,
  ].filter(Boolean).join(' | ');

  const chipsHTML = gp.map(p => {
    const cls = `chip ${p.is_winner ? 'winner' : ''}${isSelf(p) ? ' self' : ''}`;
    return `<div class="${cls}">
      ${p.is_winner ? '<span class="win-star">👑</span>' : ''}
      <a class="char-link chip-img" href="characters.html?char=${encodeURIComponent(p.character)}">${charImgHTML(p.character)}</a>
      <div class="chip-body">
        <div class="chip-char"><a class="char-link" href="characters.html?char=${encodeURIComponent(p.character)}">${_esc(p.character)}</a></div>
        ${p.nickname ? `<div class="chip-nick"><a class="nick-link" href="player.html?nick=${encodeURIComponent(p.nickname)}">${_esc(p.nickname)}</a></div>` : ''}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="card-body">
      <div class="card-top">
        <div class="card-date">${fmtDateTime(g.played_at)}</div>
        <div class="card-meta">${meta}</div>
      </div>
      <div class="card-players">${chipsHTML}</div>
    </div>
    ${actions}`;
}

// Wrap the HTML in a <div class="game-card"> and attach the optional
// location-click handler. Callers that just need HTML should call
// buildGameCardHTML directly.
function buildGameCard(g, gp, { isSelf, actions, onLocationClick } = {}) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.innerHTML = buildGameCardHTML(g, gp, {
    isSelf,
    actions,
    locationClickable: !!onLocationClick,
  });
  if (onLocationClick && g.location) {
    card.querySelector('.card-loc-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      onLocationClick(g.location);
    });
  }
  return card;
}

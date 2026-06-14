// ── THEME ─────────────────────────────────────────────────────────────────────

(function () {
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (saved === 'dark') {
    // forced dark: no attribute needed
  } else {
    // 'auto' or unset (first visit): follow the device preference
    if (!window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', 'light');
  }
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

// Re-attach auto listener on page load when following the device (explicit
// 'auto', or unset on first visit) so live system theme changes are reflected.
if ((localStorage.getItem('theme') || 'auto') === 'auto') {
  _autoMql = window.matchMedia('(prefers-color-scheme: dark)');
  _autoMql.addEventListener('change', _onAutoChange);
}

function _updateThemeIcons() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const asset = isLight ? 'asset/logos/logo-w.svg' : 'asset/logos/logo-b.svg';
  const navImg = document.querySelector('.nav-brand img');
  if (navImg) navImg.src = asset;
  _updateFavicon();
  _updateThemeColor();
}

// Match the mobile browser address-bar colour to the app theme (the page
// background), so the chrome isn't stuck on the default/dark value.
function _updateThemeColor() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const color = isLight ? '#ffffff' : '#000000';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  if (meta.getAttribute('content') !== color) meta.setAttribute('content', color);
}

// Drive the SVG favicon from the app's own theme (the in-page light/dark
// toggle), not the OS `prefers-color-scheme` — otherwise it only follows the
// system and ignores the user's choice.
function _updateFavicon() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const V = '?v=20260603b';

  // SVG favicon (Chrome / Firefox / Edge).
  let svg = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (!svg) {
    svg = document.createElement('link');
    svg.rel = 'icon'; svg.type = 'image/svg+xml';
    document.head.appendChild(svg);
  }
  const svgHref = (isLight ? '/asset/favicon/favicon-light.svg' : '/asset/favicon/favicon-dark.svg') + V;
  if (svg.getAttribute('href') !== svgHref) svg.setAttribute('href', svgHref);

  // PNG fallback favicon — default file is the dark one; swap to the light
  // variant on light theme. If a browser ignores this, the dark default stays.
  const png = document.querySelector('link[rel="icon"][type="image/png"]');
  if (png) {
    const pngHref = (isLight ? '/asset/favicon/favicon-96x96-light.png' : '/asset/favicon/favicon-96x96.png') + V;
    if (png.getAttribute('href') !== pngHref) png.setAttribute('href', pngHref);
  }
}

// Match the favicon + address-bar colour to the theme resolved on initial load.
_updateFavicon();
_updateThemeColor();

function _nextTheme(current) {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (current === 'auto') return systemDark ? 'light' : 'dark';
  if (systemDark)         return current === 'light' ? 'dark' : 'auto';
  return                         current === 'dark'  ? 'light' : 'auto';
}

function toggleTheme() {
  _applyTheme(_nextTheme(localStorage.getItem('theme') || 'auto'));
}

function _updateThemeBtn() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const current = localStorage.getItem('theme') || 'auto';
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
  return profile?.avatar_url || profile?.default_avatar || 'asset/players/default.svg';
}

// ── AVATAR MODEL ──────────────────────────────────────────────────────────────
// An avatar value (the `avatar_url` column) is either a plain image path/URL
// (preset photos, the default svg) OR a compact "recipe" describing a player-
// built icon: a background colour plus one transparent PNG part per body slot,
// stacked back-to-front. Recipes are rendered on the fly everywhere via
// avatarHTML() — nothing rasterised is ever stored. Single source of truth for
// the parts, their order (= draw order), and per-part option counts:
const AVATAR_BUILDER = {
  parts: [
    { key: 'corpo',        label: 'Body',     count: 1 },
    { key: 'orecchie',     label: 'Ears',     count: 2 },
    { key: 'faccia',       label: 'Face',     count: 3 },
    { key: 'naso',         label: 'Nose',     count: 3 },
    { key: 'bocca',        label: 'Mouth',    count: 2 },
    { key: 'occhi',        label: 'Eyes',     count: 3 },
    { key: 'sopracciglia', label: 'Eyebrows', count: 2 },
    { key: 'capelli',      label: 'Hair',     count: 3 },
  ],
  dir: 'asset/players/parts',
  defaultBg: '#4a1d6e',
  prefix: 'builder:',
};

function isAvatarRecipe(v) {
  return typeof v === 'string' && v.startsWith(AVATAR_BUILDER.prefix);
}

// Serialize selections + bg into a stored value, e.g.
//   builder:bg=a7d8f0;corpo-1,orecchie-2,faccia-3,...
function serializeAvatarRecipe(sel, bg) {
  const body = AVATAR_BUILDER.parts.map(p => `${p.key}-${sel?.[p.key] || 1}`).join(',');
  const hex  = String(bg || AVATAR_BUILDER.defaultBg).replace('#', '').toLowerCase();
  return `${AVATAR_BUILDER.prefix}bg=${hex};${body}`;
}

// Parse a recipe string into { parts: {key:n}, bg: '#rrggbb' }, clamping every
// slot to a valid option and filling any missing slot with 1. Returns null for
// non-recipe values.
function parseAvatarRecipe(v) {
  if (!isAvatarRecipe(v)) return null;
  const [meta, body = ''] = v.slice(AVATAR_BUILDER.prefix.length).split(';');
  const bgMatch = /bg=([0-9a-fA-F]{6})/.exec(meta || '');
  const bg = bgMatch ? '#' + bgMatch[1].toLowerCase() : AVATAR_BUILDER.defaultBg;
  const raw = {};
  for (const tok of body.split(',')) {
    const m = /^([a-z]+)-(\d+)$/.exec(tok.trim());
    if (m) raw[m[1]] = parseInt(m[2], 10);
  }
  const parts = {};
  for (const p of AVATAR_BUILDER.parts) {
    const n = raw[p.key];
    parts[p.key] = (Number.isInteger(n) && n >= 1 && n <= p.count) ? n : 1;
  }
  return { parts, bg };
}

// Ordered list of layer image srcs (back-to-front) for a parsed recipe.
function avatarLayerSrcs(recipe) {
  return AVATAR_BUILDER.parts.map(p => `${AVATAR_BUILDER.dir}/${p.key}-${recipe.parts[p.key]}.png`);
}

// ── AVATAR RENDERING ──────────────────────────────────────────────────────────
// THE single place avatars become markup. `value` is a raw avatar_url (plain
// path or recipe). Use this everywhere an avatar is shown.
//   cls        – base size class ('player-avatar', 'player-avatar-lg', 'nav-avatar', …)
//   extraClass – extra classes (e.g. 'zoomable')
//   id         – element id
//   lightbox   – wire up click-to-zoom
//   fallback   – src used when value is empty / fails to load
function avatarHTML(value, { cls = 'player-avatar', extraClass = '', id = '', lightbox = false, fallback = 'asset/players/default.svg' } = {}) {
  const idAttr  = id ? ` id="${_esc(id)}"` : '';
  const classes = `${cls}${extraClass ? ' ' + extraClass : ''}`;

  if (isAvatarRecipe(value)) {
    const recipe = parseAvatarRecipe(value);
    const layers = avatarLayerSrcs(recipe)
      .map(s => `<img src="${_esc(s)}" alt="" draggable="false">`).join('');
    const lb = lightbox ? ` data-avatar="${_esc(value)}" onclick="showAvatarFromEl(this)"` : '';
    return `<span${idAttr} class="${classes} avatar-stack" style="background:${_esc(recipe.bg)}"${lb}>${layers}</span>`;
  }

  const src = (value || '').trim() || fallback;
  const lb  = lightbox ? ` onclick="showAvatarLightbox(this.src, '${_esc(fallback)}')"` : '';
  return `<img${idAttr} class="${classes}" src="${_esc(src)}" alt="" onerror="this.src='${_esc(fallback)}'"${lb}>`;
}

function playerAvatarHTML(url, large, fallback = 'asset/players/default.svg') {
  return avatarHTML(url, { cls: large ? 'player-avatar-lg' : 'player-avatar', fallback });
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

  // The pill's own class is the source of truth for "is this active": some
  // callers (new-game) reassign their backing set on every recompute, so a
  // captured set reference can go stale — the DOM class never does. We still
  // mutate `set` and fire `onToggle` so the caller's real state stays in sync.
  const isActive = btn => btn.classList.contains(activeClass);
  const setChar = (name, btn, active) => {
    if (active === isActive(btn)) return;
    btn.classList.toggle(activeClass, active);
    if (active) set.add(name); else set.delete(name);
    onToggle?.(name, active);
  };

  for (const [box, cs] of Object.entries(byBox)) {
    const group = document.createElement('div');
    group.className = 'box-group';
    group.innerHTML = `<button type="button" class="box-name" title="Toggle all ${_esc(box)} characters">${_esc(box)}</button><div class="box-pills"></div>`;
    container.appendChild(group);
    const pillsEl = group.querySelector('.box-pills');

    const boxBtns = [];
    for (const c of cs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'char-pill' + (set.has(c.name) ? ` ${activeClass}` : '');
      btn.innerHTML = charImgHTML(c.name) + _esc(c.name);
      btn.dataset.name = c.name;
      btn.onclick = () => setChar(c.name, btn, !isActive(btn));
      boxBtns.push({ name: c.name, btn });
      pillsEl.appendChild(btn);
    }

    // Box header toggles every character in this box at once: if all are already
    // active, clear them; otherwise activate them all. Only touches this box's
    // characters, so selections elsewhere are preserved.
    group.querySelector('.box-name').onclick = () => {
      const allOn = boxBtns.every(({ btn }) => isActive(btn));
      boxBtns.forEach(({ name, btn }) => setChar(name, btn, !allOn));
    };
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
// Zoom a composite avatar from its rendered element (reads the recipe stored on
// the element, so click-to-zoom works without rasterising).
function showAvatarFromEl(el) {
  if (el) showAvatarLightbox(el.dataset.avatar, 'asset/players/default.svg');
}

function showAvatarLightbox(value, fallback) {
  let overlay = document.getElementById('avatarLightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'avatarLightbox';
    overlay.className = 'avatar-lightbox';
    // Any click anywhere on the overlay (image, backdrop, close button) dismisses.
    overlay.onclick = () => closeAvatarLightbox();
    overlay.innerHTML = `
      <button class="avatar-lightbox-close" type="button" aria-label="Close">×</button>
      <div id="avatarLightboxContent"></div>
    `;
    document.body.appendChild(overlay);
  }
  const host = document.getElementById('avatarLightboxContent');
  if (isAvatarRecipe(value)) {
    const recipe = parseAvatarRecipe(value);
    const layers = avatarLayerSrcs(recipe)
      .map(s => `<img src="${_esc(s)}" alt="" draggable="false">`).join('');
    host.innerHTML = `<span class="avatar-lightbox-img avatar-stack" style="background:${_esc(recipe.bg)}">${layers}</span>`;
  } else {
    const src = (value || '').trim() || fallback || '';
    host.innerHTML = `<img class="avatar-lightbox-img" src="${_esc(src)}" alt=""${fallback ? ` onerror="this.src='${_esc(fallback)}'"` : ''}>`;
  }
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
// Anchor id for a character's box group on the characters roster page.
function boxAnchorId(box) {
  return 'box-' + String(box || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}


// `limit`   — render only the top N rows (default: all).
// `selfKey` — highlight the row whose key matches; if that row falls beyond
//             `limit`, pin it at the bottom under a "Your position" divider so
//             the viewer always sees their standing for the current sort mode.
function renderStatTableHTML(rows, opts) {
  const { mode, headLabel, getKey, getHref, getIdentity, getSub, getSubHref,
          wrapClass = '', limit = Infinity, selfKey = null } = opts;
  const sorted = sortStatRows(rows, mode);

  const maxWins  = sorted[0]?.wins  || 1;
  const maxGames = sorted[0]?.games || 1;
  const maxPct   = Math.max(...sorted.map(r => r.games ? r.wins / r.games : 0)) || 1;

  const ranks      = computeRanks(sorted, mode);
  const medalClass = rank => rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

  const rowHTML = (r, i) => {
    const rank    = ranks[i];
    const key     = getKey(r);
    const pct     = r.games ? r.wins / r.games : 0;
    const barW    = statBarWidth(r, mode, maxWins, maxGames, maxPct);
    const dispVal = mode === 'count' ? r.wins : mode === 'pct' ? Math.round(pct * 100) + '%' : r.games;
    const dispSub = mode === 'games' ? r.wins : r.games;
    const sub     = getSub ? (getSub(key, r) || '') : '';
    const subHref = (sub && getSubHref) ? (getSubHref(key, r) || '') : '';
    const selfCls = (selfKey != null && key === selfKey) ? ' lb-row-self' : '';
    // The name and the box are each their own link (to the character/player and to
    // the box), rather than one row-wide anchor — so each is independently clickable.
    return `
      <div class="lb-row${selfCls}">
        <div class="rank-num ${medalClass(rank)}">${rank}</div>
        <div class="row-identity">
          ${getIdentity(key, r)}
          <div class="row-id-text">
            <a class="row-name row-name-link" href="${getHref(key, r)}">${_esc(key)}</a>
            ${sub ? (subHref
              ? `<a class="row-sub row-sub-link" href="${_esc(subHref)}" title="View ${_esc(sub)} characters">${_esc(sub)}</a>`
              : `<div class="row-sub">${_esc(sub)}</div>`) : ''}
          </div>
        </div>
        <div class="bar-cell">
          <div class="bar-bg">
            <div class="bar-fill${rank === 1 ? ' gold' : ''}" style="width:${barW}%"></div>
          </div>
        </div>
        <div class="row-val">${dispVal}</div>
        <div class="row-games">${dispSub}</div>
      </div>`;
  };

  let body = sorted.slice(0, limit).map((r, i) => rowHTML(r, i)).join('');

  // Pin the viewer's row if it ranks below the visible cut.
  const selfIdx = selfKey != null ? sorted.findIndex(r => getKey(r) === selfKey) : -1;
  if (selfIdx >= limit) {
    body += `<div class="lb-row-sep">Your position</div>${rowHTML(sorted[selfIdx], selfIdx)}`;
  }

  return `
    <div class="lb-table${wrapClass ? ' ' + wrapClass : ''}">
      <div class="lb-head">
        <span>#</span>
        <span>${headLabel}</span>
        <span></span>
        <span class="text-right">${mode === 'count' ? '# Wins' : mode === 'pct' ? '% Wins' : '# Games'}</span>
        <span class="text-right">${mode === 'games' ? '# Wins' : '# Games'}</span>
      </div>
      ${body}
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

// ── BOX COMPLETION ACHIEVEMENTS ────────────────────────────────────────────────
// Two gold achievements per box: play every character in it, and win with every
// character in it. Binary (gold at completion) rather than tiered, since box
// sizes are small (1–6) and "completion" is all-or-nothing.

// Per-box completion from a character→{plays,wins} map. Returns rows in release
// order: { box, slug, size, played, won }.
function computeBoxCompletion(charAch, allChars, boxInfo) {
  boxInfo = boxInfo || {};
  const byBox = groupByBox(allChars);
  const rows = Object.entries(byBox).map(([box, cs]) => {
    let played = 0, won = 0;
    for (const c of cs) {
      const s = charAch.get(c.name);
      if (s && s.plays > 0) played++;
      if (s && s.wins  > 0) won++;
    }
    return { box, slug: boxInfo[box]?.slug || '', size: cs.length, played, won };
  });
  rows.sort((a, b) =>
    (boxInfo[a.box]?.order ?? 999) - (boxInfo[b.box]?.order ?? 999) || a.box.localeCompare(b.box));
  return rows;
}

function countBoxAchievements(boxRows) {
  let earned = 0;
  for (const r of boxRows) {
    if (r.size > 0 && r.played >= r.size) earned++;
    if (r.size > 0 && r.won    >= r.size) earned++;
  }
  return { earned, total: boxRows.length * 2 };
}

// Compact strip of box covers — grayscale until the box is fully played (then
// full colour, mirroring the box picker), with a gold star (played all) and cup
// (won all) marker beneath.
function renderBoxStripHTML(boxRows, onClickFn = '_showBoxDetail') {
  const tiles = boxRows.map(r => {
    const src      = r.slug ? `asset/boxes/${r.slug}.webp` : 'asset/players/default.svg';
    const playDone = r.size > 0 && r.played >= r.size;
    const winDone  = r.size > 0 && r.won    >= r.size;
    return `
      <button class="box-ach${playDone ? ' played' : ''}${winDone ? ' won' : ''}" type="button" data-box="${_esc(r.box)}" onclick="${onClickFn}(this.dataset.box)" title="${_esc(r.box)}">
        <img class="box-ach-img" src="${src}" onerror="this.src='asset/players/default.svg'" alt="${_esc(r.box)}">
        <div class="box-ach-medals">
          <span class="box-ach-medal${playDone ? ' on' : ''}">${playDone ? '⭐' : '·'}</span>
          <span class="box-ach-medal${winDone ? ' on' : ''}">${winDone ? '🏆' : '·'}</span>
        </div>
      </button>`;
  }).join('');
  return `<div class="box-ach-grid">${tiles}</div>`;
}

// Detail sheet for one box: completion status of the two tracks, then a list of
// the box's characters with their played/won marks (so you can see what's left).
function renderBoxDetailHTML(boxRow, boxChars, charAch) {
  const src      = boxRow.slug ? `asset/boxes/${boxRow.slug}.webp` : 'asset/players/default.svg';
  const playDone = boxRow.size > 0 && boxRow.played >= boxRow.size;
  const winDone  = boxRow.size > 0 && boxRow.won    >= boxRow.size;

  const trackRow = (done, count, label, icon) => `
    <div class="ach-track-tier${done ? ' earned' : ''}">
      <span class="ach-track-icon">${done ? icon : '·'}</span>
      <span class="ach-track-name">${label}</span>
      <span class="ach-track-status">${done ? 'Completed' : `${count} / ${boxRow.size}`}</span>
    </div>`;

  const charList = boxChars.map(c => {
    const s = charAch.get(c.name) || { plays: 0, wins: 0 };
    return `
      <div class="box-detail-char">
        <img class="char-portrait" src="${charImgSrc(c.name)}" onerror="this.src='asset/players/default.svg'" alt="">
        <span class="box-detail-char-name">${_esc(c.name)}</span>
        <span class="box-detail-marks">
          <span class="${s.plays > 0 ? 'on' : ''}">${s.plays > 0 ? '⭐' : '·'}</span>
          <span class="${s.wins  > 0 ? 'on' : ''}">${s.wins  > 0 ? '🏆' : '·'}</span>
        </span>
      </div>`;
  }).join('');

  return `
    <div class="ach-detail-head${winDone ? ' crowned' : ''}">
      <img class="box-detail-cover" src="${src}" onerror="this.src='asset/players/default.svg'" alt="">
      <div class="ach-detail-name">${_esc(boxRow.box)}</div>
    </div>
    <div class="ach-track">
      ${trackRow(playDone, boxRow.played, 'Play all',  '⭐')}
      ${trackRow(winDone,  boxRow.won,    'Win all',   '🏆')}
    </div>
    <div class="box-detail-list">${charList}</div>`;
}

// ── GLOBAL (PROFILE-WIDE) ACHIEVEMENTS ─────────────────────────────────────────
// Table sizes (played/won at 2p…6p), volume (games/wins, tiered 10/50/100), and
// locations (distinct places played/won, tiered 1/5/10).

const VOLUME_TIERS = [
  { id: 'bronze', threshold: 10,  label: 'Bronze' },
  { id: 'silver', threshold: 50,  label: 'Silver' },
  { id: 'gold',   threshold: 100, label: 'Gold' },
];
const DONE_TIER = [{ id: 'gold', threshold: 1, label: 'Done' }];  // binary: gold at 1

function _tierIndex(count, tiers) {
  let t = -1;
  for (let i = 0; i < tiers.length; i++) if (count >= tiers[i].threshold) t = i;
  return t;
}

// Tiered medal for any tier set — star (plays) / cup (wins), tinted by tier.
function tierMedalHTML(count, tiers, kind) {
  const isCup = kind === 'cup';
  const t = _tierIndex(count, tiers);
  if (t < 0) return `<span class="ach-medal locked">·</span>`;
  const cls = isCup ? `ach-cup ach-cup-${tiers[t].id}` : `ach-star ach-star-${tiers[t].id}`;
  return `<span class="ach-medal ${cls}">${isCup ? '🏆' : '⭐'}</span>`;
}

// Compute the viewer's profile-wide stats. `isMine(playerRow)` selects the
// viewer's rows out of all the players of their games.
function computeGlobalAchievements(games, players, isMine) {
  const countByGame = {};
  for (const p of players) countByGame[p.game_id] = (countByGame[p.game_id] || 0) + 1;
  const locByGame = {};
  for (const g of games) locByGame[g.id] = g.location || null;

  const tableSizes = {};
  for (let s = 2; s <= 6; s++) tableSizes[s] = { played: 0, won: 0 };
  let games_ = 0, wins_ = 0;
  const playedLocs = new Set(), wonLocs = new Set();

  for (const p of players) {
    if (!isMine(p)) continue;
    games_++;
    const won = !!p.is_winner;
    if (won) wins_++;
    const size = countByGame[p.game_id] || 0;
    if (size >= 2 && size <= 6) {
      tableSizes[size].played++;
      if (won) tableSizes[size].won++;
    }
    const loc = locByGame[p.game_id];
    if (loc) { playedLocs.add(loc); if (won) wonLocs.add(loc); }
  }
  return {
    tableSizes,
    volume:    { games: games_, wins: wins_ },
    locations: { played: playedLocs.size, won: wonLocs.size },
  };
}

function countGlobalAchievements(g) {
  let earned = 0, total = 0;
  // Table sizes: a single binary play-all + win-all (across 2p–6p).
  const sizes = [2, 3, 4, 5, 6];
  total += 2;
  if (sizes.every(s => g.tableSizes[s].played > 0)) earned++;
  if (sizes.every(s => g.tableSizes[s].won    > 0)) earned++;
  total += VOLUME_TIERS.length * 2;
  const vg = _tierIndex(g.volume.games, VOLUME_TIERS); if (vg >= 0) earned += vg + 1;
  const vw = _tierIndex(g.volume.wins,  VOLUME_TIERS); if (vw >= 0) earned += vw + 1;
  total += ACH_TIERS.length * 2;
  const lp = _tierIndex(g.locations.played, ACH_TIERS); if (lp >= 0) earned += lp + 1;
  const lw = _tierIndex(g.locations.won,    ACH_TIERS); if (lw >= 0) earned += lw + 1;
  return { earned, total };
}

function renderGlobalStripHTML(global, onlyEarned = false, onClickFn = '_showGlobalDetail') {
  const tile = (key, badge, playCount, playTiers, winCount, winTiers) => {
    const earned  = _tierIndex(playCount, playTiers) >= 0 || _tierIndex(winCount, winTiers) >= 0;
    if (onlyEarned && !earned) return '';
    // Crowned when both tracks reach their top tier (fully completed).
    const crowned = _tierIndex(playCount, playTiers) === playTiers.length - 1
                 && _tierIndex(winCount,  winTiers)  === winTiers.length  - 1;
    // Grayed out when no achievement is earned yet on either track.
    return `
      <button class="ach-tile${crowned ? ' crowned' : ''}${earned ? '' : ' dim'}" type="button" data-gl="${key}" onclick="${onClickFn}(this.dataset.gl)">
        <span class="ach-tile-imgwrap"><span class="gl-badge gl-badge-emoji">${badge}</span></span>
        <div class="ach-tile-medals">
          <span aria-label="Plays">${tierMedalHTML(playCount, playTiers, 'medal')}</span>
          <span aria-label="Wins">${tierMedalHTML(winCount, winTiers, 'cup')}</span>
        </div>
      </button>`;
  };
  const sizes     = [2, 3, 4, 5, 6];
  const playedAll = sizes.every(s => global.tableSizes[s].played > 0);
  const wonAll    = sizes.every(s => global.tableSizes[s].won > 0);
  const tiles = [
    tile('volume',    '👤', global.volume.games,     VOLUME_TIERS, global.volume.wins,   VOLUME_TIERS),
    tile('tables',    '👥', playedAll ? 1 : 0,       DONE_TIER,    wonAll ? 1 : 0,       DONE_TIER),
    tile('locations', '📍', global.locations.played, ACH_TIERS,    global.locations.won, ACH_TIERS),
  ];
  return `<div class="ach-grid">${tiles.join('')}</div>`;
}

function renderGlobalDetailHTML(key, global) {
  const tierTrack = (count, tiers, label, icon) => `
    <div class="ach-track">
      <div class="ach-track-label">${label} | ${count}</div>
      ${tiers.map((t, i) => {
        const earned = i <= _tierIndex(count, tiers);
        return `<div class="ach-track-tier${earned ? ' earned' : ''}">
          <span class="ach-track-icon">${earned ? icon : '·'}</span>
          <span class="ach-track-name">${t.label} | ${t.threshold}</span>
          <span class="ach-track-status">${earned ? 'Earned' : `${count} / ${t.threshold}`}</span>
        </div>`;
      }).join('')}
    </div>`;

  if (key === 'volume') {
    return `
      <div class="ach-detail-head"><div class="ach-detail-name">👤 Volume</div></div>
      ${tierTrack(global.volume.games, VOLUME_TIERS, 'Games played', '⭐')}
      ${tierTrack(global.volume.wins,  VOLUME_TIERS, 'Wins',         '🏆')}`;
  }
  if (key === 'locations') {
    return `
      <div class="ach-detail-head"><div class="ach-detail-name">📍 Locations</div></div>
      ${tierTrack(global.locations.played, ACH_TIERS, 'Distinct locations played', '⭐')}
      ${tierTrack(global.locations.won,    ACH_TIERS, 'Distinct locations won',    '🏆')}`;
  }
  if (key === 'tables') {
    const sizes     = [2, 3, 4, 5, 6];
    const playedAll = sizes.every(s => global.tableSizes[s].played > 0);
    const wonAll    = sizes.every(s => global.tableSizes[s].won > 0);
    const trackRow = (done, label, icon) => `
      <div class="ach-track-tier${done ? ' earned' : ''}">
        <span class="ach-track-icon">${done ? icon : '·'}</span>
        <span class="ach-track-name">${label}</span>
        <span class="ach-track-status">${done ? 'Earned' : 'Not yet'}</span>
      </div>`;
    const sizeRows = sizes.map(s => {
      const ts = global.tableSizes[s];
      return `
        <div class="box-detail-char">
          <span class="box-detail-char-name">${s} players</span>
          <span class="box-detail-marks">
            <span class="${ts.played > 0 ? 'on' : ''}">${ts.played > 0 ? '⭐' : '·'}</span>
            <span class="${ts.won  > 0 ? 'on' : ''}">${ts.won  > 0 ? '🏆' : '·'}</span>
          </span>
        </div>`;
    }).join('');
    return `
      <div class="ach-detail-head"><div class="ach-detail-name">👥 Table sizes</div></div>
      <div class="ach-track">
        ${trackRow(playedAll, 'Played every size (2–6p)', '⭐')}
        ${trackRow(wonAll,    'Won every size (2–6p)',    '🏆')}
      </div>
      <div class="box-detail-list">${sizeRows}</div>`;
  }
  return '';
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
    // Crown a character that has reached the top (gold) tier on BOTH plays and wins.
    const goldIdx   = ACH_TIERS.length - 1;
    const bothGold  = achTierFor(stats.plays) === goldIdx && achTierFor(stats.wins) === goldIdx;
    return `
      <button class="ach-tile${bothGold ? ' crowned' : ''}${(stats.plays === 0 && stats.wins === 0) ? ' dim' : ''}" data-char="${_esc(c.name)}" onclick="${onClickFn}(this.dataset.char)" type="button" title="${_esc(c.name)}">
        <span class="ach-tile-imgwrap">
          <img class="ach-tile-img" src="${charImgSrc(c.name)}" onerror="this.src='asset/players/default.svg'" alt="${_esc(c.name)}">
        </span>
        <div class="ach-tile-medals">
          <span aria-label="Plays">${topMedal(stats.plays, 'medal')}</span>
          <span aria-label="Wins">${topMedal(stats.wins, 'cup')}</span>
        </div>
      </button>`;
  }).join('');
  return `
    <div class="ach-grid">${tiles}</div>`;
}

function renderAchievementDetailHTML(charName, stats) {
  stats = stats || { plays: 0, wins: 0 };
  const goldIdx  = ACH_TIERS.length - 1;
  const bothGold = achTierFor(stats.plays) === goldIdx && achTierFor(stats.wins) === goldIdx;
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
    <div class="ach-detail-head${bothGold ? ' crowned' : ''}">
      <img class="char-portrait identity-portrait" src="${charImgSrc(charName)}" onerror="this.src='asset/players/default.svg'" alt="">
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
// Wrap a Supabase query-builder as a per-keystroke fetchOptions source for
// attachSearchBox. `buildQuery(term)` runs server-side on every keystroke and
// resolves to { data }; we return the rows (or []). Used by both the player and
// location search boxes so matching/limiting happens in the DB, not the browser.
function dbSearchSource(buildQuery) {
  return async term => {
    const { data } = await buildQuery(term);
    return data || [];
  };
}

// Attach location autocomplete to a free-text input: typing suggests existing
// locations (via the search_locations RPC); picking one fills the input. The
// user can still type a brand-new location. Requires a sibling .cs-dropdown
// inside a position:relative wrapper.
function attachLocationAutocomplete(inputId, dropdownId) {
  attachSearchBox({
    inputId,
    dropdownId,
    debounceMs: 200,
    fetchOptions: dbSearchSource(q => db.rpc('search_locations', { q })),
    renderOption: l => `<div class="cs-option" data-loc="${_esc(l)}">${_esc(l)}</div>`,
    onSelect: opt => {
      const input = document.getElementById(inputId);
      if (input) input.value = opt.dataset.loc;
      document.getElementById(dropdownId)?.classList.remove('open');
    },
  });
}

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
